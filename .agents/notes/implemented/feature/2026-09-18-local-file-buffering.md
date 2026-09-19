# Agent Note: 本地文件缓冲——机制 A/B 与 workdir 沙箱

Status: implemented

## Problem

bw-adt-api 的载荷量级在真实系统上实测：对象 XML 15–80 KB；DDIC 表数据 100 行 × 20 列约 68 KB；10 000 行约 6.7 MB；进程链日志 200 条约 39 KB。把这些推过 LLM 上下文窗口，要么浪费要么致命。

## Decision

`src/fileio.ts` 提供两条机制，所有涉及大字符串的工具统一采用：

- **机制 A（readInput）——大请求体走本地文件**：对象 XML、SQL 语句、ABAP 源码等大参数接受文件路径代替内联 content；双字段模式，路径与内联二选一。
- **机制 B（writeOutput）——大响应落盘**：`src/server.ts` 在调用层拦截 `outputPath` 参数——给了就把完整结果写入文件、只返回小摘要信封；不给则内联返回（工具可自行分页/投影）。
- **workdir 沙箱**：一切路径在 workdir（env `BW_MCP_WORKDIR` 或 `<cwd>/.mcp-bw-out`，启动时解析捕获）之下解析；`resolveWithin` 做 Windows 大小写不敏感的前缀检查，`..` 逃逸直接抛错。默认落在专用 scratch 目录，防止误写项目源文件。

## Alternatives considered

- **全量内联**：6.7 MB 实测致命。
- **截断**：写路径上截断等于静默损坏对象 XML。
- **远端 artifact store**：给个人工具链引入运维负担，且 LLM 无法直接编辑远端内容。

## Consequences

- 编辑型工作流固定为 `*_get_xml` → 改本地文件 → `*_save_and_activate`，与工具面收敛互相成就。
- 沙箱使文件缓冲不构成任意路径读写原语；workdir 是环境事实，不由 LLM 协商。
- 工具拿到完整 args（含 `outputPath`），因此能感知缓冲模式并跳过分页/投影——机制 B 在调用层拦截而非包装结果，避免了双重分页。

## Related

- 工具面与 mutating 派生见 [工具组聚合与元数据派生的 mutating 集合](../architecture/2026-09-18-tool-groups-and-derived-mutating-set.md)。
