/**
 * Mutating tools are derived from ToolDef.mutating on ALL_TOOLS.
 */
import { ALL_TOOLS } from "./tools"

let cached: Set<string> | undefined

export function getMutatingToolNames(): Set<string> {
  if (!cached) {
    cached = new Set(
      ALL_TOOLS.filter((t) => t.mutating === true).map((t) => t.name)
    )
  }
  return cached
}

export function isMutatingTool(name: string): boolean {
  return getMutatingToolNames().has(name)
}
