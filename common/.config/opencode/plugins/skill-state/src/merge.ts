import { type Sigma, estimateTokens } from "./state"

export type MergeResult = { ok: true; sigma: Sigma } | { ok: false; error: string }

export const MAX_STATE_TOKENS = 16000

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"])

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

function hasForbiddenKeys(obj: unknown): boolean {
  if (!isPlainObject(obj)) return false
  for (const [k, v] of Object.entries(obj)) {
    if (FORBIDDEN_KEYS.has(k)) return true
    if (hasForbiddenKeys(v)) return true
  }
  return false
}

function deepMerge(base: Sigma, patch: Sigma): Sigma {
  const out: Sigma = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete out[key]
    } else if (isPlainObject(value)) {
      const current = out[key]
      out[key] = deepMerge(isPlainObject(current) ? current : {}, value)
    } else {
      out[key] = value
    }
  }
  return out
}

export function merge(sigma: Sigma, patch: unknown): MergeResult {
  if (!isPlainObject(patch)) return { ok: false, error: "patch must be a JSON object (dict)" }
  if (hasForbiddenKeys(patch)) return { ok: false, error: "patch contains forbidden keys (__proto__/constructor/prototype)" }

  let next: Sigma
  try {
    next = deepMerge(sigma, patch)
    next = JSON.parse(JSON.stringify(next)) as Sigma
  } catch (e) {
    return { ok: false, error: `patch is not JSON-serializable: ${e instanceof Error ? e.message : String(e)}` }
  }

  const tokens = estimateTokens(JSON.stringify(next))
  if (tokens > MAX_STATE_TOKENS) {
    return { ok: false, error: `resulting state too large (${tokens} tokens > ${MAX_STATE_TOKENS}); delete stale keys with null` }
  }
  return { ok: true, sigma: next }
}
