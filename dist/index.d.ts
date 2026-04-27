import "./instrumentation";
import { PlaywrightTestArgs, PlaywrightTestOptions, PlaywrightWorkerArgs, PlaywrightWorkerOptions, TestType } from "@playwright/test";
import { RunStepsOptions, UserFlowOptions } from "./types";
/**
 * Executes a sequence of test steps using AI with intelligent caching.
 * Each step is described in natural language and executed via browser automation.
 * Successfully executed steps are cached for faster subsequent runs.
 *
 * @param options - Configuration including page, steps, assertions, and callbacks
 * @param options.page - The Playwright page instance
 * @param options.userFlow - Name of the user flow (used as cache key prefix)
 * @param options.steps - Array of steps to execute, each with a description and optional data
 * @param options.bypassCache - When true, skips cache and forces AI execution for all steps
 * @param options.assertions - Optional assertions to verify after step execution
 * @param options.executionId - Links multiple runSteps calls to share {{global.*}} placeholders
 * @param options.onStepStart - Callback fired when a step begins execution
 * @param options.onStepEnd - Callback fired when a step completes
 * @param options.onReasoning - Callback fired with AI reasoning for each tool call
 * @throws Rethrows step execution timeout errors
 *
 * @example
 * ```typescript
 * await runSteps({
 *   page,
 *   userFlow: "Checkout Flow",
 *   steps: [
 *     { description: "Add item to cart" },
 *     { description: "Fill in email", data: { value: "{{run.email}}" } },
 *   ],
 *   assertions: [{ assertion: "Order confirmation is displayed" }],
 *   expect,
 * });
 * ```
 */
export declare const runSteps: ({ page, test, expect, userFlow, steps, auth, bypassCache, onStepStart, onStepEnd, onReasoning, assertions, projectId, executionId, failAssertionsSilently, }: RunStepsOptions) => Promise<void>;
/**
 * Runs a complete user flow as a single AI agent call.
 * Best for exploratory testing where exact steps are flexible.
 * The AI autonomously navigates, interacts, and verifies the flow.
 *
 * @param options - User flow configuration
 * @param options.page - The Playwright page instance
 * @param options.userFlow - Description of the user flow to execute
 * @param options.steps - Natural language description of steps to perform
 * @param options.effort - "low" uses a faster model, "high" uses a more capable model with deeper thinking
 * @param options.assertion - Optional assertion to verify after the flow completes
 * @returns The assertion result if an assertion was provided, the raw AI text response otherwise, or undefined on error
 *
 * @example
 * ```typescript
 * const result = await runUserFlow({
 *   page,
 *   userFlow: "Complete a purchase",
 *   steps: "Navigate to store, add an item, checkout",
 *   effort: "high",
 *   assertion: "Order confirmation is displayed",
 * });
 * ```
 */
export declare const runUserFlow: ({ page, userFlow, steps, assertion, effort, thinkingBudget, }: UserFlowOptions) => Promise<string | {
    assertionPassed: boolean;
    confidenceScore: number;
    reasoning: string;
} | undefined>;
/**
 * Wraps a cached Playwright flow with AI fallback for auto-healing.
 * Tries the cached flow first; if it fails (e.g., due to UI changes), falls back to AI execution.
 *
 * @param config - Configuration for cached and AI flow execution
 * @param config.cachedFlow - The cached Playwright flow to try first
 * @param config.aiFlow - The AI-powered fallback flow to run if cached flow fails
 * @param config.aiFlowTimeout - Optional timeout for the AI flow in milliseconds
 * @param config.test - Playwright test instance for retry detection and timeout management
 *
 * @example
 * ```typescript
 * await executeWithAutoHealing({
 *   cachedFlow: async () => { await page.getByRole("button").click(); },
 *   aiFlow: async () => { await runSteps({ page, userFlow: "Click submit", steps }); },
 *   test,
 * });
 * ```
 */
export declare const executeWithAutoHealing: (config: {
    cachedFlow: () => Promise<void>;
    aiFlow: () => Promise<void>;
    aiFlowTimeout?: number;
    test: TestType<PlaywrightTestArgs & PlaywrightTestOptions, PlaywrightWorkerArgs & PlaywrightWorkerOptions>;
}) => Promise<void>;
export { configure } from "./config";
export type { EmailProvider } from "./config";
export { emailsinkProvider } from "./providers/emailsink";
export { extractEmailContent, generateEmail } from "./email";
export { assert } from "./assertion";
export type { AssertionResult } from "./types";
export type { CacheStore } from "./cache";
export { PassmarkError, StepExecutionError, ValidationError, AIModelError, CacheError, ConfigurationError } from "./errors";
