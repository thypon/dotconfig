import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { parseYamlFrontmatter } from "./permissions/frontmatter"

const SHARED_SKILLS = join(homedir(), ".config", "skills")
const SHARED_PROMPTS = join(homedir(), ".config", "pi", "prompts")
const SETTINGS_PATH = join(homedir(), ".pi", "agent", "settings.json")
const MODELS_PATH = join(homedir(), ".config", "dynamic-models.jsonc")

// DS4 local server (OpenAI-compatible DeepSeek V4 Flash)
const DS4_URL = "http://localhost:8000/v1/models"
const DS4_MODEL_FLASH = "ds4/deepseek-v4-flash"

export interface ResolveOpts {
  settingsPath?: string
  modelsPath?: string
  probeDs4?: () => Promise<boolean>
}

function stripJsoncComments(text: string): string {
  return text.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
}

function loadJsonc(path: string): any {
  return JSON.parse(stripJsoncComments(readFileSync(path, "utf8")))
}


async function fileExists(path: string): Promise<boolean> {
  try {
    readFileSync(path)
    return true
  } catch {
    return false
  }
}

async function ds4Available(): Promise<boolean> {
  try {
    const res = await fetch(DS4_URL, { signal: AbortSignal.timeout(1000) })
    return res.ok
  } catch {
    return false
  }
}

export async function resolveDynamicModel(
  token: string,
  opts: ResolveOpts = {}
): Promise<string | null> {
  const parts = token.split("/")
  if (parts[0] !== "dynamic") return null
  const key = parts[1] // model | small_model | frontier_model | antagonist_model

  try {
    const settings = JSON.parse(readFileSync(opts.settingsPath ?? SETTINGS_PATH, "utf8"))
    const provider = settings.defaultProvider
    const models = loadJsonc(opts.modelsPath ?? MODELS_PATH)
    const modelValue = models?.providers?.[provider]?.[key]
    if (!modelValue) return null

    if (key === "small_model" && modelValue.includes("deepseek-v4-flash")) {
      const probe = opts.probeDs4 ?? ds4Available
      if (await probe()) return DS4_MODEL_FLASH
    }

    return modelValue
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

// Pre-scan prompts directory to build a name→modelToken map
function buildPromptModelMap(): Map<string, string> {
  const map = new Map<string, string>()
  try {
    const entries = readdirSync(SHARED_PROMPTS)
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue
      const name = entry.replace(/\.md$/, "")
      const content = readFileSync(join(SHARED_PROMPTS, entry), "utf8")
      const fm = parseYamlFrontmatter(content)
      const modelToken = fm?.metadata?.model
      if (modelToken && typeof modelToken === "string" && modelToken.startsWith("dynamic/")) {
        map.set(name, modelToken)
      }
    }
  } catch { /* prompts dir might not exist */ }
  return map
}

export default async function modelRouterExtension(pi: any) {
  console.error("[model-router] loaded")

  // Pre-build the prompt model map
  const promptModelMap = buildPromptModelMap()
  if (promptModelMap.size > 0) {
    const names = [...promptModelMap.keys()].join(", ")
    console.error(`[model-router] prompts with dynamic models: ${names}`)
  }

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
    // Check for /skill:name syntax (skill invocation)
    const skillMatch = event.text?.match(/\/skill:(\S+)/)
    if (skillMatch) {
      const skillName = skillMatch[1].replace(/[^\w-]/g, "")
      if (!skillName) return { action: "continue" }

      const skillFile = join(SHARED_SKILLS, skillName, "SKILL.md")
      if (!(await fileExists(skillFile))) return { action: "continue" }

      const frontmatter = parseYamlFrontmatter(readFileSync(skillFile, "utf8"))
      const modelToken = frontmatter?.metadata?.model
      if (modelToken && typeof modelToken === "string" && modelToken.startsWith("dynamic/")) {
        await resolveAndStorePending(modelToken, ctx, `/skill:${skillName}`)
      }

      return { action: "continue" }
    }

    // Check for prompt slash commands: /commit, /review, /dashboard, etc.
    const promptMatch = event.text?.match(/^\/(\w[\w-]*)/)
    if (promptMatch) {
      const promptName = promptMatch[1]
      const modelToken = promptModelMap.get(promptName)
      if (modelToken) {
        await resolveAndStorePending(modelToken, ctx, `/${promptName}`)
      }
    }

    return { action: "continue" }
  })

  pi.on("tool_call", async (event: any, ctx: any) => {
    if (event.toolName !== "read") return

    const path = event.input?.path || event.input?.filePath
    if (!path) return

    // Check if reading a SKILL.md or a prompts/*.md
    const isSkillFile = path.endsWith("SKILL.md")
    const isPromptFile = path.startsWith(SHARED_PROMPTS) && path.endsWith(".md")
    if (!isSkillFile && !isPromptFile) return

    let content: string
    try {
      content = readFileSync(path, "utf8")
    } catch {
      return
    }

    const frontmatter = parseYamlFrontmatter(content)
    const modelToken = frontmatter?.metadata?.model
    if (modelToken && typeof modelToken === "string" && modelToken.startsWith("dynamic/")) {
      const label = isSkillFile ? "SKILL.md read" : `prompt: ${path.split("/").pop()?.replace(".md", "")}`
      await resolveAndStorePending(modelToken, ctx, label)
    }
  })
}
