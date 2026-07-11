import { describe, it, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  capabilityToSandboxConfig,
  mergeConfigs,
  injectMandatoryDenies,
  type CapabilityPolicy,
} from "../policy-parser";
import {
  hashString,
  projectCacheDir,
  policyContentHash,
  loadPolicyCache,
  savePolicyCache,
} from "../cache";
import type { SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";

describe("capabilityToSandboxConfig", () => {
  it("parses allow list into network + filesystem config", () => {
    const policy: CapabilityPolicy = {
      allow: [
        "network:npmjs.org",
        "network:github.com",
        "fs:write:.",
        "fs:write:/tmp",
        "fs:read:.",
      ],
    };
    const config = capabilityToSandboxConfig(policy);
    expect(config.network!.allowedDomains).toEqual(["npmjs.org", "github.com"]);
    expect(config.filesystem!.allowWrite).toEqual([".", "/tmp"]);
    expect(config.filesystem!.allowRead).toEqual(["."]);
    expect(config.network!.deniedDomains).toEqual([]);
    expect(config.filesystem!.denyRead).toEqual([]);
    expect(config.filesystem!.denyWrite).toEqual([]);
  });

  it("parses deny list into deny config", () => {
    const policy: CapabilityPolicy = {
      deny: [
        "network:*.evil.com",
        "fs:read:~/.ssh",
        "fs:read:~/.aws",
        "fs:write:.env",
        "fs:write:*.pem",
      ],
    };
    const config = capabilityToSandboxConfig(policy);
    expect(config.network!.deniedDomains).toEqual(["*.evil.com"]);
    expect(config.filesystem!.denyRead).toEqual(["~/.ssh", "~/.aws"]);
    expect(config.filesystem!.denyWrite).toEqual([".env", "*.pem"]);
    expect(config.network!.allowedDomains).toEqual([]);
    expect(config.filesystem!.allowWrite).toEqual([]);
    expect(config.filesystem!.allowRead).toEqual([]);
  });

  it("combines allow and deny in single policy", () => {
    const policy: CapabilityPolicy = {
      allow: ["network:github.com", "fs:write:./src"],
      deny: ["fs:read:~/.ssh", "fs:write:.env"],
    };
    const config = capabilityToSandboxConfig(policy);
    expect(config.network!.allowedDomains).toEqual(["github.com"]);
    expect(config.filesystem!.allowWrite).toEqual(["./src"]);
    expect(config.filesystem!.denyRead).toEqual(["~/.ssh"]);
    expect(config.filesystem!.denyWrite).toEqual([".env"]);
  });

  it("throws on unknown token prefix", () => {
    const policy: CapabilityPolicy = {
      allow: ["bad:something"],
    };
    expect(() => capabilityToSandboxConfig(policy)).toThrow("Invalid policy token");
  });

  it("handles empty policy", () => {
    const config = capabilityToSandboxConfig({});
    expect(config.network!.allowedDomains).toEqual([]);
    expect(config.network!.deniedDomains).toEqual([]);
    expect(config.filesystem!.denyRead).toEqual([]);
    expect(config.filesystem!.allowRead).toEqual([]);
    expect(config.filesystem!.allowWrite).toEqual([]);
    expect(config.filesystem!.denyWrite).toEqual([]);
  });
});

describe("mergeConfigs", () => {
  function makeBase(): SandboxRuntimeConfig {
    return {
      network: {
        allowedDomains: ["github.com", "npmjs.org"],
        deniedDomains: [],
      },
      filesystem: {
        denyRead: ["~/.ssh"],
        allowRead: [],
        allowWrite: [".", "/tmp"],
        denyWrite: [".env"],
      },
    };
  }

  it("returns base when no overrides", () => {
    const base = makeBase();
    const merged = mergeConfigs(base);
    expect(merged.network!.allowedDomains).toEqual(["github.com", "npmjs.org"]);
    expect(merged.filesystem!.allowWrite).toEqual([".", "/tmp"]);
  });

  it("merges allow domains (union)", () => {
    const base = makeBase();
    const merged = mergeConfigs(base, { network: { allowedDomains: ["pypi.org"], deniedDomains: [] } });
    expect(merged.network!.allowedDomains).toEqual(["github.com", "npmjs.org", "pypi.org"]);
  });

  it("deny removes from allow (deny wins)", () => {
    const base = makeBase();
    const merged = mergeConfigs(base, { network: { allowedDomains: [], deniedDomains: ["npmjs.org"] } });
    expect(merged.network!.allowedDomains).toEqual(["github.com"]);
    expect(merged.network!.deniedDomains).toEqual(["npmjs.org"]);
  });

  it("merges denyRead (union) and removes from allowRead", () => {
    const base = makeBase();
    base.filesystem!.allowRead = ["."];
    const merged = mergeConfigs(base, { filesystem: { denyRead: ["."], allowWrite: [], denyWrite: [] } });
    expect(merged.filesystem!.allowRead).toEqual([]);
    expect(merged.filesystem!.denyRead).toEqual(["~/.ssh", "."]);
  });

  it("merges allowWrite (union)", () => {
    const base = makeBase();
    const merged = mergeConfigs(base, { filesystem: { denyRead: [], allowWrite: ["./build"], denyWrite: [] } });
    expect(merged.filesystem!.allowWrite).toEqual([".", "/tmp", "./build"]);
  });

  it("denyWrite removes from allowWrite (deny wins)", () => {
    const base = makeBase();
    base.filesystem!.allowWrite = [".", "/tmp", "./out"];
    const merged = mergeConfigs(base, { filesystem: { denyRead: [], allowWrite: [], denyWrite: ["./out"] } });
    expect(merged.filesystem!.allowWrite).toEqual([".", "/tmp"]);
    expect(merged.filesystem!.denyWrite).toEqual([".env", "./out"]);
  });

  it("merges multiple overrides in order", () => {
    const base = makeBase();
    const merged = mergeConfigs(
      base,
      { network: { allowedDomains: ["pypi.org"], deniedDomains: [] } },
      {
        network: { allowedDomains: [], deniedDomains: ["pypi.org"] },
        filesystem: { denyRead: [], allowWrite: ["./artifacts"], denyWrite: [] },
      },
    );
    expect(merged.network!.allowedDomains).toEqual(["github.com", "npmjs.org"]);
    expect(merged.network!.deniedDomains).toEqual(["pypi.org"]);
    expect(merged.filesystem!.allowWrite).toEqual([".", "/tmp", "./artifacts"]);
  });

  it("handles empty overrides", () => {
    const base = makeBase();
    const merged = mergeConfigs(base, {});
    expect(merged.network!.allowedDomains).toEqual(["github.com", "npmjs.org"]);
  });
});

describe("injectMandatoryDenies", () => {
  function makeConfig(): SandboxRuntimeConfig {
    return {
      network: { allowedDomains: [], deniedDomains: [] },
      filesystem: {
        denyRead: [],
        allowRead: [],
        allowWrite: [".", "/tmp"],
        denyWrite: [".env"],
      },
    };
  }

  it("adds extra paths to denyWrite", () => {
    const result = injectMandatoryDenies(makeConfig(), ["POLICY.md", "cache.json"]);
    expect(result.filesystem!.denyWrite).toEqual([".env", "POLICY.md", "cache.json"]);
  });

  it("does not duplicate existing denyWrite entries", () => {
    const result = injectMandatoryDenies(makeConfig(), [".env", "new.file"]);
    expect(result.filesystem!.denyWrite).toEqual([".env", "new.file"]);
  });

  it("does not modify original config", () => {
    const config = makeConfig();
    const result = injectMandatoryDenies(config, ["extra"]);
    expect(config.filesystem!.denyWrite).toEqual([".env"]);
    expect(result.filesystem!.denyWrite).toEqual([".env", "extra"]);
  });

  it("does not remove from allowWrite", () => {
    const result = injectMandatoryDenies(makeConfig(), ["."]);
    expect(result.filesystem!.allowWrite).toEqual([".", "/tmp"]);
    expect(result.filesystem!.denyWrite).toEqual([".env", "."]);
  });
});

describe("cache", () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "policy-cache-test-"));

  it("hashString produces consistent output", () => {
    const a = hashString("hello");
    const b = hashString("hello");
    const c = hashString("world");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(16);
  });

  it("projectCacheDir uses hash of cwd", () => {
    const dir = projectCacheDir("/Users/test/project");
    expect(dir).toContain("policy-cache");
  });

  it("policyContentHash produces consistent output", () => {
    const h1 = policyContentHash("src1", "src2", { key: "val" });
    const h2 = policyContentHash("src1", "src2", { key: "val" });
    const h3 = policyContentHash("src1", "src2", { key: "diff" });
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).toHaveLength(16);
  });

  it("policyContentHash handles null sources", () => {
    const h = policyContentHash(null, null, null);
    expect(h).toHaveLength(16);
  });

  it("savePolicyCache and loadPolicyCache roundtrip", () => {
    const projectDir = join(tmpDir, hashString("/tmp/test"));
    const hash = "a1b2c3d4e5f6a7b8";
    const config: SandboxRuntimeConfig = {
      network: { allowedDomains: ["github.com"], deniedDomains: [] },
      filesystem: { denyRead: [], allowRead: [], allowWrite: ["."], denyWrite: [] },
    };
    savePolicyCache(projectDir, hash, config);
    const loaded = loadPolicyCache(projectDir, hash);
    expect(loaded).toEqual(config);
  });

  it("loadPolicyCache returns null on miss", () => {
    const projectDir = join(tmpDir, hashString("/tmp/test"));
    const result = loadPolicyCache(projectDir, "nonexistent");
    expect(result).toBeNull();
  });

  it("loadPolicyCache returns null on corrupt file", () => {
    const projectDir = join(tmpDir, hashString("/tmp/test-corrupt"));
    const hash = "corrupt-hash";
    savePolicyCache(projectDir, hash, { network: { allowedDomains: [], deniedDomains: [] }, filesystem: { denyRead: [], allowRead: [], allowWrite: [], denyWrite: [] } });
    writeFileSync(join(projectDir, `${hash}.json`), "garbage");
    const result = loadPolicyCache(projectDir, hash);
    expect(result).toBeNull();
  });

  rmSync(tmpDir, { recursive: true, force: true });
});
