"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GLOBAL_PLACEHOLDER_KEYS = exports.LOCAL_PLACEHOLDER_KEYS = exports.EMAIL_EXTRACTION_PATTERN = void 0;
exports.getGlobalValues = getGlobalValues;
exports.saveGlobalValues = saveGlobalValues;
exports.getProjectData = getProjectData;
exports.generateLocalValues = generateLocalValues;
exports.generateGlobalValues = generateGlobalValues;
exports.containsGlobalPlaceholder = containsGlobalPlaceholder;
exports.stepsContainGlobalPlaceholders = stepsContainGlobalPlaceholders;
exports.assertionsContainGlobalPlaceholders = assertionsContainGlobalPlaceholders;
exports.containsProjectDataPlaceholder = containsProjectDataPlaceholder;
exports.stepsContainProjectDataPlaceholders = stepsContainProjectDataPlaceholders;
exports.replacePlaceholders = replacePlaceholders;
exports.processPlaceholders = processPlaceholders;
exports.getDynamicEmail = getDynamicEmail;
exports.resolveEmailPlaceholders = resolveEmailPlaceholders;
const errors_1 = require("./errors");
const shortid_1 = __importDefault(require("shortid"));
const config_1 = require("./config");
const email_1 = require("./email");
const constants_1 = require("./constants");
const logger_1 = require("./logger");
const cache_1 = require("./cache");
const utils_1 = require("./utils");
// =============================================================================
// Constants
// =============================================================================
/**
 * Pattern to match email extraction placeholders.
 * Format: {{email.<type>:<prompt>}} or {{email.<type>:<prompt>:<email>}}
 * Examples:
 *   - {{email.otp:get the 6 digit verification code}}
 *   - {{email.otp:get the 6 digit verification code:sandeep@bug0.ai}}
 *   - {{email.link:get the magic link url}}
 *   - {{email.code:get the confirmation code}}
 */
exports.EMAIL_EXTRACTION_PATTERN = /\{\{email\.(\w+):([^:}]+)(?::([^}]+))?\}\}/;
exports.LOCAL_PLACEHOLDER_KEYS = [
    "{{run.shortid}}",
    "{{run.fullName}}",
    "{{run.email}}",
    "{{run.dynamicEmail}}",
    "{{run.phoneNumber}}",
];
exports.GLOBAL_PLACEHOLDER_KEYS = [
    "{{global.shortid}}",
    "{{global.fullName}}",
    "{{global.email}}",
    "{{global.dynamicEmail}}",
    "{{global.phoneNumber}}",
];
/** Pattern to detect any global placeholder in text */
const GLOBAL_PLACEHOLDER_PATTERN = /\{\{global\.\w+\}\}/;
/** Pattern to detect any project data placeholder in text */
const PROJECT_DATA_PLACEHOLDER_PATTERN = /\{\{data\.(\w+)\}\}/g;
// =============================================================================
// Cache Operations (Global Values)
// =============================================================================
/**
 * Generates a cache key for storing global values for an execution.
 */
function getCacheKey(executionId) {
    return `execution:${executionId}:globals`;
}
/**
 * Fetches global values from the cache for a given execution ID.
 * Returns null if no values exist.
 */
async function getGlobalValues(executionId) {
    if (!cache_1.cache)
        return null;
    const key = getCacheKey(executionId);
    const values = await cache_1.cache.hgetall(key);
    if (!values || Object.keys(values).length === 0) {
        return null;
    }
    return values;
}
/**
 * Saves global values to the cache for a given execution ID.
 * Sets a 24-hour TTL on the key.
 */
async function saveGlobalValues(executionId, values) {
    if (!cache_1.cache)
        return;
    const key = getCacheKey(executionId);
    // Save all values as a hash
    await cache_1.cache.hset(key, values);
    // Set TTL
    await cache_1.cache.expire(key, constants_1.GLOBAL_VALUES_TTL_SECONDS);
    logger_1.logger.debug(`Saved global values to cache for execution: ${executionId}`);
}
// =============================================================================
// Cache Operations (Project Data)
// =============================================================================
/**
 * Generates a cache key for storing project data.
 */
function getProjectDataCacheKey(projectId) {
    return `project:${projectId}:data`;
}
/**
 * Fetches project data from the cache for a given project ID.
 * Returns an empty object if no data exists.
 */
async function getProjectData(projectId) {
    if (!cache_1.cache)
        return {};
    const key = getProjectDataCacheKey(projectId);
    const values = await cache_1.cache.hgetall(key);
    if (!values || Object.keys(values).length === 0) {
        return {};
    }
    return values;
}
// =============================================================================
// Value Generation
// =============================================================================
/**
 * Generates local values for placeholders.
 * These are fresh for each runSteps call.
 */
