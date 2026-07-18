import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, renameSync } from "node:fs";
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
const MITM_CONFDIR = "/mitm-confdir";

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
  caCertPath: string;
}

let proxySession: ProxySession | null = null;


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

export async function startCredentialProxy(
  credentialMap: CredentialMap,
  network?: string,
): Promise<ProxySession> {
  if (proxySession) return proxySession;
  // mitmproxy generates its own CA in a confdir on first run and signs every
  // intercepted leaf with it. Trying to force our own CA via --certs/--set
  // confdir is fragile: mitmproxy silently ignores malformed PEMs and falls
  // back to its built-in default CA, so the cert presented to clients is NOT
  // signed by whatever we trusted, and TLS fails. Instead, let mitmproxy use
  // its own CA, then extract that CA and trust IT in the main container.
  ensureCA();

  const certDir = join(tmpdir(), `pi-certs-${Date.now()}`);
  mkdirSync(certDir, { recursive: true });

  // The addon (Python script loaded by mitmdump) reads this JSON at request
  // time. Keys are credMap domains; values are {header: value} to inject.
  // When a domain is absent the request passes through unmodified (fake
  // credential → upstream 401). The host updates this file atomically on
  // context change without restarting the proxy.
  const controlPath = join(certDir, "allowed-creds.json");
  writeFileSync(controlPath, "{}", "utf8");

  const addonScript = `import json\n` +
    `from mitmproxy import http\n` +
    `\n` +
    `CONTROL = "${MITM_CONFDIR}/allowed-creds.json"\n` +
    `DEBUG = "/tmp/addon-debug.log"\n` +
    `\n` +
    `def log(msg):\n` +
    `    try:\n` +
    `        with open(DEBUG, "a") as f: f.write(str(msg) + "\\n")\n` +
    `    except: pass\n` +
    `\n` +
    `class CredentialInjector:\n` +
    `    def load(self, loader):\n` +
    `        log("ADDON LOADED")\n` +
    `        try:\n` +
    `            with open("/tmp/addon-loaded", "w") as f: f.write("loaded")\n` +
    `        except Exception as e:\n` +
    `            log(f"load marker failed: {e}")\n` +
    `\n` +
    `    def request(self, flow: http.HTTPFlow):\n` +
    `        log(f"REQUEST url={flow.request.url}")\n` +
    `        try:\n` +
    `            allowed = {}\n` +
    `            try:\n` +
    `                with open(CONTROL) as f: allowed = json.load(f)\n` +
    `            except Exception as e:\n` +
    `                log(f"load_allowed error: {e}")\n` +
    `            host = flow.request.pretty_host\n` +
    `            raw_host = flow.request.host\n` +
    `            host_header = flow.request.headers.get("host", "")\n` +
    `            candidates = [str(c).split(":")[0] for c in [host, raw_host, host_header]]\n` +
    `            log(f"host={host} raw={raw_host} header={host_header} candidates={candidates}")\n` +
    `            for domain, headers in allowed.items():\n` +
    `                if domain.startswith("*."):\n` +
    `                    base = domain[2:]\n` +
    `                    match = any(c == base or c.endswith("." + base) for c in candidates)\n` +
    `                else:\n` +
    `                    match = any(c == domain for c in candidates)\n` +
    `                log(f"domain={domain} match={match}")\n` +
    `                if match:\n` +
    `                    for h, v in headers.items():\n` +
    `                        flow.request.headers[h] = v\n` +
    `                        log(f"SET {h}={v[:20]}...")\n` +
    `        except Exception as e:\n` +
    `            log(f"request error: {e}")\n` +
    `\n` +
    `addons = [CredentialInjector()]\n`;
  writeFileSync(join(certDir, "addon.py"), addonScript, "utf8");

  const image = await ensureProxyImage();

  const name = `pi-proxy-${Date.now()}`;

  const mitmdumpArgs = [
    "-p", String(PROXY_PORT),
    "--listen-host", "0.0.0.0",
    "-s", `${MITM_CONFDIR}/addon.py`,
  ];

  await startContainer({
    image,
    cwd: certDir,
    name,
    env: {},
    volumes: { [certDir]: MITM_CONFDIR },
    network,
    command: ["mitmdump", ...mitmdumpArgs],
    entrypoint: null,
  });

  await pollProxyContainer(name);

  // Extract mitmproxy's own CA from the proxy container so the main
  // container can trust exactly what signs the intercepted certs.
  // mitmproxy generates its CA at startup in its confdir (~/.mitmproxy).
  const caCertPath = join(certDir, "mitmproxy-ca-cert.pem");
  const candidatePaths = [
    "/root/.mitmproxy/mitmproxy-ca-cert.pem",
    `${MITM_CONFDIR}/mitmproxy-ca-cert.pem`,
    "/home/mitmproxy/.mitmproxy/mitmproxy-ca-cert.pem",
  ];
  let attempts = 0;
  let lastErr = "";
  while (attempts < 40) {
    for (const cp of candidatePaths) {
      const r = await execInContainer(name, `cat ${cp} 2>/dev/null`, "/");
      if (r.exitCode === 0 && r.output.includes("BEGIN CERTIFICATE")) {
        writeFileSync(caCertPath, r.output);
        break;
      }
      lastErr = r.output.trim() || `not found: ${cp}`;
    }
    if (existsSync(caCertPath)) break;
    attempts++;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  if (!existsSync(caCertPath)) {
    const diag = await execInContainer(name,
      "echo '-- HOME=' $HOME; " +
      "echo '-- whoami=' $(whoami); " +
      "echo '-- find mitmproxy-ca-cert.pem --'; " +
      "find / -name mitmproxy-ca-cert.pem 2>/dev/null; " +
      "echo '-- find mitmproxy-ca*.pem --'; " +
      "find / -name 'mitmproxy-ca*.pem' 2>/dev/null; " +
      "echo '-- ls $HOME/.mitmproxy --'; " +
      "ls -la $HOME/.mitmproxy 2>&1; " +
      "echo '-- ls /root/.mitmproxy --'; " +
      "ls -la /root/.mitmproxy 2>&1",
      "/"
    );
    throw new Error(`failed to extract mitmproxy CA from proxy container (${attempts} attempts; last: ${lastErr}). Diagnostic:\n${diag.output}`);
  }

  const ip = getContainerIP(name, network);
  proxySession = { name, port: PROXY_PORT, certDir, ip, caCertPath, controlPath, credStore: credentialMap };
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

export async function setAllowedCredentials(allowedDomains: string[]): Promise<void> {
  if (!proxySession) return;
  const subset: CredentialMap = {};
  for (const domain of allowedDomains) {
    if (proxySession.credStore[domain]) {
      subset[domain] = proxySession.credStore[domain];
    }
  }
  // Atomic write: the addon reads this file per request; never expose a
  // partial file if the write is interrupted.
  const tmp = proxySession.controlPath + ".tmp";
  writeFileSync(tmp, JSON.stringify(subset), "utf8");
  renameSync(tmp, proxySession.controlPath);
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

export function getProxyCaCertPath(): string {
  return proxySession?.caCertPath ?? "";
}
