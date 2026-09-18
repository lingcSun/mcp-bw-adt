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
      "Which argument is required depends on objectType: ADSO and InfoArea (area) need " +
      "lockHandle (obtain it from a prior lock — bw_dtp_activate-style lock is not enough, " +
      "lock the ADSO itself); trfn / dtpa / pc / iobj need transport. " +
      "For ADSO you may also pass transport so it is sent as corrNr.",
    params: z.object({
      objectType: OBJECT_TYPE,
      objectName: z.string(),
      lockHandle: z
        .string()
        .optional()
        .describe("Required for objectType=adso / area: the lock handle from a prior lock call."),
      transport: z
        .string()
        .optional()
        .describe(
          "Required for trfn / dtpa / pc / iobj: a workbench REQUEST number (not a task number). " +
            "For adso / area it is optional and is sent as corrNr."
        ),
    }),
    mutating: true,
    async run(client, args) {
      const options: { lockHandle?: string; transport?: string } = {}
      if (args.lockHandle !== undefined) options.lockHandle = args.lockHandle
      if (args.transport !== undefined) options.transport = args.transport
      return client.deleteObject(args.objectType, args.objectName, options)
    },
  }),
]
