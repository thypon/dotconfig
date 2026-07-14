# Pi Container Sidecar Proxy — TODO

## Context

`--container` flag launches pi in apple/container. Proxy injects credentials via MITM.
Proxy must run in sidecar container on shared network — host loopback unreachable from container.

## Current state

- **BUG FIXED**: Proxy now runs as sidecar container on shared network (not host loopback).
- **BUG FIXED**: DNS resolution — proxy URL now uses container IP (via `container inspect`) with hostname fallback.
- `credential-proxy.ts`: CA gen + per-domain certs. Spawns mitmdump container (pi-proxy image). Certs mounted via volumes. Polls container via execInContainer. Proxy env = `http://<ip>:8080`.
- `container.ts`: Network-aware (createNetwork/removeNetwork). Image build with hash caching. `getContainerIP()` parses `container inspect` JSON. Supports `command`, `entrypoint`, `network` in ContainerConfig.
- `index.ts`: Network created before containers. Both proxy + main container join same custom network. Session shutdown tears down proxy → main container → network.

## Architecture

```
network: pi-net-<session>  (apple/container custom network)

proxy container (pi-proxy-<session>):
  image: pi-proxy:<sha256> (built once, cached: ubuntu:24.04 + mitmdump)
  ENTRYPOINT cleared via --entrypoint ""
  CMD: mitmdump -p 8080 --listen-host 0.0.0.0 --certs ... --modify-headers ...
  listens on 0.0.0.0:8080
  certs mounted from host at /certs/<domain>.pem:ro
  IP retrieved via: container inspect pi-proxy-<session> → JSON → NetworkSettings.Networks[<net>].IPAddress

main container (pi-permissions-<session>):
  image: ubuntu:24.04 or project .pi/Dockerfile
  uses HTTPS_PROXY=http://<proxy-ip>:8080 (IP, not hostname — Apple's custom networks lack DNS)
  HTTP_PROXY also set
  CA cert mounted at /usr/local/share/ca-certificates/pi-ca.crt:ro
```

## Tasks

### S1. Proxy Dockerfile + image build
- [x] Created `~/.pi/agent/container-proxy/Dockerfile` (ubuntu:24.04 + mitmproxy)
- [x] Added `buildProxyImage()` to `container.ts` — builds with sha256 content hash tag
- [x] Added `ensureProxyImage()` — builds if missing, returns cached tag
- [x] Test: `container image list` shows pi-proxy:sha256 (image list parse fixed)

### S2. Rewrite credential-proxy.ts for sidecar container
- [x] Replaced host mitmdump spawn with container-based mitmdump
- [x] `startCredentialProxy(credMap, network?)` returns `ProxySession { name, port, certDir, ip }`
- [x] `stopCredentialProxy()` → `stopContainer()` + cleanup certDir
- [x] `getCredentialProxyEnv()` → `http://<ip>:8080` (IP from inspect, hostname fallback)
- [x] No host mitmdump process, no port allocation via net.createServer
- [x] Fixed Buffer.concat type error with `as any` cast

### S3. Update index.ts container init
- [x] `container.ts`: Added `network`, `command`, `entrypoint` to ContainerConfig
- [x] `container.ts`: Added `createNetwork()`, `removeNetwork()`, `getContainerIP()`
- [x] `container.ts`: `startContainer` handles `--network`, `--entrypoint`, command
- [x] `index.ts`: Creates `pi-net-<timestamp>` shared network
- [x] `index.ts`: Passes networkName to `startCredentialProxy(credMap, networkName)`
- [x] `index.ts`: Main container joins same network via `network: networkName`
- [x] `index.ts`: Proxy env uses container IP (via getCredentialProxyEnv)
- [x] `index.ts`: Session shutdown: stop proxy → stop main container → `container network rm`
- [x] Removed unused `getCredentialProxyPort` import

### S4. Container trust store
- [x] Proxy Dockerfile updated: includes `curl` + `ca-certificates` for health polling
- [x] CA cert mount + `update-ca-certificates` in index.ts (L425–458)
- [x] Verify: `curl -x http://<proxy-ip>:8080 https://api.github.com` goes through proxy (proxy IP now resolved via container inspect)
- [ ] Verify: `curl https://api.github.com` uses HTTPS_PROXY env + trusts CA cert

### S5. E2E test
- [x] `!apt update` — was failing with DNS error on proxy hostname. Fix: proxy URL now uses
  IP from `container inspect`. Re-test. (getContainerIP fixed for apple schema)
- [ ] `pi -p --container --no-sandbox "curl -s https://example.com"` works
- [ ] With credentials: MITM injects headers, upstream works
- [ ] Verify proxy health: pollProxyContainer exits cleanly
- [ ] Verify cert generation: per-domain certs in tmpdir, mounted as volumes

### S6. Cleanup
- [x] Removed 5 debug `console.error` calls from `index.ts`
- [x] Kept `container.ts` L171: `Container stop warning` — real error path
- [x] No `--ssl-insecure` references in any `.ts` source
- [ ] Commit
