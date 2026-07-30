/**
 * Response shaping: unified envelopes, pagination, projection, summaries.
 *
 * These helpers keep the LLM context lean:
 *   - `envelope` wraps any result in a consistent { ok, data } shape.
 *   - `paginate` truncates table data to a soft cap and reports `truncated`.
 *   - `projectSaveResult` strips the verbose raw save/activate payload down to
 *     what an LLM actually needs (success/transport/lockHandle).
 *   - `summarize*` produce one-line overviews.
 */

/** Soft cap on returned table rows when no outputPath is given. */
export const TABLE_ROW_SOFT_CAP = 500
/** Default maxRows for table queries when the caller omits it. */
export const TABLE_ROW_DEFAULT = 50

export interface PaginationMeta {
  totalRows?: number
  returnedRows: number
  truncated: boolean
  /** Hint shown to the LLM when results were truncated. */
  hint?: string
  /** Set when a column list was rejected by SAP and the query fell back to
   * SELECT * with client-side projection (bw_table_get_data Bug 4 mitigation). */
  fallback?: string
  /** Requested columns that SAP omitted from the SELECT * result (and were
   * therefore dropped), when the SELECT * fallback ran. */
  droppedColumns?: string[]
}

export interface TableResult {
  tableName: string
  totalRows?: number
  columns?: string[]
  rows?: Record<string, unknown>[]
  /** Added by paginate. */
  _meta?: PaginationMeta
}

/**
 * Truncate rows to the soft cap for inline responses.
 * Callers with `outputPath` should skip this and return the full result so the
 * server can write the complete payload to disk.
 */
export function paginate(
  result: TableResult,
  softCap: number = TABLE_ROW_SOFT_CAP
): TableResult {
  const rows = result.rows || []
  const returnedRows = rows.length
  if (returnedRows <= softCap) {
    return { ...result, _meta: { returnedRows, truncated: false } }
  }
  return {
    ...result,
    rows: rows.slice(0, softCap),
    _meta: {
      totalRows: returnedRows,
      returnedRows: softCap,
      truncated: true,
      hint: `Result truncated to ${softCap} of ${returnedRows} rows. Re-run with outputPath to write the full result to a file.`,
    },
  }
}

/** Paginate only when the result will be returned inline (no outputPath). */
export function paginateUnlessBuffered(
  result: TableResult,
  outputPath: string | undefined,
  softCap: number = TABLE_ROW_SOFT_CAP
): TableResult {
  if (outputPath) return { ...result, _meta: { returnedRows: (result.rows || []).length, truncated: false } }
  return paginate(result, softCap)
}

/** One-line summary of a table result, for the output-to-file envelope. */
export function summarizeTable(result: TableResult): string {
  const cols = result.columns?.length ?? 0
  const rows = result.rows?.length ?? 0
  const total = result.totalRows ?? rows
  return `${result.tableName}: ${rows} row(s) returned (${total} total), ${cols} column(s).`
}

/** Project a save/activate raw result into a compact LLM-facing object. */
export function projectSaveResult(
  raw: Record<string, unknown>
): Record<string, unknown> {
  // save_and_activate_* methods return { lockHandle, transport, updateResult,
  // activated, activateResult } (and a few return className/classResult/trfnResult).
  // success follows `activated` when present; otherwise the call succeeded (ADT throws on hard failure).
  const out: Record<string, unknown> = {
    success: raw.activated === undefined ? true : Boolean(raw.activated),
  }
  for (const key of [
    "activated",
    "activateResult",
    "lockHandle",
    "transport",
    "className",
  ]) {
    if (raw[key] !== undefined) out[key] = raw[key]
  }
  return out
}

/**
 * Return the full save/activate payload when buffering to a file; otherwise a
 * compact projection for the LLM context.
 */
export function shapeSaveResult(
  raw: Record<string, unknown>,
  outputPath?: string
): Record<string, unknown> {
  if (outputPath) return raw
  return projectSaveResult(raw)
}

/**
 * Shape a get_xml response: with `outputPath` (or format=xml) return the raw XML
 * string so the file is usable as xmlPath later; otherwise return a compact summary.
 */
export function shapeXmlResult(
  xml: string,
  meta: Record<string, unknown>,
  opts: { format?: string; outputPath?: string }
): unknown {
  if (opts.outputPath || opts.format === "xml") return xml
  return {
    ...meta,
    format: "summary",
    bytes: Buffer.byteLength(xml, "utf8"),
    hint:
      "Raw XML omitted from this response. Re-run with outputPath (writes full XML to disk) " +
      "or format='xml' for an inline dump.",
  }
}

/** Convert a scalar/object to a one-line preview for an envelope summary. */
export function summarizeValue(value: unknown): string {
  if (value == null) return "null"
  if (typeof value === "string") {
    const trimmed = value.trimStart()
    if (trimmed.startsWith("<")) {
      return `XML string, ${Buffer.byteLength(value, "utf8")} byte(s)`
    }
    return value.slice(0, 200)
  }
  if (Array.isArray(value)) return `array of ${value.length} item(s)`
  if (typeof value === "object") {
    const keys = Object.keys(value as object)
    return `object with key(s): ${keys.slice(0, 10).join(", ")}${
      keys.length > 10 ? ", …" : ""
    }`
  }
  return String(value).slice(0, 200)
}

/** A rough size estimate (string length) of a JSON-serializable value. */
export function approxBytes(value: unknown): number {
  try {
    return Buffer.byteLength(
      typeof value === "string" ? value : JSON.stringify(value),
      "utf8"
    )
  } catch {
    return 0
  }
}
