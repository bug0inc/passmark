import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../instrumentation", () => ({ axiomEnabled: false }));

vi.mock("../../redis", () => ({
  redis: {
    hgetall: vi.fn().mockResolvedValue({}),
    hset: vi.fn().mockResolvedValue("OK"),
    expire: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: vi.fn(),
    streamText: vi.fn(),
  };
});

vi.mock("axiom/ai", () => ({
  withSpan: vi.fn((_meta: unknown, fn: () => unknown) => fn()),
  wrapAISDKModel: vi.fn((model: unknown) => model),
  wrapTool: vi.fn((_name: unknown, tool: unknown) => tool),
  initAxiomAI: vi.fn(),
  RedactionPolicy: { AxiomDefault: {} },
}));

vi.mock("../../models", () => ({
  resolveModel: vi.fn().mockReturnValue("mocked-model"),
}));

vi.mock("../../tools", () => ({
  getAItools: vi.fn().mockReturnValue({
    tools: {},
    getPendingCacheData: vi.fn().mockReturnValue(null),
    clearPendingCacheData: vi.fn(),
  }),
}));

vi.mock("../../utils", () => ({
  runLocatorCode: vi.fn().mockResolvedValue(undefined),
  safeSnapshot: vi.fn().mockResolvedValue("snapshot content"),
  verifyActionEffect: vi.fn().mockResolvedValue(undefined),
  waitForCondition: vi.fn().mockResolvedValue(undefined),
  waitForDOMStabilization: vi.fn().mockResolvedValue(undefined),
  generatePhoneNumber: vi.fn().mockReturnValue("1234567890"),
  resolvePage: vi.fn((input: unknown) => input),
}));

vi.mock("../../extract", () => ({
  extractDataWithAI: vi.fn().mockResolvedValue("extracted-value"),
}));

vi.mock("../../assertion", () => ({
  assert: vi.fn().mockResolvedValue("assertion passed"),
}));

vi.mock("../../logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../email", () => ({
  extractEmailContent: vi.fn(),
  generateEmail: vi.fn().mockReturnValue("test@example.com"),
}));

vi.mock("../../utils/secure-script-runner", () => ({
  runSecureScript: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../cua", () => ({
  runCUALoop: vi.fn().mockResolvedValue("cua-result"),
  buildRunStepsPromptCUA: vi.fn().mockReturnValue("cua-prompt"),
  buildRunUserFlowPromptCUA: vi.fn().mockReturnValue("cua-userflow-prompt"),
}));

import { runUserFlow } from "../../index";
import { resetConfig } from "../../config";
import { generateText } from "ai";
import type { Page } from "@playwright/test";

function createMockPage() {
  const mockContext = { on: vi.fn(), off: vi.fn() };
  return {
    locator: vi
      .fn()
      .mockReturnValue({ click: vi.fn(), fill: vi.fn(), describe: vi.fn().mockReturnThis() }),
    getByRole: vi.fn().mockReturnValue({ click: vi.fn() }),
    ariaSnapshot: vi.fn().mockResolvedValue("snapshot"),
    screenshot: vi.fn().mockResolvedValue(Buffer.from("fake")),
    url: vi.fn().mockReturnValue("https://example.com"),
    evaluate: vi.fn().mockResolvedValue(undefined),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    context: vi.fn().mockReturnValue(mockContext),
  } as unknown as Page;
}

describe("runUserFlow usage tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetConfig();
  });

  it("returns usage data alongside text result", async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: "Flow completed successfully",
      steps: [],
      usage: { inputTokens: 800, outputTokens: 200, totalTokens: 1000 },
    } as any);

    const result = await runUserFlow({
      page: createMockPage(),
      userFlow: "Test flow",
      steps: "Navigate to page and verify",
    });

    expect(result).toBeDefined();
    expect(result!.text).toBe("Flow completed successfully");
    expect(result!.usage).toBeDefined();
    expect(result!.usage.totalTokens).toBe(1000);
    expect(result!.usage.details[0].operation).toBe("userFlow");
  });

  it("includes assertion usage when assertion is provided", async () => {
    let callCount = 0;
    vi.mocked(generateText).mockImplementation(async (args: any) => {
      callCount++;
      if (callCount === 1) {
        // Main flow execution
        return {
          text: "Done",
          steps: [],
          usage: { inputTokens: 800, outputTokens: 200, totalTokens: 1000 },
        } as any;
      }
      // Assertion parsing call
      return {
        output: { assertionPassed: true, confidenceScore: 90, reasoning: "ok" },
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      } as any;
    });

    const result = await runUserFlow({
      page: createMockPage(),
      userFlow: "Test flow",
      steps: "Navigate and check",
      assertion: "Page shows content",
    });

    expect(result).toBeDefined();
    expect(result!.usage).toBeDefined();
    expect(result!.usage.totalTokens).toBe(1150);
    expect(result!.usage.details).toHaveLength(2);
  });
});
