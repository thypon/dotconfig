import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { newState, type SkillState } from "./state"

export class Registry {
  private cache = new Map<string, SkillState>()

  constructor(readonly stateDir: string) {}

  pathFor(sessionID: string): string {
    return join(this.stateDir, `${sessionID}.json`)
  }

  async activate(sessionID: string, pMessageID?: string): Promise<SkillState> {
    const existing = await this.get(sessionID)
    if (existing) {
      existing.active = true
      existing.updatedAt = new Date().toISOString()
      if (pMessageID && !existing.pMessageID) existing.pMessageID = pMessageID
      await this.save(existing)
      return existing
    }
    const st = newState(sessionID)
    if (pMessageID) st.pMessageID = pMessageID
    this.cache.set(sessionID, st)
    await this.save(st)
    return st
  }

  async deactivate(sessionID: string): Promise<SkillState | undefined> {
    const st = await this.get(sessionID)
    if (!st) return undefined
    st.active = false
    st.updatedAt = new Date().toISOString()
    await this.save(st)
    return st
  }

  async get(sessionID: string): Promise<SkillState | undefined> {
    const cached = this.cache.get(sessionID)
    if (cached) return cached
    try {
      const raw = await readFile(this.pathFor(sessionID), "utf8")
      const st = JSON.parse(raw) as SkillState
      if (st && st.version === 1 && st.sessionID === sessionID) {
        this.cache.set(sessionID, st)
        return st
      }
    } catch {
      // missing or corrupt file -> no state
    }
    return undefined
  }

  async save(st: SkillState): Promise<void> {
    st.updatedAt = new Date().toISOString()
    await mkdir(this.stateDir, { recursive: true })
    const target = this.pathFor(st.sessionID)
    const tmp = `${target}.tmp`
    await writeFile(tmp, JSON.stringify(st, null, 2))
    await rename(tmp, target)
  }
}

export function defaultStateDir(): string {
  const dataHome = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share")
  return join(dataHome, "opencode", "skill-state")
}
