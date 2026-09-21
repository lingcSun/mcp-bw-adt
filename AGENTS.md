# mcp-bw-adt — Agent Instructions

MCP 服务器，封装 npm 包 `bw-adt-api`，向 LLM 客户端（ZCode、Claude Desktop 等）暴露 SAP BW/4HANA ADT 操作：Public 面 75 个工具，带大 XML/表数据的本地文件缓冲层。

## Commands

```bash
npm run build       # tsc → build/
npm run watch       # tsc -w
npm run start       # 运行编译产物（stdio 传输）
npm run list-tools  # 打印工具目录 JSON（无需 BW 连接）
```

## Layout

- `src/index.ts` stdio 启动；`src/server.ts` MCP 装配、调用路由与 `outputPath` 拦截（缓冲机制 B）
- `src/tools/*.ts` 工具组（`ToolDef[]`，`mutating: true` 标注）；`tools/index.ts` 聚合 `ALL_TOOLS`
- `src/mutating.ts` 从元数据派生变更工具集合（供只读 profile 守卫）
- `src/session.ts` 多 profile `BWAdtClient` 管理（`BW_PROFILES`/`BW_DEFAULT`）
- `src/fileio.ts` 本地文件缓冲（workdir 沙箱：`BW_MCP_WORKDIR` 或 `.mcp-bw-out`）
- `src/response.ts` / `src/errors.ts` / `src/tool.ts` 结果封装、错误映射、ToolDef→JSON Schema
- `src/adsoProfiles.ts` ADSO 类型语义层（类型→属性包 + D1/D7/D8 约束）

## Invariants

- **凭据永不进入 LLM 可见面**：工具响应、错误信息、日志不得包含 password；对外只暴露 ProfileInfo（[rationale](.agents/notes/implemented/architecture/2026-09-18-multi-profile-sessions.md)）。
- **大字节不经过 LLM 上下文**：大输入走文件路径（机制 A），大输出走 outputPath 落盘（机制 B）；一切路径限定在 workdir 沙箱内（[rationale](.agents/notes/implemented/feature/2026-09-18-local-file-buffering.md)）。
- **变更工具必须标注 `mutating: true`**：只读守卫由该元数据派生，漏标即漏守卫；工具面是策划的 Public 子集，不自动镜像库 API（[rationale](.agents/notes/implemented/architecture/2026-09-18-tool-groups-and-derived-mutating-set.md)）。
- **npm 版本**：工具面 semver——新工具/能力 → minor，修复 → patch，破坏契约 → major；0.x 期 minor 可含破坏。release commit 集中版本号，build+list-tools 全绿后 publish（[checklist](.agents/notes/implemented/process/2026-09-19-npm-release-versioning.md)）。

本文件预算 ≤ 2000 字符（按字符计，中英文同口径）。超出先搬家（挪到笔记或 README）、再压缩；确需更多才改这个数字，并在提交说明里给理由。

## Agent Notes

非平凡变更必须在同一提交新增或更新至少一篇 Agent Note（[规则](.agents/notes/README.md#何时必须写)）；每篇新笔记触发 supersession 检查。决策语料在 [.agents/notes/](.agents/notes/AGENTS.md)。写行为断言（文档、注释、笔记）时用 [test-dont-assume](.agents/skills/test-dont-assume/SKILL.md) 技能。门禁 `npm run verify:agents` 校验根文件预算、笔记格式与链接。
