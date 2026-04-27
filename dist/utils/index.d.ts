import { type Page, PlaywrightTestArgs, PlaywrightTestOptions, PlaywrightWorkerArgs, PlaywrightWorkerOptions, TestType } from "@playwright/test";
import { PageInput, WaitConditionResult, WaitForConditionOptions } from "../types";
/**
 * Resolves a `Page | TabManager` to the currently-active Playwright Page.
 * Call this every time you need the page, so tab-switches mid-operation
 * (e.g. during a polling wait) are reflected on the very next access.
 */
export declare const resolvePage: (input: PageInput) => Page;
export declare const withTimeout: <T>(promise: Promise<T>, ms: number, enabled?: boolean) => Promise<T>;
export declare const safeSnapshot: (input: PageInput, timeout?: number) => Promise<string>;
/** Deterministic short hash for Redis keys */
export declare function flowKey(flow: string, { prefix, length, // 16 base64url chars ≈ 96 bits
secret, }?: {
    prefix?: string;
    length?: number;
    secret?: string;
}): string;
export declare function runLocatorCode(input: PageInput, code: string): Promise<void>;
/**
 * Waits for the DOM to stabilize by observing mutations.
 * Resolves when no mutations have occurred for the specified idle time.
 * @param page The Playwright page instance
 * @param idleTime Time in ms to wait after last mutation before considering DOM stable (default: 500ms)
 * @param timeout Maximum time to wait for stabilization (default: 5000ms)
 */
export declare function waitForDOMStabilization(input: PageInput, test?: TestType<PlaywrightTestArgs & PlaywrightTestOptions, PlaywrightWorkerArgs & PlaywrightWorkerOptions>, idleTime?: number, timeout?: number): Promise<void>;
/**
 * Waits for a condition to be met by polling AI with screenshots.
 * Uses gemini-2.5-flash to evaluate the condition.
 * Uses exponential backoff to reduce checks during long UI processes.
 *
 * @param options - Configuration options for waiting
 * @param options.page - The Playwright page instance
 * @param options.condition - The condition string to wait for
 * @param options.previousSteps - Array of previous step descriptions for context
 * @param options.currentStep - The current step being executed
 * @param options.nextStep - The next step to be executed (for context)
 * @param options.initialInterval - Initial interval between polls in ms (default: 1000)
 * @param options.maxInterval - Maximum interval between polls in ms (default: 10000)
 * @param options.timeout - Maximum time to wait in ms (default: 30000)
 * @returns Promise<WaitConditionResult> with the final condition result
 *
 * @example
 * ```typescript
 * const result = await waitForCondition({
 *   page,
 *   condition: 'The loading spinner should disappear',
 *   previousSteps: ['Navigate to dashboard', 'Click refresh button'],
 *   currentStep: 'Wait for data to load',
 *   nextStep: 'Verify data is displayed',
 *   initialInterval: 1000,
 *   maxInterval: 8000,
 * });
 * ```
 */
export declare function waitForCondition({ page, condition, pageScreenshotBeforeApplyingAction, previousSteps, currentStep, nextStep, initialInterval, maxInterval, timeout, }: WaitForConditionOptions): Promise<WaitConditionResult>;
/**
 * Verifies if an action had an observable effect by comparing accessibility snapshots.
 * Returns true if the action likely succeeded, false if it appears to have silently failed.
 */
export declare function verifyActionEffect(input: PageInput, action: string, snapshotBefore: string): Promise<{
    success: boolean;
}>;
/**
 * Generates a random unique 10-digit phone number.
 */
export declare function generatePhoneNumber(): string;
