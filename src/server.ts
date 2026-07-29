/**
 * MCP server wiring: tool registration, call routing, and the outputPath
 * interception that powers the large-response file-buffering mechanism (B).
 *
 * Call flow for `tools/call`:
 *   1. validate args against the tool's zod schema
 *   2. run the tool with the full args (including outputPath so tools can skip
 *      pagination / projection when buffering)
 *   3. if outputPath was given: write the full result to file and return a small
 *      summary envelope; otherwise return the result inline (possibly paginated
 *      by the tool itself)
 *   4. any thrown error is mapped via errors.ts
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import {
  CallToolRequestSchema,
  CallToolResult,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"

import type { ToolDef } from "./tool"
import { toJsonSchema } from "./tool"
import {
  assertWritable,
  getClient,
  isCurrentReadOnly,
  setToolListChangedHandler,
} from "./session"
import { isMutatingTool } from "./mutating"
import { toMcpError } from "./errors"
import { writeOutput } from "./fileio"
import { summarizeValue } from "./response"

/** Aggregate of all tool definitions (set by tools/index.ts). */
export const registry: ToolDef<any>[] = []

export function registerTools(...groups: ToolDef<any>[][]): void {
  for (const g of groups) registry.push(...g)
}

/** Tools visible for the current environment (hides mutating ones when read-only). */
export function visibleTools(): ToolDef<any>[] {
  if (!isCurrentReadOnly()) return registry
  return registry.filter((t) => !isMutatingTool(t.name))
}

const SERVER_NAME = "mcp-bw-adt-api"
const SERVER_VERSION = "0.1.0"

export function createServer(): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    // listChanged: we emit notifications/tools/list_changed after env switch
    // when readOnly visibility changes. Host support varies — call-time
    // assertWritable remains the hard safety net.
    { capabilities: { tools: { listChanged: true } } }
  )

  setToolListChangedHandler(() => server.sendToolListChanged())

  // tools/list — filter mutating tools when the active profile is read-only.
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: visibleTools().map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: toJsonSchema(t.params),
    })),
  }))

  // tools/call — route to the tool, apply outputPath interception.
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawArgs } = request.params
    const tool = registry.find((t) => t.name === name)
    if (!tool) {
      return toMcpError(new Error(`Unknown tool: ${name}`))
    }

    try {
      // Validate args. zod parse throws on invalid input.
      const parsed = tool.params.parse(rawArgs ?? {}) as {
        outputPath?: string
      } & Record<string, unknown>
      const { outputPath } = parsed

      // Read-only profiles block mutating tools before any network call
      // (defense in depth if the host still has a stale tool list).
      if (isMutatingTool(name)) assertWritable(name)

      // Pass full args (incl. outputPath) so tools can return untruncated/raw
      // payloads when buffering to disk. Env/status tools skip the client.
      const needsClient = tool.needsClient !== false
      const client = needsClient
        ? getClient()
        : (undefined as unknown as import("bw-adt-api").BWAdtClient)
      const result = await tool.run(client, parsed)

      // Mechanism B: dump the full result to file, return a small envelope.
      if (outputPath) {
        const { outputPath: abs, bytes } = await writeOutput(outputPath, result)
        return ok({
          ok: true,
          outputPath: abs,
          bytes,
          summary: summarizeValue(result),
        })
      }

      // Inline result.
      return ok(result)
    } catch (err) {
      return toMcpError(err)
    }
  })

  return server
}

/** Wrap a successful value as a single MCP text content block (pretty JSON). */
function ok(data: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text:
          typeof data === "string"
            ? data
            : JSON.stringify(data, null, 2),
      },
    ],
    isError: false,
  }
}
