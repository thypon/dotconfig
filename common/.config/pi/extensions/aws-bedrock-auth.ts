import { readFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { spawnSync } from "node:child_process"

const SSO_PROFILE = "claude-code-bedrock-sso"

function readConfig(): string | null {
  try {
    const path = join(homedir(), ".pi", "agent", "settings.json")
    const raw = readFileSync(path, "utf8")
    const config = JSON.parse(raw)
    const provider = config.defaultProvider
    if (provider !== "amazon-bedrock") return null
    return config.defaultModel
  } catch {
    return null
  }
}

function awsSessionActive(): boolean {
  const result = spawnSync("aws", ["sts", "get-caller-identity", "--profile", SSO_PROFILE], {
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10000,
  })
  return result.status === 0
}

export default async function bedrockAuthExtension(pi: any) {
  const model = readConfig()
  if (!model) return

  const active = awsSessionActive()
  if (active) {
    console.error("[aws-bedrock-auth] AWS session active, model:", model)
    return
  }

  console.error("[aws-bedrock-auth] AWS session expired, starting SSO login...")
  console.error("[aws-bedrock-auth] (press Ctrl+C to skip)")

  try {
    const login = spawnSync("aws", ["sso", "login", "--profile", SSO_PROFILE], {
      stdio: "inherit",
    })

    if (login.status !== 0) {
      if (login.signal) {
        console.error("[aws-bedrock-auth] SSO login interrupted, skipped")
      } else {
        console.error("[aws-bedrock-auth] SSO login failed (exit %d), skipped", login.status)
      }
      return
    }
  } catch {
    console.error("[aws-bedrock-auth] SSO login error, skipped")
    return
  }

  if (!awsSessionActive()) {
    console.error("[aws-bedrock-auth] Post-login verify failed, proceeding anyway")
    return
  }

  console.error("[aws-bedrock-auth] AWS SSO login complete")
}
