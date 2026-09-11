/**
 * ADSO (Advanced DataStore Object) tools.
 *
 * Workflow: get_xml (outputPath) → edit file → save_and_activate (xmlPath).
 * Or use atomic helpers (add_field / create) that hide large XML from the caller.
 */
import { z } from "zod"
import { defineTool, largeInput, outputPathField, readLargeInput } from "../tool"
import { shapeSaveResult, shapeXmlResult } from "../response"

const FIELD_DATA_TYPES = [
  "CHAR",
  "NUMC",
  "DATS",
  "TIMS",
  "DEC",
  "CUKY",
  "CURR",
  "QUAN",
  "INT4",
  "FLTP",
] as const

export const adsoTools = [
  defineTool({
    name: "bw_adso_details",
    description:
      "Get parsed ADSO metadata (fields, indexes, partitioning). Prefer outputPath. " +
      "May include configuration, associated DDIC tables, and related DDIC links when the " +
      "enriched client path is available; otherwise returns the standard details projection.",
    params: z.object({
      id: z.string(),
      forceCacheUpdate: z.boolean().optional(),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      const facade = (client as { adso?: { details?: (id: string, force?: boolean) => Promise<unknown> } })
        .adso
      if (facade?.details) {
        return facade.details(args.id, args.forceCacheUpdate)
      }
      return client.getADSODetails(args.id, args.forceCacheUpdate)
    },
  }),

  defineTool({
    name: "bw_adso_versions",
    description: "Get ADSO version history.",
    params: z.object({ id: z.string() }),
    async run(client, args) {
      return client.getADSOVersions(args.id)
    },
  }),

  defineTool({
    name: "bw_adso_get_xml",
    description:
      "Get the raw ADSO XML used for PUT updates. ALWAYS prefer outputPath — payloads are " +
      "15–80 KB. With outputPath, the full XML is written to disk (reuse as xmlPath in " +
      "bw_adso_save_and_activate) and the MCP response is only a summary envelope. Without " +
      "outputPath, format='summary' (default) returns a small overview; format='xml' returns " +
      "the raw XML inline. Step 1 of read-modify-write.",
    params: z.object({
      id: z.string(),
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
      const xml = await client.getADSOXml(args.id, args.forceCacheUpdate)
      return shapeXmlResult(xml, { adsoId: args.id }, args)
    },
  }),

  defineTool({
    name: "bw_adso_check",
    description: "Check ADSO consistency.",
    params: z.object({ id: z.string() }),
    async run(client, args) {
      return client.checkADSO(args.id)
    },
  }),

  defineTool({
    name: "bw_adso_save_and_activate",
    description:
      "One-stop: lock → PUT → (optional) activate → unlock. Prefer xmlPath (from " +
      "bw_adso_get_xml + outputPath) over inline xmlContent for large bodies. " +
      "When a transport is required: pass transport=<existing TRKORR> OR createTransport=true " +
      "(use bw_transport_check to list available requests). Do not omit both. " +
      "Returns a compact projection; set outputPath to keep the full update/activate detail.",
    params: z.object({
      id: z.string(),
      ...largeInput("xml"),
      transport: z
        .string()
        .optional()
        .describe("Existing transport request number to use."),
      createTransport: z
        .boolean()
        .optional()
        .describe(
          "If true and recording is required with no transport/corrNr, create a new TR. " +
            "Default false — you must choose transport or createTransport."
        ),
      transportDescription: z
        .string()
        .optional()
        .describe("Description used only when createTransport=true."),
      autoActivate: z.boolean().optional().describe("Default true."),
      timestamp: z.string().optional(),
      outputPath: outputPathField,
    }),
    mutating: true,
    async run(client, args) {
      const xml = await readLargeInput(args, "xml", true)
      const raw = await client.saveAndActivateADSO(args.id, xml!, {
        transport: args.transport,
        createTransport: args.createTransport,
        transportDescription: args.transportDescription,
        autoActivate: args.autoActivate,
        timestamp: args.timestamp,
      })
      return shapeSaveResult(raw as unknown as Record<string, unknown>, args.outputPath)
    },
  }),

  defineTool({
    name: "bw_adso_add_field",
    description:
      "Atomic edit: add a local 'field'-type field to an ADSO and save (activate optional via autoActivate, default true). " +
      "success reflects save/activate outcome; activated only means activation was attempted. " +
      "Internally reads current XML, inserts the field, and saves — no large XML handling by the caller.",
    params: z.object({
      id: z.string(),
      name: z.string().describe("Field technical name."),
      dataType: z.enum(FIELD_DATA_TYPES).optional(),
      length: z.number().int().positive().optional(),
      label: z.string().optional(),
      dimension: z.string().optional(),
      semanticType: z.string().optional(),
      precision: z.number().int().positive().optional(),
      scale: z.number().int().nonnegative().optional(),
      transport: z.string().optional(),
      createTransport: z.boolean().optional(),
      transportDescription: z.string().optional(),
      autoActivate: z.boolean().optional(),
      outputPath: outputPathField,
    }),
    mutating: true,
    async run(client, args) {
      const { id, transport, createTransport, transportDescription, autoActivate, outputPath, ...field } = args
      const raw = await client.addADSOField(id, field, {
        transport,
        createTransport,
        transportDescription,
        autoActivate,
      })
      return shapeSaveResult(raw as unknown as Record<string, unknown>, outputPath)
    },
  }),

  defineTool({
    name: "bw_adso_create",
    description:
      "Create an empty ADSO shell (fields are added afterwards via bw_adso_add_field). " +
      "Required: name, description, infoArea.",
    params: z.object({
      name: z.string(),
      description: z.string(),
      infoArea: z.string(),
      masterLanguage: z.string().optional().describe("Default EN."),
      responsible: z.string().optional().describe("Default = current user."),
      masterSystem: z.string().optional().describe("Default BPD."),
      template: z
        .object({
          objectName: z.string(),
          type: z.enum(["ADSO", "DSO", "IOBJ", "ISRC", ""]),
        })
        .optional(),
      activateData: z.boolean().optional(),
      writeChangelog: z.boolean().optional(),
      readOnly: z.boolean().optional(),
      autoActivate: z.boolean().optional().describe("Default false."),
      outputPath: outputPathField,
    }),
    mutating: true,
    async run(client, args) {
      const { outputPath: _outputPath, ...createArgs } = args
      return client.createADSO(createArgs)
    },
  }),

  defineTool({
    name: "bw_adso_validate_info_area",
    description:
      "Validate that an InfoArea exists (pre-create check for ADSO). " +
      "Prefer bw_area_validate_exists for InfoArea workflows.",
    params: z.object({ name: z.string() }),
    async run(client, args) {
      return client.validateInfoArea(args.name)
    },
  }),

  defineTool({
    name: "bw_adso_validate_template",
    description: "Validate that a template ADSO exists.",
    params: z.object({ name: z.string() }),
    async run(client, args) {
      return client.validateTemplateADSO(args.name)
    },
  }),

  defineTool({
    name: "bw_adso_validate_new_name",
    description: "Validate that a new ADSO name is available.",
    params: z.object({ name: z.string() }),
    async run(client, args) {
      return client.validateNewADSOName(args.name)
    },
  }),
]
