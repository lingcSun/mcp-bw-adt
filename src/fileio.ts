/**
 * Local-file buffering for large MCP inputs/outputs.
 *
 * bw-adt-api payloads can be very large (object XML 15–80 KB, table data up to
 * MBs). Pushing these through the LLM context window is wasteful or fatal. This
 * module lets tools:
 *   - accept a large request body from a local file instead of inline content
 *     (mechanism A, `readInput`),
 *   - write a large response to a local file and return only a small summary
 *     envelope (mechanism B, `writeOutput`).
 *
 * All paths resolve under `workdir` (BW_MCP_WORKDIR or `<cwd>/.mcp-bw-out`) and
 * are confined to that subtree — no `..` escapes. The default scratch directory
 * avoids accidentally overwriting project source files.
 */
import * as fs from "fs"
import * as path from "path"

/** Root directory for all file buffering (captured at startup). */
export const workdir: string = path.resolve(
  process.env.BW_MCP_WORKDIR || path.join(process.cwd(), ".mcp-bw-out")
)

/** Normalize to an absolute, lowercased path for case-insensitive prefix checks. */
function lower(p: string): string {
  // normPath handles drive-letter casing differences on Windows.
  return path.resolve(p).toLowerCase()
}

/**
 * Resolve `p` against `workdir` and verify it stays inside the workdir subtree.
 * Throws on escape attempts (e.g. `../../etc/passwd`).
 */
export function resolveWithin(p: string): string {
  const abs = path.resolve(workdir, p)
  const wd = lower(workdir)
  const lo = lower(abs)
  // abs must equal workdir or be a child of it.
  if (lo !== wd && !lo.startsWith(wd + path.sep.toLowerCase())) {
    throw new Error(
      `Path is outside the workdir sandbox: ${p}\n  resolved: ${abs}\n  workdir: ${workdir}`
    )
  }
  return abs
}

export interface InputSource {
  /** Inline content. Used only when `path` is absent. */
  content?: string
  /** Path (relative to workdir) to a file containing the content. Takes precedence. */
  path?: string
}

/**
 * Read a large input body. If `path` is given, read the file under workdir;
 * otherwise use `content`. Throws if neither is provided (or both empty).
 *
 * @param label short human label for the payload (e.g. "ADSO XML"), used in errors.
 */
export async function readInput(
  src: InputSource,
  label: string
): Promise<string> {
  if (src.path) {
    const abs = resolveWithin(src.path)
    return fs.promises.readFile(abs, "utf8")
  }
  if (src.content != null && src.content !== "") {
    return src.content
  }
  throw new Error(
    `${label} is required: provide it inline via the *Content field, ` +
      `or reference a file under the workdir via the *Path field. ` +
      `workdir=${workdir}`
  )
}

export interface WriteOutputResult {
  /** Absolute path that was written. */
  outputPath: string
  /** Bytes written. */
  bytes: number
}

/**
 * Write `data` under workdir. Strings (e.g. raw XML) are written as UTF-8 text
 * so they round-trip via *Path fields; other values are JSON-serialized.
 * Creates parent directories as needed.
 */
export async function writeOutput(
  relPath: string,
  data: unknown
): Promise<WriteOutputResult> {
  const abs = resolveWithin(relPath)
  await fs.promises.mkdir(path.dirname(abs), { recursive: true })
  const body =
    typeof data === "string" ? data : JSON.stringify(data, null, 2)
  await fs.promises.writeFile(abs, body, "utf8")
  return { outputPath: abs, bytes: Buffer.byteLength(body) }
}
