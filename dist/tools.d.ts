import { type Page } from "@playwright/test";
import { PlaywrightTestArgs, PlaywrightTestOptions, PlaywrightWorkerArgs, PlaywrightWorkerOptions, TestType } from "@playwright/test";
import type { TabManager } from "./utils/tab-manager";
type ToolSettings = {
    abortController?: AbortController;
    currentStep?: {
        description: string;
        data?: Record<string, string>;
    };
    test?: TestType<PlaywrightTestArgs & PlaywrightTestOptions, PlaywrightWorkerArgs & PlaywrightWorkerOptions>;
    /**
     * Optional tab manager. When provided, tools resolve the active page
     * dynamically and auto-switch to a newly opened tab after action tools.
     */
    tabManager?: TabManager;
};
export declare function getAItools(page: Page, settings?: ToolSettings): {
    tools: {
        browser_navigate: import("ai").Tool<{
            url: string;
            reasoning: string;
            doesActionAdvanceUsTowardsGoal: boolean;
        }, string | ({
            success: boolean;
            url: string;
        } & {
            snapshot: string;
        })>;
        browser_click: import("ai").Tool<{
            ref: string;
            elementDescription: string;
            reasoning: string;
            doesActionAdvanceUsTowardsGoal: boolean;
            button?: "left" | "right" | "middle" | undefined;
            doubleClick?: boolean | undefined;
        }, string | ({
            success: boolean;
        } & {
            snapshot: string;
        })>;
        browser_type: import("ai").Tool<{
            ref: string;
            elementDescription: string;
            text: string;
            reasoning: string;
            doesActionAdvanceUsTowardsGoal: boolean;
        }, string | ({
            success: boolean;
            text: string;
        } & {
            snapshot: string;
        })>;
        browser_take_screenshot: import("ai").Tool<{
            fullPage: boolean;
            reasoning: string;
        }, unknown>;
        browser_press_key: import("ai").Tool<{
            key: string;
        }, string | ({
            success: boolean;
            key: string;
        } & {
            snapshot: string;
        })>;
        browser_navigate_back: import("ai").Tool<Record<string, never>, string | ({
            success: boolean;
        } & {
            snapshot: string;
        })>;
        browser_navigate_forward: import("ai").Tool<Record<string, never>, string | ({
            success: boolean;
        } & {
            snapshot: string;
        })>;
        browser_reload: import("ai").Tool<{
            reasoning: string;
        }, string | ({
            success: boolean;
        } & {
            snapshot: string;
        })>;
        browser_snapshot: import("ai").Tool<{
            reasoning: string;
        }, string>;
        browser_wait: import("ai").Tool<{
            timeout: number;
            reasoning: string;
        }, string | ({
            success: boolean;
            timeout: number;
            message: string;
        } & {
            snapshot: string;
        })>;
        browser_mouse_move: import("ai").Tool<{
            x: number;
            y: number;
            reasoning: string;
        }, string | ({
            success: boolean;
        } & {
            snapshot: string;
        })>;
        browser_mouse_down: import("ai").Tool<{
            reasoning: string;
        }, string | ({
            success: boolean;
        } & {
            snapshot: string;
        })>;
        browser_mouse_up: import("ai").Tool<{
            reasoning: string;
        }, string | ({
            success: boolean;
        } & {
            snapshot: string;
        })>;
        browser_select_dropdown_option: import("ai").Tool<{
            ref: string;
            elementDescription: string;
            value: string;
            reasoning: string;
            doesActionAdvanceUsTowardsGoal: boolean;
        }, string | ({
            success: boolean;
            value: string;
        } & {
            snapshot: string;
        })>;
        browser_stop: import("ai").Tool<{
            reasoning: string;
        }, {
            success: boolean;
            message: string;
        }>;
        browser_drag_and_drop: import("ai").Tool<{
            sourceRef: string;
            sourceElementDescription: string;
            targetRef: string;
            targetElementDescription: string;
            reasoning: string;
            doesActionAdvanceUsTowardsGoal: boolean;
        }, string | ({
            success: boolean;
        } & {
            snapshot: string;
        })>;
        browser_hover: import("ai").Tool<{
            ref: string;
            elementDescription: string;
            reasoning: string;
            doesActionAdvanceUsTowardsGoal: boolean;
        }, string | ({
            success: boolean;
        } & {
            snapshot: string;
        })>;
        browser_upload_file: import("ai").Tool<{
            ref: string;
            elementDescription: string;
            filePaths: string[];
            reasoning: string;
            doesActionAdvanceUsTowardsGoal: boolean;
        }, string | ({
            success: boolean;
            prefixedFilePaths: string[];
        } & {
            snapshot: string;
        })>;
        browser_trigger_blur: import("ai").Tool<{
            reasoning: string;
            doesActionAdvanceUsTowardsGoal: boolean;
        }, string | ({
            success: boolean;
        } & {
            snapshot: string;
        })>;
        get_unique_value: import("ai").Tool<{
            prefix: string;
        }, {
            success: boolean;
            value: string;
        }>;
    };
    getPendingCacheData: () => Record<string, string> | null;
    clearPendingCacheData: () => void;
};
export {};
