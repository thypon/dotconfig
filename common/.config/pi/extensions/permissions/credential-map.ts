import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { CredentialMap } from "./credential-proxy";

const CREDENTIAL_MAP_PATH = join(homedir(), ".pi", "agent", "credential-map.json");

interface CredentialRule {
  env: string;
  domain: string;
  header: string;
  prefix?: string;
}

const KNOWN_CREDENTIALS: CredentialRule[] = [
  { env: "GITHUB_TOKEN", domain: "api.github.com", header: "Authorization", prefix: "Bearer " },
  { env: "GH_TOKEN", domain: "api.github.com", header: "Authorization", prefix: "Bearer " },
  { env: "OPENAI_API_KEY", domain: "api.openai.com", header: "Authorization", prefix: "Bearer " },
  { env: "ANTHROPIC_API_KEY", domain: "api.anthropic.com", header: "x-api-key" },
  { env: "BRAVE_API_KEY", domain: "api.search.brave.com", header: "X-Subscription-Token" },
  { env: "DEEPSEEK_API_KEY", domain: "api.deepseek.com", header: "Authorization", prefix: "Bearer " },
  { env: "MISTRAL_API_KEY", domain: "api.mistral.ai", header: "Authorization", prefix: "Bearer " },
  { env: "GOOGLE_API_KEY", domain: "generativelanguage.googleapis.com", header: "x-goog-api-key" },
  { env: "GEMINI_API_KEY", domain: "generativelanguage.googleapis.com", header: "x-goog-api-key" },
  { env: "NPM_TOKEN", domain: "registry.npmjs.org", header: "Authorization", prefix: "Bearer " },
  { env: "PYPI_TOKEN", domain: "upload.pypi.org", header: "Authorization", prefix: "token " },
  { env: "DOCKER_PASSWORD", domain: "index.docker.io", header: "Authorization", prefix: "Basic " },
  { env: "HF_TOKEN", domain: "huggingface.co", header: "Authorization", prefix: "Bearer " },
  { env: "HUGGINGFACE_TOKEN", domain: "huggingface.co", header: "Authorization", prefix: "Bearer " },
  { env: "CLOUDFLARE_API_TOKEN", domain: "api.cloudflare.com", header: "Authorization", prefix: "Bearer " },
  { env: "SENTRY_AUTH_TOKEN", domain: "sentry.io", header: "Authorization", prefix: "Bearer " },
  { env: "VERCEL_TOKEN", domain: "api.vercel.com", header: "Authorization", prefix: "Bearer " },
  { env: "RENDER_API_KEY", domain: "api.render.com", header: "Authorization", prefix: "Bearer " },
  { env: "FLY_API_TOKEN", domain: "api.machines.dev", header: "Authorization", prefix: "Bearer " },
  { env: "NETLIFY_AUTH_TOKEN", domain: "api.netlify.com", header: "Authorization", prefix: "Bearer " },
  { env: "HEROKU_API_KEY", domain: "api.heroku.com", header: "Authorization", prefix: "Bearer " },
  { env: "AWS_ACCESS_KEY_ID", domain: "*.amazonaws.com", header: "x-amz-access-key" },
  { env: "GCP_SERVICE_ACCOUNT_KEY", domain: "*.googleapis.com", header: "x-goog-credentials" },
];

export function autoDetectCredentials(): CredentialMap {
  const map: CredentialMap = {};

  for (const rule of KNOWN_CREDENTIALS) {
    const value = process.env[rule.env];
    if (!value) continue;

    const headerValue = rule.prefix ? `${rule.prefix}${value}` : value;

    if (!map[rule.domain]) map[rule.domain] = {};
    map[rule.domain][rule.header.toLowerCase()] = headerValue;
  }

  return map;
}

export function autoDetectGhToken(): string | undefined {
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) return undefined;
  try {
    const token = execSync("gh auth token", {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return token || undefined;
  } catch {
    return undefined;
  }
}

export function loadOverrideCredentials(): CredentialMap {
  if (!existsSync(CREDENTIAL_MAP_PATH)) return {};

  try {
    const raw = readFileSync(CREDENTIAL_MAP_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function buildCredentialMap(): CredentialMap {
  const auto = autoDetectCredentials();
  const override = loadOverrideCredentials();

  const merged: CredentialMap = { ...auto };
  for (const [domain, headers] of Object.entries(override)) {
    merged[domain] = { ...(merged[domain] ?? {}), ...headers };
  }

  return merged;
}

export function getCredentialEnvBlacklist(): string[] {
  return [
    ...KNOWN_CREDENTIALS.map(r => r.env),
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "http_proxy",
    "https_proxy",
    "NO_PROXY",
    "no_proxy",
  ];
}

export function stripCredentialsFromEnv(env: Record<string, string>): Record<string, string> {
  const blacklist = new Set(getCredentialEnvBlacklist());
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (!blacklist.has(key)) {
      clean[key] = value;
    }
  }
  return clean;
}
