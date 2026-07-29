/**
 * ADSO (Advanced DataStore Object) tools.
 *
 * Workflow guidance surfaced in descriptions:
 *   - read current XML (format=summary) → mutate via add_field or edit file → save_and_activate.
 *   - large XML bodies go through the *Content/*Path dual fields (mechanism A).
 *   - large reads (get/details) take outputPath to avoid bloating context.
 */
import { z } from "zod"
import { defineTool, largeInput, outputPathField, readLargeInput } from "../tool"
import { shapeSaveResult, shapeXmlResult } from "../response"

const VERSION = z.enum(["m", "a", "d"]).describe("Version: m=active, a=modified, d=revised.")

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
    name: "bw_adso_get",
    description: "Get ADSO raw metadata. Prefer outputPath — payloads are large.",
    params: z.object({
      id: z.string().describe("ADSO technical name."),
      forceCacheUpdate: z.boolean().optional(),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      return client.getADSO(args.id, args.forceCacheUpdate)
    },
  }),

  defineTool({
    name: "bw_adso_details",
    description: "Get parsed ADSO metadata (fields, indexes, partitioning). Prefer outputPath.",
    params: z.object({
      id: z.string(),
      forceCacheUpdate: z.boolean().optional(),
      outputPath: outputPathField,
    }),
    async run(client, args) {
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
      "Get the raw ADSO XML used for PUT updates. Large (15–80 KB) — ALWAYS set outputPath. " +
      "With outputPath, the full XML is written to disk (usable as xmlPath later) and the MCP " +
      "response is only a summary envelope. Without outputPath, format='summary' (default) returns " +
      "a small overview; format='xml' returns the raw XML inline. Step 1 of read-modify-write.",
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
    name: "bw_adso_configuration",
    description: "Get ADSO configuration info.",
    params: z.object({ id: z.string() }),
    async run(client, args) {
      return client.getADSOConfiguration(args.id)
    },
  }),

  defineTool({
    name: "bw_adso_tables",
    description: "Get the associated DDIC table names of an ADSO.",
    params: z.object({ id: z.string() }),
    async run(client, args) {
      return client.getADSOTables(args.id)
    },
  }),

  defineTool({
    name: "bw_adso_node_path",
    description: "Get the node path of an ADSO (version-qualified).",
    params: z.object({ name: z.string(), version: VERSION.optional() }),
    async run(client, args) {
      return client.getADSONodePath(args.name, args.version)
    },
  }),

  defineTool({
    name: "bw_adso_lock",
    description: "Lock an ADSO. Returns { lockHandle, corrNr }. Used before manual update/activate.",
    params: z.object({ id: z.string() }),
    async run(client, args) {
      return client.lockADSO(args.id)
    },
  }),

  defineTool({
    name: "bw_adso_unlock",
    description: "Unlock a previously locked ADSO.",
    params: z.object({ id: z.string() }),
    async run(client, args) {
      return client.unlockADSO(args.id)
    },
  }),

  defineTool({
    name: "bw_adso_activate",
    description: "Activate an ADSO. lockHandle/corrNr are optional (defaults applied server-side).",
    params: z.object({
      id: z.string(),
      lockHandle: z.string().optional(),
      corrNr: z.string().optional().describe("Transport request number."),
    }),
    async run(client, args) {
      return client.activateADSO(args.id, args.lockHandle, args.corrNr)
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
    name: "bw_adso_update",
    description:
      "Update an ADSO via PUT. Provide the XML inline (xmlContent) or from a file (xmlPath). " +
      "lockHandle is required. Usually prefer bw_adso_save_and_activate instead.",
    params: z.object({
      id: z.string(),
      lockHandle: z.string().describe("Required lock handle from bw_adso_lock."),
      ...largeInput("xml"),
      corrNr: z.string().optional(),
      timestamp: z.string().optional(),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      const xml = await readLargeInput(args, "xml", true)
      return client.updateADSO(args.id, xml!, args.lockHandle, {
        corrNr: args.corrNr,
        timestamp: args.timestamp,
      })
    },
  }),

  defineTool({
    name: "bw_adso_save_and_activate",
    description:
      "One-stop: lock → PUT → (optional) activate → unlock. XML via xmlContent or xmlPath. " +
      "Returns a compact projection; set outputPath to keep the full update/activate detail.",
    params: z.object({
      id: z.string(),
      ...largeInput("xml"),
      transport: z.string().optional(),
      transportDescription: z.string().optional(),
      autoActivate: z.boolean().optional().describe("Default true."),
      timestamp: z.string().optional(),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      const xml = await readLargeInput(args, "xml", true)
      const raw = await client.saveAndActivateADSO(args.id, xml!, {
        transport: args.transport,
        transportDescription: args.transportDescription,
        autoActivate: args.autoActivate,
        timestamp: args.timestamp,
      })
      return shapeSaveResult(raw as Record<string, unknown>, args.outputPath)
    },
  }),

  defineTool({
    name: "bw_adso_add_field",
    description:
      "Atomic edit: add a local 'field'-type field to an ADSO and save+activate. " +
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
      transportDescription: z.string().optional(),
      autoActivate: z.boolean().optional(),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      const { id, transport, transportDescription, autoActivate, outputPath, ...field } = args
      const raw = await client.addADSOField(
        id,
        field,
        { transport, transportDescription, autoActivate }
      )
      return shapeSaveResult(raw as Record<string, unknown>, outputPath)
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
    async run(client, args) {
      const { outputPath: _outputPath, ...createArgs } = args
      return client.createADSO(createArgs)
    },
  }),

  defineTool({
    name: "bw_adso_validate_info_area",
    description: "Validate that an InfoArea exists (pre-create check).",
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
