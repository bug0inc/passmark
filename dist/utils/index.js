"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeSnapshot = exports.withTimeout = exports.resolvePage = void 0;
exports.flowKey = flowKey;
exports.runLocatorCode = runLocatorCode;
exports.waitForDOMStabilization = waitForDOMStabilization;
exports.waitForCondition = waitForCondition;
exports.verifyActionEffect = verifyActionEffect;
exports.generatePhoneNumber = generatePhoneNumber;
const ai_1 = require("ai");
const crypto_1 = require("crypto");
const zod_1 = require("zod");
const config_1 = require("../config");
const logger_1 = require("../logger");
const models_1 = require("../models");
/**
 * Resolves a `Page | TabManager` to the currently-active Playwright Page.
 * Call this every time you need the page, so tab-switches mid-operation
 * (e.g. during a polling wait) are reflected on the very next access.
 */
const resolvePage = (input) => typeof input.active === "function"
    ? input.active()
    : input;
exports.resolvePage = resolvePage;
const constants_1 = require("../constants");
const withTimeout = (promise, ms, enabled = true) => {
    if (!enabled) {
        return promise;
    }
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error(`Promise timed out after ${ms} ms`));
        }, ms);
        promise.then((res) => {
            clearTimeout(timeoutId);
            resolve(res);
        }, (err) => {
            clearTimeout(timeoutId);
            reject(err);
        });
    });
};
exports.withTimeout = withTimeout;
const safeSnapshot = async (input, timeout = constants_1.SNAPSHOT_TIMEOUT) => {
    const attempt = async () => {
        return await (0, exports.resolvePage)(input).ariaSnapshot({ mode: "ai", timeout });
    };
    try {
        const snapshot = await attempt();
        return snapshot;
    }
    catch (err) {
        if (err instanceof Error && err.message === "timeout") {
            logger_1.logger.debug("Snapshot timed out, retrying once...");
            // retry once
            return await attempt();
        }
        throw err;
    }
};
exports.safeSnapshot = safeSnapshot;
/** Deterministic short hash for Redis keys */
function flowKey(flow, { prefix = "flow", length = 16, // 16 base64url chars ≈ 96 bits
secret, // optional HMAC secret to avoid leaking the flow
 } = {}) {
    const h = secret
        ? (0, crypto_1.createHash)("sha256").update(secret).update("\x00").update(flow).digest()
        : (0, crypto_1.createHash)("sha256").update(flow).digest();
    // base64url without padding
    const b64url = h.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const short = b64url.slice(0, length);
    return `${prefix}:${short}`;
}
async function runLocatorCode(input, code) {
    const fn = new Function("page", `
        return (async () => {
            ${code}
        })();
        `);
    return fn((0, exports.resolvePage)(input));
}
/**
 * Waits for the DOM to stabilize by observing mutations.
 * Resolves when no mutations have occurred for the specified idle time.
 * @param page The Playwright page instance
 * @param idleTime Time in ms to wait after last mutation before considering DOM stable (default: 500ms)
 * @param timeout Maximum time to wait for stabilization (default: 5000ms)
 */
