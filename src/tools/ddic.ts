/**
 * DDIC table & ADSO data tools.
 *
 * Table data is the biggest payload class. Prefer outputPath for anything sizeable.
 * Use bw_table_describe for a merged metadata/info/fields/data-metadata snapshot.
 */
import { z } from "zod"
import { defineTool, largeInput, outputPathField } from "../tool"
import { paginateUnlessBuffered, TABLE_ROW_DEFAULT } from "../response"
import { isAdtError } from "bw-adt-api"

export const ddicTools = [
  defineTool({
    name: "bw_table_describe",
    description:
      "Describe a DDIC table in one call: merges metadata, info, fields, and data-preview " +
      "metadata. Prefer outputPath when you need the full snapshot.",
    params: z.object({
      table: z.string().describe("DDIC table name."),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      const facade = (
        client as {
          ddic?: { describe?: (table: string) => Promise<unknown> }
        }
      ).ddic
      if (facade?.describe) {
        return facade.describe(args.table)
      }
      const [metadata, info, fields, dataMetadata] = await Promise.all([
        client.getDDICTableMetadata(args.table).catch(() => undefined),
        client.getDDICTableInfo(args.table).catch(() => undefined),
        client.getDDICTableFields(args.table).catch(() => undefined),
        client.getDDICTableDataMetadata(args.table).catch(() => undefined),
      ])
      return { metadata, info, fields, dataMetadata }
    },
  }),

  defineTool({
    name: "bw_table_get_data",
    description:
      "Query DDIC table data via the ADT data-preview service (OpenSQL SELECT). " +
      "maxRows defaults to a small value and is capped to avoid huge inline payloads; " +
      "for large reads set outputPath to dump the full result to a file.",
    params: z.object({
      table: z.string().describe("DDIC table name."),
      maxRows: z
        .number()
        .int()
        .positive()
        .max(100000)
        .optional()
        .describe(`Max rows to fetch (default ${TABLE_ROW_DEFAULT}).`),
      columns: z
        .array(z.string())
        .optional()
        .describe("Optional column allowlist. If omitted, all columns are read."),
      whereClause: z
        .string()
        .optional()
        .describe(
          "OpenSQL WHERE clause, without the WHERE keyword. " +
            "⚠️ Executed with the configured BW credentials — avoid untrusted input."
        ),
      orderBy: z
        .string()
        .optional()
        .describe("OpenSQL ORDER BY clause, without the ORDER BY keyword."),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      const opts = {
        maxRows: args.maxRows ?? TABLE_ROW_DEFAULT,
        columns: args.columns,
        whereClause: args.whereClause,
        orderBy: args.orderBy,
      }

      let result
      let fallbackUsed = false
      let droppedColumns: string[] | undefined
      try {
        result = await client.getDDICTableData(args.table, opts)
      } catch (err) {
        // SAP's data-preview rejects certain columns from an explicit field list
        // with HTTP 400. Retry with SELECT * + client-side projection.
        if (args.columns && args.columns.length > 0 && isColumnListRejection(err)) {
          fallbackUsed = true
          result = await client.getDDICTableData(args.table, {
            ...opts,
            columns: undefined,
            selectStar: true,
          })
          const projected = projectColumns(result, args.columns)
          result = projected.result
          droppedColumns = projected.droppedColumns
        } else {
          throw err
        }
      }

      const shaped = paginateUnlessBuffered(
        { ...result, tableName: result.tableName },
        args.outputPath
      )
      if (fallbackUsed && shaped._meta) {
        shaped._meta.fallback =
          "columns-rejected-by-server; retried with literal SELECT * and projected client-side"
        shaped._meta.droppedColumns = droppedColumns
      }
      return shaped
    },
  }),

  defineTool({
    name: "bw_adso_data_preview",
    description:
      "Preview data of the active table behind an ADSO. Same sizing guidance as bw_table_get_data — prefer outputPath for anything non-trivial.",
    params: z.object({
      adsoName: z.string().describe("ADSO technical name."),
      maxRows: z
        .number()
        .int()
        .positive()
        .max(100000)
        .optional()
        .describe(`Max rows to fetch (default ${TABLE_ROW_DEFAULT}).`),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      const result = await client.getADSODataPreview(
        args.adsoName,
        args.maxRows ?? TABLE_ROW_DEFAULT
      )
      return paginateUnlessBuffered(result, args.outputPath)
    },
  }),

  defineTool({
    name: "bw_table_query_sql",
    description:
      "Run an arbitrary OpenSQL statement via ADT Data Preview freestyle " +
      "(POST /sap/bc/adt/datapreview/freestyle — same as ADT SQL Console). " +
      "Pass the statement inline (sqlStatementContent) or from a file (sqlStatementPath). " +
      "Prefer outputPath for non-trivial results. " +
      "⚠️ Runs with the configured BW credentials — treat as a privileged data-plane operation; prefer SELECT-only statements.",
    params: z.object({
      table: z
        .string()
        .optional()
        .describe(
          "Optional label for the result set (not sent to the freestyle endpoint)."
        ),
      maxRows: z
        .number()
        .int()
        .positive()
        .max(100000)
        .optional()
        .describe(`Max rows to fetch (default ${TABLE_ROW_DEFAULT}).`),
      ...largeInput("sqlStatement"),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      const { readLargeInput } = await import("../tool")
      const sql = await readLargeInput(args, "sqlStatement", true)
      const result = await client.getTableDataViaSQL(args.table ?? "", sql!, {
        maxRows: args.maxRows ?? TABLE_ROW_DEFAULT,
      })
      return paginateUnlessBuffered(result, args.outputPath)
    },
  }),
]

// ---------------------------------------------------------------------------
// Helpers: detect SAP's column-list rejections and project client-side.
// ---------------------------------------------------------------------------

function isColumnListRejection(err: unknown): boolean {
  if (!isAdtError(err)) return false
  const e = err as unknown as {
    err?: number
    message?: string
    localizedMessage?: string
  }
  if (e.err !== 400) return false
  const msg = `${e.localizedMessage || ""} ${e.message || ""}`
  return /unknown column|cannot specify a field list|field list/i.test(msg)
}

function projectColumns(
  result: {
    tableName: string
    totalRows?: number
    rows?: Record<string, unknown>[]
    columns?: string[]
  },
  requested: string[]
): { result: typeof result; droppedColumns: string[] | undefined } {
  const available = new Set((result.columns || []).map((c) => c.toUpperCase()))
  const keep = requested.filter((c) => available.has(c.toUpperCase()))
  const dropped = requested.filter((c) => !available.has(c.toUpperCase()))
  const rows = (result.rows || []).map((row) => {
    const out: Record<string, unknown> = {}
    for (const c of keep) {
      const key = Object.keys(row).find((k) => k.toUpperCase() === c.toUpperCase())
      if (key) out[key] = row[key]
    }
    return out
  })
  return {
    result: { ...result, columns: keep, rows },
    droppedColumns: dropped.length > 0 ? dropped : undefined,
  }
}
