import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";

export const DEFAULT_POLICY_MD_PATH = join(homedir(), ".pi", "agent", "POLICY.md");

export const DEFAULT_CONFIG: SandboxRuntimeConfig = {
  network: {
    allowedDomains: [
      "npmjs.org",
      "*.npmjs.org",
      "registry.npmjs.org",
      "registry.yarnpkg.com",
      "pypi.org",
      "*.pypi.org",
      "github.com",
      "*.github.com",
      "api.github.com",
      "raw.githubusercontent.com",
    ],
    deniedDomains: [],
  },
  filesystem: {
    denyRead: ["~/.ssh", "~/.aws", "~/.gnupg"],
    allowWrite: [".", "/tmp", "/private/tmp"],
    denyWrite: [".env", ".env.*", "*.pem", "*.key"],
  },
};

const DEFAULT_POLICY_TEMPLATE = `---
version: 1
allow:
  - network:npmjs.org
  - network:*.npmjs.org
  - network:registry.npmjs.org
  - network:registry.yarnpkg.com
  - network:pypi.org
  - network:*.pypi.org
  - network:github.com
  - network:*.github.com
  - network:api.github.com
  - network:raw.githubusercontent.com
  - fs:write:.
  - fs:write:/tmp
  - fs:write:/private/tmp
  - fs:read:.
deny:
  - fs:read:~/.ssh
  - fs:read:~/.aws
  - fs:read:~/.gnupg
  - fs:write:.env
  - fs:write:.env.*
  - fs:write:*.pem
  - fs:write:*.key
  - fs:write:POLICY.md
  - fs:write:policy.gen.json
---

# Default Permissions Policy

This policy is auto-generated. Edit to customize.

## Network
- Allowed: npmjs, pypi, github
- All other network access blocked

## Filesystem
- Write: current directory and /tmp only
- Read: sensitive paths (~/.ssh, ~/.aws, ~/.gnupg) denied
- Write: env files, PEM keys, lock files denied
- POLICY.md and generated policy files are always write-protected
`;

export function ensureDefaultPolicy(): void {
  if (!existsSync(DEFAULT_POLICY_MD_PATH)) {
    writeFileSync(DEFAULT_POLICY_MD_PATH, DEFAULT_POLICY_TEMPLATE, "utf8");
  }
}