/** InfoObject tools. */
import { z } from "zod"
import { defineTool, outputPathField } from "../tool"

export const infoobjectTools = [
  defineTool({
    name: "bw_infoobject_get",
    description:
      "Get InfoObject details including metadata. Prefer outputPath.",
    params: z.object({ name: z.string(), outputPath: outputPathField }),
    async run(client, args) {
      const [details, metadata] = await Promise.all([
        client.getInfoObject(args.name),
        client.getInfoObjectMetadata(args.name).catch(() => undefined),
      ])
      return { details, metadata }
    },
  }),

  defineTool({
    name: "bw_infoobject_validate_exists",
    description: "Validate that an InfoObject exists.",
    params: z.object({ name: z.string() }),
    async run(client, args) {
      return client.validateInfoObjectExists(args.name)
    },
  }),

  defineTool({
    name: "bw_infoobject_validate_new_name",
    description: "Validate that a new InfoObject name is available.",
    params: z.object({ name: z.string() }),
    async run(client, args) {
      return client.validateInfoObjectNewName(args.name)
    },
  }),
]
