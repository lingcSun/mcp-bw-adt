# mcp-bw-adt-api

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that exposes the
[`bw-adt-api`](https://www.npmjs.com/package/bw-adt-api) library — SAP BW/4HANA ADT
(ABAP Developer Tools) operations — to LLM clients such as ZCode, Claude Desktop, or any
MCP-compatible client.

It exposes a **Public** subset of `BWAdtClient` domain operations (ADSO, Transformation, DTP,
DataSource, Process Chain, InfoObject, DDIC, search, dataflow, transports, …) as MCP tools —
about **64 tools** after Public-surface consolidation — with a **local-file buffering layer**
that keeps large XML payloads and table data out of the LLM context window.

> **BREAKING (Public surface):** Atomic `lock` / `unlock` / bare `update` / bare `activate`,
> raw `bw_*_get` (prefer `*_details` + `*_get_xml`), `bw_quick_search`, `bw_object_create` /
> `update` / `activate`, `bw_adso_node_path`, and several duplicate DDIC/system tools were
> removed from `tools/list`. Prefer: `*_get_xml` + `outputPath` → edit file → `*_save_and_activate`
> + `xmlPath`. Mutating tools are marked on each `ToolDef` (`mutating: true`) and derived at
> startup for read-only profile guards.

---

## Why a buffering layer?

bw-adt-api payloads are large — measured on real systems:

| Payload | Typical size |
|---|---|
| Object XML (PUT request body) | 15–80 KB |
| DDIC table data, 100 rows × 20 cols | ~68 KB |
| DDIC table data, 10 000 rows | ~6.7 MB |
| Process chain logs, 200 entries | ~39 KB |

Pushing these through the LLM context window is wasteful or fatal. This server solves it two
ways:

### Mechanism A — large request bodies via local files (POST/PUT)

Every tool that takes a large string body (object XML, SQL statement, ABAP source) accepts **two
fields**:

- `<label>Content` — inline string
- `<label>Path` — path to a file under the workdir (takes precedence)

So instead of the LLM having to generate or hold a 50 KB XML, it reads the current XML to a file,
edits it (or uses an atomic-edit tool), then references the file by path.

### Mechanism B — large responses via `outputPath`

Most read tools accept an optional `outputPath`. When set, the **full** result is written to that
file and the tool returns only a small summary envelope:

```json
{ "ok": true, "outputPath": "/abs/path/big.json", "bytes": 723908, "summary": "object with key(s): tableName, rows, …" }
```

- Objects / arrays are written as JSON.
- Raw XML strings (from `bw_*_get_xml` with `outputPath`) are written as **plain text**, so the
  same path can be reused as `xmlPath` in a later save call.

Without `outputPath`, the result is returned inline (with table data paginated to a soft cap and
`truncated`/`hint` flags set when needed).

### Workdir sandbox

All file paths resolve under the **workdir** and are confined to its subtree (`..` escapes and
out-of-tree absolute paths are rejected). By default the workdir is `<cwd>/.mcp-bw-out` (a scratch
folder under the server process working directory) so buffered files do not land on project source.
Override with `BW_MCP_WORKDIR` if you need a different root (e.g. the workspace root).

---

## Quick start

```bash
# 1. Install + build
npm install
npm run build

# 2. Configure connection (copy & edit)
cp .env.example .env
#   multi-env: BW_PROFILES + BW_<NAME>_*  (or legacy BW_BASE_URL / …)

# 3. Inspect the tool catalog (no BW connection needed)
npm run list-tools
```

### Environment variables — multi-profile (recommended)

| Variable | Required | Description |
|---|---|---|
| `BW_PROFILES` | yes* | Comma-separated profile names, e.g. `test,prod` |
| `BW_DEFAULT` | no | Startup profile (default = first in `BW_PROFILES`) |
| `BW_<NAME>_BASE_URL` | yes* | BW server URL for that profile |
| `BW_<NAME>_USERNAME` | yes* | SAP logon user |
| `BW_<NAME>_PASSWORD` | yes* | Password (never exposed to the LLM) |
| `BW_<NAME>_CLIENT` | no | SAP logon client, e.g. `100` |
| `BW_<NAME>_LANGUAGE` | no | Language key, e.g. `ZH` |
| `BW_<NAME>_READONLY` | no | `true` → reject mutating tools on this profile |
| `BW_<NAME>_ALLOW_UNAUTHORIZED` | no | `true` to accept self-signed certs |
| `BW_MCP_WORKDIR` | no | Root for file buffering (default = `<cwd>/.mcp-bw-out`) |

\* Or use the **legacy** single-env vars (`BW_BASE_URL`, `BW_USERNAME`, `BW_PASSWORD`,
optional `BW_CLIENT` / `BW_LANGUAGE` / `BW_READONLY` / `BW_ALLOW_UNAUTHORIZED`) when
`BW_PROFILES` is unset — they become a profile named `default`.

Switch at runtime with `bw_env_list` / `bw_env_switch`. The active profile’s client
auto-logs-in on its first request; `bw_disconnect` drops only the current profile’s session.

**Read-only profiles:** mutating tools are omitted from `tools/list`, and the server emits
`notifications/tools/list_changed` when `readOnly` visibility changes. Host support for
mid-session refresh is incomplete (Cursor / Claude Code may keep a stale list until MCP
reconnect or a new chat) — the server still **rejects** mutating `tools/call` as a hard
guard.

---

## Registering in an MCP client

Add the server to your client's MCP config. Examples:

### ZCode (`.zcode/mcp.json` in the workspace, or user-level)

```jsonc
{
  "mcpServers": {
    "bw-adt": {
      "command": "node",
      "args": ["E:/04-code/02-personnal/bw-adt/mcp-bw-adt-api/build/index.js"],
      "env": {
        "BW_PROFILES": "test,prod",
        "BW_DEFAULT": "test",
        "BW_TEST_BASE_URL": "http://your-bw-test:8000",
        "BW_TEST_USERNAME": "developer",
        "BW_TEST_PASSWORD": "secret",
        "BW_TEST_CLIENT": "100",
        "BW_TEST_LANGUAGE": "ZH",
        "BW_TEST_READONLY": "false",
        "BW_PROD_BASE_URL": "http://your-bw-prod:8000",
        "BW_PROD_USERNAME": "developer",
        "BW_PROD_PASSWORD": "secret",
        "BW_PROD_CLIENT": "100",
        "BW_PROD_LANGUAGE": "ZH",
        "BW_PROD_READONLY": "true"
        // "BW_MCP_WORKDIR": "C:/path/to/workspace"
      }
    }
  }
}
```

> The server inherits the client process's `cwd`, so `BW_MCP_WORKDIR` usually does not need to be
> set — files are buffered into the workspace that owns the MCP server.

### Claude Desktop (`claude_desktop_config.json`)

Same shape under `"mcpServers"`.

---

## Tool catalog

Tools are named `bw_<domain>_<action>`. Run `npm run list-tools` for the full list with input
schemas. Domains:

| Domain | Prefix | Example tools |
|---|---|---|
| System / env | `bw_system_*`, `bw_env_*`, `bw_disconnect` | `bw_env_list`, `bw_env_switch`, `bw_system_status` |
| Search | `bw_search_*`, `bw_quick_search` | `bw_search_objects`, `bw_quick_search` |
| Dataflow / lineage | `bw_dataflow_*` | `bw_dataflow_get`, `bw_dataflow_lineage` |
| Generic CRUD | `bw_object_*` | `bw_object_create/update/delete/activate` |
| ADSO | `bw_adso_*` | `bw_adso_get_xml`, `bw_adso_save_and_activate`, `bw_adso_add_field` |
| InfoArea | `bw_area_*` | `bw_area_create`, `bw_area_get_xml`, `bw_area_validate_exists` |
| Transformation | `bw_trfn_*` | `bw_trfn_create`, `bw_trfn_save_and_activate`, `bw_trfn_add_rules_and_save`, `bw_trfn_auto_map_and_save` |
| DTP | `bw_dtp_*` | `bw_dtp_create`, `bw_dtp_execute`, `bw_dtp_save_and_activate` |
| DataSource | `bw_datasource_*` | `bw_datasource_save_and_activate`, `bw_datasource_merge_proposal` |
| Replication | `bw_replication_*` | `bw_replication_replicate_full` |
| Process Chain | `bw_processchain_*` | `bw_processchain_execute`, `bw_processchain_logs` |
| InfoObject | `bw_infoobject_*` | `bw_infoobject_get` |
| DDIC tables / data | `bw_table_*` | `bw_table_get_data`, `bw_table_query_sql` |
| BICS reporting / preview | `bw_reporting_*` | `bw_reporting_preview`, `bw_reporting_initial_view` |
| Transport / CTS | `bw_transport_*` | `bw_transport_check`, `bw_transport_create` |

> Note: Transformation **creation** is unsupported server-side (SAP JCo limitation) and
> `bw_object_create` with `objectType: "trfn"` returns an error. All other TRFN operations work.

---

## Typical workflows

### Read-modify-write an ADSO (no large XML held by the LLM)

```
1. bw_adso_get_xml   { id: "ZL_FID40", format: "summary", outputPath: "adso.xml" }
   → LLM sees a small envelope; the full XML is on disk under the workdir.

2. bw_adso_add_field { id: "ZL_FID40", name: "ZZFLAG", dataType: "CHAR", length: 1 }
   → atomic edit: reads current XML, adds the field, saves+activates.
   (Or the LLM edits adso.xml directly, then:)

3. bw_adso_save_and_activate { id: "ZL_FID40", xmlPath: "adso.xml" }
   → writes the file's XML back, one-stop lock→PUT→activate→unlock.
```

### Query a large table without flooding context

```
bw_table_get_data { table: "/BIC/AZL_FID402", maxRows: 1000, outputPath: "data.json" }
→ { ok: true, outputPath: "…/data.json", bytes: 680000, summary: "…: 1000 row(s)…" }
```

The LLM can then run a follow-up script/tool to inspect `data.json` instead of ingesting it.

### Inspect process chain logs safely

```
bw_processchain_logs { id: "ZPC_FID", limit: 50, offset: 0 }
→ inline, capped. Use outputPath for the full log set.
```

---

## Architecture

```
src/
├── index.ts        stdio entry; --list-tools catalog dump
├── server.ts       MCP Server + tools/list + tools/call (outputPath interception)
├── session.ts      singleton BWAdtClient from env (auto-login)
├── errors.ts       AdtException → MCP error result mapping
├── fileio.ts       workdir sandbox, readInput (mechanism A), writeOutput (mechanism B)
├── response.ts     pagination, projection, summaries
├── tool.ts         ToolDef + zod→JSON Schema + largeInput/outputPathField helpers
└── tools/          one file per domain, each exporting ToolDef[]
```

- **Credentials** are read once from env at startup and never surfaced to the LLM.
- **Write operations** (delete, activate, execute) are exposed directly, no extra confirmation
  layer — rely on your MCP client's tool-approval prompt.
- **Pagination**: table tools default `maxRows` to 50 and cap inline returns; logs default to 100
  with `limit`/`offset`.

## Development

```bash
npm run build      # tsc → build/
npm run watch      # tsc -w
npm start          # run the server (stdio)
npm run list-tools # dump the tool catalog as JSON
```

The server depends on `bw-adt-api` via a local `file:` link during development. Once published,
switch the dependency to `"bw-adt-api": "^0.1.0"`.

## License

MIT
