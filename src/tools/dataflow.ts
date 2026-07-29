/**
 * Data flow / lineage tools.
 *
 * getDataflow returns a full graph (measured: 40 nodes ≈ 10 KB, grows with
 * depth), so outputPath is offered for deep expansions.
 */
import { z } from "zod"
import { defineTool, outputPathField } from "../tool"

const DIRECTION = z
  .enum(["upstream", "downstream", "both"])
  .optional()
  .describe(
    "upstream = sources feeding into the object; downstream = where it flows; both (default) = both."
  )

export const dataflowTools = [
  defineTool({
    name: "bw_dataflow_get",
    description:
      "Get the dataflow/lineage graph around an object (nodes + relations). " +
      "levels=-1 expands fully; positive N limits depth. Use outputPath for deep graphs.",
    params: z.object({
      objectName: z.string(),
      objectType: z.string().optional().describe("Default ADSO."),
      direction: DIRECTION,
      levels: z
        .number()
        .int()
        .optional()
        .describe("-1 = expand to the end (default); N = expand N levels."),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      const { objectName, objectType, outputPath: _outputPath, ...opts } = args
      return client.getDataflow(objectName, objectType, opts)
    },
  }),

  defineTool({
    name: "bw_dataflow_lineage",
    description:
      "Find transformations and DTPs linking a source object to a target object " +
      "(typical: 'which TRFN/DTP connect ZL_FID01 → ZL_FID40').",
    params: z.object({
      target: z.string().describe("Target object name."),
      source: z.string().describe("Source object name."),
      targetType: z.string().optional().describe("Default ADSO."),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      const { target, source, targetType } = args
      return client.getDataflowLineage(target, source, targetType)
    },
  }),
]
