# Agent Note: bw_infoobject_create——InfoObject 首个变更工具

Status: implemented

## Problem

InfoObject 域在 MCP 面只有 get/validate 三个只读工具，无法创建关键指标；LLM 建模链（InfoArea→IOBJ→ADSO）在 IOBJ 一环断掉。用户以 2026-11-10 BWMT 创建 KYF 的完整抓包补上证据。

## Decision

- **新增 `bw_infoobject_create`（`mutating: true`）**：转发 `client.infoObject.create()`（门面方法，结构化 cast + 缺失时描述性报错，`bw_adso_add_key` 同款）。语义/聚合/单位引用/包/传输/autoActivate 一步到位；结果带回读校验（persisted/diffs/objectStatus）。
- **结果自解释风险**：`persisted:false` 时 notes 里给出 ⚠️ diff 说明（库层回读兜底单位引用可能被服务端丢弃——向导本身是创建后编辑器补写），LLM 可自行决定补救路径。
- **仅 KYF**：description 明说 CHA 未实现、CURR+AMO+SUM 为已验证组合，其余枚举同形未验证——不让 LLM 误以为是全量能力。
- **不做 createTransport**：与 `bw_adso_create` 一致，packageName 非默认无 transport 由库层守卫报错，传输解析仍走显式原则。

## Alternatives considered

- **同时暴露 save_and_activate / get_xml 编辑链**：PUT /m 编辑路径抓包已有但库层未实现 XML 合并；等有真实编辑需求再扩面（Public 面是策划子集）。
- **直接调 BWAdtClient 便捷方法**：库侧已收敛到 domain facade（P1 单表面），工具走 `client.infoObject.create` 保持一致。

## Consequences

- Public 面 75 → 76；AGENTS.md/README 计数已同步。
- npm 版本：新工具 → 下次 release minor（release commit 集中处理，本次不动版本）。
- 运行依赖：需 bw-adt-api ≥ 含 InfoObjectDomain.create 的本地构建；npm 0.7.0 尚未包含——本地联调先同步 node_modules。

## Testing

`npm run build` + `npm run list-tools` 验证（工具注册与 schema 生成）；真机端到端待用户执行首次创建。

## Related

- 库侧设计：bw-adt-api `.agents/notes/implemented/feature/2026-11-10-iobj-create.md`；证据：VERIFIED_APIS §9。
