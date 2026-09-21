# Agent Note: bw-adt-api 依赖切换到 npm registry

Status: implemented

## Problem

`"bw-adt-api": "file:../bw-adt-api"` 依赖兄弟目录的存在：CI 只 checkout 本仓库，npm 解析退回 registry 同名包——但 npm 上的 0.4.0 是 2026-09-19 发布的旧代码（无 `ensureEndRoutine`/`ensureStartRoutine`），`npm run build` 报 TS2339，4 个矩阵 job 全红；任何外部克隆同样无法安装。AGENTS.md 里 `../bw-adt-api` 相对链接也只在双仓库同级的本地成立。

## Decision

- 依赖改为 registry 版本 `^0.5.0`（bw-adt-api 0.5.0 于 2026-09-21 发布，含 ensure routines、ADSO key/xml 工具等全部现有库能力），lockfile resolved 固定 npmjs tarball + integrity。
- 本地联调需要跟随库的未发布改动时，用 `npm link bw-adt-api` 恢复兄弟目录符号链接；`npm ci`/`npm install` 会把它还原为 registry 版本。
- AGENTS.md 去掉 `../bw-adt-api` 相对链接，同步精简回 2000 字符预算内。

## Alternatives considered

- **保留 file: 依赖，CI 额外 checkout 兄弟仓库到 `../bw-adt-api`**：本地流不变，但外部克隆依然装不上，CI 多一步，且发布前 CI 与本地依赖内容不一致。
- **git 依赖（github tarball）**：可引用任意 commit，但安装慢、resolved 随分支漂移；registry 语义版本已满足需要。

## Consequences

- 库的新能力必须先发版（bw-adt-api minor/patch），mcp 升级依赖区间后才能使用；本地跟随未发布改动靠 `npm link`，且 `npm ci` 会还原。
- CI 与外部克隆的依赖来源统一为 registry：装到的就是发布物，构建行为与消费者一致。

