/**
 * ADSO 类型语义层（MCP 专属）——把 VERIFIED_APIS D1/D7/D8 的实测规则编译成
 * 声明式类型档案（TYPE_PROFILES），供 bw_adso_create / bw_adso_convert_type 使用。
 *
 * 设计原则：库（bw-adt-api）保留原语能力；本模块是 Eclipse 前台同款的语义封装——
 * 选类型 → 只出现该类型的选项 → 约束自动满足或给出可操作报错。
 * 每条规则都引用 docs/VERIFIED_APIS.md（bw-adt-api 仓库）第 8 节 D1/D7/D8 证据。
 */
import type { BWAdtClient } from "bw-adt-api"

export type AdsoType = "standard" | "staging" | "dataMart" | "directUpdate"
export type StagingMode = "inboundQueueOnly" | "compressDataLog" | "corporateMemory"

export interface StandardOptions {
  /** 写变更日志（下游增量接力≈必开；纯终点可关）。默认 true。 */
  writeChangeLog?: boolean
  /** 快照支持（库存/非累积语义）。要求 writeChangeLog=true 且与 uniqueDataRecords 互斥（D7）。 */
  snapshotSupport?: boolean
  /** 唯一数据记录（活动表同键单行）。与 snapshotSupport 互斥（D7）。 */
  uniqueDataRecords?: boolean
}

export interface StagingOptions {
  /** 持久策略三选一（D8）：inboundQueueOnly(默认)=仅入站队列；compressDataLog=压缩日志；corporateMemory=企业记忆(带 changelog)。 */
  mode?: StagingMode
  /** 可报表（isReportingObject）。仅非 inboundQueueOnly 模式可开（D8：inbound+reporting 激活报 GET_OBJECT_FOR_EXTRACTION）。 */
  reportingEnabled?: boolean
}

export interface TypeProfileRequest {
  adsoType: AdsoType
  standard?: StandardOptions
  staging?: StagingOptions
}

/** 单条属性补丁（应用到 ADSO 根元素） */
export type AttrPatch = Record<string, string>

export interface ProfileApplication {
  /** 根属性补丁 */
  attrs: AttrPatch
  /** true = 移除 <keyElement>（staging inboundQueueOnly；D8：无激活无键） */
  stripKeyElement: boolean
  /** 语义说明（进工具返回，让调用方知道发生了什么） */
  notes: string[]
}

/** 校验失败：抛出带规则引用的 Error（MCP 工具层不吞） */
export class ProfileConstraintError extends Error {
  readonly rule: string
  constructor(rule: string, message: string) {
    super(`${message} [规则: ${rule}]`)
    this.name = "ProfileConstraintError"
    this.rule = rule
  }
}

/** 标准 DSO 选项校验（D7 实测矩阵） */
export function validateStandardOptions(o: StandardOptions = {}): void {
  const snap = o.snapshotSupport === true
  const uniq = o.uniqueDataRecords === true
  const cl = o.writeChangeLog !== false // 默认 true
  if (snap && !cl) {
    throw new ProfileConstraintError(
      "D7",
      'snapshotSupport requires writeChangeLog=true — server rejects: "Snapshot Scenario is set. Activate Data, Write Change Log missing."'
    )
  }
  if (snap && uniq) {
    throw new ProfileConstraintError(
      "D7",
      'snapshotSupport and uniqueDataRecords are mutually exclusive — server rejects: "Snapshot Scenario is set. Unique Data records cannot be set."'
    )
  }
}

/** Staging 模式校验（D8 实测矩阵） */
export function validateStagingOptions(o: StagingOptions = {}): void {
  const mode = o.mode || "inboundQueueOnly"
  if (mode === "inboundQueueOnly" && o.reportingEnabled) {
    throw new ProfileConstraintError(
      "D8",
      "reportingEnabled is not available with mode=inboundQueueOnly — activation fails with GET_OBJECT_FOR_EXTRACTION (reporting requires activateData)."
    )
  }
}

/**
 * 把类型档案展开为根属性补丁。
 * base 仅用于读取当前值（补丁只写有语义的键，其余属性保持原文）。
 */
