# Agent Note: bw_object_delete 对 adso/area 自动加锁

Status: implemented

## Problem

`bw_object_delete` 对 `objectType: adso / area` 硬性要求 `lockHandle`，但原子 lock 工具已在 Public 面收缩（094cff8）时全部移除——MCP 面上没有任何工具能产出 ADSO 的 lockHandle，ADSO 删除成为不可用路径（InfoArea 有专用的 `bw_area_delete` 内部加锁所以能用）。工具描述里"bw_dtp_activate-style lock is not enough, lock the ADSO itself"的要求恰恰指向一个不存在的工具。

## Decision

`run()` 对 adso / area 且未传 `lockHandle` 时自动加锁：`getObject` → `obj.lock()` → `obj.delete({ lockHandle, transport })`（库的 `BWObject.delete` 在 lockHandle 模式下自带 unlock）。已有 `lockHandle` 的高级调用方行为不变。工具描述与参数说明同步改写。

## Alternatives considered

- **恢复 `bw_adso_lock` 工具**：与 Public 面收缩决策相逆，为一个冷路径重新暴露 Advanced 原子操作不值。
- **库层给 `BWObject.delete` 加自动锁**：库层 delete 的"先锁后删"语义对 ADSO 是既有契约，改动波及面大；MCP 工具层补齐即可。

## Consequences

- adso/area 删除前多一次 lock 请求（与 `bw_area_delete` 同构）。
- `bw_dtp_activate` 返回的 lockHandle 依旧不可用作删除依据（unlock 在库层 finally 中已执行，且 DTP 的锁管不到 ADSO）。
