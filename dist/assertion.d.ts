import { AssertionOptions } from "./types";
/**
 * Multi-model consensus assertion engine.
 * Runs Claude and Gemini in parallel; if they disagree, a third model (arbiter) makes the final call.
 * An assertion passes only if both models agree (or the arbiter decides).
 * Automatically retries failed assertions once with a fresh page snapshot.
 *
 * @param options - Assertion configuration
 * @param options.page - The Playwright page instance to take snapshots from
 * @param options.assertion - Natural language assertion to validate (e.g. "The cart shows 3 items")
 * @param options.expect - Playwright expect function, used to fail the test on assertion failure
 * @param options.effort - "low" (default) or "high" — high enables thinking mode for deeper analysis
 * @param options.images - Optional base64 screenshot images to provide to the models
 * @param options.failSilently - When true, returns the result without failing the test
 * @param options.test - Playwright test instance for attaching metadata
 * @returns A string summary of the assertion result
 * @throws Fails the Playwright test via expect when assertion fails (unless failSilently is true)
 *
 * @example
 * ```typescript
 * await assert({
 *   page,
 *   assertion: "The dashboard shows 3 active projects",
 *   expect,
 *   effort: "high",
 * });
 * ```
 */
export declare const assert: ({ page, assertion, test, expect, effort, images, failSilently, maxRetries, onRetry, }: AssertionOptions) => Promise<string>;
