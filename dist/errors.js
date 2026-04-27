"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationError = exports.ConfigurationError = exports.CacheError = exports.AIModelError = exports.StepExecutionError = exports.PassmarkError = void 0;
// ─── Base ─────────────────────────────────────────────────────────────────
class PassmarkError extends Error {
    /** Machine-readable error code, stable across versions. */
    code;
    constructor(message, code) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        // Maintains proper stack trace in V8 (Node.js / Chrome)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}
exports.PassmarkError = PassmarkError;
// ─── Subclasses ───────────────────────────────────────────────────────────
/**
 * Thrown when a test step fails during AI or cached execution.
 *
 * Replaces: throw new Error(errorDescription) in index.ts
 */
class StepExecutionError extends PassmarkError {
    stepDescription;
    constructor(message, stepDescription) {
        super(message, "STEP_EXECUTION_FAILED");
        this.stepDescription = stepDescription;
    }
}
exports.StepExecutionError = StepExecutionError;
/**
 * Thrown when an AI model call fails or the provider is misconfigured.
 *
 * Replaces: throw new Error(`Unknown AI provider: ${provider}`) in models.ts
 */
class AIModelError extends PassmarkError {
    constructor(message) {
        super(message, "AI_MODEL_ERROR");
    }
}
exports.AIModelError = AIModelError;
/**
 * Thrown when a Redis operation fails or cache is unavailable.
 *
 * For future use as Redis error handling gets more granular.
 */
class CacheError extends PassmarkError {
    constructor(message) {
        super(message, "CACHE_ERROR");
    }
}
exports.CacheError = CacheError;
/**
 * Thrown when required environment variables or configuration are missing.
 *
 * Replaces: throw new Error("GOOGLE_GENERATIVE_AI_API_KEY isn't set...") in models.ts
 */
class ConfigurationError extends PassmarkError {
    constructor(message) {
        super(message, "CONFIGURATION_ERROR");
    }
}
exports.ConfigurationError = ConfigurationError;
/**
 * Thrown when input fails validation (e.g. a script step has no script).
 *
 * Replaces: throw new Error(`Script step ${step.description} has no script content.`)
 */
class ValidationError extends PassmarkError {
    constructor(message) {
        super(message, "VALIDATION_ERROR");
    }
}
exports.ValidationError = ValidationError;
