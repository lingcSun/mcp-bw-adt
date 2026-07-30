/**
 * Process Chain tools.
 *
 * Logs can be large; bw_processchain_logs applies a default limit/offset and
 * also returns run status in the same response.
 */
import { z } from "zod"
import { defineTool, outputPathField } from "../tool"

const LOG_DEFAULT_LIMIT = 100

export const processChainTools = [
  defineTool({
    name: "bw_processchain_details",
    description: "Get parsed process chain details (steps). Prefer outputPath.",
    params: z.object({ id: z.string(), outputPath: outputPathField }),
    async run(client, args) {
      return client.getProcessChainDetails(args.id)
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
    mutating: true,
    async run(client, args) {
      return client.executeProcessChain(args.id)
    },
  }),

  defineTool({
    name: "bw_processchain_stop",
    description: "Stop a running process chain. Irreversible action.",
    params: z.object({ id: z.string() }),
    mutating: true,
    async run(client, args) {
      return client.stopProcessChain(args.id)
    },
  }),

  defineTool({
    name: "bw_processchain_logs",
    description:
      "Get process chain execution logs and current run status. Defaults to the most recent " +
      "log entries; use limit/offset to page, or outputPath for the full log set. Response " +
      "shape: { logs, status, ...paging }.",
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
      const [logsRaw, status] = await Promise.all([
        client.getProcessChainLogs(args.id),
        client.getProcessChainStatus(args.id),
      ])
      const logs = logsRaw as unknown[]
      // With outputPath, return the full log set so the file is complete.
      if (args.outputPath) {
        return {
          chainName: args.id,
          totalEntries: logs.length,
          returned: logs.length,
          truncated: false,
          logs,
          status,
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
        status,
      }
    },
  }),
]
