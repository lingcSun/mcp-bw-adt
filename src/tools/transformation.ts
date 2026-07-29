/**
 * Transformation (TRFN) tools.
 *
 * Note: TRFN creation is unsupported server-side (createObject("trfn",...) throws),
 * so there is no create tool here. Read/update/activate/delete are all available.
 *
 * Atomic edit tools (add_rule, auto_map) hide the large XML from the caller; the
 * *Content/*Path dual fields cover manual update/save flows.
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
    name: "bw_trfn_get",
    description: "Get raw transformation metadata. Prefer outputPath.",
    params: z.object({
      id: z.string().describe("Transformation technical id (32-char)."),
      version: VERSION.optional(),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      return client.getTransformation(args.id, args.version)
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
      "Get raw transformation XML for PUT updates. Large — ALWAYS set outputPath. " +
      "With outputPath, full XML is written to disk (usable as xmlPath). Without it, " +
      "format='summary' returns an overview; format='xml' returns raw XML inline. Step 1 of read-modify-write.",
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
    name: "bw_trfn_lock",
    description: "Lock a transformation. Returns { lockHandle, corrNr }.",
    params: z.object({ id: z.string() }),
    async run(client, args) {
      return client.lockTransformation(args.id)
    },
  }),

  defineTool({
    name: "bw_trfn_unlock",
    description: "Unlock a transformation.",
    params: z.object({ id: z.string() }),
    async run(client, args) {
      return client.unlockTransformation(args.id)
    },
  }),

  defineTool({
    name: "bw_trfn_activate",
    description: "Activate a transformation. lockHandle is optional.",
    params: z.object({ id: z.string(), lockHandle: z.string().optional() }),
    async run(client, args) {
      return client.activateTransformation(args.id, args.lockHandle)
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
    name: "bw_trfn_update",
    description:
      "Update a transformation via PUT. XML via xmlContent or xmlPath. lockHandle is required. " +
      "Prefer bw_trfn_save_and_activate for the common case.",
    params: z.object({
      id: z.string(),
      ...largeInput("xml"),
      lockHandle: z.string().describe("Required lock handle from bw_trfn_lock."),
      corrNr: z.string().optional(),
      timestamp: z.string().optional(),
      version: VERSION.optional(),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      const xml = await readLargeInput(args, "xml", true)
      return client.updateTransformation(
        args.id,
        xml!,
        { lockHandle: args.lockHandle, corrNr: args.corrNr, timestamp: args.timestamp },
        args.version
      )
    },
  }),

  defineTool({
    name: "bw_trfn_save_and_activate",
    description:
      "One-stop: lock → PUT → (optional) activate → unlock. XML via xmlContent or xmlPath. " +
      "Returns a compact projection; set outputPath for full detail.",
    params: z.object({
      id: z.string(),
      ...largeInput("xml"),
      transport: z.string().optional(),
      transportDescription: z.string().optional(),
      autoActivate: z.boolean().optional(),
      timestamp: z.string().optional(),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      const xml = await readLargeInput(args, "xml", true)
      const raw = await client.saveAndActivateTransformation(args.id, xml!, {
        transport: args.transport,
        transportDescription: args.transportDescription,
        autoActivate: args.autoActivate,
        timestamp: args.timestamp,
      })
      return shapeSaveResult(raw as Record<string, unknown>, args.outputPath)
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
    async run(client, args) {
      const { id, fields, outputPath, ...opts } = args
      const raw = await client.setEndRoutineFields(id, fields, opts)
      return shapeSaveResult(raw as Record<string, unknown>, outputPath)
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
    async run(client, args) {
      const { id, rules, outputPath, ...opts } = args
      const raw = await client.addTransformationRulesAndSave(id, rules, opts)
      return shapeSaveResult(raw as Record<string, unknown>, outputPath)
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
    async run(client, args) {
      const { id, outputPath, ...opts } = args
      const raw = await client.autoMapTransformationFieldsAndSave(id, opts)
      return shapeSaveResult(raw as Record<string, unknown>, outputPath)
    },
  }),

  defineTool({
    name: "bw_trfn_switch_runtime",
    description:
      "Switch a transformation between HANA and ABAP runtime. lockHandle is required.",
    params: z.object({
      id: z.string(),
      useHana: z.boolean().describe("true → HANA runtime, false → ABAP runtime."),
      lockHandle: z.string().describe("Required lock handle from bw_trfn_lock."),
      version: VERSION.optional(),
      corrNr: z.string().optional(),
      timestamp: z.string().optional(),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      const { id, useHana, lockHandle, outputPath: _outputPath, ...opts } = args
      return client.switchTransformationRuntime(id, useHana, lockHandle, opts)
    },
  }),

  // ---- Transformation routine ABAP class ----

  defineTool({
    name: "bw_trfn_class_get",
    description: "Get the transformation routine's ABAP class metadata. Prefer outputPath.",
    params: z.object({
      id: z.string(),
      version: VERSION.optional(),
      forceCacheUpdate: z.boolean().optional(),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      const { id, version, forceCacheUpdate } = args
      return client.getTransformationClass(id, { version, forceCacheUpdate })
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
      "Save+activate the routine's ABAP class source. Pass source via sourceContent or sourcePath.",
    params: z.object({
      id: z.string(),
      ...largeInput("source"),
      activateTransformation: z.boolean().optional().describe("Default true."),
      transport: z.string().optional(),
      transportDescription: z.string().optional(),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      const { id, activateTransformation, transport, transportDescription } = args
      const source = await readLargeInput(args, "source", true)
      const raw = await client.saveAndActivateTransformationClassSource(id, source!, {
        activateTransformation,
        transport,
        transportDescription,
      })
      return shapeSaveResult(raw as Record<string, unknown>, args.outputPath)
    },
  }),

  defineTool({
    name: "bw_trfn_class_update_source",
    description:
      "Update (PUT) the routine's ABAP class source. lockHandle required. Pass source via sourceContent/sourcePath.",
    params: z.object({
      id: z.string(),
      ...largeInput("source"),
      lockHandle: z.string().describe("Required lock handle from bw_trfn_class_lock."),
      version: VERSION.optional(),
      forceCacheUpdate: z.boolean().optional(),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      const { id, lockHandle, version, forceCacheUpdate } = args
      const source = await readLargeInput(args, "source", true)
      return client.updateTransformationClassSource(id, source!, lockHandle, {
        version,
        forceCacheUpdate,
      })
    },
  }),

  defineTool({
    name: "bw_trfn_class_lock",
    description: "Lock the transformation routine's ABAP class.",
    params: z.object({
      id: z.string(),
      version: VERSION.optional(),
      forceCacheUpdate: z.boolean().optional(),
    }),
    async run(client, args) {
      const { id, version, forceCacheUpdate } = args
      return client.lockTransformationClass(id, { version, forceCacheUpdate })
    },
  }),

  defineTool({
    name: "bw_trfn_class_unlock",
    description: "Unlock the transformation routine's ABAP class. lockHandle required.",
    params: z.object({
      id: z.string(),
      lockHandle: z.string(),
      version: VERSION.optional(),
      forceCacheUpdate: z.boolean().optional(),
    }),
    async run(client, args) {
      const { id, lockHandle, version, forceCacheUpdate } = args
      return client.unlockTransformationClass(id, lockHandle, { version, forceCacheUpdate })
    },
  }),
]
