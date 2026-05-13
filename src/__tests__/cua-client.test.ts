import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { configure, resetConfig } from "../config";
import { getOpenAIClient, resetOpenAIClient } from "../cua/client";
import { ConfigurationError } from "../errors";

describe("cua/client/getOpenAIClient", () => {
  const originalEnv = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    resetConfig();
    resetOpenAIClient();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalEnv;
    }
  });

  it("throws ConfigurationError when gateway argument is not 'none'", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    expect(() => getOpenAIClient("openrouter")).toThrow(ConfigurationError);
    expect(() => getOpenAIClient("openrouter")).toThrow(/gateway: "none"/);
  });

  it("throws ConfigurationError when OPENAI_API_KEY is missing", () => {
    delete process.env.OPENAI_API_KEY;
    expect(() => getOpenAIClient()).toThrow(ConfigurationError);
    expect(() => getOpenAIClient()).toThrow(/OPENAI_API_KEY/);
  });

  it("returns a client when gateway is 'none' and key is set", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const client = getOpenAIClient("none");
    expect(client).toBeDefined();
    // Singleton: second call returns the same instance.
    expect(getOpenAIClient("none")).toBe(client);
  });

  it("succeeds with gateway='none' even when global gateway is non-none (hybrid case)", () => {
    // Per-step override path: global says openrouter, but a CUA step resolves
    // its gateway to 'none' and passes that explicitly.
    configure({ ai: { gateway: "openrouter" } });
    process.env.OPENAI_API_KEY = "sk-test";
    const client = getOpenAIClient("none");
    expect(client).toBeDefined();
  });
});
