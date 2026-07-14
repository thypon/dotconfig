import { spawn } from "node:child_process";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { SandboxManager, type SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  type BashOperations,
  createBashTool,
} from "@earendil-works/pi-coding-agent";

import { parseYamlFrontmatter } from "./frontmatter";
import {
  capabilityToSandboxConfig,
  mergeConfigs,
  injectMandatoryDenies,
} from "./policy-parser";
import {
  projectCacheDir,
  policyContentHash,
  loadPolicyCache,
  savePolicyCache,
} from "./cache";
import {
  DEFAULT_CONFIG,
  DEFAULT_POLICY_MD_PATH,
  ensureDefaultPolicy,
} from "./default-policy";
import {
  detectContainerRuntime,
  resolveImageTag,
  buildContainerImage,
  startContainer,
  execInContainer,
  stopContainer,
  isContainerRunning,
  createNetwork,
  removeNetwork,
  type ContainerConfig,
} from "./container";
import {
  type CredentialMap,
  ensureCA,
  getCaCertPath,
  startCredentialProxy,
  stopCredentialProxy,
  getCredentialProxyEnv,
  getCaCertEnv,
} from "./credential-proxy";
import {
  buildCredentialMap,
  stripCredentialsFromEnv,
  autoDetectGhToken,
} from "./credential-map";

const SHARED_SKILLS = join(homedir(), ".config", "skills");
const SHARED_PROMPTS = join(homedir(), ".config", "pi", "prompts");
const WORKSPACE_DIR = "/workspace";

function resolvePath(path: string, cwd: string): string {
  if (path.startsWith("~")) return path.replace(/^~/, homedir());
  if (path.startsWith("/")) return path;
  return `${cwd}/${path}`;
}

function matchesPath(target: string, pattern: string, cwd: string): boolean {
  if (pattern.includes("*") || pattern.includes("?") || pattern.includes("[")) {
    const regex = globToRegex(pattern, cwd);
    return regex.test(target);
  }
  const resolved = resolvePath(pattern, cwd);
  return target === resolved || target.startsWith(resolved + "/");
}

function globToRegex(pattern: string, cwd: string): RegExp {
  let re = pattern;
  if (re.startsWith("**/")) re = re.slice(3);
  re = resolvePath(re, cwd);
  re = re.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  re = re.replace(/\*/g, "[^/]*");
  re = re.replace(/\?/g, ".");
  return new RegExp("^" + re + "(?:/.*)?$");
}

function createSandboxedBashOps(): BashOperations {
  return {
    async exec(command, cwd, { onData, signal, timeout }) {
      if (!existsSync(cwd)) {
        throw new Error(`Working directory does not exist: ${cwd}`);
      }

      const wrappedCommand = await SandboxManager.wrapWithSandbox(command);

      return new Promise((resolve, reject) => {
        const child = spawn("bash", ["-c", wrappedCommand], {
          cwd,
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
        });

        let timedOut = false;
        let timeoutHandle: NodeJS.Timeout | undefined;

        if (timeout !== undefined && timeout > 0) {
          timeoutHandle = setTimeout(() => {
            timedOut = true;
            if (child.pid) {
              try {
                process.kill(-child.pid, "SIGKILL");
              } catch {
                child.kill("SIGKILL");
              }
            }
          }, timeout * 1000);
        }

        child.stdout?.on("data", onData);
        child.stderr?.on("data", onData);

        child.on("error", (err) => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          reject(err);
        });

        const onAbort = () => {
          if (child.pid) {
            try {
              process.kill(-child.pid, "SIGKILL");
            } catch {
              child.kill("SIGKILL");
            }
          }
        };

        signal?.addEventListener("abort", onAbort, { once: true });

        child.on("close", (code) => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          signal?.removeEventListener("abort", onAbort);

          if (signal?.aborted) {
            reject(new Error("aborted"));
          } else if (timedOut) {
            reject(new Error(`timeout:${timeout}`));
          } else {
            resolve({ exitCode: code });
          }
        });
      });
    },
  };
}

