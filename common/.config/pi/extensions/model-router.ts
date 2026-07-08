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

export default async function modelRouterExtension(pi: any) {
  console.error("[model-router] loaded")

  pi.on("input", async (event: any) => {
    const match = event.text?.match(/\/skill:(\S+)/)
    if (!match) return { action: "continue" }

    const skillName = match[1].replace(/[^\w-]/g, "")
    if (!skillName) return { action: "continue" }

    const skillFile = join(SHARED_SKILLS, skillName, "SKILL.md")
    if (!(await fileExists(skillFile))) return { action: "continue" }

    const frontmatter = parseYamlFrontmatter(readFileSync(skillFile, "utf8"))
    const modelToken = frontmatter?.metadata?.model
    if (modelToken && typeof modelToken === "string" && modelToken.startsWith("dynamic/")) {
      const resolved = await resolveDynamicModel(modelToken)
      if (resolved) {
        console.error(`[model-router] /skill:${skillName} → model: ${resolved}`)
        pi.setModel(resolved)
      }
    }

    return { action: "continue" }
  })

  pi.on("tool_call", async (event: any) => {
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
      const resolved = await resolveDynamicModel(modelToken)
      if (resolved) {
        console.error(`[model-router] SKILL.md read → model: ${resolved}`)
        pi.setModel(resolved)
      }
    }
  })
}
