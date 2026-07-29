/**
 * BICS Reporting / Provider Preview tools.
 *
 * Multidimensional preview for ADSO / InfoObject / Composite Provider via
 * /sap/bw/modeling/comp/reporting (same as Eclipse Dashboard Preview).
 * Prefer bw_reporting_preview for everyday use; initial/update for full control.
 */
import { z } from "zod"
import { defineTool, outputPathField } from "../tool"
import { paginateUnlessBuffered, TABLE_ROW_SOFT_CAP } from "../response"

const AXIS = z.enum(["ROWS", "COLUMNS", "FREE"])

const pagingFields = {
  fromRow: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Result-set start row (default 0)."),
  toRow: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Result-set end row inclusive (default ~1000 on server)."),
}

type QueryViewLike = {
  name?: string
  txt?: string
  flatRows?: Array<Record<string, string | number | null>>
  messages?: unknown
  kyfStructure?: { keyFigures?: Array<{ altName?: string; name?: string; txt?: string }> }
  metaData?: {
    characteristics?: unknown[]
    keyFigures?: unknown[]
  }
  state?: unknown[]
  resultSet?: unknown
}

/** Inline: flat table + light meta. With outputPath: full QueryView (server writes file). */
function shapeReportingView(
  view: QueryViewLike,
  outputPath: string | undefined
): unknown {
  if (outputPath) return view

  const flat = view.flatRows || []
  const columns = flat.length > 0 ? Object.keys(flat[0]) : []
  const table = paginateUnlessBuffered(
    {
      tableName: view.name || "REPORTING",
      totalRows: flat.length,
      columns,
      rows: flat as Record<string, unknown>[],
    },
    undefined,
    TABLE_ROW_SOFT_CAP
  )

  return {
    name: view.name,
    txt: view.txt,
    keyFigures: view.kyfStructure?.keyFigures?.map(k => ({
      name: k.altName || k.name,
      txt: k.txt,
    })),
    characteristicCount: view.metaData?.characteristics?.length,
    keyFigureCount: view.metaData?.keyFigures?.length,
    stateCount: view.state?.length,
    messages: view.messages,
    ...table,
  }
}

export const reportingTools = [
  defineTool({
    name: "bw_reporting_initial_view",
    description:
      "GET BICS initial reporting view for an ADSO / InfoObject / Composite Provider " +
      "(compid !NAME). Returns metadata (characteristics, key figures, ids), default axes, " +
      "and result set. Prefer outputPath — payloads are large. For axis remapping use " +
      "bw_reporting_preview instead.",
    params: z.object({
      provider: z
        .string()
        .describe("Provider technical name, with or without ! prefix (e.g. ZL_FID09)."),
      ...pagingFields,
      inclMetadata: z.boolean().optional().describe("Include metadata (default true)."),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      const view = await client.getReportingInitialView(args.provider, {
        fromRow: args.fromRow,
        toRow: args.toRow,
        inclMetadata: args.inclMetadata,
      })
      return shapeReportingView(view, args.outputPath)
    },
  }),

  defineTool({
    name: "bw_reporting_update_view",
    description:
      "POST updated BICS axes and refresh the result set. Pass the full infoObject state " +
      "(name/id/axis/pos) from bw_reporting_initial_view. Prefer bw_reporting_preview when you " +
      "only need to set row/column characteristic names.",
    params: z.object({
      provider: z.string().describe("Provider name, with or without ! prefix."),
      state: z
        .array(
          z.object({
            name: z.string(),
            id: z.string(),
            axis: AXIS,
            pos: z.number().int().optional(),
          })
        )
        .min(1)
        .describe("Full selection state (all infoObjects with ROWS/COLUMNS/FREE)."),
      ...pagingFields,
      outputPath: outputPathField,
    }),
    async run(client, args) {
      const view = await client.updateReportingView(args.provider, args.state, {
        fromRow: args.fromRow,
        toRow: args.toRow,
      })
      return shapeReportingView(view, args.outputPath)
    },
  }),

  defineTool({
    name: "bw_reporting_preview",
    description:
      "Convenience BICS preview: GET metadata → put named characteristics on ROWS " +
      "(optional COLUMNS) → POST refresh. Same as Eclipse Dashboard Preview for ADSO / " +
      "characteristic / Composite Provider. Inline response is flatRows (paginated); " +
      "set outputPath for the full QueryView.",
    params: z.object({
      provider: z
        .string()
        .describe("Provider technical name, with or without ! (e.g. ZL_FID09)."),
      rows: z
        .array(z.string())
        .min(1)
        .describe("Characteristic names for the ROWS axis (e.g. [\"0PROFIT_CTR\", \"0COMP_CODE\"])."),
      columns: z
        .array(z.string())
        .optional()
        .describe(
          "Optional characteristic names for COLUMNS. Omit to keep the key-figure structure on COLUMNS."
        ),
      ...pagingFields,
      outputPath: outputPathField,
    }),
    async run(client, args) {
      const view = await client.queryProviderPreview(args.provider, {
        rows: args.rows,
        columns: args.columns,
        fromRow: args.fromRow,
        toRow: args.toRow,
      })
      return shapeReportingView(view, args.outputPath)
    },
  }),
]