function createContainerizedBashOps(
  name: string,
  mountCwd: string,
): BashOperations {
  return {
    async exec(command, cwd, { onData, signal, timeout }) {
      const workdir = cwd && cwd.startsWith(mountCwd + "/")
        ? WORKSPACE_DIR + cwd.slice(mountCwd.length)
        : cwd && cwd.startsWith(mountCwd)
        ? WORKSPACE_DIR
        : WORKSPACE_DIR;

      const escapedCmd = command
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"');

      return new Promise((resolve, reject) => {
        const child = spawn("container", [
          "exec", "-w", workdir, name, "bash", "-c", escapedCmd,
        ], {
          stdio: ["ignore", "pipe", "pipe"],
        });

        let timedOut = false;
        let timeoutHandle: NodeJS.Timeout | undefined;

        if (timeout !== undefined && timeout > 0) {
          timeoutHandle = setTimeout(() => {
            timedOut = true;
            if (child.pid) {
              try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
            }
          }, timeout * 1000);
        }

        child.stdout?.on("data", onData);
        child.stderr?.on("data", onData);

        child.on("error", (err) => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          reject(err);
        });

        const onAbort = () => {
          if (child.pid) {
            try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
          }
        };
        signal?.addEventListener("abort", onAbort, { once: true });

        child.on("close", (code) => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          signal?.removeEventListener("abort", onAbort);

          if (signal?.aborted) {
            reject(new Error("aborted"));
          } else if (timedOut) {
            reject(new Error(`timeout:${timeout}`));
          } else {
            resolve({ exitCode: code });
          }
        });
      });
    },
  };
}

function resolveConfig(cwd: string, metaPolicy: Record<string, any> | null): SandboxRuntimeConfig {
  ensureDefaultPolicy();

  const globalSrc = existsSync(DEFAULT_POLICY_MD_PATH)
    ? readFileSync(DEFAULT_POLICY_MD_PATH, "utf8")
    : null;
  const projectPath = join(cwd, "POLICY.md");
  const projectSrc = existsSync(projectPath)
    ? readFileSync(projectPath, "utf8")
    : null;

  const hash = policyContentHash(globalSrc, projectSrc, metaPolicy);
  const projDir = projectCacheDir(cwd);
  const cached = loadPolicyCache(projDir, hash);
  if (cached) return cached;

  const globalFM = globalSrc ? parseYamlFrontmatter(globalSrc) : {};
  const projectFM = projectSrc ? parseYamlFrontmatter(projectSrc) : {};

  const globalCfg = capabilityToSandboxConfig({
    allow: Array.isArray(globalFM.allow) ? globalFM.allow : [],
    deny: Array.isArray(globalFM.deny) ? globalFM.deny : [],
  });
  const projectCfg = capabilityToSandboxConfig({
    allow: Array.isArray(projectFM.allow) ? projectFM.allow : [],
    deny: Array.isArray(projectFM.deny) ? projectFM.deny : [],
  });
  const metaCfg = metaPolicy
    ? capabilityToSandboxConfig({
        allow: Array.isArray(metaPolicy.allow) ? metaPolicy.allow : [],
        deny: Array.isArray(metaPolicy.deny) ? metaPolicy.deny : [],
      })
    : undefined;

  const merged = mergeConfigs(DEFAULT_CONFIG, globalCfg, projectCfg, ...(metaCfg ? [metaCfg] : []));

  const mandatoryPaths: string[] = [
    DEFAULT_POLICY_MD_PATH,
    projectPath,
    projDir,
  ];
  const final = injectMandatoryDenies(merged, mandatoryPaths);

  savePolicyCache(projDir, hash, final);
  return final;
}

