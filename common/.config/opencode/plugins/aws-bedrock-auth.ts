import type { Plugin } from "@opencode-ai/plugin"
import { readFileSync } from "fs"
import { join } from "path"
import { homedir } from "os"
import { spawnSync } from "child_process"

const SSO_PROFILE = "claude-code-bedrock-sso"

function readConfig(): string | null {
  try {
    const path = join(homedir(), ".config", "opencode", "opencode.json")
    const raw = readFileSync(path, "utf8")
    const m = raw.match(/"model"\s*:\s*"(amazon-bedrock\/[^"]+)"/)
    return m ? m[1] : null
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

export default (async () => {
  const model = readConfig()
  if (!model) return {}

  const active = awsSessionActive()
  if (active) {
    console.error("[aws-bedrock-auth] AWS session active, model:", model)
    return {}
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
      return {}
    }
  } catch {
    console.error("[aws-bedrock-auth] SSO login error, skipped")
    return {}
  }

  if (!awsSessionActive()) {
    console.error("[aws-bedrock-auth] Post-login verify failed, proceeding anyway")
    return {}
  }

  console.error("[aws-bedrock-auth] AWS SSO login complete")
  return {}
}) satisfies Plugin