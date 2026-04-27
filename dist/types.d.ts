import { LanguageModel } from "ai";
import { Expect, type Page, PlaywrightTestArgs, PlaywrightTestOptions, PlaywrightWorkerArgs, PlaywrightWorkerOptions, TestType } from "@playwright/test";
import type { TabManager } from "./utils/tab-manager";
export type PageInput = Page | TabManager;
export type AssertionResult = {
    assertionPassed: boolean;
    confidenceScore: number;
    reasoning: string;
};
export type UserFlowOptions = {
    page: Page;
    userFlow: string;
    steps: string;
    assertion?: string;
    effort?: "low" | "high";
    thinkingBudget?: number;
    auth?: {
        email: string;
        password: string;
    };
    model?: LanguageModel;
};
/**
 * Configuration for extracting data from a page using AI.
 * The extracted value will be stored as {{run.keyName}} and can be used in subsequent steps.
 */
export type ExtractionConfig = {
    /** Key name - the extracted value will be accessible as {{run.keyName}} in subsequent steps' data.value */
    as: string;
    /** Prompt describing what to extract from the page/URL */
    prompt: string;
};
export type Step = {
    bypassCache?: boolean;
    description: string;
    data?: Record<string, string>;
    waitUntil?: string;
    isScript?: boolean;
    script?: string;
    moduleId?: string;
    /** Extract data from page/URL using AI and store as {{run.as}} for later use */
    extract?: ExtractionConfig;
    /** Switch the active page before this step runs. 'main' = original tab, 'latest' = most recently opened, or numeric index. */
    switchToTab?: "main" | "latest" | number;
};
export type AssertionOptions = {
    page: PageInput;
    assertion: string;
    failSilently?: boolean;
    test?: TestType<PlaywrightTestArgs & PlaywrightTestOptions, PlaywrightWorkerArgs & PlaywrightWorkerOptions>;
    expect: Expect<{}>;
    effort?: "low" | "high";
    images?: string[];
    maxRetries?: number;
    onRetry?: (retryCount: number, previousResult: AssertionResult) => void;
};
export type WaitConditionResult = {
    conditionMet: boolean;
    reasoning: string;
};
export type WaitForConditionOptions = {
    page: PageInput;
    condition: string;
    pageScreenshotBeforeApplyingAction: string;
    previousSteps?: Step[];
    currentStep: Step;
    nextStep?: Step;
    initialInterval?: number;
    timeout?: number;
    maxInterval?: number;
};
export type RunStepsOptions = {
    projectId?: string;
    page: Page;
    test?: TestType<PlaywrightTestArgs & PlaywrightTestOptions, PlaywrightWorkerArgs & PlaywrightWorkerOptions>;
    userFlow: string;
    steps: Step[];
    bypassCache?: boolean;
    failAssertionsSilently?: boolean;
    auth?: {
        email: string;
        password: string;
    };
    onStepStart?: (step: {
        id: string;
        description: string;
    }) => void;
    onStepEnd?: (step: {
        id: string;
        description: string;
    }) => void;
    onReasoning?: (step: {
        id: string;
        reasoning: string;
    }) => void;
    /**
     * Execution ID to link multiple runSteps calls together.
     * When provided, {{global.*}} placeholders are persisted to the cache
     * and shared across all runSteps calls with the same executionId.
     * Required when using {{global.*}} placeholders.
     */
    executionId?: string;
} & ({
    assertions: Omit<AssertionOptions, "page" | "test" | "expect">[];
    expect: Expect<{}>;
} | {
    assertions?: never;
    expect?: never;
});
