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

export type AIGateway = "vercel" | "openrouter" | "cloudflare" | "litellm" | "none";

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

type Config = {
  email?: EmailProvider;
  ai?: {
    gateway?: AIGateway;
    mode?: AIMode;
    models?: ModelConfig;
  };
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

/** @internal Reset config to empty state. Used for testing only. */
export function resetConfig() {
  globalConfig = {};
}
