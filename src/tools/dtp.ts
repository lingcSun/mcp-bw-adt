/**
 * Data Transfer Process (DTP) tools.
 *
 * Workflow: get_xml (outputPath) → edit → save_and_activate (xmlPath).
 */
import { z } from "zod"
import { defineTool, largeInput, outputPathField, readLargeInput } from "../tool"
import { shapeSaveResult, shapeXmlResult } from "../response"

export const dtpTools = [
  defineTool({
    name: "bw_dtp_details",
    description:
      "Get parsed-and-projected DTP details (fields, filter, program flow extracted from the XML tree). Prefer outputPath.",
    params: z.object({
      id: z.string(),
      forceCacheUpdate: z.boolean().optional(),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      return client.getDTPDetails(args.id, args.forceCacheUpdate)
    },
  }),

  defineTool({
    name: "bw_dtp_get_xml",
    description:
      "Get the raw DTP XML string for PUT updates. ALWAYS prefer outputPath. " +
      "With outputPath, the full XML is written to disk (reuse as xmlPath in " +
      "bw_dtp_save_and_activate) and the MCP response is only a summary envelope. Without " +
      "outputPath, format='summary' (default) returns a small overview; format='xml' returns " +
      "the raw XML inline. Step 1 of read-modify-write.",
    params: z.object({
      id: z.string().describe("DTP technical name."),
      forceCacheUpdate: z.boolean().optional(),
      format: z
        .enum(["summary", "xml"])
        .optional()
        .describe(
          "Only affects inline responses (no outputPath). summary (default) = overview; xml = raw XML."
        ),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      const xml = await client.getDTPXml(args.id, args.forceCacheUpdate)
      return shapeXmlResult(xml, { dtpId: args.id }, args)
    },
  }),

  defineTool({
    name: "bw_dtp_versions",
    description: "Get DTP version history.",
    params: z.object({ id: z.string() }),
    async run(client, args) {
      return client.getDTPVersions(args.id)
    },
  }),

  defineTool({
    name: "bw_dtp_check",
    description: "Check DTP consistency.",
    params: z.object({ id: z.string() }),
    async run(client, args) {
      return client.checkDTP(args.id)
    },
  }),

  defineTool({
    name: "bw_dtp_execute",
    description: "Execute a DTP (triggers data transfer). Irreversible action.",
    params: z.object({ id: z.string() }),
    mutating: true,
    async run(client, args) {
      return client.executeDTP(args.id)
    },
  }),

  defineTool({
    name: "bw_dtp_save_and_activate",
    description:
      "One-stop: lock → PUT → (optional) activate → unlock. Prefer xmlPath (from " +
      "bw_dtp_get_xml + outputPath) over inline xmlContent. " +
      "When a transport is required: pass transport=<TRKORR> OR createTransport=true. " +
      "Compact projection returned; set outputPath for full detail.",
    params: z.object({
      id: z.string(),
      ...largeInput("xml"),
      transport: z.string().optional(),
      createTransport: z.boolean().optional(),
      transportDescription: z.string().optional(),
      autoActivate: z.boolean().optional(),
      outputPath: outputPathField,
    }),
    mutating: true,
    async run(client, args) {
      const xml = await readLargeInput(args, "xml", true)
      const raw = await client.saveAndActivateDTP(args.id, xml!, {
        transport: args.transport,
        createTransport: args.createTransport,
        transportDescription: args.transportDescription,
        autoActivate: args.autoActivate,
      })
      return shapeSaveResult(raw as unknown as Record<string, unknown>, args.outputPath)
    },
  }),
]
