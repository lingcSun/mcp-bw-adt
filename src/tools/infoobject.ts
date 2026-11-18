/** InfoObject tools. */
import { z } from "zod"
import { defineTool, largeInput, outputPathField, readLargeInput } from "../tool"
import { shapeSaveResult, shapeXmlResult } from "../response"

const KF_DATA_TYPES = ["CURR", "QUAN", "DEC", "INT4", "FLTP", "DF34"] as const
const KF_AGGREGATIONS = ["SUM", "MAX", "MIN", "AVG", "CNT"] as const
const KF_SEMANTICS = ["AMO", "QUA", "NUM"] as const

export const infoobjectTools = [
  defineTool({
    name: "bw_infoobject_get",
    description:
      "Get InfoObject details including metadata. Prefer outputPath.",
    params: z.object({ name: z.string(), outputPath: outputPathField }),
    async run(client, args) {
      const [details, metadata] = await Promise.all([
        client.getInfoObject(args.name),
        client.getInfoObjectMetadata(args.name).catch(() => undefined),
      ])
      return { details, metadata }
    },
  }),

  defineTool({
    name: "bw_infoobject_get_xml",
    description:
      "Get the raw InfoObject XML for PUT updates (iobj-v2_1_0). ALWAYS prefer outputPath. " +
      "With outputPath, full XML is written to disk (reuse as xmlPath in " +
      "bw_infoobject_save_and_activate) and the MCP response is only a summary envelope. " +
      "Step 1 of read-modify-write (e.g. change KYF unitCurrencyInfoObjectRef).",
    params: z.object({
      name: z.string().describe("InfoObject technical name (e.g. ZK_WSL)."),
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
      const xml = await client.getInfoObjectXml(args.name, args.forceCacheUpdate)
      return shapeXmlResult(xml, { iobjName: args.name }, args)
    },
  }),

  defineTool({
    name: "bw_infoobject_versions",
    description: "Get InfoObject version history.",
    params: z.object({ name: z.string() }),
    async run(client, args) {
      return client.getInfoObjectVersions(args.name)
    },
  }),

  defineTool({
    name: "bw_infoobject_check",
    description:
      "Check InfoObject consistency (READ-ONLY, does NOT activate).",
    params: z.object({ name: z.string() }),
    async run(client, args) {
      return client.checkInfoObject(args.name)
    },
  }),

  defineTool({
    name: "bw_infoobject_save_and_activate",
    description:
      "One-stop IOBJ write: lock → transportchecks → PUT /m (timestamp + Transport-Lock-Holder) " +
      "→ (optional) activate → unlock. Prefer xmlPath (from bw_infoobject_get_xml + outputPath) " +
      "over inline xmlContent. Use to change KYF unit binding (e.g. ZK_WSL → ZC_RWCUR). " +
      "When a transport is required: pass transport=<TRKORR> OR createTransport=true.",
    params: z.object({
      name: z.string().describe("InfoObject technical name."),
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
      const raw = await client.saveAndActivateInfoObject(args.name, xml!, {
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
    name: "bw_infoobject_create",
    description:
      "Create an InfoObject (choose iobjType). " +
      "CHA: CHAR skeleton + PUT (length/description). " +
      "UNI: currency/unit (CUKY, refs 0CURRENCY by default); $TMP or package+transport. " +
      "KYF: amount key figure (CURR/AMO/SUM); pass unitInfoObject — " +
      "POST creates KYF then PUT binds the unit. " +
      "Real package REQUIRES transport; omit → $TMP. Check verification.persisted.",
    params: z.object({
      iobjType: z
        .enum(["CHA", "KYF", "UNI"])
        .describe(
          "CHA = characteristic. UNI = currency/unit. KYF = key figure (amount)."
        ),
      name: z.string().describe("Technical name, 3-9 chars starting with a letter (e.g. ZC_RWCUR, ZK_AMT)."),
      description: z.string().describe("Description (long + short text)."),
      infoArea: z.string().describe("Target InfoArea (e.g. ZBW_MDL / ZGLD_TEST)."),
      length: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("CHA only: output length (default 5 via PUT). Ignored for UNI/KYF."),
      referencedInfoObject: z
        .string()
        .optional()
        .describe("UNI only: base unit IOBJ. Default 0CURRENCY for currency units."),
      unitType: z
        .enum(["CUR"])
        .optional()
        .describe("UNI only: CUR = currency (CUKY). Default CUR."),
      objectSpecificDataType: z
        .enum(KF_DATA_TYPES)
        .optional()
        .describe("KYF only: key figure data type. Default CURR."),
      aggregationType: z
        .enum(KF_AGGREGATIONS)
        .optional()
        .describe("KYF only: aggregation. Default SUM."),
      keyfigureType: z
        .enum(KF_SEMANTICS)
        .optional()
        .describe("KYF only: semantics. Default AMO."),
      unitInfoObject: z
        .string()
        .optional()
        .describe(
          "KYF only: currency/unit IOBJ to bind (e.g. ZC_CUR, ZC_RWCUR, 0CURRENCY). " +
            "Applied on PUT after create — prefer a UNI IOBJ, not bare local fields."
        ),
      highPrecision: z
        .boolean()
        .optional()
        .describe("KYF only: high precision storage. Default true."),
      masterLanguage: z.string().optional().describe("Default = session language."),
      responsible: z.string().optional().describe("Default = current user."),
      masterSystem: z.string().optional().describe("Default BPD."),
      autoActivate: z.boolean().optional().describe("Activate after create. Default true."),
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
          "Workbench request number. When set, the object is created in packageName " +
            "and recorded in this request (corrNr). Without it the object lands in $TMP."
        ),
      outputPath: outputPathField,
    }),
    mutating: true,
    async run(client, args) {
      const facade = (client as {
        infoObject?: {
          create?: (options: unknown) => Promise<unknown>
          createCha?: (options: unknown) => Promise<unknown>
          createUnit?: (options: unknown) => Promise<unknown>
        }
      }).infoObject
      const fn =
        args.iobjType === "CHA"
          ? facade?.createCha
          : args.iobjType === "UNI"
            ? facade?.createUnit
            : facade?.create
      if (!fn) {
        throw new Error(
          args.iobjType === "CHA"
            ? "CHA create requires InfoObjectDomain.createCha"
            : args.iobjType === "UNI"
              ? "UNI create requires bw-adt-api with InfoObjectDomain.createUnit"
              : "create requires bw-adt-api with InfoObjectDomain.create"
        )
      }
      const raw = (await fn.call(facade, args)) as {
        lockHandle?: string
        transport?: string
        activated?: boolean
        activateResult?: { success?: boolean; messages?: unknown[] }
        verification?: {
          persisted: boolean
          diffs: string[]
          objectStatus?: string
          aggregationType?: string
          unitInfoObject?: string
          infoObjectType?: string
          dataType?: string
          referencedInfoObject?: string
        }
      }
      const v = raw.verification
      return {
        created: true,
        iobjType: args.iobjType,
        name: args.name,
        infoArea: args.infoArea,
        activated: raw.activated ?? false,
        transport: raw.transport,
        verification: v,
        notes: [
          ...(v && !v.persisted
            ? [
                `⚠️ read-back diffs: ${v.diffs.join("; ")} — property not persisted.`,
              ]
            : []),
          ...(args.iobjType === "KYF" && !args.unitInfoObject
            ? [
                "KYF created without unitInfoObject — bind a UNI (e.g. ZC_CUR) via editor or recreate with unitInfoObject.",
              ]
            : []),
          ...(raw.activated === false
            ? ["object was NOT activated (autoActivate=false or activation failed) — check activateResult."]
            : []),
        ],
      }
    },
  }),

  defineTool({
    name: "bw_infoobject_validate_exists",
    description: "Validate that an InfoObject exists.",
    params: z.object({ name: z.string() }),
    async run(client, args) {
      return client.validateInfoObjectExists(args.name)
    },
  }),

  defineTool({
    name: "bw_infoobject_validate_new_name",
    description: "Validate that a new InfoObject name is available.",
    params: z.object({ name: z.string() }),
    async run(client, args) {
      return client.validateInfoObjectNewName(args.name)
    },
  }),
]
