/**
 * ADSO (Advanced DataStore Object) tools.
 *
 * Workflow: get_xml (outputPath) → edit file → save_and_activate (xmlPath).
 * Or use atomic helpers (add_field / create) that hide large XML from the caller.
 */
import { z } from "zod"
import { defineTool, largeInput, outputPathField, readLargeInput } from "../tool"
import { shapeSaveResult, shapeXmlResult } from "../response"
import {
  applyAttrsToXml,
  expandProfile,
  ProfileConstraintError,
  verifyPersisted,
  type AdsoType,
  type StagingMode,
} from "../adsoProfiles"

const ADSO_TYPES = ["standard", "staging", "dataMart", "directUpdate"] as const
const STAGING_MODES = ["inboundQueueOnly", "compressDataLog", "corporateMemory"] as const

const adsoTypeField = () =>
  z
    .enum(ADSO_TYPES)
    .optional()
    .describe(
      "ADSO type — each type is a different TABLE LAYOUT, and its options are a fixed " +
        "semantic package (not free booleans): " +
        "standard = AQ→AT→(optional) changelog; options writeChangeLog/snapshotSupport/" +
        "uniqueDataRecords (snapshot needs writeChangeLog and excludes uniqueDataRecords; " +
        "server rejects otherwise); " +
        "staging = landing buffer, no activation loop; mode is a SINGLE-SELECT template " +
        "(inboundQueueOnly | compressDataLog | corporateMemory); " +
        "dataMart = read-only reporting with HANA model; " +
        "directUpdate = direct write to active data (activation/changelog auto-disabled)."
    )

const stagingOptionsField = () =>
  z
    .object({
      mode: z.enum(STAGING_MODES).optional().describe(
        "inboundQueueOnly (default; data stays in AQ, keyless OK, no reporting) | " +
          "compressDataLog (activates data, no changelog; REQUIRES a key) | " +
          "corporateMemory (keeps changelog history; server forces reporting on)."
      ),
      reportingEnabled: z.boolean().optional().describe(
        "Expose for reporting (isReportingObject). Only valid when mode != inboundQueueOnly."
      ),
    })
    .optional()

const standardOptionsField = () =>
  z
    .object({
      writeChangeLog: z.boolean().optional().describe(
        "Write CL mirror for downstream delta extraction. Default true. " +
          "Off = pure endpoint storage (no delta feed). Required for snapshotSupport."
      ),
      snapshotSupport: z.boolean().optional().describe(
        "Point-in-time snapshot semantics (inventory/non-cumulative). " +
          "Requires writeChangeLog=true; mutually exclusive with uniqueDataRecords."
      ),
      uniqueDataRecords: z.boolean().optional().describe(
        "One row per key in the active table (classic DSO). " +
          "Mutually exclusive with snapshotSupport."
      ),
    })
    .optional()

interface CreateAndConvertArgs {
  adsoType?: AdsoType
  standard?: { writeChangeLog?: boolean; snapshotSupport?: boolean; uniqueDataRecords?: boolean }
  staging?: { mode?: StagingMode; reportingEnabled?: boolean }
}

