export type Sigma = Record<string, unknown>

export interface SkillState {
  version: number
  sessionID: string
  active: boolean
  sigma: Sigma
  pMessageID?: string
  agent?: string
  stopped?: boolean
  nudges?: number
  lastPatchesAtNudge?: number
  stalled?: number
  loopCount?: number
  cleanStreak?: number
  iterations: number
  patches: number
  errors: number
  tokensOriginal: number
  tokensSent: number
  createdAt: string
  updatedAt: string
  schema?: unknown
}

export function newState(sessionID: string, now = new Date().toISOString()): SkillState {
  return {
    version: 1,
    sessionID,
    active: true,
    sigma: {},
    iterations: 0,
    patches: 0,
    errors: 0,
    tokensOriginal: 0,
    tokensSent: 0,
    createdAt: now,
    updatedAt: now,
  }
}

export function estimateTokens(text: string | undefined): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

export type PartLike = { type: string; [k: string]: unknown }
export type WithParts = { info: { id: string; sessionID: string; role: string; [k: string]: unknown }; parts: PartLike[] }

function partTokens(part: PartLike): number {
  if (part.type === "text" || part.type === "reasoning") return estimateTokens(part.text as string | undefined)
  if (part.type === "tool") {
    const state = part.state as { output?: string; error?: string } | undefined
    return estimateTokens(state?.output) + estimateTokens(state?.error) + 12
  }
  return 4
}

export function messageTokens(message: WithParts): number {
  return Math.max(1, message.parts.reduce((sum, p) => sum + partTokens(p), 0) + 8)
}

export function historyTokens(messages: WithParts[]): number {
  return messages.reduce((sum, m) => sum + messageTokens(m), 0)
}
