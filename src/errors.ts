/**
 * Map bw-adt-api exceptions into MCP error content.
 *
 * AdtException is a discriminated union (AdtErrorException | AdtCsrfException |
 * AdtHttpException). We narrow with the exported predicates and surface a JSON
 * text block the LLM can act on. Login failures (401/CSRF) are called out so
 * the LLM knows credentials are the issue, not a transient bug.
 */
import {
  isAdtError,
  isAdtException,
  isHttpError,
  isLoginError,
  isTransportRequiredError,
} from "bw-adt-api"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"

function summarize(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

/** Convert any thrown value into an MCP error result. */
export function toMcpError(err: unknown): CallToolResult {
  if (isTransportRequiredError(err)) {
    return text(
      JSON.stringify(
        {
          code: err.code,
          message: err.message,
          objectUri: err.objectUri,
          transports: err.transports,
          hint:
            "Choose an existing TR via transport=<TRKORR>, or set createTransport=true to create a new one. " +
            "Optionally call bw_transport_check first to list available requests.",
        },
        null,
        2
      ),
      true
    )
  }
  // Try to extract the rich ADT payload first.
  if (isAdtException(err)) {
    if (isLoginError(err)) {
      return text(
        `Authentication failed (invalid credentials or session expired). ` +
          `Check BW_BASE_URL / BW_USERNAME / BW_PASSWORD. Detail: ${summarize(err)}`,
        true
      )
    }
    if (isAdtError(err)) {
      // AdtErrorException carries .err (HTTP status), .type, .message, .properties.
      const anyErr = err as unknown as {
        err?: number
        type?: string
        message?: string
        localizedMessage?: string
        properties?: Record<string, string>
      }
      const parts: string[] = []
      if (anyErr.err != null) parts.push(`HTTP ${anyErr.err}`)
      if (anyErr.type) parts.push(`type=${anyErr.type}`)
      parts.push(anyErr.localizedMessage || anyErr.message || summarize(err))
      const detail =
        parts.join(" — ") +
        (anyErr.properties && Object.keys(anyErr.properties).length
          ? `\nproperties: ${JSON.stringify(anyErr.properties)}`
          : "")
      return text(detail, true)
    }
    if (isHttpError(err)) {
      const anyErr = err as unknown as { code?: number; message?: string }
      return text(
        `HTTP error${anyErr.code ? ` ${anyErr.code}` : ""}: ${
          anyErr.message || summarize(err)
        }`,
        true
      )
    }
    // isAdtException but none of the specific types (e.g. AdtCsrfException).
    return text(`ADT error: ${summarize(err)}`, true)
  }

  // Non-ADT errors (file IO, validation, programming bugs).
  return text(summarize(err), true)
}

function text(text: string, isError: boolean): CallToolResult {
  return { content: [{ type: "text", text }], isError }
}
