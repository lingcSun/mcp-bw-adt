/** Search tools. Results are arrays; offer outputPath for large result sets. */
import { z } from "zod"
import { defineTool, outputPathField } from "../tool"

const SEARCH_OBJECT_TYPES = [
  "ADSO",
  "DTPA",
  "TRFN",
  "INFOCUBE",
  "DSO",
  "IOBJ",
  "CHA",
  "KF",
  "QUERY",
  "PROCS_CHAIN",
] as const

export const searchTools = [
  defineTool({
    name: "bw_search_objects",
    description:
      "Advanced BW object search with filters (type, dates, name/description). Returns a list of { objectName, objectType, title, uri, ... }. Use outputPath for large result sets.",
    params: z.object({
      searchTerm: z.string().describe("Search term, may include wildcards like 0ASSET*."),
      searchInName: z.boolean().optional(),
      searchInDescription: z.boolean().optional(),
      objectType: z.enum(SEARCH_OBJECT_TYPES).optional(),
      createdOnFrom: z.string().optional().describe("ISO 8601 date."),
      createdOnTo: z.string().optional().describe("ISO 8601 date."),
      changedOnFrom: z.string().optional().describe("ISO 8601 date."),
      changedOnTo: z.string().optional().describe("ISO 8601 date."),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      return client.searchBWObjects(args)
    },
  }),

  defineTool({
    name: "bw_adso_transformations",
    description:
      "Get Transformations related to an ADSO (via name search). Each TRFN title carries a 'SOURCE -> TARGET' relation.",
    params: z.object({
      adsoName: z.string().describe("ADSO technical name."),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      return client.getADSOTransformations(args.adsoName)
    },
  }),

  defineTool({
    name: "bw_adso_dtps",
    description:
      "Get DTPs related to an ADSO (via name search). Each DTP title carries a 'SOURCE -> TARGET' relation.",
    params: z.object({
      adsoName: z.string().describe("ADSO technical name."),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      return client.getADSODataTransferProcesses(args.adsoName)
    },
  }),
]
