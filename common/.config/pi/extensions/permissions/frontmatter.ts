export function parseYamlFrontmatter(text: string): Record<string, any> {
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

    if (indent >= currentIndent && currentKey) {
      const listMatch = line.match(/^\s*-\s+(.*)/)
      if (listMatch) {
        if (typeof result[currentKey] === "object" && !Array.isArray(result[currentKey])) {
          result[currentKey] = []
        }
        if (!Array.isArray(result[currentKey])) {
          result[currentKey] = []
        }
        result[currentKey].push(listMatch[1].trim())
        continue
      }
    }
  }

  if (result.description && typeof result.description === "string") {
    result.description = result.description.replace(/^"(.*)"$/, "$1")
  }

  return result
}
