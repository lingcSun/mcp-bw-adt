#!/usr/bin/env node
/**
 * mcp-bw-adt-api entry point.
 *
 * Runs the stdio MCP server. Supports a `--list-tools` mode that prints the
 * tool catalog as JSON (handy for verifying registration without a live BW
 * connection or a full MCP client).
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"

import { createServer, registry } from "./server"
import { registerTools } from "./server"
import { ALL_TOOLS } from "./tools"
import { toJsonSchema } from "./tool"

async function main(): Promise<void> {
  registerTools(ALL_TOOLS)

  // `npm run list-tools` / `node build/index.js --list-tools`
  if (process.argv.includes("--list-tools")) {
    const catalog = registry.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: toJsonSchema(t.params),
    }))
    process.stdout.write(JSON.stringify(catalog, null, 2) + "\n")
    return
  }

  const server = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err?.stack || err}\n`)
  process.exit(1)
})
