export type TokenUsage = {
  model: string;
  operation: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type UsageResult = {
  details: TokenUsage[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
};

type RecordInput = {
  model: string;
  operation: string;
  usage:
    | {
        inputTokens?: number | undefined;
        outputTokens?: number | undefined;
        totalTokens?: number | undefined;
      }
    | undefined;
};

export type UsageTracker = {
  record(input: RecordInput): void;
  merge(other: UsageTracker): void;
  getResult(): UsageResult;
};

export function createUsageTracker(): UsageTracker {
  const details: TokenUsage[] = [];

  return {
    record({ model, operation, usage }: RecordInput) {
      details.push({
        model,
        operation,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        totalTokens: usage?.totalTokens ?? 0,
      });
    },

    merge(other: UsageTracker) {
      const otherResult = other.getResult();
      details.push(...otherResult.details);
    },

    getResult(): UsageResult {
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalTokens = 0;

      for (const d of details) {
        totalInputTokens += d.inputTokens;
        totalOutputTokens += d.outputTokens;
        totalTokens += d.totalTokens;
      }

      return {
        details: [...details],
        totalInputTokens,
        totalOutputTokens,
        totalTokens,
      };
    },
  };
}
