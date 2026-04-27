"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_MODELS = void 0;
exports.configure = configure;
exports.getConfig = getConfig;
exports.getModelId = getModelId;
exports.resetConfig = resetConfig;
exports.DEFAULT_MODELS = {
    stepExecution: "google/gemini-3-flash",
    userFlowLow: "google/gemini-3-flash",
    userFlowHigh: "google/gemini-3.1-pro-preview",
    assertionPrimary: "anthropic/claude-haiku-4.5",
    assertionSecondary: "google/gemini-3-flash",
    assertionArbiter: "google/gemini-3.1-pro-preview",
    utility: "google/gemini-2.5-flash",
};
let globalConfig = {};
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
function configure(config) {
    globalConfig = { ...globalConfig, ...config };
}
/**
 * Returns the current global configuration.
 */
function getConfig() {
    return globalConfig;
}
/**
 * Returns the configured model ID for a given use case, falling back to the default.
 *
 * @param key - The model use case key (e.g. "stepExecution", "utility")
 * @returns The model identifier string (e.g. "google/gemini-3-flash")
 */
function getModelId(key) {
    return getConfig().ai?.models?.[key] ?? exports.DEFAULT_MODELS[key];
}
/** @internal Reset config to empty state. Used for testing only. */
function resetConfig() {
    globalConfig = {};
}
