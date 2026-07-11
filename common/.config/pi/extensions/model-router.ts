import { readFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

const SHARED_SKILLS = join(homedir(), ".config", "skills")
const SETTINGS_PATH = join(homedir(), ".pi", "agent", "settings.json")
const MODELS_PATH = join(homedir(), ".config", "dynamic-models.jsonc")

function stripJsoncComments(text: string): string {
  return text.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
}

function loadJsonc(path: string): any {
  return JSON.parse(stripJsoncComments(readFileSync(path, "utf8")))
}

function parseYamlFrontmatter(text: string): Record<string, any> {
  const m = text.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return {}
  const frontmatter = m[1]
  const result: Record<string, any> = {}
  const lines = frontmatter.split("\n")
  let currentKey = ""
  let currentIsMultiline = false
  let currentIndent = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === "") continue

    if (!currentIsMultiline) {
      const keyMatch = line.match(/^(\w[\w-]*):\s*(.*)/)
      if (keyMatch) {
        currentKey = keyMatch[1]
        const value = keyMatch[2]
        if (value === ">" || value === "|") {
          currentIsMultiline = true
          currentIndent = line.search(/\S/) + 2
          result[currentKey] = ""
        } else if (value === "") {
          currentIndent = line.search(/\S/) + 2
          result[currentKey] = {}
        } else {
          const unquoted = value.replace(/^"(.*)"$/, "$1")
          result[currentKey] = unquoted
        }
        continue
      }
    }

    if (currentIsMultiline) {
      // Exit multiline if this line is a new root-level key
      const keyMatch = line.match(/^(\w[\w-]*):\s*(.*)/)
      if (keyMatch && line.search(/\S/) <= currentIndent - 2) {
        currentIsMultiline = false
        currentKey = keyMatch[1]
        const value = keyMatch[2]
        if (value === ">" || value === "|") {
          currentIsMultiline = true
          currentIndent = line.search(/\S/) + 2
          result[currentKey] = ""
        } else if (value === "") {
          currentIndent = line.search(/\S/) + 2
          result[currentKey] = {}
        } else {
          result[currentKey] = value.replace(/^"(.*)"$/, "$1")
        }
        continue
      }
      const content = trimmed
      result[currentKey] = result[currentKey] ? `${result[currentKey]} ${content}` : content
      continue
    }

    const indent = line.search(/\S/)
    if (indent >= currentIndent && currentKey === "metadata") {
      const metaMatch = line.match(/^\s*(\w[\w-]*):\s*(.*)/)
      if (metaMatch) {
        if (!result.metadata) result.metadata = {}
        const metaVal = metaMatch[2]
        result.metadata[metaMatch[1]] = metaVal.replace(/^"(.*)"$/, "$1")
      }
    }
  }

  if (result.description && typeof result.description === "string") {
    result.description = result.description.replace(/^"(.*)"$/, "$1")
  }

  return result
}

async function fileExists(path: string): Promise<boolean> {
  try {
    readFileSync(path)
    return true
  } catch {
    return false
  }
}

async function resolveDynamicModel(token: string): Promise<string | null> {
  const parts = token.split("/")
  if (parts[0] !== "dynamic") return null
  const key = parts[1] // model | small_model | frontier_model | antagonist_model

  try {
    const settings = JSON.parse(readFileSync(SETTINGS_PATH, "utf8"))
    const provider = settings.defaultProvider
    const models = loadJsonc(MODELS_PATH)
    const modelValue = models?.providers?.[provider]?.[key]
    if (modelValue) return modelValue
  } catch { /* fall through */ }

  return null
}

let pendingModelId: string | null = null

async function resolveAndStorePending(
  token: string,
  ctx: any,
  label: string
): Promise<void> {
  const resolved = await resolveDynamicModel(token)
  if (!resolved) return

  const slashIdx = resolved.indexOf("/")
  if (slashIdx < 0) {
    console.error(`[model-router] ${label}: invalid model string "${resolved}"`)
    return
  }
  const provider = resolved.slice(0, slashIdx)
  const modelId = resolved.slice(slashIdx + 1)

  const modelObj = ctx.modelRegistry?.find?.(provider, modelId)
  if (!modelObj) {
    console.error(
      `[model-router] ${label}: model "${resolved}" not found in registry, using default`
    )
    return
  }

  pendingModelId = modelObj.id
  console.error(
    `[model-router] ${label} → model: ${resolved}`
  )
}

export default async function modelRouterExtension(pi: any) {
  console.error("[model-router] loaded")

  pi.on("before_provider_request", async (event: any, _ctx: any) => {
    if (pendingModelId == null) return

    console.error(`[model-router] override model → ${pendingModelId}`)
    const overridden = typeof event.payload === "object" && event.payload !== null
      ? { ...event.payload, model: pendingModelId }
      : event.payload
    pendingModelId = null
    return overridden
  })

  pi.on("input", async (event: any, ctx: any) => {
    const match = event.text?.match(/\/skill:(\S+)/)
    if (!match) return { action: "continue" }

    const skillName = match[1].replace(/[^\w-]/g, "")
    if (!skillName) return { action: "continue" }

    const skillFile = join(SHARED_SKILLS, skillName, "SKILL.md")
    if (!(await fileExists(skillFile))) return { action: "continue" }

    const frontmatter = parseYamlFrontmatter(readFileSync(skillFile, "utf8"))
    const modelToken = frontmatter?.metadata?.model
    if (modelToken && typeof modelToken === "string" && modelToken.startsWith("dynamic/")) {
      await resolveAndStorePending(modelToken, ctx, `/skill:${skillName}`)
    }

    return { action: "continue" }
  })

  pi.on("tool_call", async (event: any, ctx: any) => {
    if (event.toolName !== "read") return

    const path = event.input?.path || event.input?.filePath
    if (!path || !path.endsWith("SKILL.md")) return

    let content: string
    try {
      content = readFileSync(path, "utf8")
    } catch {
      return
    }

    const frontmatter = parseYamlFrontmatter(content)
    const modelToken = frontmatter?.metadata?.model
    if (modelToken && typeof modelToken === "string" && modelToken.startsWith("dynamic/")) {
      await resolveAndStorePending(modelToken, ctx, "SKILL.md read")
    }
  })
}
