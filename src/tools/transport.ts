/** Transport / CTS (Change and Transport System) tools. */
import { z } from "zod"
import { defineTool, outputPathField } from "../tool"

export const transportTools = [
  defineTool({
    name: "bw_transport_check",
    description:
      "Check whether saving an object requires a transport request. " +
      "Returns recording flag (X = transport mandatory) and the current dev class.",
    params: z.object({
      uri: z.string().describe("Object URI to check."),
      devclass: z.string().optional().describe("Development class."),
      operation: z.string().optional(),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      return client.transportCheck(args.uri, args.devclass, args.operation)
    },
  }),

  defineTool({
    name: "bw_transport_create",
    description: "Create a new transport request for a referenced object.",
    params: z.object({
      refUri: z.string().describe("Object URI the transport is for."),
      description: z.string().describe("Transport description."),
      devclass: z.string().optional(),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      return client.createTransport(args.refUri, args.description, args.devclass)
    },
  }),
]
