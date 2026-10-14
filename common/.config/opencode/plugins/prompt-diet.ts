import { Plugin } from "@opencode/plugin"

const DIET: Record<string, string> = {
  shell: "Run shell command in a persistent shell session. Use workdir param instead of cd. Quote paths with spaces. Independent commands → parallel calls in one message; dependent → single call with &&. Output truncated past 2000 lines/50KB (written to file, use read/grep on it). Explain non-trivial commands. AVOID find/grep/cat/head/tail/sed/awk/echo — use dedicated tools (glob, grep, read, edit, write). Verify parent dirs exist before mkdir; verify file exists before edits. Optional timeout (ms, default 120000).",
  read: "Read a file (text/image/PDF) or directory. Lines prefixed 'N: '. Default: 2000 lines from start; offset/limit for later slices. Lines >2000 chars truncated. Prefer read over cat/head/tail.",
  edit: "Exact string replacement in a file. MUST Read the file first (tool errors otherwise). oldString must match file content exactly (after the 'N: ' prefix) and be unique — add surrounding lines if ambiguous, or set replaceAll. Prefer editing existing files over creating new ones.",
  write: "Write a file, overwriting if it exists. MUST Read an existing file before overwriting. NEVER create docs (*.md) proactively; only if explicitly requested. No emojis unless asked.",
  glob: "Fast filename pattern search (e.g. '**/*.ts'). Returns matching paths. Use for open-ended multi-round searches.",
  grep: "Regex content search across files. Filter by include pattern (e.g. '*.ts'). Prefer over shell grep. For counting matches use shell with rg.",
  subagent: "Launch a subagent for complex multi-step work. Requires agent (explore=fast codebase search, general=multi-step research/exec, scout=manual only). Parallelize independent tasks in one message. Prompt must be self-contained and state research-vs-code + verification. Returns one final message; sessionID resumes a session. Don't use for simple file finds — use glob/grep/read directly.",
  question: "Ask the user clarifying questions / offer choices. Custom free-text option is added automatically — don't add 'Other'. Put recommended option first, label it ' (Recommended)'. Set multiple=true for multi-select.",
  webfetch: "Fetch a URL, return content as markdown (default), text, or html. HTTP auto-upgraded to HTTPS. URL must be fully-formed. If a more targeted tool exists, prefer it. Large content may be summarized.",
  skill: "Load a specialized skill by name when the current task matches it. Injects the skill's instructions and resources into the conversation.",
  compress: "Context management: replace closed conversation ranges with dense technical summaries. Never compress active work, unresolved errors, or exact content needed next. Compression urge on an unresolved loop → fresh websearch grounding before compress.",
}

export default Plugin.define({
  id: "prompt-diet",
  async setup(ctx) {
    await ctx.tool.transform((editor) => {
      for (const [id, diet] of Object.entries(DIET)) {
        if (editor.get(id)) {
          editor.update(id, (t) => {
            t.description = diet
          })
        }
      }
    })
    const ids = (await ctx.tool.list()).map((t) => t.id).sort().join(",")
    console.error(`[prompt-diet] dieted: ${Object.keys(DIET).join(",")} | registry: ${ids}`)
  },
})