export type EmailProvider = {
  /** Domain for generating test emails (e.g. "emailsink.dev") */
  domain: string;
  /**
   * Function to extract content from an email.
   * Called with the email address and a prompt describing what to extract.
   * Should return the extracted string value.
   */
  extractContent: (params: { email: string; prompt: string }) => Promise<string>;
};

export type AIGateway = "vercel" | "openrouter" | "cloudflare" | "none";

/**
 * Execution mode for browser automation.
 * - "snapshot" (default): ARIA accessibility snapshot + aria-ref locators (works with any gateway).
 * - "cua": OpenAI Responses API with the built-in `computer` tool — visual, coordinate-based
 *   actions. Requires OPENAI_API_KEY and gateway: "none".
 */
export type AIMode = "snapshot" | "cua";

export type ModelConfig = {
  /** Model for executing individual steps. Default: google/gemini-3-flash */
  stepExecution?: string;
  /** Model for running user flows (low effort). Default: google/gemini-3-flash-preview */
  userFlowLow?: string;
  /** Model for running user flows (high effort). Default: google/gemini-3.1-pro-preview */
  userFlowHigh?: string;
  /** Model for assertions (primary). Default: anthropic/claude-haiku-4.5 */
  assertionPrimary?: string;
  /** Model for assertions (secondary). Default: google/gemini-3-flash */
  assertionSecondary?: string;
  /** Model for assertion arbiter. Default: google/gemini-3.1-pro-preview */
  assertionArbiter?: string;
  /** Model for data extraction, wait conditions, and lightweight tasks. Default: google/gemini-2.5-flash */
  utility?: string;
  /**
   * Model for CUA mode (OpenAI Responses API + built-in `computer` tool).
   * Locked to "gpt-5.5" — passing this field to `configure()` currently throws.
   * Override may be re-enabled in a future release.
   */
  cua?: string;
};

export const DEFAULT_MODELS: Required<ModelConfig> = {
  stepExecution: "google/gemini-3-flash",
  userFlowLow: "google/gemini-3-flash",
  userFlowHigh: "google/gemini-3.1-pro-preview",
  assertionPrimary: "anthropic/claude-haiku-4.5",
  assertionSecondary: "google/gemini-3-flash",
  assertionArbiter: "google/gemini-3.1-pro-preview",
  utility: "google/gemini-2.5-flash",
  cua: "gpt-5.5",
};

/**
 * Per-call / per-step override of the global `ai` config. Same shape as
 * `Config["ai"]`, all fields optional. Used by `runSteps`, individual `Step`s,
 * and `runUserFlow` to switch mode/gateway/models for part of a run without
 * touching `configure()`.
 */
export type AIOverride = {
  gateway?: AIGateway;
  mode?: AIMode;
  models?: ModelConfig;
};

type Config = {
  email?: EmailProvider;
  ai?: AIOverride;
  /** Base path for file uploads. Default: "./uploads" */
  uploadBasePath?: string;
};

let globalConfig: Config = {};

/**
 * Sets global configuration for Passmark. Call once before using any functions.
 * Subsequent calls merge with existing config (does not reset unset fields).
 *
 * @param config - Configuration options for AI gateway, models, email, and uploads
 *
 * @example
 * ```typescript
 * configure({
 *   ai: { gateway: "none", models: { stepExecution: "google/gemini-3-flash" } },
 *   email: { domain: "test.com", extractContent: async ({ email, prompt }) => "..." },
 * });
 * ```
 */
export function configure(config: Config) {
  if (config.ai?.models?.cua !== undefined) {
    throw new Error(
      `[passmark] ai.models.cua is not user-configurable — CUA mode is locked to "${DEFAULT_MODELS.cua}". ` +
      `Remove the "cua" field from configure({ ai: { models } }).`,
    );
  }
  globalConfig = { ...globalConfig, ...config };
}

/**
 * Returns the current global configuration.
 */
export function getConfig(): Config {
  return globalConfig;
}

/**
 * Returns the configured model ID for a given use case, falling back to the default.
 *
 * @param key - The model use case key (e.g. "stepExecution", "utility")
 * @returns The model identifier string (e.g. "google/gemini-3-flash")
 */
export function getModelId(key: keyof ModelConfig): string {
  return getConfig().ai?.models?.[key] ?? DEFAULT_MODELS[key];
}

/**
 * Returns the configured execution mode ("snapshot" | "cua").
 * Defaults to "snapshot" so existing users see no behavior change.
 */
export function getMode(): AIMode {
  return getConfig().ai?.mode ?? "snapshot";
}

/**
 * Effective AI config for a single step / call after merging overrides with
 * the global config. `getModelId` looks up a model with the same precedence
 * as the layer search.
 */
export type ResolvedAI = {
  mode: AIMode;
  gateway: AIGateway;
  getModelId: (key: keyof ModelConfig) => string;
};

const CUA_LOCK_MESSAGE =
  `[passmark] ai.models.cua is not user-configurable — CUA mode is locked to "${DEFAULT_MODELS.cua}". ` +
  `Remove the "cua" field from your ai config.`;

/**
 * Merge AI overrides into the global config. Later args win.
 *
 * Precedence (right-to-left): the last override wins, then earlier overrides,
 * then the global `configure()` value, then `DEFAULT_MODELS`.
 *
 * Example: `resolveAI(callLevelAi, stepAi)` → step beats call beats global.
 *
 * Throws if any override sets `models.cua` (CUA model is locked, same rule
 * `configure()` enforces).
 */
export function resolveAI(...overrides: (AIOverride | undefined)[]): ResolvedAI {
  for (const layer of overrides) {
    if (layer?.models?.cua !== undefined) {
      throw new Error(CUA_LOCK_MESSAGE);
    }
  }
  const layers: (AIOverride | undefined)[] = [getConfig().ai, ...overrides];
  const lastDefined = <K extends "mode" | "gateway">(key: K): AIOverride[K] => {
    for (let i = layers.length - 1; i >= 0; i--) {
      const v = layers[i]?.[key];
      if (v !== undefined) return v;
    }
    return undefined;
  };
  const mode = (lastDefined("mode") as AIMode | undefined) ?? "snapshot";
  const gateway = (lastDefined("gateway") as AIGateway | undefined) ?? "none";
  const getModelIdForKey = (key: keyof ModelConfig): string => {
    for (let i = layers.length - 1; i >= 0; i--) {
      const v = layers[i]?.models?.[key];
      if (v !== undefined) return v;
    }
    return DEFAULT_MODELS[key];
  };
  return { mode, gateway, getModelId: getModelIdForKey };
}

/** @internal Reset config to empty state. Used for testing only. */
export function resetConfig() {
  globalConfig = {};
}