export function expandProfile(req: TypeProfileRequest): ProfileApplication {
  switch (req.adsoType) {
    case "standard": {
      validateStandardOptions(req.standard || {})
      const o = req.standard || {}
      const attrs: AttrPatch = {
        readOnly: "false",
        activateData: "true",
        writeChangelog: String(o.writeChangeLog !== false),
        snapShotScenario: String(o.snapshotSupport === true),
        uniqueDataRecords: String(o.uniqueDataRecords === true),
      }
      return {
        attrs,
        stripKeyElement: false,
        notes: [
          "standard: AQ→AT→(可选)CL 经典激活闭环",
          o.snapshotSupport ? "snapshotSupport=开（快照语义，依托 changelog 镜像）" : undefined,
          o.uniqueDataRecords ? "uniqueDataRecords=开（活动表同键单行）" : undefined,
          o.writeChangeLog === false ? "writeChangeLog=关（纯终点存储，无 delta 抽取）" : undefined,
        ].filter(Boolean) as string[],
      }
    }
    case "staging": {
      validateStagingOptions(req.staging || {})
      const o = req.staging || {}
      const mode = o.mode || "inboundQueueOnly"
      const activateData = mode !== "inboundQueueOnly"
      const writeChangelog = mode === "corporateMemory"
      // D8: corporateMemory 模式服务端强制 isReportingObject=true——主动置 T 并说明
      const reporting = mode === "corporateMemory" ? true : o.reportingEnabled === true
      const attrs: AttrPatch = {
        activateData: String(activateData),
        writeChangelog: String(writeChangelog),
        isReportingObject: String(reporting),
        readOnly: "false",
      }
      return {
        attrs,
        // inboundQueueOnly 无激活→无键合法且是抓包形态；compress/corporateMemory 有激活→键必需（保留 keyElement）
        stripKeyElement: mode === "inboundQueueOnly",
        notes: [
          "staging: 落地/缓冲，不走标准激活闭环（表布局与标准不同）",
          `mode=${mode}` +
            (mode === "inboundQueueOnly"
              ? "（仅入站队列，数据停在 AQ；无键合法）"
              : mode === "compressDataLog"
                ? "（压缩日志：激活数据不留 CL；必须有键定义）"
                : "（企业记忆：保留 changelog 历史；服务端强制可报表）"),
          mode === "inboundQueueOnly" ? "keyElement 已移除（无激活无键）" : "keyElement 保留（激活需要键定义）",
        ].filter(Boolean) as string[],
      }
    }
    case "dataMart": {
      return {
        attrs: { readOnly: "true", withHanaModel: "true", writeChangelog: "false" },
        stripKeyElement: false,
        notes: ["dataMart: 压缩态 + HANA 模型，报表只读（readOnly+withHanaModel+无 changelog）"],
      }
    }
    case "directUpdate": {
      return {
        attrs: { directUpdate: "true", activateData: "false", writeChangelog: "false" },
        stripKeyElement: false,
        notes: [
          "directUpdate: 直写活动表（规划/APD 旁路）",
          "activateData/writeChangelog 已自动关闭（D1 组合约束：否则激活报两条 Error）",
        ],
      }
    }
    default:
      throw new ProfileConstraintError("D1", `unknown adsoType: ${req.adsoType}`)
  }
}

/** 把属性补丁应用到 ADSO XML 根元素（只替换已存在属性或追加） */
export function applyAttrsToXml(xml: string, attrs: AttrPatch, stripKeyElement: boolean): string {
  let out = xml
  const rootMatch = out.match(/<adso:dataStore\b[^>]*>/)
  if (!rootMatch) throw new Error("ADSO XML: <adso:dataStore> root not found")
  let root = rootMatch[0]
  for (const [k, v] of Object.entries(attrs)) {
    const re = new RegExp(`${k}="[^"]*"`)
    if (re.test(root)) root = root.replace(re, `${k}="${v}"`)
    else root = root.replace(/>$/, ` ${k}="${v}">`)
  }
  out = out.replace(rootMatch[0], root)
  if (stripKeyElement) {
    out = out.replace(/<keyElement>[^<]*<\/keyElement>\s*/g, "")
  }
  return out
}

/** 回读校验：补丁属性必须与目标一致（防静默归一化——D1 初轮教训） */
export function verifyPersisted(xmlAfter: string, attrs: AttrPatch): { ok: boolean; diffs: string[] } {
  const diffs: string[] = []
  for (const [k, v] of Object.entries(attrs)) {
    const actual = (xmlAfter.match(new RegExp(`${k}="([^"]*)"`)) || [])[1]
    if (actual !== v) diffs.push(`${k}: 期望 ${v}, 实际 ${actual}`)
  }
  return { ok: diffs.length === 0, diffs }
}

/** convert 编排：读 XML → 应用档案 → 保存（激活可选）→ 回读校验 */
export async function convertAdsoType(
  client: BWAdtClient,
  id: string,
  req: TypeProfileRequest,
  options?: { autoActivate?: boolean }
): Promise<Record<string, unknown>> {
  const before = await client.getADSOXml(id, true)
  const app = expandProfile(req)
  const hadKeyElement = /<keyElement>/.test(before)
  if (req.adsoType === "staging") {
    const mode = req.staging?.mode || "inboundQueueOnly"
    if (mode !== "inboundQueueOnly" && !hadKeyElement) {
      throw new ProfileConstraintError(
        "D8",
        `target mode ${mode} activates data, which REQUIRES a key definition, but ${id} has no <keyElement>. ` +
          `Add a key first (bw_adso_add_key), or choose mode=inboundQueueOnly.`
      )
    }
  }
  const next = applyAttrsToXml(before, app.attrs, app.stripKeyElement)
  const save = await client.saveAndActivateADSO(id, next, {
    autoActivate: options?.autoActivate ?? true,
  })
  const after = await client.getADSOXml(id, true)
  const check = verifyPersisted(after, app.attrs)
  return {
    id,
    adsoType: req.adsoType,
    saved: !!(save as { updateResult?: { success?: boolean } }).updateResult?.success,
    activated: options?.autoActivate === false ? false : !!((save as { activateResult?: { success?: boolean } }).activateResult?.success),
    persisted: check.ok,
    persistenceDiffs: check.diffs,
    notes: app.notes,
  }
}
