import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../instrumentation", () => ({ axiomEnabled: false }));

vi.mock("../models", () => ({
  resolveModel: (id: string) => id,
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: vi.fn(),
  };
});

import { extractDataWithAI } from "../extract";
import { createUsageTracker } from "../usage";
import { generateText } from "ai";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("extractDataWithAI usage tracking", () => {
  it("records usage when usageTracker is provided", async () => {
    const tracker = createUsageTracker();

    vi.mocked(generateText).mockResolvedValue({
      output: { extractedValue: "abc123" },
      usage: { inputTokens: 200, outputTokens: 30, totalTokens: 230 },
    } as any);

    const result = await extractDataWithAI({
      snapshot: "page content",
      url: "https://example.com?token=abc123",
      prompt: "Extract the token query parameter",
      usageTracker: tracker,
    });

    expect(result).toBe("abc123");

    const usage = tracker.getResult();
    expect(usage.details).toHaveLength(1);
    expect(usage.details[0].operation).toBe("extraction");
    expect(usage.totalTokens).toBe(230);
  });

  it("works without usageTracker (backward compatible)", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: { extractedValue: "value" },
      usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
    } as any);

    const result = await extractDataWithAI({
      snapshot: "content",
      url: "https://example.com",
      prompt: "Extract something",
    });

    expect(result).toBe("value");
  });
});
