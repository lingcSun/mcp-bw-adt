/**
 * MCP 语义层真机验证——直接调用工具 run 函数（client 用真实登录）。
 * 场景：四类型创建（枚举入口）→ 标准互转 staging/dataMart/directUpdate → 护栏拦截 → 清理。
 */
const path = require("path")
require(path.join(__dirname, "..", "..", "..", "bw-adt-api", "node_modules", "dotenv")).config({ path: path.resolve(__dirname, "..", "..", "..", "bw-adt-api", ".env") })
const mcpRoot = path.resolve(__dirname, "..", "..")
const { BWAdtClient } = require(path.join(mcpRoot, "node_modules", "bw-adt-api"))
const { adsoTools } = require(path.join(mcpRoot, "build", "tools", "adso"))

const AREA = process.env.PARENT_AREA || "ZGLD_TEST"
const mask = (s) => String(s).replace(/(?<!\/)[A-Z0-9_]{5,}/g, (m) => (m.startsWith("0") ? m : "X".repeat(m.length)))
const tool = (name) => adsoTools.find((t) => t.name === name)
async function runTool(name, client, args) {
  const t = tool(name)
  if (!t) throw new Error("no tool " + name)
  return t.run(client, args)
}
async function deleteAdso(c, name) {
  const h = c.h || c
  const lock = await h.request(`/sap/bw/modeling/adso/${encodeURIComponent(name.toLowerCase())}?action=lock`, {
    method: "POST", sessionType: "stateful",
    headers: { Accept: "application/vnd.sap.bw.modeling.adso-v1_5_0+xml" }
  })
  const lh = String(lock.body || "").match(/<LOCK_HANDLE>([^<]+)/)?.[1]
  try {
    await h.request(`/sap/bw/modeling/adso/${encodeURIComponent(name.toLowerCase())}/m?lockHandle=${encodeURIComponent(lh)}`, {
      method: "DELETE", sessionType: "stateless",
      headers: { Accept: "application/vnd.sap.bw.modeling.adso-v1_5_0+xml" }
    })
  } finally {
    try { await h.request(`/sap/bw/modeling/adso/${encodeURIComponent(name.toLowerCase())}?action=unlock`, { method: "POST", sessionType: "stateful", headers: { Accept: "application/vnd.sap.bw.modeling.adso-v1_5_0+xml" } }) } catch { }
  }
}
const attr = (xml, k) => (xml.match(new RegExp(k + '="([^"]*)"')) || [])[1]

async function main() {
  const c = new BWAdtClient(process.env.BW_BASE_URL, process.env.BW_USERNAME, process.env.BW_PASSWORD, process.env.BW_CLIENT, process.env.BW_LANGUAGE)
  await c.login()
  const out = {}
  const ts = Date.now().toString(36).slice(-4).toUpperCase()
  const N = "ZWM" + ts
  const created = [N]

  try {
    // 1) staging 创建（mode=compressDataLog，枚举入口）
    await runTool("bw_adso_create", c, {
      name: N, description: "mcp semantic create", infoArea: AREA, packageName: "$TMP",
      adsoType: "staging", staging: { mode: "compressDataLog" },
    })
    let xml = await c.getADSOXml(N, true)
    out.createStaging = { act: attr(xml, "activateData"), cl: attr(xml, "writeChangelog"), rep: attr(xml, "isReportingObject") }

    // 2) add_key（补 compress 模式必需的键）
    await runTool("bw_adso_add_key", c, { id: N, infoObjectName: "0MATERIAL" })
    await runTool("bw_adso_add_field", c, { id: N, name: "ZFLD1", dataType: "CHAR", length: 10, label: "f" })
    xml = await c.getADSOXml(N, true)
    out.addKey = { keyElement: /<keyElement>/.test(xml), field: /name="ZFLD1"/.test(xml) }

    // 3) convert → standard（含 snapshotSupport）
    const conv1 = await runTool("bw_adso_convert_type", c, {
      id: N, targetType: "standard", standard: { snapshotSupport: true },
    })
    xml = await c.getADSOXml(N, true)
    out.convertToStandard = {
      persisted: conv1.persisted,
      snap: attr(xml, "snapShotScenario"), cl: attr(xml, "writeChangelog"), act: attr(xml, "activateData"),
    }

    // 4) 护栏：snapshot+unique 同设 → 客户端拦截（无服务器调用）
    try {
      await runTool("bw_adso_convert_type", c, { id: N, targetType: "standard", standard: { snapshotSupport: true, uniqueDataRecords: true } })
      out.guardSnapUniq = "❌ 未拦截"
    } catch (e) { out.guardSnapUniq = "✅ " + String(e.message).slice(0, 60) }

    // 5) convert → dataMart
    const conv2 = await runTool("bw_adso_convert_type", c, { id: N, targetType: "dataMart" })
    xml = await c.getADSOXml(N, true)
    out.convertToDataMart = { persisted: conv2.persisted, ro: attr(xml, "readOnly"), hana: attr(xml, "withHanaModel"), cl: attr(xml, "writeChangelog") }

    // 6) convert → directUpdate
    const conv3 = await runTool("bw_adso_convert_type", c, { id: N, targetType: "directUpdate" })
    xml = await c.getADSOXml(N, true)
    out.convertToDirectUpdate = { persisted: conv3.persisted, du: attr(xml, "directUpdate"), act: attr(xml, "activateData"), cl: attr(xml, "writeChangelog") }

    // 7) 护栏：staging corporateMemory 无键对象 → 此对象有键，应放行；inbound+reporting 应拦截
    try {
      await runTool("bw_adso_convert_type", c, { id: N, targetType: "staging", staging: { mode: "inboundQueueOnly", reportingEnabled: true } })
      out.guardInboundRep = "❌ 未拦截"
    } catch (e) { out.guardInboundRep = "✅ " + String(e.message).slice(0, 60) }
  } finally {
    for (const n of created) { try { await deleteAdso(c, n) } catch (e) { out.cleanupErr = String(e.message).slice(0, 80) } }
  }
  console.log(JSON.stringify(out, null, 1))
}

main().catch((e) => { console.error("FAIL", String((e && e.stack) || e).slice(0, 400)); process.exit(1) })
