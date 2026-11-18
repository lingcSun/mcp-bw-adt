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
      "ADSO and InfoArea (area): pass a lockHandle if you already hold one; otherwise the tool " +
      "locks the object itself first (the atomic lock tools were removed from the Public surface, " +
      "so self-locking is the default path). trfn / dtpa / pc / iobj need transport " +
      "(a workbench REQUEST number, not a task number). " +
      "For ADSO you may also pass transport so it is sent as corrNr.",
    params: z.object({
      objectType: OBJECT_TYPE,
      objectName: z.string(),
      lockHandle: z
        .string()
        .optional()
        .describe(
          "Optional for objectType=adso / area: a lock handle from a prior lock call. " +
            "When omitted, the tool locks the object itself."
        ),
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
      // ADSO/InfoArea/TRFN/DTP 删除走 lockHandle 模式（见 bwObject.delete）；
      // MCP Public 面无原子 lock 工具，此处内部加锁。
      const needsSelfLock =
        (args.objectType === "adso" ||
          args.objectType === "area" ||
          args.objectType === "trfn" ||
          args.objectType === "dtpa") &&
        args.lockHandle === undefined
      if (needsSelfLock) {
        const obj = await client.getObject(args.objectType, args.objectName)
        const lock = await obj.lock()
        return obj.delete({ lockHandle: lock.lockHandle, transport: args.transport })
      }
      const options: { lockHandle?: string; transport?: string } = {}
      if (args.lockHandle !== undefined) options.lockHandle = args.lockHandle
      if (args.transport !== undefined) options.transport = args.transport
      return client.deleteObject(args.objectType, args.objectName, options)
    },
  }),
]
