import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { type Socket } from "node:net";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSecureContext, connect as tlsConnect } from "node:tls";
import { TLSSocket } from "node:tls";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";

let caDir = ""

export function getCaDir(): string {
  return caDir
}

export function setCaDir(dir: string): void {
  caDir = dir
}

function caKeyPath(): string { return join(caDir, "ca.key") }
function caCertPath(): string { return join(caDir, "ca.crt") }
function certsDir(): string { return join(caDir, "certs") }

export interface DomainCredentials {
  [header: string]: string;
}

export interface CredentialMap {
  [domain: string]: DomainCredentials;
}

let proxyServer: Server | null = null;
let proxyPort = 0;
let proxyCredentialMap: CredentialMap = {};

function ensureCA(): { key: string; cert: string } {
  if (!caDir || !existsSync(caKeyPath()) || !existsSync(caCertPath())) {
    throw new Error("CA not available. Generate CA inside container first.")
  }
  if (!existsSync(certsDir())) mkdirSync(certsDir(), { recursive: true })
  return {
    key: readFileSync(caKeyPath(), "utf8"),
    cert: readFileSync(caCertPath(), "utf8"),
  }
}

function getDomainCert(domain: string): { key: string; cert: string } {
  const safeName = domain.replace(/[^a-zA-Z0-9.-]/g, "_")
  const certPath = join(certsDir(), `${safeName}.crt`)
  const keyPath = join(certsDir(), `${safeName}.key`)

  if (existsSync(keyPath) && existsSync(certPath)) {
    return {
      key: readFileSync(keyPath, "utf8"),
      cert: readFileSync(certPath, "utf8"),
    }
  }

  const caKey = readFileSync(caKeyPath(), "utf8")
  const caCert = readFileSync(caCertPath(), "utf8")

  const tmpKey = join(certsDir(), `.tmp-${safeName}.key`)
  const tmpCsr = join(certsDir(), `.tmp-${safeName}.csr`)
  const tmpExt = join(certsDir(), `.tmp-${safeName}.ext`)

  try {
    execSync(
      `openssl genrsa -out "${tmpKey}" 2048`,
      { stdio: "pipe", timeout: 10000 },
    )
    execSync(
      `openssl req -new -key "${tmpKey}" -out "${tmpCsr}" -subj "/CN=${domain}"`,
      { stdio: "pipe", timeout: 10000 },
    )

    const extContent = [
      "authorityKeyIdentifier=keyid,issuer",
      "basicConstraints=CA:FALSE",
      "keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment",
      `subjectAltName=DNS:${domain}`,
    ].join("\n")
    writeFileSync(tmpExt, extContent)

    execSync(
      `openssl x509 -req -in "${tmpCsr}" -CA "${caCertPath()}" -CAkey "${caKeyPath()}" ` +
      `-CAcreateserial -out "${certPath}" -days 825 -sha256 -extfile "${tmpExt}"`,
      { stdio: "pipe", timeout: 10000 },
    )

    writeFileSync(keyPath, readFileSync(tmpKey))
  } finally {
    try { unlinkSync(tmpKey) } catch {}
    try { unlinkSync(tmpCsr) } catch {}
    try { unlinkSync(tmpExt) } catch {}
  }

  return {
    key: readFileSync(keyPath, "utf8"),
    cert: readFileSync(certPath, "utf8"),
  }
}

interface ProxyRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: Buffer;
}

function parseHttpRequest(data: Buffer): ProxyRequest | null {
  const str = data.toString("utf8")
  const lines = str.split("\r\n")
  const requestLine = lines[0]
  if (!requestLine) return null

  const [method, path] = requestLine.split(" ")
  if (!method || !path) return null

  const headers: Record<string, string> = {}
  let i = 1
  for (; i < lines.length; i++) {
    const line = lines[i]
    if (line === "") break
    const colonIdx = line.indexOf(": ")
    if (colonIdx > 0) {
      headers[line.slice(0, colonIdx).toLowerCase()] = line.slice(colonIdx + 2)
    }
  }

  const bodyStart = str.indexOf("\r\n\r\n") + 4
  const body = Buffer.from(str.slice(bodyStart), "utf8")

  return { method, path, headers, body }
}

