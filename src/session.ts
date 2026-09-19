/**
 * Multi-profile BWAdtClient management.
 *
 * Profiles are declared via env:
 *   BW_PROFILES=test,prod
 *   BW_DEFAULT=test
 *   BW_TEST_BASE_URL=...  BW_TEST_USERNAME=...  BW_TEST_PASSWORD=...
 *   BW_TEST_CLIENT=100    BW_TEST_LANGUAGE=ZH   BW_TEST_READONLY=false
 *   BW_PROD_...           BW_PROD_READONLY=true
 *
 * Legacy single-env (BW_BASE_URL / BW_USERNAME / BW_PASSWORD) is treated as a
 * profile named "default", with optional BW_READONLY.
 *
 * Credentials stay here and are never surfaced to the LLM.
 */
import { BWAdtClient, createSSLConfig } from "bw-adt-api"

/** Public profile info (no password). */
export interface ProfileInfo {
  name: string
  baseUrl: string
  username: string
  client: string
  language: string
  readOnly: boolean
}

interface ProfileConfig extends ProfileInfo {
  password: string
  allowUnauthorized: boolean
}

/** @deprecated Use ProfileInfo — kept for callers that imported ConnectionInfo. */
export type ConnectionInfo = ProfileInfo

const clients = new Map<string, BWAdtClient>()
let profiles: Map<string, ProfileConfig> | undefined
let currentName: string | undefined

function truthy(v: string | undefined): boolean {
  if (!v) return false
  const s = v.trim().toLowerCase()
  return s === "true" || s === "1" || s === "yes"
}

function profileEnv(name: string, suffix: string): string | undefined {
  return process.env[`BW_${name.toUpperCase()}_${suffix}`]
}

function requireProfileField(
  name: string,
  suffix: string,
  value: string | undefined
): string {
  if (!value) {
    throw new Error(
      `Missing BW_${name.toUpperCase()}_${suffix} for profile "${name}".`
    )
  }
  return value
}

function loadLegacyProfile(): Map<string, ProfileConfig> {
  const baseUrl = process.env.BW_BASE_URL
  const username = process.env.BW_USERNAME
  const password = process.env.BW_PASSWORD
  if (!baseUrl || !username || !password) {
    throw new Error(
      "Missing BW connection environment variables. Either set BW_PROFILES " +
        "with per-profile BW_<NAME>_BASE_URL/USERNAME/PASSWORD, or the legacy " +
        "BW_BASE_URL, BW_USERNAME, BW_PASSWORD."
    )
  }
  const map = new Map<string, ProfileConfig>()
  map.set("default", {
    name: "default",
    baseUrl,
    username,
    password,
    client: process.env.BW_CLIENT || "",
    language: process.env.BW_LANGUAGE || "",
    readOnly: truthy(process.env.BW_READONLY),
    allowUnauthorized: truthy(process.env.BW_ALLOW_UNAUTHORIZED),
  })
  return map
}

function loadNamedProfiles(names: string[]): Map<string, ProfileConfig> {
  const map = new Map<string, ProfileConfig>()
  for (const name of names) {
    const baseUrl = requireProfileField(
      name,
      "BASE_URL",
      profileEnv(name, "BASE_URL")
    )
    const username = requireProfileField(
      name,
      "USERNAME",
      profileEnv(name, "USERNAME")
    )
    const password = requireProfileField(
      name,
      "PASSWORD",
      profileEnv(name, "PASSWORD")
    )
    map.set(name, {
      name,
      baseUrl,
      username,
      password,
      client: profileEnv(name, "CLIENT") || "",
      language: profileEnv(name, "LANGUAGE") || "",
      readOnly: truthy(profileEnv(name, "READONLY")),
      allowUnauthorized: truthy(profileEnv(name, "ALLOW_UNAUTHORIZED")),
    })
  }
  return map
}

function ensureProfiles(): Map<string, ProfileConfig> {
  if (profiles) return profiles

  const raw = process.env.BW_PROFILES?.trim()
  if (raw) {
    const names = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    if (names.length === 0) {
      throw new Error("BW_PROFILES is set but empty. Use e.g. BW_PROFILES=test,prod")
    }
    const dup = names.find((n, i) => names.indexOf(n) !== i)
    if (dup) {
      throw new Error(`Duplicate profile name in BW_PROFILES: "${dup}"`)
    }
    profiles = loadNamedProfiles(names)
  } else {
    profiles = loadLegacyProfile()
  }

  const preferred =
    process.env.BW_DEFAULT?.trim() ||
    process.env.BW_DEFAULT_PROFILE?.trim() ||
    ""
  if (preferred) {
    if (!profiles.has(preferred)) {
      throw new Error(
        `BW_DEFAULT="${preferred}" is not in configured profiles: ${[
          ...profiles.keys(),
        ].join(", ")}`
      )
    }
    currentName = preferred
  } else {
    currentName = profiles.keys().next().value as string
  }

  return profiles
}

