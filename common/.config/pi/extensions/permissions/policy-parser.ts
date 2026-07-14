import type { SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";

export interface CapabilityPolicy {
  allow?: string[];
  deny?: string[];
}

type TokenHandler = (target: string, config: SandboxRuntimeConfig) => void;

const TOKEN_HANDLERS: Record<string, TokenHandler> = {
  "network": (target, config) => {
    config.network?.allowedDomains?.push(target);
  },
  "fs:read": (target, config) => {
    config.filesystem?.allowRead?.push(target);
  },
  "fs:write": (target, config) => {
    config.filesystem?.allowWrite?.push(target);
  },
  "mach": (target, config) => {
    config.network?.allowMachLookup?.push(target);
  },
  "unix-socket": (target, config) => {
    config.network?.allowUnixSockets?.push(target);
  },
};

export function capabilityToSandboxConfig(policy: CapabilityPolicy): SandboxRuntimeConfig {
  const config: SandboxRuntimeConfig = {
    network: { allowedDomains: [], deniedDomains: [], allowMachLookup: [], allowUnixSockets: [] },
    filesystem: { denyRead: [], allowRead: [], allowWrite: [], denyWrite: [] },
  };

  for (const token of policy.allow ?? []) {
    const parsed = parseToken(token, "allow");
    const handler = TOKEN_HANDLERS[parsed.prefix];
    if (handler) handler(parsed.target, config);
  }

  for (const token of policy.deny ?? []) {
    const parsed = parseToken(token, "deny");
    if (parsed.prefix === "network") {
      config.network?.deniedDomains?.push(parsed.target);
    } else if (parsed.prefix === "fs:read") {
      config.filesystem?.denyRead?.push(parsed.target);
    } else if (parsed.prefix === "fs:write") {
      config.filesystem?.denyWrite?.push(parsed.target);
    }
  }

  return config;
}

function parseToken(token: string, list: "allow" | "deny"): { prefix: string; target: string } {
  for (const prefix of ["network", "fs:read", "fs:write", "mach", "unix-socket"]) {
    if (token.startsWith(prefix + ":")) {
      return { prefix, target: token.slice(prefix.length + 1) };
    }
  }
  throw new Error(`Invalid policy token in ${list} list: "${token}". Expected "network:<domain>", "fs:read:<path>", "fs:write:<path>", or "mach:<service>"`);
}

export function mergeConfigs(base: SandboxRuntimeConfig, ...overrides: Partial<SandboxRuntimeConfig>[]): SandboxRuntimeConfig {
  const merged: SandboxRuntimeConfig = {
    network: {
      allowedDomains: [...(base.network?.allowedDomains ?? [])],
      deniedDomains: [...(base.network?.deniedDomains ?? [])],
      allowLocalBinding: base.network?.allowLocalBinding,
      allowUnixSockets: base.network?.allowUnixSockets ? [...base.network.allowUnixSockets] : [],
      allowAllUnixSockets: base.network?.allowAllUnixSockets,
      tlsTerminate: base.network?.tlsTerminate,
      allowMachLookup: base.network?.allowMachLookup ? [...base.network.allowMachLookup] : [],
    },
    filesystem: {
      denyRead: [...(base.filesystem?.denyRead ?? [])],
      allowRead: [...(base.filesystem?.allowRead ?? [])],
      allowWrite: [...(base.filesystem?.allowWrite ?? [])],
      denyWrite: [...(base.filesystem?.denyWrite ?? [])],
    },
    ignoreViolations: base.ignoreViolations ? { ...base.ignoreViolations } : undefined,
    enableWeakerNestedSandbox: base.enableWeakerNestedSandbox,
    enableWeakerNetworkIsolation: base.enableWeakerNetworkIsolation,
    allowAppleEvents: base.allowAppleEvents,
  };

  for (const override of overrides) {
    if (override.network) {
      if (override.network.allowedDomains) {
        for (const d of override.network.allowedDomains) {
          if (!merged.network!.allowedDomains!.includes(d)) {
            merged.network!.allowedDomains!.push(d);
          }
        }
      }
      if (override.network.deniedDomains) {
        for (const d of override.network.deniedDomains) {
          const inAllowed = merged.network!.allowedDomains!.indexOf(d);
          if (inAllowed !== -1) merged.network!.allowedDomains!.splice(inAllowed, 1);
          if (!merged.network!.deniedDomains!.includes(d)) {
            merged.network!.deniedDomains!.push(d);
          }
        }
      }
      if (override.network.allowLocalBinding !== undefined) merged.network!.allowLocalBinding = override.network.allowLocalBinding;
      if (override.network.allowUnixSockets) {
        merged.network!.allowUnixSockets = [...(merged.network!.allowUnixSockets ?? []), ...override.network.allowUnixSockets];
      }
      if (override.network.allowAllUnixSockets !== undefined) merged.network!.allowAllUnixSockets = override.network.allowAllUnixSockets;
      if (override.network.tlsTerminate !== undefined) merged.network!.tlsTerminate = override.network.tlsTerminate;
      if (override.network.allowMachLookup) {
        for (const m of override.network.allowMachLookup) {
          if (!merged.network!.allowMachLookup!.includes(m)) {
            merged.network!.allowMachLookup!.push(m);
          }
        }
      }
    }
    if (override.filesystem) {
      if (override.filesystem.denyRead) {
        for (const p of override.filesystem.denyRead) {
          const inAllowed = merged.filesystem!.allowRead!.indexOf(p);
          if (inAllowed !== -1) merged.filesystem!.allowRead!.splice(inAllowed, 1);
          if (!merged.filesystem!.denyRead!.includes(p)) {
            merged.filesystem!.denyRead!.push(p);
          }
        }
      }
      if (override.filesystem.allowRead) {
        for (const p of override.filesystem.allowRead) {
          if (!merged.filesystem!.allowRead!.includes(p)) {
            merged.filesystem!.allowRead!.push(p);
          }
        }
      }
      if (override.filesystem.allowWrite) {
        for (const p of override.filesystem.allowWrite) {
          if (!merged.filesystem!.allowWrite!.includes(p)) {
            merged.filesystem!.allowWrite!.push(p);
          }
        }
      }
      if (override.filesystem.denyWrite) {
        for (const p of override.filesystem.denyWrite) {
          const inAllowed = merged.filesystem!.allowWrite!.indexOf(p);
          if (inAllowed !== -1) merged.filesystem!.allowWrite!.splice(inAllowed, 1);
          if (!merged.filesystem!.denyWrite!.includes(p)) {
            merged.filesystem!.denyWrite!.push(p);
          }
        }
      }
    }
    if (override.ignoreViolations) {
      merged.ignoreViolations = { ...merged.ignoreViolations, ...override.ignoreViolations };
    }
    if (override.enableWeakerNestedSandbox !== undefined) merged.enableWeakerNestedSandbox = override.enableWeakerNestedSandbox;
    if (override.enableWeakerNetworkIsolation !== undefined) merged.enableWeakerNetworkIsolation = override.enableWeakerNetworkIsolation;
    if (override.allowAppleEvents !== undefined) merged.allowAppleEvents = override.allowAppleEvents;
  }

  return merged;
}

export function injectMandatoryDenies(config: SandboxRuntimeConfig, extraPaths: string[]): SandboxRuntimeConfig {
  const denyWrite = [...(config.filesystem?.denyWrite ?? [])];
  for (const p of extraPaths) {
    if (!denyWrite.includes(p)) {
      denyWrite.push(p);
    }
  }
  return {
    ...config,
    filesystem: {
      ...config.filesystem,
      denyWrite,
    },
  };
}
