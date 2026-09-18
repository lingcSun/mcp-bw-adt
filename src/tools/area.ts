/**
 * InfoArea tools.
 *
 * Create flow mirrors Eclipse ADT Communication Log:
 *   validate parent exists → validate new name → lock → POST create → unlock
 * (no activate; InfoArea active version is /a).
 */
import { z } from "zod"
import { defineTool, outputPathField } from "../tool"
import { shapeXmlResult } from "../response"

function buildAreaXml(options: {
  name: string
  parentInfoArea: string
  description: string
  responsible: string
  masterLanguage: string
  language: string
  masterSystem: string
}): string {
  const {
    name,
    parentInfoArea,
    description,
    responsible,
    masterLanguage,
    language,
    masterSystem,
  } = options

  return `<?xml version="1.0" encoding="UTF-8"?>
<InfoArea:infoArea xmlns:InfoArea="http://www.sap.com/bw/modeling/BwInfoArea.ecore" xmlns:adtcore="http://www.sap.com/adt/core" name="${name}" parentInfoArea="${parentInfoArea}">
  <longDescription>${description}</longDescription>
  <tlogoProperties adtcore:language="${language}" adtcore:name="${name}" adtcore:type="AREA" adtcore:masterLanguage="${masterLanguage}" adtcore:masterSystem="${masterSystem}" adtcore:responsible="${responsible}">
    <infoArea>${parentInfoArea}</infoArea>
  </tlogoProperties>
</InfoArea:infoArea>`
}

export const areaTools = [
  defineTool({
    name: "bw_area_validate_exists",
    description:
      "Validate that an InfoArea exists (AREA). Prefer this over bw_adso_validate_info_area.",
    params: z.object({ name: z.string().describe("InfoArea technical name.") }),
    async run(client, args) {
      return client.validateInfoArea(args.name)
    },
  }),

  defineTool({
    name: "bw_area_validate_new_name",
    description: "Validate that a new InfoArea name is available.",
    params: z.object({ name: z.string().describe("Candidate InfoArea name.") }),
    async run(client, args) {
      return client.validateNewObjectName("AREA", args.name)
    },
  }),

  defineTool({
    name: "bw_area_get_xml",
    description:
      "Get InfoArea raw XML (active version /a). Prefer outputPath. " +
      "Reuse as xmlPath only if a future save tool is added; create uses structured params.",
    params: z.object({
      name: z.string().describe("InfoArea technical name."),
      format: z
        .enum(["summary", "xml"])
        .optional()
        .describe(
          "Only affects inline responses (no outputPath). summary (default) = overview; xml = raw XML."
        ),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      const obj = await client.getObject("area", args.name)
      const xml = await obj.getDetails()
      return shapeXmlResult(xml, { areaName: args.name }, args)
    },
  }),

  defineTool({
    name: "bw_area_create",
    description:
      "Create an InfoArea under a parent InfoArea. Flow: validate parent → validate name → " +
      "lock → POST → unlock (no activate). $TMP packages typically need no transport.",
    params: z.object({
      name: z.string().describe("New InfoArea technical name."),
      parentInfoArea: z
        .string()
        .describe("Parent InfoArea technical name (e.g. ZGLD_TEST)."),
      description: z.string().describe("Long description / title."),
      masterLanguage: z.string().optional().describe("Default = session language."),
      language: z.string().optional().describe("Default = session language."),
      responsible: z.string().optional().describe("Default = current username."),
      masterSystem: z.string().optional().describe("Default BPD."),
      transport: z.string().optional().describe("Optional transport request."),
    }),
    mutating: true,
    async run(client, args) {
      const language = args.language || client.language || "ZH"
      const masterLanguage = args.masterLanguage || language
      const xml = buildAreaXml({
        name: args.name,
        parentInfoArea: args.parentInfoArea,
        description: args.description,
        responsible: args.responsible || client.username || "",
        masterLanguage,
        language,
        masterSystem: args.masterSystem || "BPD",
      })
      await client.createObject("area", args.name, xml, {
        parent: args.parentInfoArea,
        transport: args.transport,
      })
      return {
        ok: true,
        name: args.name,
        parentInfoArea: args.parentInfoArea,
        description: args.description,
      }
    },
  }),

  defineTool({
    name: "bw_area_delete",
    description:
      "Delete an InfoArea. Locks, DELETE /a?lockHandle=…, then unlocks. Irreversible.",
    params: z.object({
      name: z.string().describe("InfoArea technical name to delete."),
    }),
    mutating: true,
    async run(client, args) {
      try {
        await client.dropSession()
      } catch {
        // ignore stale session
      }
      const obj = await client.getObject("area", args.name)
      const lock = await obj.lock()
      await obj.delete({ lockHandle: lock.lockHandle })
      return { ok: true, name: args.name, deleted: true }
    },
  }),
]
