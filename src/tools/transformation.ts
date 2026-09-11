/**
 * Transformation (TRFN) tools.
 *
 * Workflow: bw_trfn_create (8TRANSIENT transient flow) → get_xml (outputPath) →
 * edit → save_and_activate (xmlPath).
 */
import { z } from "zod"
import { defineTool, largeInput, outputPathField, readLargeInput } from "../tool"
import { shapeSaveResult, shapeXmlResult } from "../response"

const VERSION = z.enum(["m", "a", "d"]).describe("Version: m=active, a=modified, d=revised.")
const CLASS_VERSION = z
  .enum(["active", "inactive", "workingArea"])
  .optional()
  .describe("Which class variant to read.")

export const transformationTools = [
  defineTool({
    name: "bw_trfn_create",
    description:
      "Create a transformation via the 8TRANSIENT transient flow (Eclipse wizard equivalent). " +
      "Server mints the id, hydrates all source/target elements and default rules from the two " +
      "providers. Returns trfnId + hydrated XML. packageName defaults to $TMP; pass a real " +
      "package together with transport to register in a workbench request. " +
      "Then use bw_trfn_auto_map_and_save / bw_trfn_add_rules_and_save / bw_trfn_check to finish.",
    params: z.object({
      sourceName: z.string().describe("Source object name (e.g. staging ADSO)."),
      targetName: z.string().describe("Target object name."),
      sourceType: z.string().optional().describe("Source tlogo type, default ADSO."),
      targetType: z.string().optional().describe("Target tlogo type, default ADSO."),
      packageName: z
        .string()
        .optional()
        .describe("Target package, default $TMP. Non-$TMP requires transport."),
      transport: z.string().optional().describe("Workbench request number."),
      description: z.string().optional().describe("Description (set on a follow-up save)."),
      responsible: z.string().optional().describe("Responsible user, defaults to login user."),
      masterSystem: z.string().optional().describe("Master system, default BPD."),
      outputPath: outputPathField,
    }),
    mutating: true,
    async run(client, args) {
      const { outputPath, sourceName, targetName, sourceType, targetType, ...opts } = args
      const res = await client.createTransformation({
        ...opts,
        sourceObjName: sourceName,
        targetObjName: targetName,
        sourceObjType: sourceType,
        targetObjType: targetType,
      })
      return shapeXmlResult(res.xml, { trfnId: res.trfnId, created: true }, args)
    },
  }),

  defineTool({
    name: "bw_trfn_details",
    description: "Get parsed transformation details. Prefer outputPath.",
    params: z.object({
      id: z.string(),
      version: VERSION.optional(),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      return client.getTransformationDetails(args.id, args.version)
    },
  }),

  defineTool({
    name: "bw_trfn_versions",
    description: "Get transformation version history.",
    params: z.object({ id: z.string() }),
    async run(client, args) {
      return client.getTransformationVersions(args.id)
    },
  }),

  defineTool({
    name: "bw_trfn_get_xml",
    description:
      "Get raw transformation XML for PUT updates. ALWAYS prefer outputPath. " +
      "With outputPath, full XML is written to disk (reuse as xmlPath in " +
      "bw_trfn_save_and_activate). Without it, format='summary' returns an overview; " +
      "format='xml' returns raw XML inline. Step 1 of read-modify-write.",
    params: z.object({
      id: z.string(),
      version: VERSION.optional(),
      format: z
        .enum(["summary", "xml"])
        .optional()
        .describe("Only affects inline responses (no outputPath)."),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      const xml = await client.getTransformationXml(args.id, args.version)
      return shapeXmlResult(xml, { trfnId: args.id }, args)
    },
  }),

  defineTool({
    name: "bw_trfn_check",
    description: "Check transformation consistency.",
    params: z.object({ id: z.string() }),
    async run(client, args) {
      return client.checkTransformation(args.id)
    },
  }),

  defineTool({
    name: "bw_trfn_save_and_activate",
    description:
      "One-stop: lock → PUT → (optional) activate → unlock. Prefer xmlPath (from " +
      "bw_trfn_get_xml + outputPath) over inline xmlContent. " +
      "When a transport is required: pass transport=<TRKORR> OR createTransport=true. " +
      "Returns a compact projection; set outputPath for full detail.",
    params: z.object({
      id: z.string(),
      ...largeInput("xml"),
      transport: z.string().optional(),
      createTransport: z.boolean().optional(),
      transportDescription: z.string().optional(),
      autoActivate: z.boolean().optional(),
      timestamp: z.string().optional(),
      outputPath: outputPathField,
    }),
    mutating: true,
    async run(client, args) {
      const xml = await readLargeInput(args, "xml", true)
      const raw = await client.saveAndActivateTransformation(args.id, xml!, {
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
    name: "bw_trfn_set_end_routine_fields",
    description:
      "Check a list of target field names into the transformation's end routine and save+activate.",
    params: z.object({
      id: z.string(),
      fields: z
        .array(z.string())
        .describe("Target field names to check into the end routine."),
      transport: z.string().optional(),
      transportDescription: z.string().optional(),
      autoActivate: z.boolean().optional(),
      outputPath: outputPathField,
    }),
    mutating: true,
    async run(client, args) {
      const { id, fields, outputPath, ...opts } = args
      const raw = await client.setEndRoutineFields(id, fields, opts)
      return shapeSaveResult(raw as unknown as Record<string, unknown>, outputPath)
    },
  }),

  defineTool({
    name: "bw_trfn_add_rules_and_save",
    description:
      "Atomic edit: add DIRECT mapping rules (source→target pairs) to a transformation and save+activate. " +
      "target omitted means same-name mapping.",
    params: z.object({
      id: z.string(),
      rules: z
        .array(
          z.object({
            source: z.string(),
            target: z.string().optional().describe("Omit for same-name mapping."),
          })
        )
        .describe("Mapping rules to insert."),
      transport: z.string().optional(),
      transportDescription: z.string().optional(),
      autoActivate: z.boolean().optional(),
      outputPath: outputPathField,
    }),
    mutating: true,
    async run(client, args) {
      const { id, rules, outputPath, ...opts } = args
      const raw = await client.addTransformationRulesAndSave(id, rules, opts)
      return shapeSaveResult(raw as unknown as Record<string, unknown>, outputPath)
    },
  }),

  defineTool({
    name: "bw_trfn_auto_map_and_save",
    description:
      "Atomic edit: auto-map same-named source→target fields in a transformation and save+activate.",
    params: z.object({
      id: z.string(),
      transport: z.string().optional(),
      transportDescription: z.string().optional(),
      autoActivate: z.boolean().optional(),
      outputPath: outputPathField,
    }),
    mutating: true,
    async run(client, args) {
      const { id, outputPath, ...opts } = args
      const raw = await client.autoMapTransformationFieldsAndSave(id, opts)
      return shapeSaveResult(raw as unknown as Record<string, unknown>, outputPath)
    },
  }),

  defineTool({
    name: "bw_trfn_switch_runtime",
    description:
      "Switch a transformation between HANA and ABAP runtime. Requires an existing lockHandle.",
    params: z.object({
      id: z.string(),
      useHana: z.boolean().describe("true → HANA runtime, false → ABAP runtime."),
      lockHandle: z.string().describe("Required lock handle for the transformation."),
      version: VERSION.optional(),
      corrNr: z.string().optional(),
      timestamp: z.string().optional(),
      outputPath: outputPathField,
    }),
    mutating: true,
    async run(client, args) {
      const { id, useHana, lockHandle, outputPath: _outputPath, ...opts } = args
      return client.switchTransformationRuntime(id, useHana, lockHandle, opts)
    },
  }),

  defineTool({
    name: "bw_trfn_class_source",
    description: "Get the routine's ABAP source code. Prefer outputPath.",
    params: z.object({
      id: z.string(),
      version: VERSION.optional(),
      forceCacheUpdate: z.boolean().optional(),
      classVersion: CLASS_VERSION,
      outputPath: outputPathField,
    }),
    async run(client, args) {
      const { id, version, forceCacheUpdate, classVersion } = args
      return client.getTransformationClassSource(id, {
        version,
        forceCacheUpdate,
        classVersion,
      })
    },
  }),

  defineTool({
    name: "bw_trfn_class_save_source",
    description:
      "Save+activate the routine's ABAP class source. Prefer sourcePath over inline sourceContent.",
    params: z.object({
      id: z.string(),
      ...largeInput("source"),
      activateTransformation: z.boolean().optional().describe("Default true."),
      transport: z.string().optional(),
      transportDescription: z.string().optional(),
      outputPath: outputPathField,
    }),
    mutating: true,
    async run(client, args) {
      const { id, activateTransformation, transport, transportDescription } = args
      const source = await readLargeInput(args, "source", true)
      const raw = await client.saveAndActivateTransformationClassSource(id, source!, {
        activateTransformation,
        transport,
        transportDescription,
      })
      return shapeSaveResult(raw as unknown as Record<string, unknown>, args.outputPath)
    },
  }),
]
