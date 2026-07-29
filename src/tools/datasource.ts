/**
 * DataSource (RSDS) tools.
 *
 * DataSources are identified by (datasource, sourceSystem) pairs. lock/unlock and
 * all ops are stateful. updateDataSource requires a lockHandle; save_and_activate
 * handles locking internally.
 */
import { z } from "zod"
import { defineTool, largeInput, outputPathField, readLargeInput } from "../tool"
import { shapeSaveResult, shapeXmlResult } from "../response"

export const datasourceTools = [
  defineTool({
    name: "bw_datasource_get",
    description: "Get raw DataSource metadata. Prefer outputPath.",
    params: z.object({
      datasource: z.string(),
      sourceSystem: z.string().describe("Logical source system, e.g. S4DCLNT300."),
      forceCacheUpdate: z.boolean().optional(),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      return client.getDataSource(args.datasource, args.sourceSystem, args.forceCacheUpdate)
    },
  }),

  defineTool({
    name: "bw_datasource_get_xml",
    description:
      "Get raw DataSource XML for PUT updates. Large — ALWAYS set outputPath. " +
      "With outputPath, full XML is written to disk (usable as xmlPath). Without it, " +
      "format='summary' returns an overview; format='xml' returns raw XML inline.",
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
    name: "bw_datasource_lock",
    description: "Lock a DataSource (stateful session). Returns lockHandle.",
    params: z.object({ datasource: z.string(), sourceSystem: z.string() }),
    async run(client, args) {
      return client.lockDataSource(args.datasource, args.sourceSystem)
    },
  }),

  defineTool({
    name: "bw_datasource_unlock",
    description: "Unlock a DataSource.",
    params: z.object({ datasource: z.string(), sourceSystem: z.string() }),
    async run(client, args) {
      return client.unlockDataSource(args.datasource, args.sourceSystem)
    },
  }),

  defineTool({
    name: "bw_datasource_update",
    description:
      "Update a DataSource via PUT. XML via xmlContent or xmlPath. lockHandle required.",
    params: z.object({
      datasource: z.string(),
      sourceSystem: z.string(),
      ...largeInput("xml"),
      lockHandle: z.string().describe("Required lock handle from bw_datasource_lock."),
      transport: z.string().optional(),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      const { datasource, sourceSystem, lockHandle, transport } = args
      const xml = await readLargeInput(args, "xml", true)
      return client.updateDataSource(datasource, sourceSystem, xml!, {
        lockHandle,
        transport,
      })
    },
  }),

  defineTool({
    name: "bw_datasource_activate",
    description: "Activate a DataSource. lockHandle/corrNr optional.",
    params: z.object({
      datasource: z.string(),
      sourceSystem: z.string(),
      lockHandle: z.string().optional(),
      corrNr: z.string().optional(),
    }),
    async run(client, args) {
      return client.activateDataSource(args.datasource, args.sourceSystem, args.lockHandle, args.corrNr)
    },
  }),

  defineTool({
    name: "bw_datasource_merge_proposal",
    description:
      "Merge an ODP proposal (field sync after adapter change) into the current DataSource XML. " +
      "XML via xmlContent or xmlPath; returns the merged XML — write it back via save_and_activate.",
    params: z.object({
      datasource: z.string(),
      sourceSystem: z.string(),
      ...largeInput("xml"),
      outputPath: outputPathField.describe("Recommended — merged XML can be large."),
    }),
    async run(client, args) {
      const xml = await readLargeInput(args, "xml", true)
      return client.mergeDataSourceProposal(args.datasource, args.sourceSystem, xml!)
    },
  }),

  defineTool({
    name: "bw_datasource_save_and_activate",
    description:
      "One-stop: lock → PUT → (optional) activate → unlock. XML via xmlContent or xmlPath. " +
      "Compact projection returned.",
    params: z.object({
      datasource: z.string(),
      sourceSystem: z.string(),
      ...largeInput("xml"),
      transport: z.string().optional(),
      transportDescription: z.string().optional(),
      autoActivate: z.boolean().optional(),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      const { datasource, sourceSystem, outputPath, ...opts } = args
      const xml = await readLargeInput(args, "xml", true)
      const raw = await client.saveAndActivateDataSource(datasource, sourceSystem, xml!, opts)
      return shapeSaveResult(raw as Record<string, unknown>, outputPath)
    },
  }),
]
