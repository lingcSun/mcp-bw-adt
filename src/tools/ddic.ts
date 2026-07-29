/**
 * DDIC table & ADSO data tools.
 *
 * Table data is the biggest payload class (measured: 100 rows x 20 cols ≈ 68 KB,
 * maxRows=10000 ≈ 6.7 MB). So these tools:
 *   - default maxRows to a small number and cap it,
 *   - paginate the result when returned inline,
 *   - strongly favor outputPath for anything sizeable.
 */
import { z } from "zod"
import { defineTool, largeInput, outputPathField } from "../tool"
import { paginateUnlessBuffered, TABLE_ROW_DEFAULT } from "../response"

export const ddicTools = [
  defineTool({
    name: "bw_table_metadata",
    description:
      "Get DDIC table metadata (blueSource format): responsible, language, package, links.",
    params: z.object({
      table: z.string().describe("DDIC table name."),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      return client.getDDICTableMetadata(args.table)
    },
  }),

  defineTool({
    name: "bw_table_info",
    description:
      "Get DDIC table info: fields (name, key, type, length, decimals), description, delivery class.",
    params: z.object({
      table: z.string().describe("DDIC table name."),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      return client.getDDICTableInfo(args.table)
    },
  }),

  defineTool({
    name: "bw_table_fields",
    description: "Get the field list of a DDIC table (parsed from table source).",
    params: z.object({ table: z.string().describe("DDIC table name.") }),
    async run(client, args) {
      return client.getDDICTableFields(args.table)
    },
  }),

  defineTool({
    name: "bw_table_data_metadata",
    description: "Get data-preview metadata for a DDIC table (column list, etc.).",
    params: z.object({
      table: z.string().describe("DDIC table name."),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      return client.getDDICTableDataMetadata(args.table)
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
      const result = await client.getDDICTableData(args.table, {
        maxRows: args.maxRows ?? TABLE_ROW_DEFAULT,
        columns: args.columns,
        whereClause: args.whereClause,
        orderBy: args.orderBy,
      })
      return paginateUnlessBuffered(
        { ...result, tableName: result.tableName },
        args.outputPath
      )
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

  defineTool({
    name: "bw_adso_ddic_links",
    description: "Get DDIC table link / data-preview link for an ADSO (from response headers).",
    params: z.object({ adsoId: z.string() }),
    async run(client, args) {
      return client.getADSODDICLinks(args.adsoId)
    },
  }),

  defineTool({
    name: "bw_adso_ddic_table_name",
    description: "Resolve the underlying DDIC table name for an ADSO.",
    params: z.object({ adsoId: z.string() }),
    async run(client, args) {
      return { ddicTableName: await client.getADSODDICTableName(args.adsoId) }
    },
  }),
]