async function generateLocalValues() {
    const { faker } = await import("@faker-js/faker");
    const { v4: uuidv4 } = await import("uuid");
    const emailDomain = (0, config_1.getConfig)().email?.domain;
    return {
        "{{run.shortid}}": shortid_1.default.generate(),
        "{{run.fullName}}": faker.person.fullName(),
        "{{run.email}}": faker.internet.email(),
        "{{run.dynamicEmail}}": emailDomain ? `e2e-tester-${uuidv4()}@${emailDomain}` : "",
        "{{run.phoneNumber}}": (0, utils_1.generatePhoneNumber)(),
    };
}
/**
 * Generates global values, reusing any existing values provided.
 * Only generates values for keys that don't exist in existingValues.
 */
async function generateGlobalValues(existingValues) {
    const { faker } = await import("@faker-js/faker");
    const { v4: uuidv4 } = await import("uuid");
    const emailDomain = (0, config_1.getConfig)().email?.domain;
    return {
        "{{global.shortid}}": existingValues?.["{{global.shortid}}"] ?? shortid_1.default.generate(),
        "{{global.fullName}}": existingValues?.["{{global.fullName}}"] ?? faker.person.fullName(),
        "{{global.email}}": existingValues?.["{{global.email}}"] ?? faker.internet.email(),
        "{{global.dynamicEmail}}": existingValues?.["{{global.dynamicEmail}}"] ??
            (emailDomain ? `e2e-tester-${uuidv4()}@${emailDomain}` : ""),
        "{{global.phoneNumber}}": existingValues?.["{{global.phoneNumber}}"] ?? (0, utils_1.generatePhoneNumber)(),
    };
}
// =============================================================================
// Placeholder Detection
// =============================================================================
/**
 * Checks if any text contains global placeholders.
 */
function containsGlobalPlaceholder(text) {
    return GLOBAL_PLACEHOLDER_PATTERN.test(text);
}
/**
 * Scans steps for any global placeholders.
 * Returns true if any step description, data value, or script contains a global placeholder.
 */
function stepsContainGlobalPlaceholders(steps) {
    for (const step of steps) {
        if (containsGlobalPlaceholder(step.description)) {
            return true;
        }
        if (step.data) {
            for (const value of Object.values(step.data)) {
                if (containsGlobalPlaceholder(value)) {
                    return true;
                }
            }
        }
        if (step.script && containsGlobalPlaceholder(step.script)) {
            return true;
        }
        if (step.waitUntil && containsGlobalPlaceholder(step.waitUntil)) {
            return true;
        }
    }
    return false;
}
/**
 * Scans assertions for any global placeholders.
 */
function assertionsContainGlobalPlaceholders(assertions) {
    if (!assertions)
        return false;
    for (const item of assertions) {
        if (containsGlobalPlaceholder(item.assertion)) {
            return true;
        }
    }
    return false;
}
/**
 * Checks if any text contains project data placeholders.
 */
function containsProjectDataPlaceholder(text) {
    // Reset lastIndex since we're using a global regex
    PROJECT_DATA_PLACEHOLDER_PATTERN.lastIndex = 0;
    return PROJECT_DATA_PLACEHOLDER_PATTERN.test(text);
}
/**
 * Scans steps for any project data placeholders.
 * Returns true if any step description, data value, or script contains a project data placeholder.
 */
function stepsContainProjectDataPlaceholders(steps) {
    for (const step of steps) {
        if (containsProjectDataPlaceholder(step.description)) {
            return true;
        }
        if (step.data) {
            for (const value of Object.values(step.data)) {
                if (containsProjectDataPlaceholder(value)) {
                    return true;
                }
            }
        }
        if (step.script && containsProjectDataPlaceholder(step.script)) {
            return true;
        }
        if (step.waitUntil && containsProjectDataPlaceholder(step.waitUntil)) {
            return true;
        }
    }
    return false;
}
// =============================================================================
// Placeholder Replacement
// =============================================================================
/**
 * Replaces dynamic placeholders in a string with their corresponding values.
 * Handles {{run.*}}, {{global.*}}, and {{data.*}} placeholders.
 */
function replacePlaceholders(text, localValues, globalValues, projectDataValues) {
    let result = text;
    // Throw if dynamicEmail placeholders are used without an email provider configured
    const dynamicEmailPlaceholders = ["{{run.dynamicEmail}}", "{{global.dynamicEmail}}"];
    for (const placeholder of dynamicEmailPlaceholders) {
        if (result.includes(placeholder) && !(0, config_1.getConfig)().email) {
            throw new errors_1.ConfigurationError(`Email provider not configured. Call configure({ email: ... }) before using ${placeholder}.`);
        }
    }
    // Replace {{run.*}} placeholders
    for (const [placeholder, value] of Object.entries(localValues)) {
        result = result.split(placeholder).join(value);
    }
    // Replace {{global.*}} placeholders
    if (globalValues) {
        for (const [placeholder, value] of Object.entries(globalValues)) {
            result = result.split(placeholder).join(value);
        }
    }
    // Replace {{data.key}} placeholders
    if (projectDataValues) {
        result = result.replace(/\{\{data\.(\w+)\}\}/g, (match, key) => {
            const value = projectDataValues[key];
            if (value === undefined) {
                logger_1.logger.warn(`[ProjectData] Placeholder ${match} not found`);
                return match;
            }
            return value;
        });
    }
    return result;
}
// =============================================================================
// Main Processing Function
// =============================================================================
/**
 * Processes steps and assertions to replace dynamic placeholders with consistent values.
 * Handles {{run.*}} placeholders (fresh per call), {{global.*}} placeholders
 * (shared across execution via cache), and {{data.*}} placeholders (project data from cache).
 * Returns the processed steps and assertions along with the generated values.
 */
