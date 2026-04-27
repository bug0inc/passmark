"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigurationError = exports.CacheError = exports.AIModelError = exports.ValidationError = exports.StepExecutionError = exports.PassmarkError = exports.assert = exports.generateEmail = exports.extractEmailContent = exports.emailsinkProvider = exports.configure = exports.executeWithAutoHealing = exports.runUserFlow = exports.runSteps = void 0;
const errors_1 = require("./errors");
require("./instrumentation"); // For Axiom AI instrumentation
const ai_1 = require("ai");
const ai_2 = require("axiom/ai");
const shortid_1 = __importDefault(require("shortid"));
const instrumentation_1 = require("./instrumentation");
// Only use withSpan when Axiom is configured, otherwise just execute the function directly
async function maybeWithSpan(meta, fn) {
    return instrumentation_1.axiomEnabled ? (0, ai_2.withSpan)(meta, async () => fn()) : fn();
}
const zod_1 = require("zod");
const prompts_1 = require("./prompts");
const cache_1 = require("./cache");
const tools_1 = require("./tools");
const utils_1 = require("./utils");
const assertion_1 = require("./assertion");
const data_cache_1 = require("./data-cache");
const config_1 = require("./config");
const extract_1 = require("./extract");
const logger_1 = require("./logger");
const models_1 = require("./models");
const secure_script_runner_1 = require("./utils/secure-script-runner");
const tab_manager_1 = require("./utils/tab-manager");
const constants_1 = require("./constants");
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
const runSteps = async ({ page, test, expect, userFlow, steps, auth, bypassCache = false, onStepStart, onStepEnd, onReasoning, assertions, projectId, executionId, failAssertionsSilently, }) => {
    executionId = executionId || process.env.executionId;
    // Track all open tabs for this run. The active page is updated automatically
    // when a new tab opens, or explicitly via the `switchToTab` step field.
    const tabManager = (0, tab_manager_1.createTabManager)(page);
    if (!cache_1.cache) {
        logger_1.logger.warn("Cache not configured. Step caching is disabled — all steps will use AI execution.");
        if (executionId) {
            logger_1.logger.warn("{{global.*}} placeholders will not persist across runSteps calls without a cache provider.");
        }
    }
    // Check if this is a Playwright retry - if so, bypass cache and use AI only
    const isPlaywrightRetry = test ? test.info().retry > 0 : false;
    if (isPlaywrightRetry) {
        logger_1.logger.debug(`Playwright retry detected (retry #${test.info().retry}). Bypassing cache and using AI only.`);
    }
    // Process dynamic placeholders before running steps
    const { processedSteps, processedAssertions, localValues, globalValues, projectDataValues } = await (0, data_cache_1.processPlaceholders)(steps, assertions, executionId, projectId);
    logger_1.logger.info(`Starting step-by-step execution of ${processedSteps.length} steps.`);
    let errorInStepExecution, stepThatFailed = "";
    for (let i = 0; i < processedSteps.length; i++) {
        // Resolve email placeholders lazily just before step execution
        // This ensures the email has arrived before we try to extract content
        // Use global email if available, otherwise fall back to run email, and then use the supplied email from regex
        // ~~~ This logic needs to be fixed as global email will always be present if executionId is provided ~~~
        const dynamicEmail = (0, data_cache_1.getDynamicEmail)(localValues, globalValues);
        // Re-process step data and waitUntil with current localValues to pick up extracted values from previous steps
        let currentStep = processedSteps[i];
        if (currentStep.data) {
            currentStep = {
                ...currentStep,
                data: Object.fromEntries(Object.entries(currentStep.data).map(([k, v]) => [
                    k,
                    (0, data_cache_1.replacePlaceholders)(v, localValues, globalValues, projectDataValues),
                ])),
            };
        }
        if (currentStep.waitUntil) {
            currentStep = {
                ...currentStep,
                waitUntil: (0, data_cache_1.replacePlaceholders)(currentStep.waitUntil, localValues, globalValues, projectDataValues),
            };
        }
        const step = await (0, data_cache_1.resolveEmailPlaceholders)(currentStep, dynamicEmail);
        const id = shortid_1.default.generate();
        if (onStepStart) {
            onStepStart({ id, description: step.description });
        }
        // Switch tab before executing the step if requested.
        if (step.switchToTab !== undefined) {
            await tabManager.switchTo(step.switchToTab);
        }
        // Script mode: execute script directly, skip AI and cache
        if (step.isScript) {
            if (!step.script) {
                throw new errors_1.ValidationError(`Script step ${step.description} has no script content.`);
            }
            logger_1.logger.debug(`Executing Script Step: ${step.description}`);
            if (step.moduleId) {
                // moduleId is optional metadata used only for logging/debugging to identify the source module of this script step.
                logger_1.logger.debug(`Module ID: ${step.moduleId}`);
            }
            try {
                let pageScreenshotBeforeApplyingAction = "";
                if (step.waitUntil) {
                    pageScreenshotBeforeApplyingAction = (await tabManager.active().screenshot({ fullPage: false })).toString("base64");
                }
                if (onReasoning) {
                    onReasoning({
                        id,
                        reasoning: `Executing script for step: ${step.description}`,
                    });
                }
                // Execute script securely using AST-based validation
                // This prevents arbitrary code execution by only allowing safe Playwright method chains
                await (0, secure_script_runner_1.runSecureScript)({
                    page: tabManager,
                    script: step.script,
                    localValues: localValues,
                    globalValues: globalValues,
                    expect, // Pass expect for assertions like expect(locator).toContainText()
                });
                // Handle waitUntil if specified
                if (step.waitUntil) {
                    await (0, utils_1.waitForCondition)({
                        page: tabManager,
                        condition: step.waitUntil,
                        pageScreenshotBeforeApplyingAction,
                        previousSteps: processedSteps.slice(0, i),
                        currentStep: step,
                        nextStep: processedSteps[i + 1],
                    });
                }
                // Handle data extraction if specified
                // This is done post script execution
                if (step.extract) {
                    const snapshot = await (0, utils_1.safeSnapshot)(tabManager);
                    const url = tabManager.active().url();
                    const extracted = await (0, extract_1.extractDataWithAI)({
                        snapshot,
                        url,
                        prompt: step.extract.prompt,
                    });
                    const placeholderKey = `{{run.${step.extract.as}}}`;
                    localValues[placeholderKey] = extracted;
                    logger_1.logger.info(`Extracted {{run.${step.extract.as}}}: "${extracted}"`);
                }
                if (onStepEnd) {
                    onStepEnd({ id, description: step.description });
                }
                continue; // Skip to next step
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                logger_1.logger.error(`Script execution failed: ${message}`);
                errorInStepExecution = message;
                stepThatFailed = step.description;
                break; // Stop execution on script failure
            }
        }
        // First check if the step is cached on redis
        const cachedStep = cache_1.cache ? await cache_1.cache.hgetall(`step:${userFlow}:${step.description}`) : {};
        if (!bypassCache &&
            !isPlaywrightRetry &&
            !step.bypassCache &&
            cachedStep &&
            Object.keys(cachedStep).length > 0) {
            // Running cached step
            logger_1.logger.debug(`Executing Cached Step: ${step.description}`);
            const locator = cachedStep["locator"];
            const action = cachedStep["action"];
            const description = cachedStep["description"].replace(/'/g, "\\'");
            const value = cachedStep["value"];
            const input = step.data?.value || value;
            let code = "";
            switch (action) {
                case "click":
                case "dblclick":
                    code = `await page.${locator}.describe('${description}').${action}({ timeout: ${constants_1.CACHED_ACTION_TIMEOUT} });`;
                    break;
                case "fill":
                    code = `await page.${locator}.describe('${description}').fill("${input}", { timeout: ${constants_1.CACHED_ACTION_TIMEOUT} })`;
                    break;
                case "hover":
                    code = `await page.${locator}.describe('${description}').hover({ timeout: ${constants_1.CACHED_ACTION_TIMEOUT} })`;
                    break;
                case "select-option":
                    code = `await page.${locator}.describe('${description}').selectOption("${input}", { timeout: ${constants_1.CACHED_ACTION_TIMEOUT} })`;
                    break;
                case "waitForText":
                    code = `await page.getByText("${value}", { exact: true }).first().waitFor({ state: "visible" })`;
                    break;
            }
            logger_1.logger.debug(`Executing cached action:\n${code}`);
            try {
                let pageScreenshotBeforeApplyingAction = "";
                if (step.waitUntil) {
                    pageScreenshotBeforeApplyingAction = (await tabManager.active().screenshot({ fullPage: false })).toString("base64");
                }
                /**
                 *  Before executing the first cached step, ensure the DOM is stable to avoid
                 *  taking snapshot of a loading or transitioning state. Give it higher idle time because the page might
                 *  take a bit longer to stabilize right after navigation.
                 */
                const INITIAL_DOM_STABILIZATION_IDLE_TIME = constants_1.INITIAL_DOM_STABILIZATION_IDLE;
                if (i === 0) {
                    await (0, utils_1.waitForDOMStabilization)(tabManager, test, INITIAL_DOM_STABILIZATION_IDLE_TIME);
                }
                const pageSnapshotBeforeApplyingAction = await (0, utils_1.safeSnapshot)(tabManager);
                await (0, utils_1.runLocatorCode)(tabManager, code);
                /**
                 *  Verify that the action had the intended effect on the page. This is because sometimes cached pw action may silently fail.
                 *
                 *  Before verifying, this function will wait for the DOM to stabilize.
                 *  stabilization idle time is set to 500ms by default.
                 *
                 *  This means workflow is this: action performed -> wait for DOM stabilization -> check if action had effect -> next step
                 *
                 *  Auto healing will be triggered if the action did not have any effect on the page.
                 */
                await (0, utils_1.verifyActionEffect)(tabManager, action, pageSnapshotBeforeApplyingAction);
                if (step.waitUntil) {
                    await (0, utils_1.waitForCondition)({
                        page: tabManager,
                        condition: step.waitUntil,
                        pageScreenshotBeforeApplyingAction,
                        previousSteps: processedSteps.slice(0, i),
                        currentStep: step,
                        nextStep: processedSteps[i + 1],
                    });
                }
                // Handle data extraction if specified
                // This is done post cached step execution
                if (step.extract) {
                    const snapshot = await (0, utils_1.safeSnapshot)(tabManager);
                    const url = tabManager.active().url();
                    const extracted = await (0, extract_1.extractDataWithAI)({
                        snapshot,
                        url,
                        prompt: step.extract.prompt,
                    });
                    const placeholderKey = `{{run.${step.extract.as}}}`;
                    localValues[placeholderKey] = extracted;
                    logger_1.logger.info(`Extracted {{run.${step.extract.as}}}: "${extracted}"`);
                }
                continue;
            }
            catch (error) {
                logger_1.logger.debug(`Error executing cached step, falling back to AI execution: ${error}`);
            }
        }
        const abortController = new AbortController();
        const { tools, getPendingCacheData, clearPendingCacheData } = (0, tools_1.getAItools)(tabManager.active(), {
            currentStep: step,
            abortController,
            test,
            tabManager,
        });
        logger_1.logger.debug(`Executing Step: ${step.description}`);
        let pageScreenshotBeforeApplyingAction = "";
        if (step.waitUntil) {
            pageScreenshotBeforeApplyingAction = (await tabManager.active().screenshot({ fullPage: false })).toString("base64");
        }
        const model = (0, models_1.resolveModel)((0, config_1.getModelId)("stepExecution"));
        logger_1.logger.debug(`Using model: ${(0, config_1.getModelId)("stepExecution")} for step execution / gateway: ${(0, config_1.getConfig)().ai?.gateway ?? "none"}`);
        try {
            const result = await maybeWithSpan({ capability: "step_execution", step: "agentic_tool_calling" }, async () => (0, ai_1.generateText)({
                model,
                maxRetries: constants_1.MAX_RETRIES,
                temperature: 0,
                tools: tools,
                providerOptions: {
                    google: {
                        thinkingConfig: {
                            includeThoughts: false,
                            thinkingLevel: "medium",
                        },
                    },
                    openrouter: {
                        reasoning: {
                            effort: "medium",
                            exclude: true
                        },
                    },
                },
                onStepFinish: async ({ toolCalls }) => {
                    if (!onReasoning)
                        return;
                    // Append tool call reasoning to the response
                    toolCalls.forEach((toolCall) => {
                        const reasoning = `${(toolCall?.input).reasoning}\n\n`;
                        onReasoning({
                            id,
                            reasoning,
                        });
                    });
                },
                stopWhen: (0, ai_1.stepCountIs)(constants_1.STEP_EXECUTION_MAX_STEPS),
                abortSignal: AbortSignal.timeout(constants_1.STEP_EXECUTION_TIMEOUT),
                toolChoice: "auto",
                prompt: (0, prompts_1.buildRunStepsPrompt)({
                    auth,
                    steps: processedSteps,
                    step,
                    userFlow,
                    stepIndex: i,
                }),
            }));
            // Cache the step action only if it was a single tool call (simple, deterministic action).
            // Multi-step actions are not cached as they may be non-deterministic.
            const allToolCalls = result.steps
                .flatMap((s) => s.toolCalls)
                .filter((tool) => ["browser_snapshot", "browser_stop"].indexOf(tool.toolName) === -1);
            if (allToolCalls.length === 1 && cache_1.cache) {
                const cacheData = getPendingCacheData();
                if (cacheData) {
                    await cache_1.cache.hset(`step:${userFlow}:${step.description}`, cacheData);
                    logger_1.logger.debug(`Cached step action: ${step.description}`);
                }
            }
            clearPendingCacheData();
        }
        catch (error) {
            logger_1.logger.error({ err: error }, `Step execution failed: ${step.description}`);
            errorInStepExecution = error instanceof Error ? error.message : String(error);
            stepThatFailed = step.description;
            break;
        }
        if (step.waitUntil) {
            await (0, utils_1.waitForCondition)({
                page: tabManager,
                condition: step.waitUntil,
                pageScreenshotBeforeApplyingAction,
                previousSteps: processedSteps.slice(0, i),
                currentStep: step,
                nextStep: processedSteps[i + 1],
            });
        }
        // Handle data extraction if specified
        // This is done post AI step execution
        if (step.extract) {
            const snapshot = await (0, utils_1.safeSnapshot)(tabManager);
            const url = tabManager.active().url();
            const extracted = await (0, extract_1.extractDataWithAI)({
                snapshot,
                url,
                prompt: step.extract.prompt,
            });
            const placeholderKey = `{{run.${step.extract.as}}}`;
            localValues[placeholderKey] = extracted;
            logger_1.logger.info(`Extracted {{run.${step.extract.as}}}: "${extracted}"`);
        }
        if (onStepEnd) {
            onStepEnd({ id, description: step.description });
        }
    }
    if (errorInStepExecution) {
        logger_1.logger.warn(`Step execution encountered an error. Skipping assertions execution.`);
        const errorDescription = `\n${errorInStepExecution}\nStep: ${stepThatFailed}`;
        if (test) {
            test.info().annotations.push({
                type: "Error",
                description: errorDescription,
            });
        }
        throw new errors_1.StepExecutionError(errorDescription, stepThatFailed);
    }
    if (processedAssertions && processedAssertions.length > 0 && expect) {
        for (const { assertion, effort, images } of processedAssertions) {
            logger_1.logger.info(`Running assertion: ${assertion}`);
            const id = shortid_1.default.generate();
            if (onStepStart) {
                onStepStart({
                    id,
                    description: "Starting assertion verification",
                });
            }
            if (onReasoning) {
                onReasoning({
                    id,
                    reasoning: `Verifying assertion: ${assertion}`,
                });
            }
            const reasoning = await (0, assertion_1.assert)({
                page: tabManager,
                assertion,
                test,
                expect,
                effort,
                images,
                failSilently: failAssertionsSilently,
                maxRetries: 1,
                onRetry: (retryCount, previousResult) => { },
            });
            if (onReasoning) {
                onReasoning({
                    id,
                    reasoning: `\n\n${reasoning}`,
                });
            }
            if (onStepEnd) {
                onStepEnd({ id, description: "Successfully verified assertion" });
            }
        }
    }
};
exports.runSteps = runSteps;
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
const runUserFlow = async ({ page, userFlow, steps, assertion, effort = "low", thinkingBudget = constants_1.THINKING_BUDGET_DEFAULT, }) => {
    const abortController = new AbortController();
    const model = effort === "low"
        ? (0, models_1.resolveModel)((0, config_1.getModelId)("userFlowLow"))
        : (0, models_1.resolveModel)((0, config_1.getModelId)("userFlowHigh"));
    const { tools } = (0, tools_1.getAItools)(page, {
        abortController,
    });
    try {
        const { text } = await maybeWithSpan({ capability: "user_flow_execution", step: "agentic_tool_calling" }, async () => {
            return (0, ai_1.generateText)({
                model,
                maxRetries: constants_1.MAX_RETRIES,
                temperature: 0,
                tools: tools,
                providerOptions: {
                    google: {
                        thinkingConfig: {
                            thinkingBudget,
                        },
                    },
                    openrouter: {
                        reasoning: {
                            max_tokens: thinkingBudget,
                        },
                    },
                },
                stopWhen: (0, ai_1.stepCountIs)(constants_1.USER_FLOW_MAX_STEPS),
                abortSignal: abortController.signal,
                prepareStep: async ({ messages }) => {
                    // Remove older messages to keep the context window small
                    if (messages.length > 11) {
                        const modifiedMessages = [messages[0], ...messages.slice(-10)];
                        return {
                            messages: modifiedMessages,
                        };
                    }
                    return {};
                },
                toolChoice: "auto",
                prompt: (0, prompts_1.buildRunUserFlowPrompt)({
                    steps,
                    userFlow,
                    assertion,
                }),
            });
        });
        if (assertion) {
            const { output } = await (0, ai_1.generateText)({
                model: (0, models_1.resolveModel)((0, config_1.getModelId)("utility")),
                prompt: `Convert the following text output into a valid JSON object with the specified properties:\n\n${text}`,
                output: ai_1.Output.object({
                    schema: zod_1.z.object({
                        assertionPassed: zod_1.z.boolean().describe("Indicates whether the assertion passed or not."),
                        confidenceScore: zod_1.z
                            .number()
                            .describe("Confidence score of the assertion, between 0 and 100."),
                        reasoning: zod_1.z
                            .string()
                            .describe("Brief explanation of the reasoning behind the assertion."),
                    }),
                }),
            });
            return output;
        }
        return text;
    }
    catch (error) {
        logger_1.logger.error({ err: error }, "Error during user flow execution");
    }
};
exports.runUserFlow = runUserFlow;
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
const executeWithAutoHealing = async (config) => {
    const { cachedFlow, aiFlow, test, aiFlowTimeout } = config;
    if (process.env.AI || test.info().retry > 0) {
        if (aiFlowTimeout) {
            test.setTimeout(aiFlowTimeout);
        }
        await aiFlow();
    }
    else {
        await cachedFlow();
    }
};
exports.executeWithAutoHealing = executeWithAutoHealing;
var config_2 = require("./config");
Object.defineProperty(exports, "configure", { enumerable: true, get: function () { return config_2.configure; } });
var emailsink_1 = require("./providers/emailsink");
Object.defineProperty(exports, "emailsinkProvider", { enumerable: true, get: function () { return emailsink_1.emailsinkProvider; } });
var email_1 = require("./email");
Object.defineProperty(exports, "extractEmailContent", { enumerable: true, get: function () { return email_1.extractEmailContent; } });
Object.defineProperty(exports, "generateEmail", { enumerable: true, get: function () { return email_1.generateEmail; } });
var assertion_2 = require("./assertion");
Object.defineProperty(exports, "assert", { enumerable: true, get: function () { return assertion_2.assert; } });
var errors_2 = require("./errors");
Object.defineProperty(exports, "PassmarkError", { enumerable: true, get: function () { return errors_2.PassmarkError; } });
Object.defineProperty(exports, "StepExecutionError", { enumerable: true, get: function () { return errors_2.StepExecutionError; } });
Object.defineProperty(exports, "ValidationError", { enumerable: true, get: function () { return errors_2.ValidationError; } });
Object.defineProperty(exports, "AIModelError", { enumerable: true, get: function () { return errors_2.AIModelError; } });
Object.defineProperty(exports, "CacheError", { enumerable: true, get: function () { return errors_2.CacheError; } });
Object.defineProperty(exports, "ConfigurationError", { enumerable: true, get: function () { return errors_2.ConfigurationError; } });
