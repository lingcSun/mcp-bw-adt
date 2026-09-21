# Agent Note: ADSO 类型语义层——以 Eclipse 前台同款语义封装类型能力

Status: implemented

## Problem

写面验证（bw-adt-api 账本 D1/D7/D8）证实：ADSO 的四类类型 = 不同的表布局，各自的属性是固定语义包且选项间有约束（snapshot 依赖 changelog 且与 unique 互斥；staging 持久策略是三选一模板；directUpdate 必须关激活与日志）。把裸属性暴露给 LLM 调用方 = 让它猜合法组合——服务端报错模糊、静默归一化无感知。

## Decision

- **语义层落在 MCP**（库保持原语）：新增 `src/adsoProfiles.ts`——声明式类型档案（standard/staging/dataMart/directUpdate → 根属性组合）+ 约束校验（抛 `ProfileConstraintError`，带账本规则引用）+ **回读持久性校验**（防 readOnly 孤立翻转式静默归一化）。
- **工具面**：`bw_adso_create` 增 `adsoType` 枚举 + `standard.*`/`staging.*` 选项对象（约束在创建前拦截）；新增 `bw_adso_convert_type`（同语义的类型调整：staging inbound 自动去 keyElement、compress/corporateMemory 要求已有键、directUpdate 自动关 act/CL，保存后回读校验）；新增 `bw_adso_add_key`（暴露库 addADSOKey——键是无键 ADSO 激活的前置）。
- **依赖切本地**：`bw-adt-api: file:../bw-adt-api`——npm 0.4.0 不含 addADSOKey/executerun/D1 需要的任何新能力；0.5.0 发版后切回 npm 版。
- **约束错误带规则引用**：报错形如 `[规则: D8]`，LLM 可据此选择替代路径（如换 inboundQueueOnly）。

## Alternatives considered

- **语义放进库（createADSO 加 adsoType）**：库身份是 REST 忠实封装，Eclipse UI 语义放库里会拖累库的版本节奏；MCP 演进快、贴 LLM 使用面。
- **只加 convert 不动 create**：创建即选类型是 Eclipse 向导的形态；创建后再 convert 会多两次服务器往返且留下 standard 中间态。
- **键约束做自动加键**：键选哪个 InfoObject 是建模决策不是技术细节，自动选 = 替用户做主；报错指引 add_key。

## Consequences

- `bw_adso_create` 移除裸 `activateData/writeChangelog/readOnly` 参数（被 adsoType 包取代）——工具契约破坏，随下一 minor。
- staging compress/corporateMemory + 无键对象：保存成功但**不激活**，结果注明"先 add_key 再 add_field"——把服务端的静默失败前置为显式工作流。
- 语义正确性依赖账本 D1/D7/D8；系统升级后这些规则若变，以新证据更新 TYPE_PROFILES。

## Testing

`npm run smoke:profiles`（离线 11 项：档案展开、约束拦截、XML 应用、静默归一化检出、工具注册）；`npm run build` + `npm run list-tools` 全绿。真机（工具 run 函数直连）：staging(compressDataLog) 创建→add_key→add_field→convert standard(snapshotSupport)→convert dataMart→convert directUpdate 全链持久化验证；两个护栏（snap+uniq 互斥、inbound+reporting）客户端拦截实测。

## Related

- 规则证据：bw-adt-api 仓库 `docs/VERIFIED_APIS.md` 第 8 节 D1/D7/D8。
