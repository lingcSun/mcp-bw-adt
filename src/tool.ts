/**
 * Declarative tool definitions.
 *
 * Each tool is an object literal (name / description / zod params / run). The
 * server derives the JSON Schema from the zod type and routes calls to `run`.
 * Helpers produce the recurring large-input and output-path field shapes so
 * every write/large-response tool is consistent and concise.
 */
import { z } from "zod"
import { zodToJsonSchema } from "zod-to-json-schema"
import type { BWAdtClient } from "bw-adt-api"

/** A tool definition. `S` is the zod schema for the tool's arguments. */
export interface ToolDef<S extends z.ZodTypeAny> {
  name: string
  description: string
  params: S
  /**
   * When false, the server does not build/login a BW client (env list/switch,
   * status). Default true.
   */
  needsClient?: boolean
  /**
   * When true, blocked under read-only profiles. Source of truth for mutating
   * tool set (derived from ALL_TOOLS at startup).
   */
  mutating?: boolean
  /**
   * Execute the tool. `args` is already validated against `params`. Must NOT
   * read/write files itself except via fileio helpers when it opts in.
   */
  run: (client: BWAdtClient, args: z.infer<S>) => Promise<unknown>
}

/** Identity helper — just returns its argument, for concise definitions. */
export function defineTool<S extends z.ZodTypeAny>(def: ToolDef<S>): ToolDef<S> {
  return def
}

/**
 * Convert a zod schema to a JSON Schema acceptable as an MCP inputSchema.
 *
 * zodToJsonSchema inlines a self-referencing wrapper ($ref + definitions) only
 * when a schema recurses; for plain object schemas it emits the object directly.
 * We drop the bundled $schema key (not valid inside an MCP inputSchema) and
 * return the schema object as-is.
 */
export function toJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  // zod-to-json-schema's TS types recurse excessively with zod 3.x; bypass them.
  const json = (zodToJsonSchema as (s: unknown) => unknown)(schema) as Record<
    string,
    unknown
  >
  // Remove the $schema hint that zodToJsonSchema adds — MCP clients reject it.
  const { $schema, ...rest } = json
  return rest
}

/**
 * Produce a zod object with `{ <label>Content?, <label>Path? }` for a large
 * request body (mechanism A). Spread it into a tool's params object.
 *
 * `label` is used verbatim as the field-name prefix, so pass a lowerCamelCase
 * label (e.g. "xml", "xmlContent" field; "sqlStatement" → "sqlStatementPath").
 *
 * Example: `z.object({ adsoId: z.string(), ...largeInput("xml") })` yields
 * optional `xmlContent` and `xmlPath` string fields.
 */
export function largeInput(label: string): Record<string, z.ZodOptional<z.ZodString>> {
  return {
    [`${label}Content`]: z
      .string()
      .optional()
      .describe(`Inline ${label} content. Mutually exclusive with ${label}Path.`),
    [`${label}Path`]: z
      .string()
      .optional()
      .describe(
        `Path (under the workdir) to a file containing the ${label}. ` +
          `Takes precedence over ${label}Content. Use bw_*_get_xml with outputPath to produce such a file.`
      ),
  }
}

/**
 * Resolve a large-input field pair into a single string, reading from file when
 * a path is given. `label` MUST be the same string passed to `largeInput`.
 * Returns undefined when neither field is present (caller decides if that's an error).
 */
export async function readLargeInput(
  args: Record<string, unknown>,
  label: string,
  required: boolean
): Promise<string | undefined> {
  const pathField = args[`${label}Path`]
  const contentField = args[`${label}Content`]
  // Lazy import to avoid a circular module dependency at load time.
  const { readInput } = await import("./fileio")
  return readInput(
    { path: pathField as string | undefined, content: contentField as string | undefined },
    required ? `${label} (required)` : label
  ).catch((e) => {
    if (required) throw e
    return undefined
  })
}

/** The optional outputPath field appended to large-response tools (mechanism B). */
export const outputPathField = z
  .string()
  .optional()
  .describe(
    "If provided, the full result is written to this path (under the workdir) and the tool " +
      "returns only a small summary envelope { ok, outputPath, bytes, summary }. " +
      "Objects/arrays are written as JSON; ONLY the bw_*_get_xml family writes the raw XML " +
      "string as plain text (that file is directly reusable as xmlPath in a later save call). " +
      "Other *_get tools (e.g. bw_dtp_get, bw_trfn_get) write the PARSED XML-to-JSON tree, " +
      "not raw XML — use the matching bw_*_get_xml tool when you need the raw XML string. " +
      "Use outputPath for large responses (XML, table data, logs, dataflow graphs). " +
      "When set, tools skip inline pagination/projection so the file contains the complete payload."
  )