export default function (pi: ExtensionAPI) {
  pi.registerFlag("no-sandbox", {
    description: "Disable OS-level sandboxing for bash commands",
    type: "boolean",
    default: false,
  });
  pi.registerFlag("policy-trace", {
    description: "Print resolved policy on startup",
    type: "boolean",
    default: false,
  });
  pi.registerFlag("container", {
    description: "Run bash commands in apple/container (macOS 26+) instead of sandbox",
    type: "boolean",
    default: false,
  });
  pi.registerFlag("container-ports", {
    description: "Forward ports to container (comma-separated, e.g. 8080:80,3000:3000)",
    type: "string",
    default: "",
  });

  const localCwd = process.cwd();
  const localBash = createBashTool(localCwd);

  let sandboxEnabled = false;
  let sandboxInitialized = false;
  let containerEnabled = false;
  let containerRunning = false;
  let containerName = "";
  let containerCwd = "";
  let networkName = "";
  let proxyRunning = false;
  let activeConfig: SandboxRuntimeConfig | null = null;
  let activePolicyHash: string | null = null;
  let activePolicyMeta: Record<string, any> | null = null;
  let activePolicyContext: string | null = null;
  let globalPolicySrc: string | null = null;
  let projectPolicySrc: string | null = null;

  async function reinitSandbox(ctx: any, cwd: string, metaPolicy: Record<string, any> | null): Promise<void> {
    if (!sandboxInitialized) return;

    const projectPath = join(cwd, "POLICY.md");
    globalPolicySrc = existsSync(DEFAULT_POLICY_MD_PATH)
      ? readFileSync(DEFAULT_POLICY_MD_PATH, "utf8")
      : null;
    projectPolicySrc = existsSync(projectPath)
      ? readFileSync(projectPath, "utf8")
      : null;

    const newHash = policyContentHash(globalPolicySrc, projectPolicySrc, metaPolicy);
    if (newHash === activePolicyHash) return;

    const newConfig = resolveConfig(cwd, metaPolicy);

    try {
      await SandboxManager.reset();
      await SandboxManager.initialize(newConfig);
      activeConfig = newConfig;
      activePolicyHash = newHash;
      activePolicyMeta = metaPolicy;

      const networkCount = newConfig.network?.allowedDomains?.length ?? 0;
      const writeCount = newConfig.filesystem?.allowWrite?.length ?? 0;
      const denyWriteCount = newConfig.filesystem?.denyWrite?.length ?? 0;
      const sources: string[] = ["default"];
      if (existsSync(DEFAULT_POLICY_MD_PATH)) sources.push("global POLICY.md");
      if (existsSync(projectPath)) sources.push("project POLICY.md");
      if (activePolicyContext) sources.push(activePolicyContext);

      ctx.ui.setStatus(
        "permissions",
        ctx.ui.theme.fg(
          "accent",
          `🔒 Permissions: ${networkCount} domains, ${writeCount} writes, ${denyWriteCount} denied [${sources.join(", ")}]`,
        ),
      );

      const trace = pi.getFlag("policy-trace") as boolean;
      if (trace) {
        const lines = formatPolicyDetails(newConfig, ctx.cwd, sources);
        ctx.ui.notify(lines.join("\n"), "info");
      }
    } catch (err) {
      ctx.ui.notify(
        `Permissions sandbox re-init failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    }
  }

  pi.registerTool({
    ...localBash,
    label: "bash (sandboxed)",
    async execute(id, params, signal, onUpdate, _ctx) {
      if (containerEnabled && containerRunning) {
        const ctrBash = createBashTool(localCwd, {
          operations: createContainerizedBashOps(containerName, containerCwd),
        });
        return ctrBash.execute(id, params, signal, onUpdate);
      }

      if (!sandboxEnabled || !sandboxInitialized) {
        return localBash.execute(id, params, signal, onUpdate);
      }

      const sandboxedBash = createBashTool(localCwd, {
        operations: createSandboxedBashOps(),
      });
      return sandboxedBash.execute(id, params, signal, onUpdate);
    },
  });

  pi.on("user_bash", () => {
    if (containerEnabled && containerRunning) {
      return { operations: createContainerizedBashOps(containerName, containerCwd) };
    }
    if (!sandboxEnabled || !sandboxInitialized) return;
    return { operations: createSandboxedBashOps() };
  });

  pi.on("session_start", async (_event, ctx) => {
    const noSandbox = pi.getFlag("no-sandbox") as boolean;
    const useContainer = pi.getFlag("container") as boolean;

    if (noSandbox) {
      sandboxEnabled = false;
      ctx.ui.notify("Sandbox disabled via --no-sandbox", "warning");
    }

    if (useContainer) {
      try {
        const runtime = detectContainerRuntime();
        if (!runtime) {
          ctx.ui.notify("Container requested but apple/container not available", "error");
          return;
        }

        containerCwd = ctx.cwd;
        containerName = `pi-permissions-${Date.now()}`;

        const portsFlag = pi.getFlag("container-ports") as string;
        const ports = portsFlag ? portsFlag.split(",").map(s => s.trim()).filter(Boolean) : undefined;

        const imageTag = await resolveImageTag(containerCwd);
        await buildContainerImage(containerCwd, imageTag);

        const credMap = buildCredentialMap();
        const cleanEnv = stripCredentialsFromEnv(process.env as Record<string, string>);

        const ghToken = autoDetectGhToken();
        if (ghToken) {
          const tokenRule = { env: "GH_TOKEN", domain: "api.github.com", header: "Authorization", prefix: "Bearer " };
          const headerValue = `Bearer ${ghToken}`;
          if (!credMap["api.github.com"]) credMap["api.github.com"] = {};
          credMap["api.github.com"]["authorization"] = headerValue;
        }

        networkName = `pi-net-${Date.now()}`;
        createNetwork(networkName);

        ensureCA();
        const caCertPath = getCaCertPath();
        const certVolumes: Record<string, string> = {};
        if (existsSync(caCertPath)) {
          certVolumes[caCertPath] = "/usr/local/share/ca-certificates/pi-ca.crt:ro";
        }

        ctx.ui.notify(`Starting proxy + container ${containerName} (${imageTag})...`, "info");

        const proxySession = await startCredentialProxy(credMap, networkName);
        proxyRunning = true;

        const proxyEnv = getCredentialProxyEnv();
        const caEnv = getCaCertEnv();
        const containerEnv = { ...cleanEnv, ...proxyEnv, ...caEnv };

        if (ghToken) {
          containerEnv.GH_TOKEN = ghToken;
        }

        await startContainer({
          image: imageTag,
          cwd: containerCwd,
          name: containerName,
          ports,
          env: containerEnv,
          ssh: false,
          volumes: certVolumes,
          network: networkName,
        });

        try {
          await execInContainer(containerName,
            "mkdir -p /usr/local/share/ca-certificates && " +
            "cp /usr/local/share/ca-certificates/pi-ca.crt /usr/local/share/ca-certificates/pi-ca.crt 2>/dev/null; " +
            "update-ca-certificates 2>/dev/null || true",
            "/"
          );
        } catch (err) {
          ctx.ui.notify(`CA trust store install failed: ${err instanceof Error ? err.message : err}`, "warning");
        }

        containerEnabled = true;
        containerRunning = true;

        ctx.ui.setStatus(
          "permissions",
          ctx.ui.theme.fg("accent", `🐳 Container: ${containerName} (${imageTag}) proxy:${proxySession.name}:${proxySession.port}`),
        );
        ctx.ui.notify(`Container ${containerName} ready (proxy ${proxySession.name}:${proxySession.port})`, "info");
      } catch (err) {
        containerEnabled = false;
        containerRunning = false;
        ctx.ui.notify(
          `Container start failed: ${err instanceof Error ? err.message : err}`,
          "error",
        );
        return;
      }
      return;
    }

    const platform = process.platform;
    if (platform !== "darwin" && platform !== "linux") {
      sandboxEnabled = false;
      ctx.ui.notify(`Sandbox not supported on ${platform}`, "warning");
      return;
    }

    try {
      activePolicyContext = null;
      activePolicyMeta = null;

      const projectPath = join(ctx.cwd, "POLICY.md");
      globalPolicySrc = existsSync(DEFAULT_POLICY_MD_PATH)
        ? readFileSync(DEFAULT_POLICY_MD_PATH, "utf8")
        : null;
      projectPolicySrc = existsSync(projectPath)
        ? readFileSync(projectPath, "utf8")
        : null;

      activePolicyHash = policyContentHash(globalPolicySrc, projectPolicySrc, null);
      activeConfig = resolveConfig(ctx.cwd, null);

      await SandboxManager.initialize(activeConfig);

      sandboxEnabled = true;
      sandboxInitialized = true;

      const networkCount = activeConfig.network?.allowedDomains?.length ?? 0;
      const writeCount = activeConfig.filesystem?.allowWrite?.length ?? 0;
      const denyWriteCount = activeConfig.filesystem?.denyWrite?.length ?? 0;
      const sources: string[] = ["default"];
      if (existsSync(DEFAULT_POLICY_MD_PATH)) sources.push("global POLICY.md");
      if (existsSync(projectPath)) sources.push("project POLICY.md");

      ctx.ui.setStatus(
        "permissions",
        ctx.ui.theme.fg(
          "accent",
          `🔒 Permissions: ${networkCount} domains, ${writeCount} writes, ${denyWriteCount} denied [${sources.join(", ")}]`,
        ),
      );

      const trace = pi.getFlag("policy-trace") as boolean;
      if (trace) {
        const lines = formatPolicyDetails(activeConfig, ctx.cwd, sources);
        ctx.ui.notify(lines.join("\n"), "info");
      } else {
        ctx.ui.notify(`Permissions sandbox initialized (${sources.length} sources)`, "info");
      }
    } catch (err) {
      sandboxEnabled = false;
      ctx.ui.notify(
        `Permissions sandbox init failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    }
  });

  function expandEnvTokens(tokens: string[]): string[] {
    return tokens.map(t => t.replace(/\$\{?(\w+)\}?/g, (_m, name) => process.env[name] ?? ""));
  }

  pi.on("input", async (event: any, ctx: any) => {
    const text = event.text ?? "";
    let policyAllow: string[] = [];
    let policyDeny: string[] = [];
    let contextLabel: string | null = null;

    const skillMatch = text.match(/\/skill:(\S+)/);
    if (skillMatch) {
      const skillName = skillMatch[1].replace(/[^\w-]/g, "");
      if (skillName) {
        const skillFile = join(SHARED_SKILLS, skillName, "SKILL.md");
        try {
          const content = readFileSync(skillFile, "utf8");
          const fm = parseYamlFrontmatter(content);
          policyAllow = Array.isArray(fm["policy-allow"]) ? fm["policy-allow"] : [];
          policyDeny = Array.isArray(fm["policy-deny"]) ? fm["policy-deny"] : [];
          contextLabel = `skill:${skillName}`;
        } catch { /* skill not found */ }
      }
    }

    if (!contextLabel) {
      const promptMatch = text.match(/^\/(\w[\w-]*)/);
      if (promptMatch) {
        const promptName = promptMatch[1];
        const promptFile = join(SHARED_PROMPTS, `${promptName}.md`);
        try {
          const content = readFileSync(promptFile, "utf8");
          const fm = parseYamlFrontmatter(content);
          policyAllow = Array.isArray(fm["policy-allow"]) ? fm["policy-allow"] : [];
          policyDeny = Array.isArray(fm["policy-deny"]) ? fm["policy-deny"] : [];
          contextLabel = `prompt:${promptName}`;
        } catch { /* prompt not found */ }
      }
    }

    if (contextLabel) {
      policyAllow = expandEnvTokens(policyAllow);
      policyDeny = expandEnvTokens(policyDeny);
      const hasPolicy = policyAllow.length > 0 || policyDeny.length > 0;
      const metaPolicy = hasPolicy ? { allow: policyAllow, deny: policyDeny } : null;

      if (contextLabel !== activePolicyContext || hasPolicy !== (activePolicyMeta !== null)) {
        activePolicyContext = contextLabel;
        await reinitSandbox(ctx, ctx.cwd, metaPolicy);
      }
    } else {
      if (activePolicyContext !== null) {
        activePolicyContext = null;
        await reinitSandbox(ctx, ctx.cwd, null);
      }
    }

    return { action: "continue" };
  });

  pi.on("tool_call", (event: any, ctx: any) => {
    if (!sandboxEnabled || !sandboxInitialized || !activeConfig) return;

    const toolName = event.toolName;
    if (toolName !== "write" && toolName !== "edit" && toolName !== "read" &&
        toolName !== "grep" && toolName !== "find" && toolName !== "ls") return;

    const path = event.input?.path || event.input?.filePath || event.input?.directory;
    if (!path) return;

    const resolved = path.startsWith("~")
      ? path.replace(/^~/, homedir())
      : path.startsWith("/")
        ? path
        : `${ctx.cwd}/${path}`;

    if (toolName === "write" || toolName === "edit") {
      const denyWrite = activeConfig.filesystem?.denyWrite ?? [];
      for (const deny of denyWrite) {
        if (matchesPath(resolved, deny, ctx.cwd)) {
          return { block: true, reason: `Write denied by policy: ${deny}` };
        }
      }
      const allowWrite = activeConfig.filesystem?.allowWrite ?? [];
      const allowed = allowWrite.some(p => matchesPath(resolved, p, ctx.cwd));
      if (!allowed) {
        return { block: true, reason: `Write not in allowWrite policy` };
      }
    }

    if (toolName === "read" || toolName === "grep" || toolName === "find" || toolName === "ls") {
      const denyRead = activeConfig.filesystem?.denyRead ?? [];
      for (const deny of denyRead) {
        if (matchesPath(resolved, deny, ctx.cwd)) {
          return { block: true, reason: `Read denied by policy: ${deny}` };
        }
      }
    }
  });

  pi.on("session_shutdown", async () => {
    if (proxyRunning) {
      try {
        await stopCredentialProxy();
      } catch {
        // Ignore cleanup errors
      }
      proxyRunning = false;
    }
    if (containerRunning && containerName) {
      try {
        await stopContainer(containerName);
      } catch {
        // Ignore cleanup errors
      }
      containerRunning = false;
      containerEnabled = false;
    }
    if (networkName) {
      try {
        removeNetwork(networkName);
        networkName = "";
      } catch {}
    }
    if (sandboxInitialized) {
      try {
        await SandboxManager.reset();
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  pi.registerCommand("policy", {
    description: "Show current permissions policy",
    handler: async (_args, ctx) => {
      if (!activeConfig) {
        ctx.ui.notify("No active permissions policy (sandbox not initialized)", "warning");
        return;
      }
      const sources: string[] = [];
      const projectPath = join(ctx.cwd, "POLICY.md");
      if (existsSync(DEFAULT_POLICY_MD_PATH)) sources.push("global POLICY.md");
      if (existsSync(projectPath)) sources.push("project POLICY.md");
      const lines = formatPolicyDetails(activeConfig, ctx.cwd, sources);
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}

function formatPolicyDetails(config: SandboxRuntimeConfig, _cwd: string, sources: string[]): string[] {
  return [
    `Permissions Policy [${sources.join(", ")}]:`,
    "",
    "Network:",
    `  Allowed: ${config.network?.allowedDomains?.join(", ") || "(none)"}`,
    `  Denied:  ${config.network?.deniedDomains?.join(", ") || "(none)"}`,
    "",
    "Filesystem:",
    `  Deny Read:  ${config.filesystem?.denyRead?.join(", ") || "(none)"}`,
    `  Allow Read: ${config.filesystem?.allowRead?.join(", ") || "(none)"}`,
    `  Allow Write: ${config.filesystem?.allowWrite?.join(", ") || "(none)"}`,
    `  Deny Write: ${config.filesystem?.denyWrite?.join(", ") || "(none)"}`,
  ];
}
