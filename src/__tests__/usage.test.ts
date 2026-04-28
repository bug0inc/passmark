import { describe, it, expect } from "vitest";
import { createUsageTracker } from "../usage";

describe("UsageTracker", () => {
  it("should start with empty state", () => {
    const tracker = createUsageTracker();
    const result = tracker.getResult();

    expect(result.details).toEqual([]);
    expect(result.totalInputTokens).toBe(0);
    expect(result.totalOutputTokens).toBe(0);
    expect(result.totalTokens).toBe(0);
  });

  it("should track a single AI call", () => {
    const tracker = createUsageTracker();
    tracker.record({
      model: "google/gemini-3-flash",
      operation: "stepExecution",
      usage: { inputTokens: 1000, outputTokens: 200, totalTokens: 1200 },
    });

    const result = tracker.getResult();
    expect(result.details).toHaveLength(1);
    expect(result.details[0]).toEqual({
      model: "google/gemini-3-flash",
      operation: "stepExecution",
      inputTokens: 1000,
      outputTokens: 200,
      totalTokens: 1200,
    });
    expect(result.totalTokens).toBe(1200);
  });

  it("should accumulate multiple AI calls", () => {
    const tracker = createUsageTracker();
    tracker.record({
      model: "google/gemini-3-flash",
      operation: "stepExecution",
      usage: { inputTokens: 1000, outputTokens: 200, totalTokens: 1200 },
    });
    tracker.record({
      model: "anthropic/claude-haiku-4.5",
      operation: "assertion",
      usage: { inputTokens: 500, outputTokens: 100, totalTokens: 600 },
    });

    const result = tracker.getResult();
    expect(result.details).toHaveLength(2);
    expect(result.totalInputTokens).toBe(1500);
    expect(result.totalOutputTokens).toBe(300);
    expect(result.totalTokens).toBe(1800);
  });

  it("should handle missing usage data gracefully", () => {
    const tracker = createUsageTracker();
    tracker.record({
      model: "google/gemini-3-flash",
      operation: "stepExecution",
      usage: undefined,
    });

    const result = tracker.getResult();
    expect(result.details).toHaveLength(1);
    expect(result.details[0].inputTokens).toBe(0);
    expect(result.details[0].outputTokens).toBe(0);
    expect(result.details[0].totalTokens).toBe(0);
    expect(result.totalTokens).toBe(0);
  });

  it("should merge another tracker's results", () => {
    const parent = createUsageTracker();
    parent.record({
      model: "google/gemini-3-flash",
      operation: "stepExecution",
      usage: { inputTokens: 1000, outputTokens: 200, totalTokens: 1200 },
    });

    const child = createUsageTracker();
    child.record({
      model: "anthropic/claude-haiku-4.5",
      operation: "assertion",
      usage: { inputTokens: 500, outputTokens: 100, totalTokens: 600 },
    });

    parent.merge(child);

    const result = parent.getResult();
    expect(result.details).toHaveLength(2);
    expect(result.totalTokens).toBe(1800);
  });
});
