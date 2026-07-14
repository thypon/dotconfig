import { spawn } from "node:child_process";
import { createConnection, createServer } from "node:net";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const MITMDUMP = "/opt/homebrew/bin/mitmdump";
const MITMPROXY_CA_CERT = join(homedir(), ".mitmproxy", "mitmproxy-ca-cert.pem");

export interface DomainCredentials {
  [header: string]: string;
}

export interface CredentialMap {
  [domain: string]: DomainCredentials;
}

let proxyProcess: ReturnType<typeof spawn> | null = null;
let proxyPort = 0;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function startCredentialProxy(
  credentialMap: CredentialMap,
  port = 0,
): Promise<number> {
  return new Promise(async (resolve, reject) => {
    if (proxyProcess) {
      resolve(proxyPort);
      return;
    }

    // Find a free port if port=0
    let targetPort = port;
    if (targetPort === 0) {
      const portServer = createServer();
      targetPort = await new Promise<number>((resolvePort, rejectPort) => {
        portServer.listen(0, "127.0.0.1", () => {
          const addr = portServer.address();
          if (addr && typeof addr === "object") resolvePort(addr.port);
          else rejectPort(new Error("could not determine port"));
        });
        portServer.on("error", rejectPort);
      });
      portServer.close();
    }

    const args: string[] = [
      "-p", String(targetPort),
      "--ssl-insecure",
      "--listen-host", "127.0.0.1",
    ];

    for (const [domain, creds] of Object.entries(credentialMap)) {
      const domainPattern = `/~d ${escapeRegex(domain)}`;
      for (const [header, value] of Object.entries(creds)) {
        args.push(
          "--modify-headers",
          `${domainPattern}/${header}/${value}`,
        );
      }
    }

    const child = spawn(MITMDUMP, args, {
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });

    console.error(`[credential-proxy] spawned mitmdump pid=${child.pid} port=${targetPort}`);

    let resolved = false;
    let pollTimer: ReturnType<typeof setTimeout>;

    const cleanup = () => clearTimeout(pollTimer);

    const handleError = (err: Error) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      reject(err);
    };

    child.on("error", (err) => handleError(new Error(`mitmdump failed: ${err.message}`)));
    child.on("exit", (code) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(new Error(`mitmdump exited with code ${code}`));
      }
    });

    const tryPort = (): Promise<boolean> => {
      return new Promise((resolveConnect) => {
        const sock = createConnection({ host: "127.0.0.1", port: targetPort }, () => {
          sock.destroy();
          resolveConnect(true);
        });
        sock.on("error", () => resolveConnect(false));
        setTimeout(() => { sock.destroy(); resolveConnect(false); }, 500);
      });
    };

    let pollAttempts = 0;
    const poll = () => {
      if (resolved) return;
      if (pollAttempts > 60) {
        handleError(new Error("timed out waiting for mitmdump"));
        return;
      }
      pollAttempts++;
      tryPort().then((alive) => {
        if (resolved) return;
        if (alive) {
          resolved = true;
          proxyPort = targetPort;
          proxyProcess = child;
          resolve(proxyPort);
        } else {
          pollTimer = setTimeout(poll, 500);
        }
      });
    };
    poll();
  });
}

export function stopCredentialProxy(): Promise<void> {
  return new Promise((resolve) => {
    if (!proxyProcess) {
      resolve();
      return;
    }
    proxyProcess.kill("SIGTERM");
    proxyProcess.on("exit", () => {
      proxyProcess = null;
      proxyPort = 0;
      resolve();
    });
    setTimeout(() => {
      if (proxyProcess) {
        proxyProcess.kill("SIGKILL");
        proxyProcess = null;
        proxyPort = 0;
        resolve();
      }
    }, 3000);
  });
}

export function getCredentialProxyPort(): number {
  return proxyPort;
}

export function getCredentialProxyEnv(): Record<string, string> {
  if (!proxyPort || !existsSync(MITMPROXY_CA_CERT)) return {};
  const proxyUrl = `http://127.0.0.1:${proxyPort}`;
  return {
    HTTPS_PROXY: proxyUrl,
    https_proxy: proxyUrl,
    HTTP_PROXY: proxyUrl,
    http_proxy: proxyUrl,
    NODE_EXTRA_CA_CERTS: MITMPROXY_CA_CERT,
  };
}