async function processPlaceholders(steps, assertions, executionId, projectId) {
    // Check if global placeholders are used without executionId
    const hasGlobalPlaceholders = stepsContainGlobalPlaceholders(steps) || assertionsContainGlobalPlaceholders(assertions);
    if (hasGlobalPlaceholders && !executionId) {
        throw new errors_1.ValidationError("{{global.*}} placeholders require an executionId. " +
            "Please provide executionId in runSteps options to use global placeholders.");
    }
    // Check if project data placeholders are used without projectId
    const hasProjectDataPlaceholders = stepsContainProjectDataPlaceholders(steps);
    if (hasProjectDataPlaceholders && !projectId) {
        throw new errors_1.ValidationError("{{data.*}} placeholders require a projectId. " +
            "Please provide projectId in runSteps options to use project data placeholders.");
    }
    // Generate fresh run values (always new per runSteps call)
    const localValues = await generateLocalValues();
    // Handle global values if executionId is provided
    let globalValues;
    if (executionId) {
        // Try to load existing global values from Redis
        const existingGlobalValues = await getGlobalValues(executionId);
        // Generate global values, reusing existing ones
        globalValues = await generateGlobalValues(existingGlobalValues);
        // Save global values back to Redis (updates TTL and adds any new values)
        await saveGlobalValues(executionId, globalValues);
        logger_1.logger.debug({ globalValues }, `Using global values for execution ${executionId}`);
    }
    // Fetch project data if projectId is provided
    let projectDataValues;
    if (projectId) {
        projectDataValues = await getProjectData(projectId);
        logger_1.logger.debug({ projectDataValues }, `Using project data for project ${projectId}`);
    }
    // Deep clone and process steps
    // Note: Email extraction placeholders ({{email.xxx:prompt}}) are NOT resolved here.
    // They are resolved lazily in runSteps just before each step executes.
    const processedSteps = steps.map((step) => {
        const processedStep = { ...step };
        if (processedStep.data) {
            processedStep.data = { ...processedStep.data };
            for (const key in processedStep.data) {
                processedStep.data[key] = replacePlaceholders(processedStep.data[key], localValues, globalValues, projectDataValues);
            }
        }
        // Process script placeholders if present
        if (processedStep.script) {
            processedStep.script = replacePlaceholders(processedStep.script, localValues, globalValues, projectDataValues);
        }
        // Process waitUntil placeholders if present
        if (processedStep.waitUntil) {
            processedStep.waitUntil = replacePlaceholders(processedStep.waitUntil, localValues, globalValues, projectDataValues);
        }
        return processedStep;
    });
    // Process assertions if provided
    let processedAssertions;
    if (assertions) {
        processedAssertions = assertions.map((assertionItem) => ({
            ...assertionItem,
            assertion: replacePlaceholders(assertionItem.assertion, localValues, globalValues, projectDataValues),
        }));
    }
    return {
        processedSteps,
        processedAssertions,
        localValues,
        globalValues,
        projectDataValues,
    };
}
/**
 * Gets the dynamic email to use for email extraction.
 * Prefers global email if available, otherwise falls back to local email.
 */
function getDynamicEmail(localValues, globalValues) {
    return globalValues?.["{{global.dynamicEmail}}"] || localValues["{{run.dynamicEmail}}"];
}
/**
 * Resolves email extraction placeholders in step data.
 * This should be called just before step execution to ensure emails have arrived.
 */
async function resolveEmailPlaceholders(step, dynamicEmail) {
    if (!step.data)
        return step;
    const resolvedData = { ...step.data };
    let hasEmailExtraction = false;
    for (const key in resolvedData) {
        const value = resolvedData[key];
        const match = value.match(exports.EMAIL_EXTRACTION_PATTERN);
        if (match) {
            hasEmailExtraction = true;
            const [fullMatch, extractType, prompt, explicitEmail] = match;
            const targetEmail = explicitEmail?.trim() || dynamicEmail;
            logger_1.logger.debug(`Extracting ${extractType} from ${targetEmail} with prompt: "${prompt}"`);
            const extractedValue = await (0, email_1.extractEmailContent)({
                email: targetEmail,
                prompt: prompt.trim(),
            });
            resolvedData[key] = value.replace(fullMatch, extractedValue);
        }
    }
    if (hasEmailExtraction) {
        return { ...step, data: resolvedData };
    }
    return step;
}
