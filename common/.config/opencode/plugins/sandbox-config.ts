import type { Plugin } from "@opencode-ai/plugin"
import { readFileSync, existsSync } from "fs"
import { join, dirname } from "path"
import { homedir } from "os"

// Reads sandbox config from agent options (agent.*.options.sandbox) in
// opencode.json files and exports it as OPENCODE_SANDBOX_CONFIG so the
// opencode-sandbox plugin picks it up. Must load BEFORE opencode-sandbox.

function stripJsonc(src: string): string {
  let out = ""
  let inString = false
  let escaped = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    const next = src[i + 1]
    if (inString) {
      out += c
      if (escaped) escaped = false
      else if (c === "\\") escaped = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') {
      inString = true
      out += c
      continue
    }
    if (c === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i++
      out += "\n"
      continue
    }
    if (c === "/" && next === "*") {
      i += 2
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++
      i++
      continue
    }
    out += c
  }
  // trailing commas
  return out.replace(/,(\s*[}\]])/g, "$1")
}

function parseJsoncFile(path: string): Record<string, any> | null {
  try {
    if (!existsSync(path)) return null
    return JSON.parse(stripJsonc(readFileSync(path, "utf8")))
  } catch {
    return null
  }
}

function isPlainObject(v: unknown): v is Record<string, any> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function deepMerge(a: Record<string, any>, b: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { ...a }
  for (const k of Object.keys(b)) {
    if (isPlainObject(out[k]) && isPlainObject(b[k])) out[k] = deepMerge(out[k], b[k])
    else out[k] = b[k]
  }
  return out
}

function globalConfigPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME || join(homedir(), ".config")
  return join(xdg, "opencode", "opencode.json")
}

function projectConfigPaths(start: string): string[] {
  const found: string[] = []
  let dir = start
  for (;;) {
    for (const name of ["opencode.json", "opencode.jsonc", join(".opencode", "opencode.json")]) {
      const p = join(dir, name)
      if (existsSync(p)) found.push(p)
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  // nearest project config should win; reverse so merge order is root -> leaf
  return found.reverse()
}

function collectSandbox(cfg: Record<string, any> | null): Record<string, any> {
  if (!cfg) return {}
  let merged: Record<string, any> = {}
  const agents = cfg.agent
  if (isPlainObject(agents)) {
    for (const name of Object.keys(agents)) {
      const s = agents[name]?.options?.sandbox
      if (isPlainObject(s)) merged = deepMerge(merged, s)
    }
  }
  return merged
}

const SandboxConfig: Plugin = async ({ directory }) => {
  try {
    let sandbox: Record<string, any> = {}
    sandbox = deepMerge(sandbox, collectSandbox(parseJsoncFile(globalConfigPath())))
    for (const p of projectConfigPaths(directory)) {
      sandbox = deepMerge(sandbox, collectSandbox(parseJsoncFile(p)))
    }
    if (Object.keys(sandbox).length > 0) {
      process.env.OPENCODE_SANDBOX_CONFIG = JSON.stringify(sandbox)
      console.log("[sandbox-config] exported OPENCODE_SANDBOX_CONFIG from agent options")
    }
  } catch (err) {
    console.warn("[sandbox-config] failed:", err instanceof Error ? err.message : err)
  }
  return {
    // Strip agent.*.options.sandbox from the live config so it is not
    // forwarded to providers as request params (strict providers like
    // venice reject unknown params with 400 "Invalid request parameter").
    config: (cfg) => {
      const agents = (cfg as Record<string, any>).agent
      if (!isPlainObject(agents)) return
      for (const name of Object.keys(agents)) {
        const opts = agents[name]?.options
        if (!isPlainObject(opts) || !("sandbox" in opts)) continue
        delete opts.sandbox
        if (Object.keys(opts).length === 0) delete agents[name].options
      }
    },
  }
}

export default SandboxConfig
