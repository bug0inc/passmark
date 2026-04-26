import { describe, it, expect, beforeEach } from "vitest";
import { trackUsage, getTotalCost, resetCostTracker } from "../cost";
import { configure, resetConfig } from "../config";
import { BudgetExceededError } from "../errors";

describe("Cost Tracking", () => {
  beforeEach(async () => {
    await resetCostTracker();
    resetConfig();
  });

  it("should track usage for a known model and calculate correct cost", async () => {
    // google/gemini-3-flash: $0.075 / 1M input, $0.30 / 1M output
    await trackUsage("google/gemini-3-flash", { promptTokens: 1_000_000, completionTokens: 2_000_000 });
    // Cost should be 0.075 + 2 * 0.30 = 0.675
    expect(await getTotalCost()).toBeCloseTo(0.675);
  });

  it("should match model ignoring prefix if exact match not found", async () => {
    // This matches the suffix "gemini-3-flash"
    await trackUsage("custom-provider/gemini-3-flash", { promptTokens: 2_000_000, completionTokens: 1_000_000 });
    // Cost should be 2 * 0.075 + 0.30 = 0.45
    expect(await getTotalCost()).toBeCloseTo(0.45);
  });

  it("should accumulate costs across multiple calls", async () => {
    await trackUsage("google/gemini-3-flash", { promptTokens: 1_000_000, completionTokens: 0 }); // 0.075
    await trackUsage("anthropic/claude-haiku-4.5", { promptTokens: 1_000_000, completionTokens: 1_000_000 }); // 0.25 + 1.25 = 1.50
    expect(await getTotalCost()).toBeCloseTo(1.575);
  });

  it("should throw BudgetExceededError if cost exceeds maxCostPerRun", async () => {
    configure({ maxCostPerRun: 1.0 });

    await trackUsage("google/gemini-3-flash", { promptTokens: 1_000_000, completionTokens: 1_000_000 }); // 0.375
    expect(await getTotalCost()).toBeCloseTo(0.375);

    await expect(async () => {
      // 1M prompt + 3M completion = 0.25 + 3.75 = 4.00
      await trackUsage("anthropic/claude-haiku-4.5", { promptTokens: 1_000_000, completionTokens: 3_000_000 });
    }).rejects.toThrow(BudgetExceededError);
    
    // The cost still accumulated
    expect(await getTotalCost()).toBeCloseTo(4.375);
  });

  it("should not throw if maxCostPerRun is not set", async () => {
    await expect(async () => {
      await trackUsage("gpt-5.5", { promptTokens: 10_000_000, completionTokens: 10_000_000 }); // 50 + 150 = 200
    }).not.toThrow();
    expect(await getTotalCost()).toBeCloseTo(200);
  });

  it("should fallback to gemini-3-flash pricing for unknown models", async () => {
    await trackUsage("unknown/model", { promptTokens: 1_000_000, completionTokens: 1_000_000 });
    expect(await getTotalCost()).toBeCloseTo(0.375);
  });
  
  it("should use custom pricing if configured", async () => {
    configure({ pricing: { "my-model": { input: 1.0, output: 2.0 } } });
    await trackUsage("my-model", { promptTokens: 1_000_000, completionTokens: 1_000_000 });
    expect(await getTotalCost()).toBeCloseTo(3.0);
  });
});
