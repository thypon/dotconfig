import { spawnSync, execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { homedir } from "node:os";

const DEFAULT_IMAGE = "ubuntu:24.04";
const WORKSPACE_DIR = "/workspace";
const PROXY_DOCKERFILE_DIR = join(homedir(), ".pi", "agent", "container-proxy");
const PROXY_IMAGE_NAME = "pi-proxy";

export interface ContainerConfig {
  image: string;
  cwd: string;
  name: string;
  ports?: string[];
  env?: Record<string, string>;
  ssh?: boolean;
  volumes?: Record<string, string>;
  network?: string;
  command?: string[];
  entrypoint?: string | null;
}

export function detectContainerRuntime(): string | null {
  try {
    execSync("container --version", { stdio: "ignore" });
    return "apple";
  } catch {
    return null;
  }
}

function resolveDockerfile(cwd: string): string | null {
  const piDockerfile = join(cwd, ".pi", "Dockerfile");
  if (existsSync(piDockerfile)) return piDockerfile;
  const rootDockerfile = join(cwd, "Dockerfile");
  if (existsSync(rootDockerfile)) return rootDockerfile;
  return null;
}

function dockerfileHash(dockerfilePath: string): string {
  const content = readFileSync(dockerfilePath, "utf8");
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
}

export async function resolveImageTag(cwd: string): Promise<string> {
  const dockerfile = resolveDockerfile(cwd);
  if (!dockerfile) return DEFAULT_IMAGE;

  const hash = dockerfileHash(dockerfile);
  const tag = `pi-sandbox:${hash}`;

  if (imageList().some(line => line.trim() === tag)) return tag;

  return tag;
}

export async function buildContainerImage(cwd: string, imageTag: string): Promise<void> {
  const dockerfile = resolveDockerfile(cwd);
  if (!dockerfile) return;

  const contextDir = join(dockerfile, "..");
  const result = spawnSync("container", ["build", "-t", imageTag, contextDir], {
    encoding: "utf8",
    stdio: "inherit",
    timeout: 300000,
  });

  if (result.status !== 0) {
    throw new Error(`Container build failed: ${result.stderr || "unknown error"}`);
  }
}

export async function startContainer(config: ContainerConfig): Promise<string> {
  const args: string[] = ["run", "-d", "--name", config.name];

  args.push("-v", `${config.cwd}:${WORKSPACE_DIR}`);
  args.push("-w", WORKSPACE_DIR);

  if (config.ports) {
    for (const portSpec of config.ports) {
      args.push("-p", portSpec);
    }
  }

  if (config.volumes) {
    for (const [hostPath, containerPath] of Object.entries(config.volumes)) {
      args.push("-v", `${hostPath}:${containerPath}`);
    }
  }

  if (config.env) {
    for (const [key, value] of Object.entries(config.env)) {
      args.push("-e", `${key}=${value}`);
    }
  }

  if (config.network) {
    args.push("--network", config.network);
  }

  if (config.entrypoint !== undefined) {
    if (config.entrypoint === null) {
      args.push("--entrypoint", "");
    } else {
      args.push("--entrypoint", config.entrypoint);
    }
  }

  if (config.ssh) {
    args.push("--ssh");
  }

  args.push(config.image);

  if (config.command && config.command.length > 0) {
    args.push(...config.command);
  } else {
    args.push("sleep", "86400");
  }

  const result = spawnSync("container", args, {
    encoding: "utf8",
    timeout: 60000,
  });

  if (result.status !== 0) {
    throw new Error(`Container start failed: ${result.stderr || "unknown error"}`);
  }

  return (result.stdout || "").trim();
}

export async function execInContainer(
  name: string,
  command: string,
  cwd?: string
): Promise<{ exitCode: number | null; output: string }> {
  const workdir = cwd ?? WORKSPACE_DIR;
  const escapedCmd = command
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');

  const result = spawnSync("container", ["exec", "-w", workdir, name, "bash", "-c", escapedCmd], {
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
    timeout: 300000,
  });

  return {
    exitCode: result.status,
    output: (result.stdout || "") + (result.stderr || ""),
  };
}

export async function stopContainer(name: string): Promise<void> {
  const result = spawnSync("container", ["rm", "-f", name], {
    encoding: "utf8",
    timeout: 30000,
  });

  if (result.status !== 0) {
    console.error(`Container stop warning: ${result.stderr || "unknown error"}`);
  }
}

export function isContainerRunning(name: string): boolean {
  try {
    const result = execSync("container list", {
      encoding: "utf8",
      timeout: 5000,
    });
    return result.includes(name);
  } catch {
    return false;
  }
}

function proxyDockerfileHash(): string {
  const dockerfilePath = join(PROXY_DOCKERFILE_DIR, "Dockerfile");
  const content = readFileSync(dockerfilePath, "utf8");
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
}

function proxyImageExists(tag: string): boolean {
  return imageList().some(line => line.trim() === tag);
}

function imageList(): string[] {
  try {
    const result = spawnSync("container", ["image", "list", "--format", "json"], {
      encoding: "utf8",
      timeout: 10000,
    });
    const images = JSON.parse(result.stdout || "[]");
    return (images as any[]).map(img => img?.configuration?.name ?? "");
  } catch {
    return [];
  }
}

export async function buildProxyImage(): Promise<string> {
  const hash = proxyDockerfileHash();
  const tag = `${PROXY_IMAGE_NAME}:${hash}`;

  if (proxyImageExists(tag)) return tag;

  const result = spawnSync("container", ["build", "-t", tag, PROXY_DOCKERFILE_DIR], {
    encoding: "utf8",
    stdio: "inherit",
    timeout: 300000,
  });

  if (result.status !== 0) {
    throw new Error(`Proxy image build failed: ${result.stderr || "unknown error"}`);
  }

  return tag;
}

export async function ensureProxyImage(): Promise<string> {
  const hash = proxyDockerfileHash();
  const tag = `${PROXY_IMAGE_NAME}:${hash}`;

  if (proxyImageExists(tag)) return tag;

  return buildProxyImage();
}

export function getContainerIP(name: string, network?: string): string {
  try {
    const result = JSON.parse(
      execSync(`container inspect ${name}`, {
        encoding: "utf8",
        timeout: 10000,
      }).toString(),
    );
    const container = Array.isArray(result) ? result[0] : result;
    const nets: any[] = container?.status?.networks ?? [];
    const entry = network
      ? nets.find(n => n?.network === network)
      : nets[0];
    return (entry?.ipv4Address ?? "").split("/")[0];
  } catch {
    return "";
  }
}

export function createNetwork(name: string): void {
  try {
    execSync(`container network create ${name}`, { stdio: "ignore", timeout: 10000 });
  } catch {
    throw new Error(`Failed to create network: ${name}`);
  }
}

export function removeNetwork(name: string): void {
  try {
    execSync(`container network rm ${name}`, { stdio: "ignore", timeout: 10000 });
  } catch {}
}
