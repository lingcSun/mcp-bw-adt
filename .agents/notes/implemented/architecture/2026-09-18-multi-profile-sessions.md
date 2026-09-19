# Agent Note: 多 profile 连接管理与凭据不出 LLM 面

Status: implemented

## Problem

单台服务器需要同时面向测试与生产等多个 BW 系统，且生产 profile 必须能被限制为只读。更根本的约束：凭据一旦进入任何工具响应、错误文本或日志，就进入了 LLM 上下文与对话记录——这是不可接受的泄漏面。

## Decision

`src/session.ts`：

- **profile 声明式配置**：`BW_PROFILES=test,prod` 加 `BW_DEFAULT=test`，每个 profile 一组 `BW_<NAME>_BASE_URL/USERNAME/PASSWORD/CLIENT/LANGUAGE/READONLY` 环境变量；旧单连接变量（`BW_BASE_URL/…`）等价于名为 `default` 的 profile，保持兼容。
- **凭据隔离**：对外只暴露 `ProfileInfo`（name、baseUrl、username、client、language、readOnly）——password 只存在于 session.ts 内部；任何工具响应、错误信息、日志不得包含凭据。
- **只读守卫**：`READONLY=true` 的 profile 拒绝一切 mutating 工具；集合从 `ToolDef.mutating` 元数据派生（见相关笔记），守卫与工具定义不脱钩。

## Alternatives considered

- **每 profile 一个服务器实例**：配置重复，MCP 客户端要维护多份 server 条目。
- **提供运行时切换连接参数的工具**：把凭据路径暴露给 LLM，直接违背隔离目标。
- **默认全可写、靠文档警告区分生产**：生产误操作与一次模型幻觉之间没有任何硬屏障。

## Consequences

- profile 是环境事实而非 LLM 可协商的状态；readonly 语义在连接层之下、工具层之上。
- legacy `default` profile 保留是为既有部署平滑迁移；新配置一律用多 profile 形式。
- `assertWritable` 这类守卫在工具执行前消费派生集合，失败信息不回显凭据或完整环境。

## Related

- 守卫消费的 mutating 集合见 [工具组聚合与元数据派生的 mutating 集合](2026-09-18-tool-groups-and-derived-mutating-set.md)。
