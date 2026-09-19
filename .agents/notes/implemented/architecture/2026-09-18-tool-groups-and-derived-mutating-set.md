# Agent Note: 工具组聚合与元数据派生的 mutating 集合

Status: implemented

## Problem

最初的工具面直接镜像 bw-adt-api 的原子操作（atomic lock/unlock、裸 update/activate、raw `bw_*_get`），暴露给 LLM 后模型频繁走进破损中间态：锁了不解锁、改了不激活、拿不到完整对象 XML 就盲写。同时"哪些工具会改系统"散落在守卫逻辑的判断链里——新增工具漏标一处，只读守卫就漏一个口子。

## Decision

（094cff8 "shrink MCP Public surface and derive mutating tools from metadata"，0.3.0 定型）

- **工作流形态的工具面**：Public 面收敛到约 64 个工具，推荐路径固定为 `*_get_xml` + `outputPath` → 本地改文件 → `*_save_and_activate` + `xmlPath`；原子 lock/unlock、裸 update/activate、raw getter、重复的 DDIC/system 工具从 `tools/list` 移除（一次 breaking，README 顶部声明）。库层 API 不变——只是不再全部暴露给 LLM。
- **mutating 即元数据**：每个 `ToolDef` 带 `mutating: true` 标注（`src/tools/*.ts`）；`src/mutating.ts` 启动时从 `ALL_TOOLS` 派生出名称集合并缓存，只读 profile 守卫（`src/session.ts`）消费该集合。
- **组文件聚合**：`src/tools/` 按域一组（adso、area、dataflow、datasource、ddic、dtp、generic、infoobject、processchain、replication、reporting、search、system、transformation、transport），`tools/index.ts` 聚合为 `ALL_TOOLS`，新组在此登记。

## Alternatives considered

- **保留原子工具 + 文档引导**：模型不读文档，实测走进中间态；文档不是守卫。
- **命名前缀约定（如 `mut_*`）**：重命名破坏兼容，且前缀本身仍是手工维护的平行清单。
- **运行时分析工具函数体判定副作用**：静态不可读、脆弱，且把守卫建立在对实现的猜测上。

## Consequences

- 新增变更工具 = 在 `ToolDef` 上加一个标注，只读守卫自动覆盖；漏标的风险从"散落多处"收敛为"一处元数据"。
- Public 面是策划产物，刻意小于库 API；一次 breaking 换来可引导的编辑工作流。
- `bw_object_delete` 后来把锁与传输拆为显式 `lockHandle`/`transport` 参数（0c51289），延续同一条线：写前置条件显式化，不留给模型猜。

## Related

- 编辑工作流的另一半（文件缓冲）见 [本地文件缓冲——机制 A/B 与 workdir 沙箱](../feature/2026-09-18-local-file-buffering.md)。
