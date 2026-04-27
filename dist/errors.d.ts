/**
 * errors.ts
 *
 * Custom error hierarchy for Passmark.
 * All Passmark errors extend PassmarkError so callers can distinguish
 * framework errors from generic runtime errors with a simple instanceof check.
 *
 * Usage:
 *   import { StepExecutionError, AIModelError } from "./errors";
 *
 *   try { ... }
 *   catch (e) {
 *     if (e instanceof StepExecutionError) { ... }
 *   }
 */
export declare class PassmarkError extends Error {
    /** Machine-readable error code, stable across versions. */
    readonly code: string;
    constructor(message: string, code: string);
}
/**
 * Thrown when a test step fails during AI or cached execution.
 *
 * Replaces: throw new Error(errorDescription) in index.ts
 */
export declare class StepExecutionError extends PassmarkError {
    readonly stepDescription: string;
    constructor(message: string, stepDescription: string);
}
/**
 * Thrown when an AI model call fails or the provider is misconfigured.
 *
 * Replaces: throw new Error(`Unknown AI provider: ${provider}`) in models.ts
 */
export declare class AIModelError extends PassmarkError {
    constructor(message: string);
}
/**
 * Thrown when a Redis operation fails or cache is unavailable.
 *
 * For future use as Redis error handling gets more granular.
 */
export declare class CacheError extends PassmarkError {
    constructor(message: string);
}
/**
 * Thrown when required environment variables or configuration are missing.
 *
 * Replaces: throw new Error("GOOGLE_GENERATIVE_AI_API_KEY isn't set...") in models.ts
 */
export declare class ConfigurationError extends PassmarkError {
    constructor(message: string);
}
/**
 * Thrown when input fails validation (e.g. a script step has no script).
 *
 * Replaces: throw new Error(`Script step ${step.description} has no script content.`)
 */
export declare class ValidationError extends PassmarkError {
    constructor(message: string);
}
