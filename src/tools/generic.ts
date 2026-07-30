/**
 * Generic cross-type BW object tools.
 * Public surface keeps delete only; type-specific create/update/activate cover writes.
 */
import { z } from "zod"
import { defineTool } from "../tool"

const OBJECT_TYPE = z
  .enum(["adso", "trfn", "dtpa", "pc", "iobj", "area"])
  .describe("BW object type.")

export const genericTools = [
  defineTool({
    name: "bw_object_delete",
    description:
      "Delete any BW object. Irreversible. " +
      "For InfoArea (area), pass a lock handle; for other types, pass a transport request number.",
    params: z.object({
      objectType: OBJECT_TYPE,
      objectName: z.string(),
      lockHandleOrTransport: z
        .string()
        .describe("Lock handle (InfoArea) or transport request number (other types)."),
    }),
    mutating: true,
    async run(client, args) {
      return client.deleteObject(args.objectType, args.objectName, args.lockHandleOrTransport)
    },
  }),
]
