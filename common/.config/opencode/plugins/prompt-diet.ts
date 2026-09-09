import type { Plugin } from "@opencode-ai/plugin"

const DIET: Record<string, string> = {
  bash: "Run bash command in a persistent shell session. Use workdir param instead of cd. Quote paths with spaces. Independent commands → parallel calls in one message; dependent → single call with &&. Output truncated past 2000 lines/50KB (written to file, use Read/Grep on it). Explain non-trivial commands. AVOID find/grep/cat/head/tail/sed/awk/echo — use dedicated tools (Glob, Grep, Read, Edit, Write). Verify parent dirs exist before mkdir; verify file exists before edits. Optional timeout (ms, default 120000).",
  read: "Read a file (text/image/PDF) or directory. Lines prefixed 'N: '. Default: 2000 lines from start; offset/limit for later slices. Lines >2000 chars truncated. Prefer Read over cat/head/tail.",
  edit: "Exact string replacement in a file. MUST Read the file first (tool errors otherwise). oldString must match file content exactly (after the 'N: ' prefix) and be unique — add surrounding lines if ambiguous, or set replaceAll. Prefer editing existing files over creating new ones.",
  write: "Write a file, overwriting if it exists. MUST Read an existing file before overwriting. NEVER create docs (*.md) proactively; only if explicitly requested. No emojis unless asked.",
  glob: "Fast filename pattern search (e.g. '**/*.ts'). Returns matching paths. Use for open-ended multi-round searches.",
  grep: "Regex content search across files. Filter by include pattern (e.g. '*.ts'). Prefer over bash grep. For counting matches use Bash with rg.",
  task: "Launch a subagent for complex multi-step work. Requires subagent_type (explore=fast codebase search, general=multi-step research/exec, scout=manual only). Parallelize independent tasks in one message. Prompt must be self-contained and state research-vs-code + verification. Returns one final message; task_id resumes a session. Don't use for simple file finds — use Glob/Grep/Read directly.",
  todowrite: "Structured todo list. Use for 3+ step tasks or multi-part requests. Exactly ONE in_progress at a time. Mark completed only when verified (tests run, checks pass), never on intent. Update in real time, no batch updates. Skip for single trivial steps or informational asks.",
  question: "Ask the user clarifying questions / offer choices. Custom free-text option is added automatically — don't add 'Other'. Put recommended option first, label it ' (Recommended)'. Set multiple=true for multi-select.",
  webfetch: "Fetch a URL, return content as markdown (default), text, or html. HTTP auto-upgraded to HTTPS. URL must be fully-formed. If a more targeted tool exists, prefer it. Large content may be summarized.",
  skill: "Load a specialized skill by name when the current task matches it. Injects the skill's instructions and resources into the conversation.",
  compress: "Context management: replace closed conversation ranges with dense technical summaries. Never compress active work, unresolved errors, or exact content needed next. Compression urge on an unresolved loop → fresh brave_websearch grounding before compress.",
}

export const PromptDietPlugin: Plugin = async () => {
  return {
    "tool.definition": async (input, output) => {
      const diet = DIET[input.toolID]
      if (diet) output.description = diet
    },
  }
}