async function waitForDOMStabilization(input, test, idleTime = constants_1.DOM_STABILIZATION_IDLE, timeout = constants_1.DOM_STABILIZATION_TIMEOUT) {
    const _waitForStabilization = async () => {
        try {
            await (0, exports.resolvePage)(input).evaluate(({ idleTime, timeout }) => {
                return new Promise((resolve) => {
                    let timeoutId;
                    // eslint-disable-next-line prefer-const
                    let overallTimeoutId;
                    // @ts-expect-error MutationObserver exists in browser context via page.evaluate
                    const observer = new MutationObserver(() => {
                        clearTimeout(timeoutId);
                        timeoutId = setTimeout(() => {
                            observer.disconnect();
                            clearTimeout(overallTimeoutId);
                            resolve();
                        }, idleTime);
                    });
                    // @ts-expect-error document.body exists in browser context via page.evaluate
                    observer.observe(document.body, {
                        childList: true,
                        subtree: true,
                        attributes: true,
                        characterData: true,
                    });
                    // Start the idle timer immediately in case no mutations occur
                    timeoutId = setTimeout(() => {
                        observer.disconnect();
                        clearTimeout(overallTimeoutId);
                        resolve();
                    }, idleTime);
                    // Overall timeout to prevent hanging indefinitely
                    overallTimeoutId = setTimeout(() => {
                        observer.disconnect();
                        clearTimeout(timeoutId);
                        resolve();
                    }, timeout);
                });
            }, { idleTime, timeout });
        }
        catch (error) {
            // If execution context was destroyed due to navigation, wait for load state
            if ((error instanceof Error && error.message?.includes("Execution context was destroyed")) ||
                (error instanceof Error && error.message?.includes("navigation"))) {
                // Navigation occurred - wait for the page to be ready
                await (0, exports.resolvePage)(input).waitForLoadState("domcontentloaded").catch(() => { });
                return;
            }
            // Re-throw other errors
            throw error;
        }
    };
    if (test) {
        await test.step("Waiting for DOM stabilization", async () => {
            await _waitForStabilization();
        });
    }
    else {
        await _waitForStabilization();
    }
}
const waitConditionSchema = zod_1.z.object({
    conditionMet: zod_1.z.boolean().describe("Indicates whether the wait condition has been met."),
    reasoning: zod_1.z
        .string()
        .describe("Brief explanation of why the condition is met or not met based on the current page state."),
});
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
async function waitForCondition({ page, condition, pageScreenshotBeforeApplyingAction, previousSteps = [], currentStep, nextStep, initialInterval = constants_1.WAIT_CONDITION_INITIAL_INTERVAL, maxInterval = constants_1.WAIT_CONDITION_MAX_INTERVAL, timeout = constants_1.WAIT_CONDITION_TIMEOUT, }) {
    await waitForDOMStabilization(page); // Ensure DOM is stable before starting
    const startTime = Date.now();
    let currentInterval = initialInterval;
    const checkCondition = async () => {
        const pageScreenshotAfterApplyingAction = (await (0, exports.resolvePage)(page).screenshot({ fullPage: false })).toString("base64");
        const prompt = `
You are an AI-powered QA Agent designed to test web applications.

You are helping to determine if a wait condition has been met during a test flow.

<Context>
${previousSteps.length > 0
            ? `Previous steps completed:\n${previousSteps
                .map((s, i) => `${i + 1}. ${s.description}\n${s.data ? `   Data: ${JSON.stringify(s.data)}` : ""}`)
                .join("\n")}`
            : "No previous steps."}

Last executed step: ${currentStep.description}
${nextStep ? `Next step: ${nextStep.description}` : ""}

Attached are before and after screenshots of the page surrounding the last executed step. Image 1 is before executing the step, and Image 2 is after executing the step.
</Context>

<WaitCondition>
${condition}
</WaitCondition>

<Rules>
- Assume last executed step has been performed on the page.
- Examine the screenshot carefully to determine if the wait condition has been met.
- Consider the context of the previous steps and last executed step when evaluating.
- The condition should be evaluated based on what is visually present on the page.
- Be practical - if the core condition appears to be satisfied, mark it as met.
- Don't be overly strict about exact text matching; focus on the intent of the condition.
</Rules>

<OutputFormat>
- \`conditionMet\`: A boolean indicating whether the wait condition has been met.
- \`reasoning\`: A brief string explaining why the condition is or is not met.
</OutputFormat>

Analyze the attached before and after screenshots and determine if the wait condition has been met.
`;
        const { output } = await (0, ai_1.generateText)({
            model: (0, models_1.resolveModel)((0, config_1.getModelId)("utility")),
            temperature: 0,
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: prompt },
                        { type: "image", image: pageScreenshotBeforeApplyingAction },
                        { type: "image", image: pageScreenshotAfterApplyingAction },
                    ],
                },
            ],
            output: ai_1.Output.object({ schema: waitConditionSchema }),
        });
        return output;
    };
    while (Date.now() - startTime < timeout) {
        try {
            const result = await checkCondition();
            if (result.conditionMet) {
                logger_1.logger.info(`Condition met: ${result.reasoning}`);
                return result;
            }
            logger_1.logger.debug(`Condition not met yet: ${result.reasoning}. Retrying in ${currentInterval}ms...`);
            // Wait before next poll
            await new Promise((resolve) => setTimeout(resolve, currentInterval));
            // Exponential backoff: double the interval, capped at maxInterval
            currentInterval = Math.min(currentInterval * 2, maxInterval);
        }
        catch (error) {
            logger_1.logger.error({ err: error }, "Error checking condition");
            // Wait before retry on error
            await new Promise((resolve) => setTimeout(resolve, currentInterval));
            currentInterval = Math.min(currentInterval * 2, maxInterval);
        }
    }
    // Timeout reached, do one final check
    const finalResult = await checkCondition();
    if (!finalResult.conditionMet) {
        logger_1.logger.warn(`Wait condition timed out after ${timeout}ms: ${finalResult.reasoning}`);
    }
    return finalResult;
}
/**
 * Verifies if an action had an observable effect by comparing accessibility snapshots.
 * Returns true if the action likely succeeded, false if it appears to have silently failed.
 */
async function verifyActionEffect(input, action, snapshotBefore) {
    await waitForDOMStabilization(input); // Ensure DOM is stable before taking snapshot
    // Actions that don't necessarily cause visible changes
    if (action === "hover" || action === "waitForText") {
        return { success: true };
    }
    const snapshotAfter = await (0, exports.safeSnapshot)(input);
    // If snapshots are identical, the action likely had no effect
    if (snapshotBefore.trim() === snapshotAfter.trim()) {
        throw new Error(`Action "${action}" appears to have had no effect on the page.`);
    }
    return { success: true };
}
/**
 * Generates a random unique 10-digit phone number.
 */
function generatePhoneNumber() {
    // First digit should be 1-9 to avoid leading zero
    const firstDigit = Math.floor(Math.random() * 9) + 1;
    // Remaining 9 digits can be 0-9
    const remainingDigits = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join("");
    return `${firstDigit}${remainingDigits}`;
}
