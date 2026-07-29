/**
 * Data Transfer Process (DTP) tools.
 *
 * updateDTP has no options bag (fully positional: lockHandle, transport).
 * save_and_activate returns a compact projection.
 */
import { z } from "zod"
import { defineTool, largeInput, outputPathField, readLargeInput } from "../tool"
import { shapeSaveResult } from "../response"

export const dtpTools = [
  defineTool({
    name: "bw_dtp_get",
    description: "Get raw DTP metadata. Prefer outputPath.",
    params: z.object({
      id: z.string().describe("DTP technical name."),
      forceCacheUpdate: z.boolean().optional(),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      return client.getDTP(args.id, args.forceCacheUpdate)
    },
  }),

  defineTool({
    name: "bw_dtp_details",
    description: "Get parsed DTP details. Prefer outputPath.",
    params: z.object({ id: z.string(), forceCacheUpdate: z.boolean().optional(), outputPath: outputPathField }),
    async run(client, args) {
      return client.getDTPDetails(args.id, args.forceCacheUpdate)
    },
  }),

  defineTool({
    name: "bw_dtp_versions",
    description: "Get DTP version history.",
    params: z.object({ id: z.string() }),
    async run(client, args) {
      return client.getDTPVersions(args.id)
    },
  }),

  defineTool({
    name: "bw_dtp_lock",
    description: "Lock a DTP. Returns { lockHandle, corrNr }.",
    params: z.object({ id: z.string() }),
    async run(client, args) {
      return client.lockDTP(args.id)
    },
  }),

  defineTool({
    name: "bw_dtp_unlock",
    description: "Unlock a DTP.",
    params: z.object({ id: z.string() }),
    async run(client, args) {
      return client.unlockDTP(args.id)
    },
  }),

  defineTool({
    name: "bw_dtp_activate",
    description: "Activate a DTP. lockHandle/corrNr optional.",
    params: z.object({ id: z.string(), lockHandle: z.string().optional(), corrNr: z.string().optional() }),
    async run(client, args) {
      return client.activateDTP(args.id, args.lockHandle, args.corrNr)
    },
  }),

  defineTool({
    name: "bw_dtp_check",
    description: "Check DTP consistency.",
    params: z.object({ id: z.string() }),
    async run(client, args) {
      return client.checkDTP(args.id)
    },
  }),

  defineTool({
    name: "bw_dtp_execute",
    description: "Execute a DTP (triggers data transfer). Irreversible action.",
    params: z.object({ id: z.string() }),
    async run(client, args) {
      return client.executeDTP(args.id)
    },
  }),

  defineTool({
    name: "bw_dtp_update",
    description:
      "Update a DTP via PUT. XML via xmlContent or xmlPath. lockHandle required. " +
      "Prefer bw_dtp_save_and_activate.",
    params: z.object({
      id: z.string(),
      ...largeInput("xml"),
      lockHandle: z.string().describe("Required lock handle from bw_dtp_lock."),
      transport: z.string().optional(),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      const xml = await readLargeInput(args, "xml", true)
      return client.updateDTP(args.id, xml!, args.lockHandle, args.transport)
    },
  }),

  defineTool({
    name: "bw_dtp_save_and_activate",
    description:
      "One-stop: lock → PUT → (optional) activate → unlock. XML via xmlContent or xmlPath. " +
      "Compact projection returned; set outputPath for full detail.",
    params: z.object({
      id: z.string(),
      ...largeInput("xml"),
      transport: z.string().optional(),
      transportDescription: z.string().optional(),
      autoActivate: z.boolean().optional(),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      const xml = await readLargeInput(args, "xml", true)
      const raw = await client.saveAndActivateDTP(args.id, xml!, {
        transport: args.transport,
        transportDescription: args.transportDescription,
        autoActivate: args.autoActivate,
      })
      return shapeSaveResult(raw as Record<string, unknown>, args.outputPath)
    },
  }),
]
