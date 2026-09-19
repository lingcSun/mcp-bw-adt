# Agent Note: bw_env_switch 释放上一个 profile 的服务端会话

Status: implemented

## Problem

`switchProfile` 只切换 `currentName`，旧 profile 的 `BWAdtClient`（及其 BW 服务端 stateful 会话）留在 `clients` 缓存里直到进程退出。频繁 test/prod 切换会在服务器侧积累挂起会话，SAP 有单用户会话数上限，最终表现为新登录被拒（"maximum sessions reached"），而 MCP 侧没有任何提示。`bw_disconnect` 只处理当前 profile，救不了被切走的那些。

## Decision

`switchProfile` 在切换时对上一个 profile 已存在的 client 执行 best-effort `logout()`（`void … .catch(() => {})`，不阻塞、不抛错）并从 `clients` 缓存移除。切回该 profile 时 `getClient` 重建客户端，首个请求自动重新登录。

## Alternatives considered

- **保持现状、仅写文档提醒先 bw_disconnect**：把正确性依赖在 LLM/用户记住约定上，不可靠。
- **加 `BW_MCP_LOGOUT_ON_SWITCH` 开关默认关闭**：多一个配置面；自动重登让"切回成本"只是一次登录，默认开启更符合"会话是服务器资源"的模型。

## Consequences

- 环境切换后旧 profile 的未保存上下文（无——client 无状态，只持有会话 cookie）无损失；切回时多一次登录开销。
- logout 请求失败（网络/会话已失效）被静默忽略，与原行为的差异仅在服务端会话留存时长。
- `SERVER_VERSION` 常量同步对齐 package 版本（此前一直停在 0.1.0）。
