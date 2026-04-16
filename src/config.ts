import { logger } from "./logger";

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

export type AIGateway = "vercel" | "openrouter" | "none";

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
  /** Array of models to use for consensus assertions. When provided, overrides assertionPrimary/assertionSecondary */
  assertionModels?: string[];
  /** Model for assertion arbiter. Default: google/gemini-3.1-pro-preview */
  assertionArbiter?: string;
  /** Model for data extraction, wait conditions, and lightweight tasks. Default: google/gemini-2.5-flash */
  utility?: string;
};

export const DEFAULT_MODELS: Required<Omit<ModelConfig, 'assertionModels'>> & Pick<ModelConfig, 'assertionModels'> = {
  stepExecution: "google/gemini-3-flash",
  userFlowLow: "google/gemini-3-flash",
  userFlowHigh: "google/gemini-3.1-pro-preview",
  assertionPrimary: "anthropic/claude-haiku-4.5",
  assertionSecondary: "google/gemini-3-flash",
  assertionModels: undefined,
  assertionArbiter: "google/gemini-3.1-pro-preview",
  utility: "google/gemini-2.5-flash",
};

type Config = {
  email?: EmailProvider;
  ai?: {
    gateway?: AIGateway;
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
 * // Using primary/secondary models (backward compatible)
 * configure({
 *   ai: { 
 *     gateway: "none", 
 *     models: { 
 *       assertionPrimary: "anthropic/claude-haiku-4.5",
 *       assertionSecondary: "google/gemini-3-flash"
 *     } 
 *   },
 * });
 * 
 * // Using multiple models array (new flexible approach)
 * configure({
 *   ai: { 
 *     gateway: "openrouter", 
 *     models: { 
 *       assertionModels: [
 *         "anthropic/claude-haiku-4.5",
 *         "google/gemini-3-flash",
 *         "meta-llama/llama-3.1-8b-instruct"
 *       ],
 *       assertionArbiter: "google/gemini-3.1-pro-preview"
 *     } 
 *   },
 * });
 * ```
 */
export function configure(config: Config) {
  globalConfig = { ...globalConfig, ...config };
  
  // Validate assertion model configuration
  const models = globalConfig.ai?.models;
  if (models) {
    const assertionModels = getAssertionModelsList(models);
    if (assertionModels.length < 2) {
      logger.warn(
        'Passmark: At least 2 assertion models are recommended for reliable consensus validation.'
      );
    }
  }
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
export function getModelId(key: keyof Omit<ModelConfig, 'assertionModels'>): string {
  return getConfig().ai?.models?.[key] ?? DEFAULT_MODELS[key];
}

/**
 * Returns the list of assertion models from configuration.
 * Prioritizes assertionModels array, falls back to [assertionPrimary, assertionSecondary].
 *
 * @param models - The model configuration
 * @returns Array of model identifiers for assertions
 */
export function getAssertionModelsList(models?: ModelConfig): string[] {
  const configModels = models ?? getConfig().ai?.models;
  
  if (!configModels) {
    return [DEFAULT_MODELS.assertionPrimary, DEFAULT_MODELS.assertionSecondary];
  }
  
  // Prefer the new assertionModels array if provided
  if (configModels.assertionModels && configModels.assertionModels.length > 0) {
    return configModels.assertionModels;
  }
  
  // Fall back to primary/secondary for backward compatibility
  const modelsList: string[] = [];
  if (configModels.assertionPrimary) {
    modelsList.push(configModels.assertionPrimary);
  }
  if (configModels.assertionSecondary) {
    modelsList.push(configModels.assertionSecondary);
  }
  
  // If nothing configured, use defaults
  if (modelsList.length === 0) {
    return [DEFAULT_MODELS.assertionPrimary, DEFAULT_MODELS.assertionSecondary];
  }
  
  return modelsList;
}

/** @internal Reset config to empty state. Used for testing only. */
export function resetConfig() {
  globalConfig = {};
}