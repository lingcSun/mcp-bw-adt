/** Session, environment profiles, and system information tools. */
import { z } from "zod"
import { defineTool, outputPathField } from "../tool"
import {
  getConnectionInfo,
  getCurrentProfile,
  hasActiveClient,
  listProfiles,
  resetClient,
  switchProfile,
} from "../session"

export const systemTools = [
  defineTool({
    name: "bw_system_status",
    description:
      "Report MCP server status: current environment profile (name, baseUrl, username, " +
      "client, language, readOnly), whether a live BW session exists for it, all configured " +
      "profiles, and workdir for file buffering. No network call. Use this first to confirm " +
      "the server is wired to the right BW system.",
    params: z.object({}),
    needsClient: false,
    async run() {
      const info = getConnectionInfo()
      return {
        connected: hasActiveClient(),
        configured: !!info,
        currentEnv: info?.name,
        readOnly: info?.readOnly ?? false,
        connection: info,
        profiles: (() => {
          try {
            return listProfiles()
          } catch {
            return []
          }
        })(),
        workdir: (await import("../fileio")).workdir,
      }
    },
  }),

  defineTool({
    name: "bw_env_list",
    description:
      "List configured BW environment profiles and which one is active. Each profile includes " +
      "name, baseUrl, username, client, language, and readOnly. No network call. Prefer this " +
      "(or bw_system_status) before bw_env_switch.",
    params: z.object({}),
    needsClient: false,
    async run() {
      const current = getCurrentProfile()
      return {
        currentEnv: current.name,
        readOnly: current.readOnly,
        profiles: listProfiles(),
      }
    },
  }),

  defineTool({
    name: "bw_env_switch",
    description:
      "Switch the active BW environment profile (e.g. test → prod). Subsequent tools use the " +
      "new profile. Does not log in until the next tool that needs a client; existing sessions " +
      "for other profiles are kept. When switching to/from a read-only profile, mutating tools " +
      "are hidden/shown and a tools/list_changed notification is sent (host support varies; " +
      "mutating calls are always rejected on read-only profiles).",
    params: z.object({
      env: z
        .string()
        .describe(
          'Profile name from BW_PROFILES, e.g. "test" or "prod". Use bw_env_list to see options.'
        ),
    }),
    needsClient: false,
    async run(_client, args) {
      const profile = switchProfile(args.env)
      return {
        switched: true,
        currentEnv: profile.name,
        readOnly: profile.readOnly,
        connection: profile,
      }
    },
  }),

  defineTool({
    name: "bw_system_info",
    description:
      "Query BW system info and capabilities for the current environment (auto-logs in on first call). " +
      "Use outputPath for the full document. For a single property or capability check, read the " +
      "returned document (or buffered file) rather than separate tools.",
    params: z.object({ outputPath: outputPathField }),
    async run(client) {
      return client.systemInfo()
    },
  }),

  defineTool({
    name: "bw_disconnect",
    description:
      "Drop the current environment's BW session/client so the next call reconnects. " +
      "Other profiles' sessions are left intact. Useful after errors or to force a fresh login.",
    params: z.object({}),
    async run(client) {
      try {
        await client.logout()
      } catch {
        /* ignore — session may already be gone */
      }
      resetClient()
      return {
        disconnected: true,
        currentEnv: getCurrentProfile().name,
      }
    },
  }),
]