function handleMITM(
  clientSocket: Socket,
  domain: string,
  port: number,
  onRequest: (req: ProxyRequest) => ProxyRequest,
): void {
  clientSocket.on("error", () => {})

  try {
    const { key, cert } = getDomainCert(domain)
    const secureContext = createSecureContext({ key, cert })

    const tlsSocket = new TLSSocket(clientSocket, {
      secureContext,
      isServer: true,
    })

    tlsSocket.on("error", () => {})

    let buffer = Buffer.alloc(0)

    tlsSocket.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])

      if (!buffer.toString().includes("\r\n\r\n")) return

      const req = parseHttpRequest(buffer)
      if (!req) return

      const modified = onRequest(req)

      const upstreamHeaders: Record<string, string> = {}
      for (const [k, v] of Object.entries(modified.headers)) {
        upstreamHeaders[k] = v
      }
      delete upstreamHeaders["proxy-connection"]
      delete upstreamHeaders["proxy-authorization"]

      const upstreamSocket = tlsConnect({
        host: domain,
        port,
        servername: domain,
        rejectUnauthorized: false,
      })

      upstreamSocket.on("error", () => {
        tlsSocket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n")
      })

      upstreamSocket.on("connect", () => {
        const headerLines = [
          `${modified.method} ${modified.path} HTTP/1.1`,
          `Host: ${domain}`,
          ...Object.entries(upstreamHeaders).map(([k, v]) => `${k}: ${v}`),
          "",
          "",
        ]
        const raw = headerLines.join("\r\n")

        upstreamSocket.write(raw)
        if (modified.body.length > 0) {
          upstreamSocket.write(modified.body)
        }

        tlsSocket.pipe(upstreamSocket).pipe(tlsSocket)
      })
    })
  } catch {
    clientSocket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n")
  }
}

export function startCredentialProxy(
  credentialMap: CredentialMap,
  port = 0,
): Promise<number> {
  return new Promise((resolve, reject) => {
    if (proxyServer) {
      resolve(proxyPort)
      return
    }

    ensureCA()
    proxyCredentialMap = credentialMap

    proxyServer = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "Content-Type": "text/plain" })
        res.end("ok")
        return
      }

      res.writeHead(404)
      res.end("Not Found")
    })

    proxyServer.on("connect", (req: IncomingMessage, clientSocket: Socket, _head: Buffer) => {
      const [domain, portStr] = (req.url ?? "").split(":")
      const targetPort = parseInt(portStr) || 443

      if (!domain) {
        clientSocket.end("HTTP/1.1 400 Bad Request\r\n\r\n")
        return
      }

      const domainCreds = proxyCredentialMap[domain] ?? {}

      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n")

      handleMITM(clientSocket, domain, targetPort, (proxiedReq) => {
        const headers = { ...proxiedReq.headers }
        for (const [hdr, val] of Object.entries(domainCreds)) {
          headers[hdr.toLowerCase()] = val
        }
        return { ...proxiedReq, headers }
      })
    })

    proxyServer.on("error", reject)

    proxyServer.listen(port, "127.0.0.1", () => {
      const addr = proxyServer!.address()
      if (addr && typeof addr === "object") {
        proxyPort = addr.port
        resolve(proxyPort)
      } else {
        reject(new Error("Failed to get proxy port"))
      }
    })
  })
}

export function stopCredentialProxy(): Promise<void> {
  return new Promise((resolve) => {
    if (!proxyServer) {
      resolve()
      return
    }
    proxyServer.close(() => {
      proxyServer = null
      proxyPort = 0
      proxyCredentialMap = {}
      resolve()
    })
  })
}

export function getCredentialProxyPort(): number {
  return proxyPort;
}

export function getCredentialProxyEnv(): Record<string, string> {
  if (!proxyPort || !caDir) return {}
  const proxyUrl = `http://127.0.0.1:${proxyPort}`
  return {
    HTTPS_PROXY: proxyUrl,
    https_proxy: proxyUrl,
    HTTP_PROXY: proxyUrl,
    http_proxy: proxyUrl,
    NODE_EXTRA_CA_CERTS: caCertPath(),
  };
}
