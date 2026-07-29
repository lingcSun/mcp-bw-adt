/**
 * Process Chain tools.
 *
 * Logs can be large (200 entries ≈ 39 KB), so bw_processchain_logs applies a
 * default limit and an offset, and supports outputPath for full dumps.
 */
import { z } from "zod"
import { defineTool, outputPathField } from "../tool"

const LOG_DEFAULT_LIMIT = 100

export const processChainTools = [
  defineTool({
    name: "bw_processchain_get",
    description: "Get raw process chain metadata. Prefer outputPath.",
    params: z.object({ id: z.string(), outputPath: outputPathField }),
    async run(client, args) {
      return client.getProcessChain(args.id)
    },
  }),

  defineTool({
    name: "bw_processchain_details",
    description: "Get parsed process chain details (steps). Prefer outputPath.",
    params: z.object({ id: z.string(), outputPath: outputPathField }),
    async run(client, args) {
      return client.getProcessChainDetails(args.id)
    },
  }),

  defineTool({
    name: "bw_processchain_versions",
    description: "Get process chain version history.",
    params: z.object({ id: z.string() }),
    async run(client, args) {
      return client.getProcessChainVersions(args.id)
    },
  }),

  defineTool({
    name: "bw_processchain_lock",
    description: "Lock a process chain.",
    params: z.object({ id: z.string() }),
    async run(client, args) {
      return client.lockProcessChain(args.id)
    },
  }),

  defineTool({
    name: "bw_processchain_unlock",
    description: "Unlock a process chain.",
    params: z.object({ id: z.string() }),
    async run(client, args) {
      return client.unlockProcessChain(args.id)
    },
  }),

  defineTool({
    name: "bw_processchain_activate",
    description: "Activate a process chain. lockHandle/corrNr optional.",
    params: z.object({ id: z.string(), lockHandle: z.string().optional(), corrNr: z.string().optional() }),
    async run(client, args) {
      return client.activateProcessChain(args.id, args.lockHandle, args.corrNr)
    },
  }),

  defineTool({
    name: "bw_processchain_check",
    description: "Check process chain consistency.",
    params: z.object({ id: z.string() }),
    async run(client, args) {
      return client.checkProcessChain(args.id)
    },
  }),

  defineTool({
    name: "bw_processchain_execute",
    description: "Execute a process chain. Irreversible action.",
    params: z.object({ id: z.string() }),
    async run(client, args) {
      return client.executeProcessChain(args.id)
    },
  }),

  defineTool({
    name: "bw_processchain_stop",
    description: "Stop a running process chain. Irreversible action.",
    params: z.object({ id: z.string() }),
    async run(client, args) {
      return client.stopProcessChain(args.id)
    },
  }),

  defineTool({
    name: "bw_processchain_logs",
    description:
      "Get process chain execution logs. Defaults to the most recent entries; use limit/offset " +
      "to page, or outputPath for the full log set.",
    params: z.object({
      id: z.string(),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(`Max entries returned inline (default ${LOG_DEFAULT_LIMIT}).`),
      offset: z.number().int().nonnegative().optional(),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      const logs = (await client.getProcessChainLogs(args.id)) as unknown[]
      // With outputPath, return the full log set so the file is complete.
      if (args.outputPath) {
        return {
          chainName: args.id,
          totalEntries: logs.length,
          returned: logs.length,
          truncated: false,
          logs,
        }
      }
      const offset = args.offset ?? 0
      const limit = args.limit ?? LOG_DEFAULT_LIMIT
      const slice = logs.slice(offset, offset + limit)
      return {
        chainName: args.id,
        totalEntries: logs.length,
        offset,
        limit,
        returned: slice.length,
        truncated: offset + limit < logs.length,
        hint:
          offset + limit < logs.length
            ? `Showing ${slice.length} of ${logs.length} from offset ${offset}. Increase limit/offset or set outputPath for all.`
            : undefined,
        logs: slice,
      }
    },
  }),

  defineTool({
    name: "bw_processchain_status",
    description: "Get process chain run status.",
    params: z.object({ id: z.string() }),
    async run(client, args) {
      return client.getProcessChainStatus(args.id)
    },
  }),
]
