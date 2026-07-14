import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import {
  ensureProxyImage,
  startContainer,
  stopContainer,
  execInContainer,
  getContainerIP,
} from "./container";

const CA_DIR = join(homedir(), ".pi", "agent", "container-ca");
const CA_KEY = join(CA_DIR, "ca-key.pem");
const CA_CERT = join(CA_DIR, "ca-cert.pem");
const PROXY_PORT = 8080;

export interface DomainCredentials {
  [header: string]: string;
}

export interface CredentialMap {
  [domain: string]: DomainCredentials;
}

export interface ProxySession {
  name: string;
  port: number;
  certDir: string;
  ip: string;
}

let proxySession: ProxySession | null = null;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function ensureCA(): { certPath: string; keyPath: string } {
  if (!existsSync(CA_DIR)) {
    mkdirSync(CA_DIR, { recursive: true });
  }
  if (!existsSync(CA_KEY) || !existsSync(CA_CERT)) {
    execSync(
      `openssl genrsa -out "${CA_KEY}" 2048 2>/dev/null && ` +
      `openssl req -x509 -new -nodes -key "${CA_KEY}" -sha256 -days 3650 ` +
      `-out "${CA_CERT}" -subj "/CN=PiContainerCA" ` +
      `-addext "basicConstraints=critical,CA:TRUE,pathlen:0" ` +
      `-addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null`,
      { timeout: 10000 },
    );
  }
  return { certPath: CA_CERT, keyPath: CA_KEY };
}

export function getCaCertPath(): string {
  return CA_CERT;
}

function generateDomainCert(domain: string, dir: string): string {
  const keyPath = join(dir, `${domain}.key`);
  const certPath = join(dir, `${domain}.crt`);
  const fullchainPath = join(dir, `${domain}.pem`);
  const extPath = join(dir, `${domain}.ext`);

  const safeDomain = domain.replace(/[^a-zA-Z0-9.*_-]/g, "_");
  const san = safeDomain.startsWith("*")
    ? `DNS:${safeDomain},DNS:${safeDomain.slice(1)}`
    : `DNS:${safeDomain}`;

  writeFileSync(extPath, `subjectAltName=${san}\n`);

  execSync(
    `openssl genrsa -out "${keyPath}" 2048 2>/dev/null && ` +
    `openssl req -new -key "${keyPath}" -out "${join(dir, safeDomain + ".csr")}" ` +
    `-subj "/CN=${safeDomain}" 2>/dev/null && ` +
    `openssl x509 -req -in "${join(dir, safeDomain + ".csr")}" ` +
    `-CA "${CA_CERT}" -CAkey "${CA_KEY}" -CAcreateserial ` +
    `-out "${certPath}" -days 365 -sha256 -extfile "${extPath}" 2>/dev/null`,
    { timeout: 10000 },
  );

  const cert = readFileSync(certPath);
  const key = readFileSync(keyPath);
  writeFileSync(fullchainPath, Buffer.concat([cert as any, key as any]) as any);

  try { rmSync(join(dir, safeDomain + ".csr")); } catch {}
  try { rmSync(extPath); } catch {}
  try { rmSync(join(CA_DIR, "ca-cert.srl")); } catch {}

  return fullchainPath;
}

export async function startCredentialProxy(
  credentialMap: CredentialMap,
  network?: string,
): Promise<ProxySession> {
  if (proxySession) return proxySession;

  ensureCA();

  const certDir = join(tmpdir(), `pi-certs-${Date.now()}`);
  mkdirSync(certDir, { recursive: true });

  const domains = Object.keys(credentialMap);
  const domainCerts: Record<string, string> = {};
  for (const domain of domains) {
    try {
      domainCerts[domain] = generateDomainCert(domain, certDir);
    } catch (err) {
    }
  }

  const certVolumes: Record<string, string> = {};
  const certPaths: string[] = [];
  for (const [domain, certPath] of Object.entries(domainCerts)) {
    certPaths.push(`--certs`, `${domain}=/certs/${domain}.pem`);
    certVolumes[certPath] = `/certs/${domain}.pem:ro`;
  }

  const modifyHeadersArgs: string[] = [];
  for (const [domain, creds] of Object.entries(credentialMap)) {
    const domainPattern = `/~d ${escapeRegex(domain)}`;
    for (const [header, value] of Object.entries(creds)) {
      modifyHeadersArgs.push("--modify-headers", `${domainPattern}/${header}/${value}`);
    }
  }

  const image = await ensureProxyImage();

  const name = `pi-proxy-${Date.now()}`;

  const mitmdumpArgs = [
    "-p", String(PROXY_PORT),
    "--listen-host", "0.0.0.0",
    ...certPaths,
    ...modifyHeadersArgs,
  ];

  await startContainer({
    image,
    cwd: certDir,
    name,
    env: {},
    volumes: certVolumes,
    network,
    command: ["mitmdump", ...mitmdumpArgs],
    entrypoint: null,
  });

  await pollProxyContainer(name);

  const ip = getContainerIP(name, network);
  proxySession = { name, port: PROXY_PORT, certDir, ip };
  return proxySession;
}

async function pollProxyContainer(name: string, maxAttempts = 60): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const result = await execInContainer(name,
        `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:${PROXY_PORT}`,
        "/"
      );
      if (result.exitCode === 0) return;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error("timed out waiting for proxy container");
}

export async function stopCredentialProxy(): Promise<void> {
  if (!proxySession) return;

  try {
    await stopContainer(proxySession.name);
  } catch (err) {
  }

  try { rmSync(proxySession.certDir, { recursive: true }); } catch {}
  proxySession = null;
}

export function getCredentialProxyPort(): number {
  return proxySession?.port ?? 0;
}

export function getCredentialProxyEnv(): Record<string, string> {
  if (!proxySession || !existsSync(CA_CERT)) return {};
  const host = proxySession.ip || proxySession.name;
  const proxyUrl = `http://${host}:${proxySession.port}`;
  return {
    HTTPS_PROXY: proxyUrl,
    https_proxy: proxyUrl,
    HTTP_PROXY: proxyUrl,
    http_proxy: proxyUrl,
  };
}

export function getCaCertEnv(): Record<string, string> {
  if (!existsSync(CA_CERT)) return {};
  return { NODE_EXTRA_CA_CERTS: CA_CERT };
}
