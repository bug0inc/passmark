import { describe, it, expect, vi, beforeEach } from "vitest";

// Disable Axiom instrumentation
vi.mock("../instrumentation", () => ({ axiomEnabled: false }));

// Mock models.resolveModel to return the model id string so our AI mock can
// branch based on the model identifier.
vi.mock("../models", () => ({
  resolveModel: (id: string) => id,
}));

// Mock logger to silence output
vi.mock("../logger", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock the AI SDK - return mocked functions we can control in tests
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: vi.fn(),
    generateObject: vi.fn(),
    streamText: vi.fn(),
  };
});

// Mock utils used by the assertion flow
vi.mock("../utils", () => ({
  safeSnapshot: vi.fn().mockResolvedValue("snapshot content"),
  withTimeout: vi.fn((p: Promise<unknown>) => p),
}));

import { assert } from "../assertion";
import { withTimeout } from "../utils";
import { generateText, generateObject } from "ai";

function createMockPage() {
  return {
    screenshot: vi.fn().mockResolvedValue(Buffer.from("fake-screenshot")),
    _snapshotForAI: vi.fn().mockResolvedValue("snapshot content"),
  } as any;
}

const mockTest = { info: () => ({ annotations: [] }) } as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("assert consensus logic", () => {
  it("returns pass when both models agree", async () => {
    const page = createMockPage();

    // Claude returns text then get converted to object
    vi.mocked(generateText).mockResolvedValue({ text: "claude text" });

    vi.mocked(generateObject).mockImplementation(async (opts: any) => {
      const model = String(opts.model ?? "");
      if (model.includes("anthropic")) {
        return { object: { assertionPassed: true, confidenceScore: 90, reasoning: "Claude: looks good" } };
      }
      if (model.includes("gemini-3-flash")) {
        return { object: { assertionPassed: true, confidenceScore: 80, reasoning: "Gemini: OK" } };
      }
      // Arbiter (not used here) fallback
      return { object: { assertionPassed: true, confidenceScore: 85, reasoning: "Arbiter: OK" } };
    });

    const res = await assert({
      page,
      assertion: "The page shows 3 items",
      test: mockTest,
      expect: ((a: unknown, _m?: string) => ({ toBe: (_v: unknown) => {} })) as any,
      failSilently: true,
    });

    expect(res).toContain("✅ passed");
    expect(res).toContain("Gemini: OK");
    expect(generateText).toHaveBeenCalled();
    expect(generateObject).toHaveBeenCalled();
  });

  it("returns fail when both models agree failure", async () => {
    const page = createMockPage();

    vi.mocked(generateText).mockResolvedValue({ text: "claude text" });

    vi.mocked(generateObject).mockImplementation(async (opts: any) => {
      const model = String(opts.model ?? "");
      if (model.includes("anthropic")) {
        return { object: { assertionPassed: false, confidenceScore: 20, reasoning: "Claude: not found" } };
      }
      if (model.includes("gemini-3-flash")) {
        return { object: { assertionPassed: false, confidenceScore: 10, reasoning: "Gemini: nope" } };
      }
      return { object: { assertionPassed: false, confidenceScore: 5, reasoning: "Arbiter: nope" } };
    });

    const res = await assert({
      page,
      assertion: "The page shows 3 items",
      test: mockTest,
      expect: ((a: unknown, _m?: string) => ({ toBe: (_v: unknown) => {} })) as any,
      failSilently: true,
    });

    expect(res).toContain("❌ failed");
    expect(res).toContain("Gemini: nope");
  });

  it("consults arbiter when models disagree and arbiter decides pass", async () => {
    const page = createMockPage();

    vi.mocked(generateText).mockResolvedValue({ text: "claude text" });

    vi.mocked(generateObject).mockImplementation(async (opts: any) => {
      const model = String(opts.model ?? "");
      if (model.includes("anthropic")) {
        return { object: { assertionPassed: true, confidenceScore: 95, reasoning: "Claude: yes" } };
      }
      if (model.includes("gemini-3-flash")) {
        return { object: { assertionPassed: false, confidenceScore: 30, reasoning: "Gemini: no" } };
      }
      if (model.includes("3.1-pro-preview")) {
        return { object: { assertionPassed: true, confidenceScore: 70, reasoning: "Arbiter: I side with Claude" } };
      }
      return { object: { assertionPassed: false, confidenceScore: 0, reasoning: "unknown" } };
    });

    const res = await assert({
      page,
      assertion: "The page shows 3 items",
      test: mockTest,
      expect: ((a: unknown, _m?: string) => ({ toBe: (_v: unknown) => {} })) as any,
      failSilently: true,
    });

    expect(res).toContain("✅ passed");
    expect(res).toContain("Arbiter: I side with Claude");
  });

  it("consults arbiter when models disagree and arbiter decides fail", async () => {
    const page = createMockPage();

    vi.mocked(generateText).mockResolvedValue({ text: "claude text" });

    vi.mocked(generateObject).mockImplementation(async (opts: any) => {
      const model = String(opts.model ?? "");
      if (model.includes("anthropic")) {
        return { object: { assertionPassed: true, confidenceScore: 60, reasoning: "Claude: yes" } };
      }
      if (model.includes("gemini-3-flash")) {
        return { object: { assertionPassed: false, confidenceScore: 40, reasoning: "Gemini: no" } };
      }
      if (model.includes("3.1-pro-preview")) {
        return { object: { assertionPassed: false, confidenceScore: 45, reasoning: "Arbiter: I disagree, it fails" } };
      }
      return { object: { assertionPassed: false, confidenceScore: 0, reasoning: "unknown" } };
    });

    const res = await assert({
      page,
      assertion: "The page shows 3 items",
      test: mockTest,
      expect: ((a: unknown, _m?: string) => ({ toBe: (_v: unknown) => {} })) as any,
      failSilently: true,
    });

    expect(res).toContain("❌ failed");
    expect(res).toContain("Arbiter: I disagree, it fails");
  });

  it("retries once on transient model errors and succeeds", async () => {
    const page = createMockPage();

    vi.mocked(generateText).mockResolvedValue({ text: "claude text" });

    let geminiCalls = 0;
    vi.mocked(generateObject).mockImplementation(async (opts: any) => {
      const model = String(opts.model ?? "");
      if (model.includes("anthropic")) {
        return { object: { assertionPassed: true, confidenceScore: 90, reasoning: "Claude: ok" } };
      }
      if (model.includes("gemini-3-flash")) {
        geminiCalls += 1;
        if (geminiCalls === 1) {
          throw new Error("transient model error");
        }
        return { object: { assertionPassed: true, confidenceScore: 80, reasoning: "Gemini: ok after retry" } };
      }
      return { object: { assertionPassed: true, confidenceScore: 50, reasoning: "arbiter" } };
    });

    const res = await assert({
      page,
      assertion: "The page shows 3 items",
      test: mockTest,
      expect: ((a: unknown, _m?: string) => ({ toBe: (_v: unknown) => {} })) as any,
      failSilently: true,
    });

    expect(res).toContain("✅ passed");
    expect(res).toContain("Gemini: ok after retry");
    expect(geminiCalls).toBeGreaterThanOrEqual(2);
  });

  it("retries when model wrapper times out (withTimeout rejection)", async () => {
    const page = createMockPage();

    // Make withTimeout reject once to simulate timeout
    vi.mocked(withTimeout).mockImplementationOnce(() => Promise.reject(new Error("timed out")) as any);

    vi.mocked(generateText).mockResolvedValue({ text: "claude text" });

    vi.mocked(generateObject).mockImplementation(async (opts: any) => {
      const model = String(opts.model ?? "");
      if (model.includes("anthropic")) {
        return { object: { assertionPassed: true, confidenceScore: 90, reasoning: "Claude: ok" } };
      }
      if (model.includes("gemini-3-flash")) {
        return { object: { assertionPassed: true, confidenceScore: 80, reasoning: "Gemini: ok" } };
      }
      return { object: { assertionPassed: true, confidenceScore: 50, reasoning: "arbiter" } };
    });

    const res = await assert({
      page,
      assertion: "The page shows 3 items",
      test: mockTest,
      expect: ((a: unknown, _m?: string) => ({ toBe: (_v: unknown) => {} })) as any,
      failSilently: true,
    });

    expect(res).toContain("✅ passed");
  });
});
