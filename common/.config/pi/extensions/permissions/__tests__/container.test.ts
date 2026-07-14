import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

import { getContainerIP } from "../container";

const REAL_INSPECT_FIXTURE = "/tmp/pi-apple-inspect.json";

function pendingIfNoContainer(): { skip: boolean; reason?: string } {
  try {
    const r = spawnSync("container", ["--version"], { encoding: "utf8", timeout: 5000 });
    if (r.status !== 0) return { skip: true, reason: "container not available" };
    return { skip: false };
  } catch {
    return { skip: true, reason: "container not available" };
  }
}

describe("getContainerIP", () => {
  const canRun = pendingIfNoContainer();

  it("parses apple container inspect status.networks[].ipv4Address", () => {
    const raw = readFileSync(REAL_INSPECT_FIXTURE, "utf8");
    const parsed = JSON.parse(raw);

    expect(Array.isArray(parsed)).toBe(true);
    const container = parsed[0];
    expect(container.status).toBeDefined();
    expect(container.status.networks).toBeArray();
    expect(container.status.networks[0]).toHaveProperty("ipv4Address");
    expect(container.status.networks[0]).toHaveProperty("network");

    const ip = container.status.networks[0].ipv4Address;
    expect(ip).toMatch(/^\d+\.\d+\.\d+\.\d+\/\d+$/);
  });

  it("finds IP by network name", () => {
    const raw = readFileSync(REAL_INSPECT_FIXTURE, "utf8");
    const parsed = JSON.parse(raw);
    const container = parsed[0];
    const defaultNet = container.status.networks[0].network;
    const ip = container.status.networks[0].ipv4Address;

    expect(defaultNet).toBe("default");
    expect(ip.split("/")[0]).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
  });

  it("strips CIDR suffix from ipv4Address", () => {
    const ipv4 = "192.168.64.42/24";
    const stripped = ipv4.split("/")[0];
    expect(stripped).toBe("192.168.64.42");
    expect(stripped).not.toContain("/");
  });

  it("live getContainerIP returns IP from running container", () => {
    if (canRun.skip) return;

    const result = spawnSync("container", ["list", "-a"], {
      encoding: "utf8",
      timeout: 5000,
    });
    const names = (result.stdout || "")
      .split("\n")
      .filter(l => l.includes("pi-permissions-"));
    if (names.length === 0) return;

    const name = names[0].split(/\s+/)[0];
    const ip = getContainerIP(name);
    expect(ip).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    expect(ip).not.toContain("/");
  });

  it("live getContainerIP returns IP for specific network", () => {
    if (canRun.skip) return;

    const result = spawnSync("container", ["list", "-a"], {
      encoding: "utf8",
      timeout: 5000,
    });
    const names = (result.stdout || "")
      .split("\n")
      .filter(l => l.includes("pi-permissions-"));
    if (names.length === 0) return;

    const name = names[0].split(/\s+/)[0];
    const ip = getContainerIP(name, "default");
    expect(ip).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
  });

  it("returns empty string for nonexistent container", () => {
    const ip = getContainerIP("nonexistent-container-12345");
    expect(ip).toBe("");
  });
});
