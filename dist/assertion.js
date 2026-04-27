"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assert = void 0;
const ai_1 = require("ai");
const zod_1 = require("zod");
const config_1 = require("./config");
const constants_1 = require("./constants");
const logger_1 = require("./logger");
const models_1 = require("./models");
const utils_1 = require("./utils");
const assertionSchema = zod_1.z.object({
    assertionPassed: zod_1.z.boolean().describe("Indicates whether the assertion passed or not."),
    confidenceScore: zod_1.z
        .number()
        .describe("Confidence score of the assertion, between 0 and 100."),
    reasoning: zod_1.z
        .string()
        .describe("Brief explanation of the reasoning behind your decision - explain why the assertion passed or failed."),
});
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
const assert = async ({ page, assertion, test, expect, effort = "low", images, failSilently, maxRetries = 1, onRetry = (retryCount, previousResult) => { }, }) => {
    const thinkingEnabled = effort === "high";
    const runFullAssertion = async () => {
        const snapshot = await (0, utils_1.safeSnapshot)(page);
        const imageContent = images
            ? images.map((image) => ({ type: "image", image }))
            : [
                {
                    type: "image",
                    image: (await (0, utils_1.resolvePage)(page).screenshot({ fullPage: false })).toString("base64"),
                },
            ];
        const basePrompt = `
You are an AI-powered QA Agent designed to test web applications.

You have access to the following information. Based on this information, you'll tell us whether the assertion provided below should pass or not.
${!images
            ? `
- An accessibility snapshot of the current page, which provides a detailed structure of the DOM
- A screenshot of the current page`
            : "- Screenshots from various stages of the user flow"}

${!images
            ? `
<Snapshot>
${snapshot}
</Snapshot>
`
            : ""}

<Assertion>
${assertion}
</Assertion>

<Rules>
- First use the attached screenshot(s) to visually inspect the page and try to verify the assertion.
- Only if the screenshot is not sufficient, use the accessibility snapshot (if supplied) to verify the assertion.
- Don't create additional assertion conditions on your own - only consider the exact assertion provided above.
- The assertion should pass if either the screenshot or the accessibility snapshot supports it.
- Don't be overly strict or pedantic about exact wording. Focus on the intent and objective of the assertion rather than literal text matching.
- Think like a practical QA tester - if the core functionality or state being asserted is present, the assertion should pass even if minor details differ.
</Rules>

<OutputFormat>
    The output should contain the following information:
    - \`assertionPassed\`: A boolean indicating whether the assertion passed or not.
    - \`confidenceScore\`: A number between 0 and 100 indicating the confidence score of the assertion.
    - \`reasoning\`: A brief string explaining the reasoning behind the assertion.
</OutputFormat>

Never hallucinate. Be truthful and if you are not sure, use a low confidence score.
`;
        const messages = [
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: basePrompt,
                    },
                    ...imageContent,
                ],
            },
        ];
        // Claude assertion function
        const getClaudeAssertion = async () => {
            // First get Claude's text response with thinking if enabled
            const { text } = await (0, ai_1.generateText)({
                model: (0, models_1.resolveModel)((0, config_1.getModelId)("assertionPrimary")),
                temperature: 0,
                providerOptions: thinkingEnabled
                    ? {
                        anthropic: {
                            thinking: { type: "enabled", budgetTokens: constants_1.THINKING_BUDGET_DEFAULT },
                        },
                        openrouter: {
                            reasoning: { max_tokens: constants_1.THINKING_BUDGET_DEFAULT },
                        },
                    }
                    : undefined,
                messages,
            });
            // Convert Claude's response to structured format using Haiku
            const { output } = await (0, ai_1.generateText)({
                model: (0, models_1.resolveModel)((0, config_1.getModelId)("assertionPrimary")),
                temperature: 0.1,
                prompt: `Convert the following text output into a valid JSON object with the specified properties:\n\n${text}`,
                output: ai_1.Output.object({ schema: assertionSchema }),
            });
            return output;
        };
        // Gemini assertion function
        const getGeminiAssertion = async () => {
            const { output } = await (0, ai_1.generateText)({
                model: (0, models_1.resolveModel)((0, config_1.getModelId)("assertionSecondary")),
                temperature: 0,
                providerOptions: thinkingEnabled
                    ? {
                        google: {
                            thinkingConfig: {
                                thinkingBudget: constants_1.THINKING_BUDGET_DEFAULT,
                            },
                        },
                        openrouter: {
                            reasoning: { max_tokens: constants_1.THINKING_BUDGET_DEFAULT },
                        },
                    }
                    : undefined,
                messages,
                output: ai_1.Output.object({ schema: assertionSchema }),
            });
            return output;
        };
        // Arbiter function using Gemini 2.5 Pro with thinking enabled
        const getArbiterDecision = async (claudeResult, geminiResult) => {
            const arbiterPrompt = `
You are an AI arbiter tasked with resolving a disagreement between two AI models about an assertion.

Claude's Assessment:
- Assertion Passed: ${claudeResult.assertionPassed}
- Confidence: ${claudeResult.confidenceScore}%
- Reasoning: ${claudeResult.reasoning}

Gemini's Assessment:
- Assertion Passed: ${geminiResult.assertionPassed}
- Confidence: ${geminiResult.confidenceScore}%
- Reasoning: ${geminiResult.reasoning}

${!images
                ? `
<Snapshot>
${snapshot}
</Snapshot>
`
                : ""}

<Assertion>
${assertion}
</Assertion>

Please carefully review the evidence (screenshot and accessibility snapshot (when provided)) and make the final determination. Consider both models' reasoning but make your own independent assessment.

<Rules>
- Make your own independent evaluation based on the evidence
- Don't simply pick one model's answer - analyze the situation yourself
- Provide clear reasoning for your decision
- Be decisive - this is the final answer
- First use the attached screenshot(s) to visually inspect the page and try to verify the assertion.
- Only if the screenshot is not sufficient, use the accessibility snapshot (if supplied) to verify the assertion.
- Don't create additional assertion conditions on your own - only consider the exact assertion provided above.
- The assertion should pass if either the screenshot or the accessibility snapshot supports it.
- Don't be overly strict or pedantic about exact wording. Focus on the intent and objective of the assertion rather than literal text matching.
- Think like a practical QA tester - if the core functionality or state being asserted is present, the assertion should pass even if minor details differ.
</Rules>
`;
            const arbiterMessages = [
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: arbiterPrompt,
                        },
                        ...imageContent,
                    ],
                },
            ];
            const { output } = await (0, ai_1.generateText)({
                model: (0, models_1.resolveModel)((0, config_1.getModelId)("assertionArbiter")),
                temperature: 0,
                providerOptions: {
                    google: {
                        thinkingConfig: {
                            thinkingBudget: constants_1.THINKING_BUDGET_DEFAULT,
                        },
                    },
                    openrouter: {
                        reasoning: { max_tokens: constants_1.THINKING_BUDGET_DEFAULT },
                    },
                },
                messages: arbiterMessages,
                output: ai_1.Output.object({ schema: assertionSchema }),
            });
            return output;
        };
        const runAssertion = async (attempt = 0) => {
            try {
                // Run both models in parallel for speed optimization
                const [claudeResult, geminiResult] = await Promise.all([
                    (0, utils_1.withTimeout)(getClaudeAssertion(), constants_1.ASSERTION_MODEL_TIMEOUT),
                    (0, utils_1.withTimeout)(getGeminiAssertion(), constants_1.ASSERTION_MODEL_TIMEOUT),
                ]);
                // Check if models disagree on assertionPassed
                if (claudeResult.assertionPassed !== geminiResult.assertionPassed) {
                    logger_1.logger.debug("Models disagree on assertion result, consulting arbiter...");
                    const arbiterResult = await (0, utils_1.withTimeout)(getArbiterDecision(claudeResult, geminiResult), constants_1.ASSERTION_MODEL_TIMEOUT);
                    return {
                        assertionPassed: arbiterResult.assertionPassed,
                        confidenceScore: arbiterResult.confidenceScore,
                        reasoning: arbiterResult.reasoning,
                    };
                }
                // Assertion passes only if both models agree it should pass
                const assertionPassed = claudeResult.assertionPassed && geminiResult.assertionPassed;
                // Calculate average confidence score
                const confidenceScore = (claudeResult.confidenceScore + geminiResult.confidenceScore) / 2;
                // For now take Gemini's reasoning for simplicity
                const reasoning = geminiResult.reasoning;
                return {
                    assertionPassed,
                    confidenceScore: Math.round(confidenceScore),
                    reasoning,
                };
            }
            catch (error) {
                if (attempt < 1) {
                    logger_1.logger.debug("Retrying assertion due to error...");
                    return await runAssertion(attempt + 1);
                }
                logger_1.logger.error({ err: error }, "Error running assertions after multiple retries");
                throw error;
            }
        };
        return await runAssertion();
    };
    // Run assertion with retry on failure
    let result = await runFullAssertion();
    for (let retry = 0; retry < maxRetries && !result.assertionPassed; retry++) {
        logger_1.logger.debug("Assertion failed, retrying with fresh snapshot and screenshot...");
        onRetry(retry, result);
        result = await runFullAssertion();
    }
    const { assertionPassed, reasoning } = result;
    test?.info().annotations.push({
        type: "AI Summary",
        description: reasoning,
    });
    const expectStatus = assertionPassed ? "✅ passed" : "❌ failed";
    if (!failSilently) {
        expect(assertionPassed, reasoning).toBe(true);
    }
    return `${reasoning}\n\n[Assertion ${expectStatus}]`;
};
exports.assert = assert;
