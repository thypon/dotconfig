import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";

function getCacheDir(): string {
  const dir = join(homedir(), ".pi", "agent", "policy-cache");
  return dir;
}

export function hashString(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}

export function projectCacheDir(cwd: string): string {
  return join(getCacheDir(), hashString(cwd));
}

export function policyContentHash(globalSrc: string | null, projectSrc: string | null, metaPolicy: Record<string, any> | null): string {
  const parts = [
    globalSrc ?? "",
    projectSrc ?? "",
    JSON.stringify(metaPolicy ?? {}),
  ];
  return createHash("sha256").update(parts.join("\x00")).digest("hex").slice(0, 16);
}

export function loadPolicyCache(projectDir: string, hash: string): SandboxRuntimeConfig | null {
  const path = join(projectDir, `${hash}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function savePolicyCache(projectDir: string, hash: string, config: SandboxRuntimeConfig): void {
  mkdirSync(projectDir, { recursive: true });
  const path = join(projectDir, `${hash}.json`);
  writeFileSync(path, JSON.stringify(config, null, 2), "utf8");
}
