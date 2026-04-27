import { Step } from "./types";
/**
 * Local placeholders that are fresh for each runSteps call.
 * These values are NOT persisted and are regenerated every time.
 */
export type LocalPlaceholders = {
    "{{run.shortid}}": string;
    "{{run.fullName}}": string;
    "{{run.email}}": string;
    "{{run.dynamicEmail}}": string;
    "{{run.phoneNumber}}": string;
};
/**
 * Global placeholders that are shared across all tests within an execution.
 * These values are persisted to the cache and loaded for subsequent runSteps calls
 * with the same executionId.
 */
export type GlobalPlaceholders = {
    "{{global.shortid}}": string;
    "{{global.fullName}}": string;
    "{{global.email}}": string;
    "{{global.dynamicEmail}}": string;
    "{{global.phoneNumber}}": string;
};
/**
 * Project data placeholders for {{data.key}} syntax.
 * These are stored in the cache and managed via project settings.
 */
export type ProjectDataPlaceholders = Record<string, string>;
export type AssertionItem = {
    assertion: string;
    effort?: "low" | "high";
    images?: string[];
};
export type ProcessPlaceholdersResult = {
    processedSteps: Step[];
    processedAssertions?: AssertionItem[];
    localValues: LocalPlaceholders;
    globalValues?: GlobalPlaceholders;
    projectDataValues?: ProjectDataPlaceholders;
};
/**
 * Pattern to match email extraction placeholders.
 * Format: {{email.<type>:<prompt>}} or {{email.<type>:<prompt>:<email>}}
 * Examples:
 *   - {{email.otp:get the 6 digit verification code}}
 *   - {{email.otp:get the 6 digit verification code:sandeep@bug0.ai}}
 *   - {{email.link:get the magic link url}}
 *   - {{email.code:get the confirmation code}}
 */
export declare const EMAIL_EXTRACTION_PATTERN: RegExp;
export declare const LOCAL_PLACEHOLDER_KEYS: (keyof LocalPlaceholders)[];
export declare const GLOBAL_PLACEHOLDER_KEYS: (keyof GlobalPlaceholders)[];
/**
 * Fetches global values from the cache for a given execution ID.
 * Returns null if no values exist.
 */
export declare function getGlobalValues(executionId: string): Promise<Partial<GlobalPlaceholders> | null>;
/**
 * Saves global values to the cache for a given execution ID.
 * Sets a 24-hour TTL on the key.
 */
export declare function saveGlobalValues(executionId: string, values: GlobalPlaceholders): Promise<void>;
/**
 * Fetches project data from the cache for a given project ID.
 * Returns an empty object if no data exists.
 */
export declare function getProjectData(projectId: string): Promise<ProjectDataPlaceholders>;
/**
 * Generates local values for placeholders.
 * These are fresh for each runSteps call.
 */
export declare function generateLocalValues(): Promise<LocalPlaceholders>;
/**
 * Generates global values, reusing any existing values provided.
 * Only generates values for keys that don't exist in existingValues.
 */
export declare function generateGlobalValues(existingValues: Partial<GlobalPlaceholders> | null): Promise<GlobalPlaceholders>;
/**
 * Checks if any text contains global placeholders.
 */
export declare function containsGlobalPlaceholder(text: string): boolean;
/**
 * Scans steps for any global placeholders.
 * Returns true if any step description, data value, or script contains a global placeholder.
 */
export declare function stepsContainGlobalPlaceholders(steps: {
    description: string;
    data?: Record<string, string>;
    script?: string;
    waitUntil?: string;
}[]): boolean;
/**
 * Scans assertions for any global placeholders.
 */
export declare function assertionsContainGlobalPlaceholders(assertions?: {
    assertion: string;
}[]): boolean;
/**
 * Checks if any text contains project data placeholders.
 */
export declare function containsProjectDataPlaceholder(text: string): boolean;
/**
 * Scans steps for any project data placeholders.
 * Returns true if any step description, data value, or script contains a project data placeholder.
 */
export declare function stepsContainProjectDataPlaceholders(steps: {
    description: string;
    data?: Record<string, string>;
    script?: string;
    waitUntil?: string;
}[]): boolean;
/**
 * Replaces dynamic placeholders in a string with their corresponding values.
 * Handles {{run.*}}, {{global.*}}, and {{data.*}} placeholders.
 */
export declare function replacePlaceholders(text: string, localValues: LocalPlaceholders, globalValues?: GlobalPlaceholders, projectDataValues?: ProjectDataPlaceholders): string;
/**
 * Processes steps and assertions to replace dynamic placeholders with consistent values.
 * Handles {{run.*}} placeholders (fresh per call), {{global.*}} placeholders
 * (shared across execution via cache), and {{data.*}} placeholders (project data from cache).
 * Returns the processed steps and assertions along with the generated values.
 */
export declare function processPlaceholders(steps: Step[], assertions?: AssertionItem[], executionId?: string, projectId?: string): Promise<ProcessPlaceholdersResult>;
/**
 * Gets the dynamic email to use for email extraction.
 * Prefers global email if available, otherwise falls back to local email.
 */
export declare function getDynamicEmail(localValues: LocalPlaceholders, globalValues?: GlobalPlaceholders): string;
/**
 * Resolves email extraction placeholders in step data.
 * This should be called just before step execution to ensure emails have arrived.
 */
export declare function resolveEmailPlaceholders(step: Step, dynamicEmail: string): Promise<Step>;
