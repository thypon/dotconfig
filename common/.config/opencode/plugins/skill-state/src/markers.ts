export type Marker = "activate" | "stop"

export const ACTIVATE_PATTERN = /\[skillstate\]/i
export const STOP_PATTERN = /\[skillstate[ _:-]stop\]/i

export function scanMarker(text: string): Marker | null {
  if (STOP_PATTERN.test(text)) return "stop"
  if (ACTIVATE_PATTERN.test(text)) return "activate"
  return null
}
