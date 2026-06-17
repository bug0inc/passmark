import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { normalizedAnthropicBaseURL } from "../models";

describe("normalizedAnthropicBaseURL", () => {
  const original = process.env.ANTHROPIC_BASE_URL;

  beforeEach(() => {
    delete process.env.ANTHROPIC_BASE_URL;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.ANTHROPIC_BASE_URL;
    } else {
      process.env.ANTHROPIC_BASE_URL = original;
    }
  });

  it("returns undefined when ANTHROPIC_BASE_URL is unset", () => {
    expect(normalizedAnthropicBaseURL()).toBeUndefined();
  });

  it("appends /v1 to a bare host (Claude Code / Cursor style)", () => {
    process.env.ANTHROPIC_BASE_URL = "https://api.anthropic.com";
    expect(normalizedAnthropicBaseURL()).toBe("https://api.anthropic.com/v1");
  });

  it("trims a trailing slash before appending /v1", () => {
    process.env.ANTHROPIC_BASE_URL = "https://api.anthropic.com/";
    expect(normalizedAnthropicBaseURL()).toBe("https://api.anthropic.com/v1");
  });

  it("leaves a value that already ends in /v1 unchanged", () => {
    process.env.ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
    expect(normalizedAnthropicBaseURL()).toBe("https://api.anthropic.com/v1");
  });

  it("leaves a value that ends in /v1/ unchanged", () => {
    process.env.ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1/";
    expect(normalizedAnthropicBaseURL()).toBe("https://api.anthropic.com/v1/");
  });

  it("normalizes a custom proxy host", () => {
    process.env.ANTHROPIC_BASE_URL = "https://proxy.internal/anthropic";
    expect(normalizedAnthropicBaseURL()).toBe("https://proxy.internal/anthropic/v1");
  });
});
