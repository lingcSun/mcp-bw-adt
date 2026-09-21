/**
 * adsoProfiles 语义层离线冒烟（无 I/O）：
 * 档案展开 / 约束拦截 / XML 应用 / keyElement 处理 / 工具注册。
 */
const path = require("path")
const {
  expandProfile,
  applyAttrsToXml,
  verifyPersisted,
  ProfileConstraintError,
} = require(path.join("..", "build", "adsoProfiles"))
const { adsoTools } = require(path.join("..", "build", "tools", "adso"))

const BASE = `<?xml version="1.0"?><adso:dataStore xmlns:adso="http://www.sap.com/bw/modeling/adso.ecore" name="ZT1" physicalSchemaName="SAPHANADB" readOnly="false" activateData="true" writeChangelog="true" snapShotScenario="false" uniqueDataRecords="false" directUpdate="false" isReportingObject="true">
  <keyElement>#///0MATERIAL</keyElement>
</adso:dataStore>`

let failures = 0
function check(name, fn) {
  try { fn(); console.log("PASS", name) }
  catch (e) { failures++; console.log("FAIL", name, "::", String(e.message).slice(0, 120)) }
}
function expectThrows(name, fn, re) {
  try { fn(); failures++; console.log("FAIL", name, ":: 未抛错") }
  catch (e) {
    if (re.test(String(e.message))) console.log("PASS", name)
    else { failures++; console.log("FAIL", name, ":: 报错不匹配:", String(e.message).slice(0, 100)) }
  }
}

// --- 档案展开 ---
check("standard 默认（cl=T, snap/uniq=F）", () => {
  const app = expandProfile({ adsoType: "standard" })
  if (app.attrs.writeChangelog !== "true" || app.attrs.snapShotScenario !== "false") throw new Error(JSON.stringify(app.attrs))
  if (app.stripKeyElement) throw new Error("standard 不应去键")
})
check("standard snapshot+unique 互斥拦截（D7）", () => {
  try { expandProfile({ adsoType: "standard", standard: { snapshotSupport: true, uniqueDataRecords: true } }); throw new Error("no throw") }
  catch (e) { if (!(e instanceof ProfileConstraintError) || !/mutually exclusive/.test(e.message)) throw e }
})
check("standard snapshot 无 changelog 拦截（D7）", () => {
  try { expandProfile({ adsoType: "standard", standard: { snapshotSupport: true, writeChangeLog: false } }); throw new Error("no throw") }
  catch (e) { if (!/requires writeChangeLog/.test(String(e.message))) throw e }
})
check("staging inboundQueueOnly → stripKeyElement=true", () => {
  const app = expandProfile({ adsoType: "staging", staging: { mode: "inboundQueueOnly" } })
  if (!app.stripKeyElement) throw new Error("应去键")
  if (app.attrs.activateData !== "false") throw new Error(JSON.stringify(app.attrs))
})
check("staging corporateMemory → changelog=T + rep 强制 T（D8）", () => {
  const app = expandProfile({ adsoType: "staging", staging: { mode: "corporateMemory", reportingEnabled: false } })
  if (app.attrs.writeChangelog !== "true" || app.attrs.isReportingObject !== "true") throw new Error(JSON.stringify(app.attrs))
})
check("staging inbound + reporting 拦截（D8）", () => {
  try { expandProfile({ adsoType: "staging", staging: { mode: "inboundQueueOnly", reportingEnabled: true } }); throw new Error("no throw") }
  catch (e) { if (!/GET_OBJECT_FOR_EXTRACTION/.test(String(e.message))) throw e }
})
check("dataMart → readOnly/withHanaModel/noCL", () => {
  const app = expandProfile({ adsoType: "dataMart" })
  if (app.attrs.readOnly !== "true" || app.attrs.withHanaModel !== "true" || app.attrs.writeChangelog !== "false") throw new Error(JSON.stringify(app.attrs))
})
check("directUpdate → 自动关 act/CL（D1 组合约束）", () => {
  const app = expandProfile({ adsoType: "directUpdate" })
  if (app.attrs.directUpdate !== "true" || app.attrs.activateData !== "false" || app.attrs.writeChangelog !== "false") throw new Error(JSON.stringify(app.attrs))
})

// --- XML 应用与回读校验 ---
check("applyAttrsToXml 替换 + stripKeyElement", () => {
  const app = expandProfile({ adsoType: "staging", staging: { mode: "inboundQueueOnly" } })
  const next = applyAttrsToXml(BASE, app.attrs, app.stripKeyElement)
  if (/<keyElement>/.test(next)) throw new Error("keyElement 未移除")
  if (!/activateData="false"/.test(next)) throw new Error("activateData 未改")
  const v = verifyPersisted(next, app.attrs)
  if (!v.ok) throw new Error(v.diffs.join(","))
})
check("verifyPersisted 捕获静默归一化", () => {
  const v = verifyPersisted(BASE, { snapShotScenario: "true" })
  if (v.ok) throw new Error("应检出差异")
})

// --- 工具注册 ---
check("MCP 工具注册：create/convert/add_key", () => {
  const names = adsoTools.map((t) => t.name)
  for (const n of ["bw_adso_create", "bw_adso_convert_type", "bw_adso_add_key", "bw_adso_add_field"]) {
    if (!names.includes(n)) throw new Error("缺 " + n)
  }
  const create = adsoTools.find((t) => t.name === "bw_adso_create")
  const paramsKeys = Object.keys(create.params.shape || {})
  for (const k of ["adsoType", "standard", "staging"]) {
    if (!paramsKeys.includes(k)) throw new Error("create params 缺 " + k)
  }
  const convert = adsoTools.find((t) => t.name === "bw_adso_convert_type")
  if (!convert) throw new Error("缺 bw_adso_convert_type")
})

process.exit(failures ? 1 : 0)