/** 创建/转换共用：类型档案 → 属性补丁应用 + 保存（激活可选）→ 回读校验持久性 */
async function applyTypeProfile(
  client: unknown,
  id: string,
  req: CreateAndConvertArgs,
  autoActivate: boolean
): Promise<Record<string, unknown>> {
  const c = client as {
    getADSOXml: (id: string, force?: boolean) => Promise<string>
    saveAndActivateADSO: (id: string, xml: string, opts?: unknown) => Promise<unknown>
  }
  const app = expandProfile({
    adsoType: req.adsoType || "standard",
    standard: req.standard,
    staging: req.staging,
  })
  const before = await c.getADSOXml(id, true)
  const needsKeyNote =
    req.adsoType === "staging" &&
    (req.staging?.mode || "inboundQueueOnly") !== "inboundQueueOnly" &&
    !/<keyElement>/.test(before)
  if (needsKeyNote && autoActivate) {
    throw new ProfileConstraintError(
      "D8",
      `target staging mode activates data, which REQUIRES a key definition, but ${id} has no ` +
        `<keyElement>. Add one first (bw_adso_add_key), or choose mode=inboundQueueOnly, ` +
        `or pass autoActivate=false to stage the change without activating.`
    )
  }
  const next = applyAttrsToXml(before, app.attrs, app.stripKeyElement)
  const save = (await c.saveAndActivateADSO(id, next, { autoActivate: autoActivate && !needsKeyNote })) as {
    updateResult?: { success?: boolean }
    activateResult?: { success?: boolean }
  }
  const after = await c.getADSOXml(id, true)
  const check = verifyPersisted(after, app.attrs)
  return {
    id,
    adsoType: req.adsoType || "standard",
    saved: !!save.updateResult?.success,
    activated: autoActivate && !needsKeyNote ? !!save.activateResult?.success : false,
    persisted: check.ok,
    persistenceDiffs: check.diffs,
    notes: [
      ...app.notes,
      ...(needsKeyNote
        ? ["⚠️ 已保存未激活：本模式激活需要键定义——请先 bw_adso_add_key 再 bw_adso_add_field（由 add_field 激活）"]
        : []),
    ],
  }
}

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
      "Create an empty ADSO shell (fields are added afterwards via bw_adso_add_field and " +
      "bw_adso_add_key, or by editing the XML from bw_adso_get_xml). Required: name, " +
      "description, infoArea. " +
      "Use adsoType to pick the table layout; type-specific options ride along " +
      "(standard.* / staging.*) and their constraints are validated BEFORE any server call. " +
      "Pass packageName (e.g. \"ZBW\") TOGETHER WITH transport=<TRKORR> to create the object " +
      "in a real package and register it in that workbench request; omitting transport makes " +
      "the object local to $TMP and it will NOT appear in E071.",
    params: z.object({
      name: z
        .string()
        .describe(
          "ADSO technical name. 3-9 characters, excluding any /namespace/ prefix " +
            "(e.g. /CPMB/A2IA1MG is valid: its last segment is 8 chars). " +
            "InfoArea names have no such limit. Server-side validation rejects violations."
        ),
      description: z.string(),
      infoArea: z.string(),
      adsoType: adsoTypeField(),
      standard: standardOptionsField(),
      staging: stagingOptionsField(),
      masterLanguage: z.string().optional().describe("Default EN."),
      responsible: z.string().optional().describe("Default = current user."),
      masterSystem: z.string().optional().describe("Default BPD."),
      template: z
        .object({
          objectName: z.string(),
          type: z.enum(["ADSO", "DSO", "IOBJ", "ISRC", ""]),
        })
        .optional(),
      autoActivate: z.boolean().optional().describe("Default false."),
      packageName: z
        .string()
        .optional()
        .describe(
          "Target development package. Default $TMP (local object). " +
            "Requires transport to actually take effect."
        ),
      transport: z
        .string()
        .optional()
        .describe(
          "Workbench request number. When set, the object is created in packageName and " +
            "recorded in this request (corrNr). Without it the object lands in $TMP."
        ),
      outputPath: outputPathField,
    }),
    mutating: true,
    async run(client, args) {
      const { outputPath: _outputPath, adsoType, standard, staging, ...createArgs } = args
      const created = await client.createADSO(createArgs)
      // 非默认类型档案：创建后立即应用（不激活——新壳无字段；键/字段由 add_key/add_field 补齐后激活）
      if (adsoType && adsoType !== "standard") {
        const profile = await applyTypeProfile(client, createArgs.name, { adsoType, standard, staging }, false)
        return { created: true, profile }
      }
      return created
    },
  }),

  defineTool({
    name: "bw_adso_convert_type",
    description:
      "Convert an existing ADSO between types (standard | staging | dataMart | directUpdate). " +
      "Encodes the verified server semantics (VERIFIED_APIS D1/D7/D8): applies the target " +
      "type's attribute package, strips <keyElement> when converting to " +
      "staging/inboundQueueOnly (keyless OK there), REQUIRES a key for staging modes that " +
      "activate data, auto-disables activateData/writeChangelog for directUpdate, validates " +
      "standard option constraints up-front, and READS BACK to verify attributes persisted " +
      "(guards against silent normalization). Same-type option changes also go here " +
      "(e.g. standard: toggle writeChangeLog / snapshotSupport / uniqueDataRecords).",
    params: z.object({
      id: z.string(),
      targetType: adsoTypeField(),
      standard: standardOptionsField(),
      staging: stagingOptionsField(),
      autoActivate: z.boolean().optional().describe("Default true."),
      outputPath: outputPathField,
    }),
    mutating: true,
    async run(client, args) {
      const { outputPath: _outputPath, id, targetType, standard, staging, autoActivate } = args
      return applyTypeProfile(client, id, { adsoType: targetType, standard, staging }, autoActivate ?? true)
    },
  }),

  defineTool({
    name: "bw_adso_add_key",
    description:
      "Add a key definition (an InfoObject reference as <keyElement>) to an ADSO and save. " +
      "An ADSO without a key cannot be activated ('Key definition missing'); staging modes " +
      "that activate data also require one. Flow: add_key (no activate) → add_field " +
      "(activates). Default does NOT activate — a keyless ADSO with only a key still needs " +
      "at least one field before activation succeeds.",
    params: z.object({
      id: z.string(),
      infoObjectName: z.string().describe("InfoObject technical name to use as the key (e.g. 0MATERIAL)."),
      length: z.number().int().positive().optional().describe(
        "inlineType length written into the key element. Default 40 (the only live-verified value)."
      ),
      transport: z.string().optional(),
      createTransport: z.boolean().optional(),
      transportDescription: z.string().optional(),
      autoActivate: z.boolean().optional().describe("Default false — add fields first, let add_field activate."),
      outputPath: outputPathField,
    }),
    mutating: true,
    async run(client, args) {
      const { id, infoObjectName, length, transport, createTransport, transportDescription, autoActivate, outputPath } = args
      const facade = (client as { adso?: { addKey?: (id: string, iobj: string, o?: unknown) => Promise<unknown> } }).adso
      if (!facade?.addKey) throw new Error("addKey requires bw-adt-api with AdsoDomain.addKey (>= local 0.5.0 build)")
      const raw = await facade.addKey(id, infoObjectName, {
        length,
        autoActivate,
        transport,
        createTransport,
        transportDescription,
      })
      return shapeSaveResult(raw as unknown as Record<string, unknown>, outputPath)
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
