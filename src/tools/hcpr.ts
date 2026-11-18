/**
 * HCPR (CompositeProvider) tools.
 *
 * Workflow: get_xml (outputPath) → edit file → save_and_activate (xmlPath).
 * Media type: application/vnd.sap.bw.modeling.hcpr-v1_15_0+xml
 */
import { z } from "zod"
import { defineTool, largeInput, outputPathField, readLargeInput } from "../tool"
import { shapeSaveResult, shapeXmlResult } from "../response"

export const hcprTools = [
  defineTool({
    name: "bw_hcpr_details",
    description:
      "Get a lightweight HCPR (CompositeProvider) projection (name, description, " +
      "schemaVersion, package, status). Prefer bw_hcpr_get_xml for full parts/mappings.",
    params: z.object({
      id: z.string().describe("HCPR technical name."),
      forceCacheUpdate: z.boolean().optional(),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      return client.getHCPRDetails(args.id, args.forceCacheUpdate)
    },
  }),

  defineTool({
    name: "bw_hcpr_get_xml",
    description:
      "Get the raw HCPR XML for PUT updates (hcpr-v1_15_0). ALWAYS prefer outputPath. " +
      "With outputPath, full XML is written to disk (reuse as xmlPath in " +
      "bw_hcpr_save_and_activate) and the MCP response is only a summary envelope. " +
      "Step 1 of read-modify-write.",
    params: z.object({
      id: z.string().describe("HCPR technical name."),
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
      const xml = await client.getHCPRXml(args.id, args.forceCacheUpdate)
      return shapeXmlResult(xml, { hcprId: args.id }, args)
    },
  }),

  defineTool({
    name: "bw_hcpr_versions",
    description: "Get HCPR version history.",
    params: z.object({ id: z.string() }),
    async run(client, args) {
      return client.getHCPRVersions(args.id)
    },
  }),

  defineTool({
    name: "bw_hcpr_check",
    description:
      "Check HCPR consistency (READ-ONLY, does NOT activate). Use bw_hcpr_activate to (re)activate.",
    params: z.object({ id: z.string() }),
    async run(client, args) {
      return client.checkHCPR(args.id)
    },
  }),

  defineTool({
    name: "bw_hcpr_activate",
    description:
      "Activate an HCPR — re-activate without changing content. " +
      "Locks → activates → unlocks. Use bw_hcpr_save_and_activate when XML was modified.",
    params: z.object({
      id: z.string(),
      transport: z.string().optional().describe("Workbench request number (corrNr)."),
    }),
    mutating: true,
    async run(client, args) {
      return client.activateHCPRWithLock(args.id, { transport: args.transport })
    },
  }),

  defineTool({
    name: "bw_hcpr_save_and_activate",
    description:
      "One-stop HCPR write: lock → transportchecks → PUT /m (timestamp + Transport-Lock-Holder) " +
      "→ (optional) activate → unlock. Prefer xmlPath (from bw_hcpr_get_xml + outputPath) " +
      "over inline xmlContent. When a transport is required: pass transport=<TRKORR> OR " +
      "createTransport=true.",
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
      const raw = await client.saveAndActivateHCPR(args.id, xml!, {
        transport: args.transport,
        createTransport: args.createTransport,
        transportDescription: args.transportDescription,
        autoActivate: args.autoActivate,
      })
      return shapeSaveResult(raw as unknown as Record<string, unknown>, args.outputPath)
    },
  }),
]
