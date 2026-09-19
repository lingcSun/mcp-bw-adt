# Agent Note: bw_trfn_switch_runtime 改用一站式 switchRuntimeAndSave

Status: implemented

## Problem

`bw_trfn_switch_runtime` 要求调用方传 `lockHandle`——MCP 面没有 lock 工具，参数无处可取；其依赖的库方法 `BWAdtClient.switchTransformationRuntime` 又存在把解析对象 JSON.stringify 后当 XML 写回的缺陷（0.3.0），该工具端到端不可用。库侧已在一站式 `switchRuntimeAndSave` 中修复（见 bw-adt-api 仓库的 trfn-switch-runtime-defect 笔记）。

## Decision

工具改为调用 `client.switchRuntimeAndSave(id, useHana, opts)`：schema 删除 `lockHandle`、`version`、`corrNr`、`timestamp`，新增 `transport` / `createTransport` / `transportDescription` / `autoActivate`；返回值经 `shapeSaveResult` 压缩投影。`mutating: true` 不变。

## Alternatives considered

- **保留旧参数并内部加锁后调旧方法**：旧方法不做激活，切运行时后对象仍 inactive，还得多一步 `bw_dtp_activate` 式的补激活；一站式语义更完整。

## Consequences

- 工具 schema 变化（ breaking for 直接调用方；LLM 侧靠 description 引导）。
- 切换后默认自动激活（与"运行时切换需要重新激活才生效"的现实一致）。