function toPublic(p: ProfileConfig): ProfileInfo {
  return {
    name: p.name,
    baseUrl: p.baseUrl,
    username: p.username,
    client: p.client,
    language: p.language,
    readOnly: p.readOnly,
  }
}

function buildClient(cfg: ProfileConfig): BWAdtClient {
  const options = cfg.allowUnauthorized ? createSSLConfig(true) : {}
  return new BWAdtClient(
    cfg.baseUrl,
    cfg.username,
    cfg.password,
    cfg.client,
    cfg.language,
    options
  )
}

/** All configured profiles (no passwords). Loads config if needed. */
export function listProfiles(): ProfileInfo[] {
  return [...ensureProfiles().values()].map(toPublic)
}

/** Current active profile (no password). */
export function getCurrentProfile(): ProfileInfo {
  const map = ensureProfiles()
  const name = currentName!
  const cfg = map.get(name)
  if (!cfg) throw new Error(`Current profile "${name}" is missing`)
  return toPublic(cfg)
}

/** Switch the active profile. Does not log in until the next tool that needs a client. */
export function switchProfile(name: string): ProfileInfo {
  const map = ensureProfiles()
  const cfg = map.get(name)
  if (!cfg) {
    throw new Error(
      `Unknown environment "${name}". Configured: ${[...map.keys()].join(", ")}`
    )
  }
  const prevName = currentName
  const prevReadOnly = prevName ? map.get(prevName)?.readOnly : undefined
  currentName = name
  // 释放上一个 profile 的服务端会话（best-effort logout），避免频繁切换在 BW 侧
  // 积累挂起的 stateful 会话（服务端有会话数上限）。切回时 getClient 重建客户端，
  // 首个请求自动重新登录。
  if (prevName && prevName !== name) {
    const prevClient = clients.get(prevName)
    if (prevClient) {
      clients.delete(prevName)
      void prevClient.logout().catch(() => {})
    }
  }
  // Mutating-tool visibility changes with readOnly — notify MCP clients.
  if (prevReadOnly !== cfg.readOnly) {
    void notifyToolListChanged()
  }
  return toPublic(cfg)
}

/** Whether the current profile forbids mutating tools. Safe if env not ready. */
export function isCurrentReadOnly(): boolean {
  try {
    return getCurrentProfile().readOnly
  } catch {
    return false
  }
}

type ToolListChangedHandler = () => void | Promise<void>
let toolListChangedHandler: ToolListChangedHandler | undefined

/** Wired by createServer to emit notifications/tools/list_changed. */
export function setToolListChangedHandler(
  handler: ToolListChangedHandler | undefined
): void {
  toolListChangedHandler = handler
}

async function notifyToolListChanged(): Promise<void> {
  try {
    await toolListChangedHandler?.()
  } catch {
    /* client may not support / transport may be down — call-time guard remains */
  }
}

/**
 * Throw if the current profile is read-only. Used by the server before
 * running mutating tools.
 */
export function assertWritable(toolName: string): void {
  const p = getCurrentProfile()
  if (!p.readOnly) return
  throw new Error(
    `Environment "${p.name}" is read-only; refusing mutating tool "${toolName}". ` +
      `Use bw_env_switch to a writable environment (e.g. test).`
  )
}

/** Get the client for the current profile, building it on first use. */
export function getClient(): BWAdtClient {
  const map = ensureProfiles()
  const name = currentName!
  const cfg = map.get(name)
  if (!cfg) throw new Error(`Current profile "${name}" is missing`)

  let client = clients.get(name)
  if (!client) {
    client = buildClient(cfg)
    clients.set(name, client)
  }
  return client
}

/** Whether a live client instance exists for the current profile. */
export function hasActiveClient(): boolean {
  return currentName !== undefined && clients.has(currentName)
}

/** Drop the current profile's client so the next call rebuilds it. */
export function resetClient(): void {
  if (currentName) clients.delete(currentName)
}

/**
 * Best-effort connection info for status (no password). Never creates a client.
 * Returns undefined only when required env vars are missing.
 */
export function getConnectionInfo(): ProfileInfo | undefined {
  try {
    return getCurrentProfile()
  } catch {
    return undefined
  }
}

/** @deprecated alias — prefer getConnectionInfo / getCurrentProfile. */
export function readEnvConnectionInfo(): ProfileInfo | undefined {
  return getConnectionInfo()
}
