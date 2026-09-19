# Agent Note: ok() 对 undefined 工具结果兜底为 "ok"

Status: implemented

## Problem

`server.ts` 的 `ok()` 把工具返回值 `JSON.stringify` 后放进 `content[0].text`。任何 `run()` 返回 undefined 的工具都会触发：`JSON.stringify(undefined)` 返回 undefined，MCP 结果缺 `content[0].text`，schema 校验失败。实锤案例是 `bw_object_delete`——依赖的 `bw-adt-api@0.3.0` 的 `delete()` resolve undefined。删除在服务端实际成功而客户端报错，LLM 可能重试不可逆操作。

## Decision

`ok()` 的 text 表达式加 `?? "ok"` 兜底：`JSON.stringify` 结果为 undefined 时使用字符串 `"ok"`。字符串、对象、null、数字等其余输入的行为不变（`null` 序列化为 `"null"`，不受影响）。

## Alternatives considered

- **在 bw-adt-api 层让 `delete()` 返回确认对象**：已做（见 bw-adt-api 仓库的 delete() 确认对象笔记），根治该工具且给出删除语义；但 ok() 兜底覆盖未来任何返回 undefined 的工具/API 组合，且不依赖重新发布依赖版本。
- **逐工具包装 run() 返回值**：41 处直通调用逐个改，重复且必然再漏。

## Consequences

- 返回 undefined 的工具结果为文本 `"ok"`——语义弱但 schema 合法；待 bw-adt-api 发布含 delete() 确认对象的版本后，`bw_object_delete` 自然升级为结构化结果。
