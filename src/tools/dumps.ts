/** ABAP runtime dumps (ST22) — read-only ops. */
import { z } from "zod"
import { defineTool, outputPathField } from "../tool"
import { condenseDump } from "../dumpsCondense"

export const dumpsTools = [
  defineTool({
    name: "bw_dumps",
    description:
      "Retrieves ABAP runtime dumps (ST22 feed). Each dump returns title, author, updated, " +
      "categories and the key troubleshooting sections extracted from the dump HTML (header " +
      "key/values, where terminated, error analysis, source extract with the crash line, call " +
      "stack) instead of the full escaped HTML body. Optional query is a plain ADT URL query " +
      'string, e.g. "maxNumber=5" or "from=20260901120000" (YYYYMMDDhhmmss). Use outputPath for ' +
      "large result sets.",
    params: z.object({
      query: z
        .string()
        .optional()
        .describe(
          'Optional URL query string passed through to ADT, e.g. "maxNumber=5" or "from=20260901120000"'
        ),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      const feed = await client.dumps(args.query)
      const dumps = feed.dumps.map((d) => ({
        title: d.title,
        author: d.author,
        updated: d.updated,
        categories: d.categories,
        ...condenseDump(d.text),
      }))
      return {
        count: dumps.length,
        href: feed.href,
        title: feed.title,
        updated: feed.updated,
        dumps,
      }
    },
  }),
]
