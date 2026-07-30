/**
 * DataSource (RSDS) tools.
 *
 * DataSources are identified by (datasource, sourceSystem) pairs.
 * Workflow: get_xml (outputPath) → edit → save_and_activate (xmlPath).
 */
import { z } from "zod"
import { defineTool, largeInput, outputPathField, readLargeInput } from "../tool"
import { shapeSaveResult, shapeXmlResult } from "../response"

export const datasourceTools = [
  defineTool({
    name: "bw_datasource_details",
    description: "Get parsed DataSource details. Prefer outputPath.",
    params: z.object({
      datasource: z.string(),
      sourceSystem: z.string(),
      forceCacheUpdate: z.boolean().optional(),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      return client.getDataSourceDetails(args.datasource, args.sourceSystem, args.forceCacheUpdate)
    },
  }),

  defineTool({
    name: "bw_datasource_get_xml",
    description:
      "Get raw DataSource XML for PUT updates. ALWAYS prefer outputPath. " +
      "With outputPath, full XML is written to disk (reuse as xmlPath in " +
      "bw_datasource_save_and_activate). Without it, format='summary' returns an overview; " +
      "format='xml' returns raw XML inline.",
    params: z.object({
      datasource: z.string(),
      sourceSystem: z.string(),
      forceCacheUpdate: z.boolean().optional(),
      format: z
        .enum(["summary", "xml"])
        .optional()
        .describe("Only affects inline responses (no outputPath)."),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      const xml = await client.getDataSourceXml(
        args.datasource,
        args.sourceSystem,
        args.forceCacheUpdate
      )
      return shapeXmlResult(
        xml,
        { datasource: args.datasource, sourceSystem: args.sourceSystem },
        args
      )
    },
  }),

  defineTool({
    name: "bw_datasource_fields",
    description: "Get parsed DataSource field list.",
    params: z.object({
      datasource: z.string(),
      sourceSystem: z.string(),
      forceCacheUpdate: z.boolean().optional(),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      return client.getDataSourceFields(args.datasource, args.sourceSystem, args.forceCacheUpdate)
    },
  }),

  defineTool({
    name: "bw_datasource_versions",
    description: "Get DataSource version history.",
    params: z.object({ datasource: z.string(), sourceSystem: z.string() }),
    async run(client, args) {
      return client.getDataSourceVersions(args.datasource, args.sourceSystem)
    },
  }),

  defineTool({
    name: "bw_datasource_merge_proposal",
    description:
      "Merge an ODP proposal (field sync after adapter change) into the current DataSource XML. " +
      "Prefer xmlPath over inline xmlContent; returns the merged XML — write it back via save_and_activate.",
    params: z.object({
      datasource: z.string(),
      sourceSystem: z.string(),
      ...largeInput("xml"),
      outputPath: outputPathField.describe("Recommended — merged XML can be large."),
    }),
    mutating: true,
    async run(client, args) {
      const xml = await readLargeInput(args, "xml", true)
      return client.mergeDataSourceProposal(args.datasource, args.sourceSystem, xml!)
    },
  }),

  defineTool({
    name: "bw_datasource_save_and_activate",
    description:
      "One-stop: lock → PUT → (optional) activate → unlock. Prefer xmlPath (from " +
      "bw_datasource_get_xml + outputPath) over inline xmlContent. " +
      "When a transport is required: pass transport=<TRKORR> OR createTransport=true. " +
      "Compact projection returned.",
    params: z.object({
      datasource: z.string(),
      sourceSystem: z.string(),
      ...largeInput("xml"),
      transport: z.string().optional(),
      createTransport: z.boolean().optional(),
      transportDescription: z.string().optional(),
      autoActivate: z.boolean().optional(),
      outputPath: outputPathField,
    }),
    mutating: true,
    async run(client, args) {
      const { datasource, sourceSystem, outputPath, ...opts } = args
      const xml = await readLargeInput(args, "xml", true)
      const raw = await client.saveAndActivateDataSource(datasource, sourceSystem, xml!, opts)
      return shapeSaveResult(raw as unknown as Record<string, unknown>, outputPath)
    },
  }),
]
