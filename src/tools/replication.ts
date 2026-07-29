/**
 * DataSource replication tools.
 *
 * ReplicationTask is the unit of a replication request. `activate` is a strategy
 * string (not boolean) per the underlying API.
 */
import { z } from "zod"
import { defineTool, outputPathField } from "../tool"

const replicationTask = z.object({
  datasource: z.string(),
  tlogo: z.string().optional().describe("Object type, usually RSDS."),
  externalObject: z.string().optional(),
  externalObjectDescription: z.string().optional(),
  description: z.string().optional(),
  operation: z.string().optional().describe("e.g. UEQ."),
  execute: z.boolean().optional(),
  uri: z.string().optional(),
})

export const replicationTools = [
  defineTool({
    name: "bw_replication_info",
    description: "Replication pre-check for a DataSource.",
    params: z.object({
      sourceSystem: z.string(),
      datasource: z.string(),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      return client.getReplicationInfo(args.sourceSystem, args.datasource)
    },
  }),

  defineTool({
    name: "bw_replication_replicate",
    description:
      "Trigger DataSource replication with explicit pre-check tasks. " +
      "activate is a strategy string (not a boolean).",
    params: z.object({
      sourceSystem: z.string(),
      datasource: z.string(),
      tasks: z.array(replicationTask).describe("Replication tasks."),
      activate: z.string().optional().describe("Activation strategy value."),
      background: z.boolean().optional(),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      const { sourceSystem, datasource, outputPath: _outputPath, ...opts } = args
      // io-ts' OutputOf marks these keys required (value|undefined); explicitly
      // materialize every key so the type checks out.
      const tasks = args.tasks.map((t) => ({
        datasource: t.datasource,
        tlogo: t.tlogo,
        externalObject: t.externalObject,
        externalObjectDescription: t.externalObjectDescription,
        description: t.description,
        operation: t.operation,
        execute: t.execute,
        uri: t.uri,
      }))
      return client.replicateDataSource(sourceSystem, datasource, tasks, opts)
    },
  }),

  defineTool({
    name: "bw_replication_replicate_full",
    description: "One-stop: pre-check → trigger replication.",
    params: z.object({
      sourceSystem: z.string(),
      datasource: z.string(),
      activate: z.string().optional(),
      background: z.boolean().optional(),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      const { sourceSystem, datasource, outputPath: _outputPath, ...opts } = args
      return client.replicateDataSourceFull(sourceSystem, datasource, opts)
    },
  }),
]
