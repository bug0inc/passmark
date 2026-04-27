export type EmailProvider = {
    /** Domain for generating test emails (e.g. "emailsink.dev") */
    domain: string;
    /**
     * Function to extract content from an email.
     * Called with the email address and a prompt describing what to extract.
     * Should return the extracted string value.
     */
    extractContent: (params: {
        email: string;
        prompt: string;
    }) => Promise<string>;
};
export type AIGateway = "vercel" | "openrouter" | "cloudflare" | "none";
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
};
export declare const DEFAULT_MODELS: Required<ModelConfig>;
type Config = {
    email?: EmailProvider;
    ai?: {
        gateway?: AIGateway;
        models?: ModelConfig;
    };
    /** Base path for file uploads. Default: "./uploads" */
    uploadBasePath?: string;
};
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
export declare function configure(config: Config): void;
/**
 * Returns the current global configuration.
 */
export declare function getConfig(): Config;
/**
 * Returns the configured model ID for a given use case, falling back to the default.
 *
 * @param key - The model use case key (e.g. "stepExecution", "utility")
 * @returns The model identifier string (e.g. "google/gemini-3-flash")
 */
export declare function getModelId(key: keyof ModelConfig): string;
/** @internal Reset config to empty state. Used for testing only. */
export declare function resetConfig(): void;
export {};
