import { describe, it, expect, afterEach } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { resolveDynamicModel } from "../model-router";

let dir: string;

function setup(settings: object | null, models: object | null): void {
  dir = mkdtempSync(join(tmpdir(), "model-router-"));
  if (settings !== null) {
    writeFileSync(join(dir, "settings.json"), JSON.stringify(settings));
  }
  if (models !== null) {
    writeFileSync(join(dir, "models.jsonc"), JSON.stringify(models));
  }
}

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const MODELS = {
  providers: {
    openrouter: {
      model: "openrouter/z-ai/glm-5.3",
      small_model: "openrouter/z-ai/glm-5.3-flash",
      frontier_model: "openrouter/z-ai/glm-5.3",
      antagonist_model: "openrouter/openai/gpt-5.6-terra",
    },
  },
};

describe("resolveDynamicModel", () => {
  it("resolves dynamic/model from active provider", async () => {
    setup({ defaultProvider: "openrouter" }, MODELS);
    const got = await resolveDynamicModel("dynamic/model", {
      settingsPath: join(dir, "settings.json"),
      modelsPath: join(dir, "models.jsonc"),
    });
    expect(got).toBe("openrouter/z-ai/glm-5.3");
  });

  it("routes dynamic/small_model to local ds4 when probe passes and model is flash", async () => {
    setup({ defaultProvider: "openrouter" }, MODELS);
    const got = await resolveDynamicModel("dynamic/small_model", {
      settingsPath: join(dir, "settings.json"),
      modelsPath: join(dir, "models.jsonc"),
      probeDs4: async () => true,
    });
    expect(got).toBe("ds4/glm-5.3-flash");
  });

  it("resolves dynamic/small_model remotely when probe fails", async () => {
    setup({ defaultProvider: "openrouter" }, MODELS);
    const got = await resolveDynamicModel("dynamic/small_model", {
      settingsPath: join(dir, "settings.json"),
      modelsPath: join(dir, "models.jsonc"),
      probeDs4: async () => false,
    });
    expect(got).toBe("openrouter/z-ai/glm-5.3-flash");
  });

  it("does not rewrite small_model that is not the ds4 flash model", async () => {
    const models = {
      providers: {
        venice: {
          model: "venice/deepseek-v4-pro",
          small_model: "openrouter/z-ai/glm-5.3",
        },
      },
    };
    setup({ defaultProvider: "venice" }, models);
    const got = await resolveDynamicModel("dynamic/small_model", {
      settingsPath: join(dir, "settings.json"),
      modelsPath: join(dir, "models.jsonc"),
      probeDs4: async () => true,
    });
    expect(got).toBe("openrouter/z-ai/glm-5.3");
  });

  it("returns null for non-dynamic token", async () => {
    setup({ defaultProvider: "openrouter" }, MODELS);
    const got = await resolveDynamicModel("openrouter/z-ai/glm-5.3", {
      settingsPath: join(dir, "settings.json"),
      modelsPath: join(dir, "models.jsonc"),
    });
    expect(got).toBeNull();
  });

  it("returns null when files missing", async () => {
    setup(null, null);
    const got = await resolveDynamicModel("dynamic/model", {
      settingsPath: join(dir, "missing-settings.json"),
      modelsPath: join(dir, "missing-models.jsonc"),
    });
    expect(got).toBeNull();
  });
});
