"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAItools = getAItools;
const ai_1 = require("ai");
const zod_1 = require("zod");
const ai_2 = require("axiom/ai");
const shortid_1 = __importDefault(require("shortid"));
const config_1 = require("./config");
const instrumentation_1 = require("./instrumentation");
const logger_1 = require("./logger");
const constants_1 = require("./constants");
// Only wrap tools with Axiom instrumentation when Axiom is configured
const maybeWrapTool = instrumentation_1.axiomEnabled ? ai_2.wrapTool : (_name, t) => t;
function getAItools(page, settings) {
    const playwrightTools = new PlaywrightTools(page, settings);
    const withSnapshot = async (fn, args) => {
        try {
            const result = await fn(args);
            // tab-manager's persistent 'page' listener auto-switches active focus
            // when a new tab opens, so getSnapshot() below targets it automatically.
            const snapshot = await playwrightTools.getSnapshot();
            return { ...result, snapshot };
        }
        catch (_error) {
            return `Error executing this action. Retry the action or try a different one.\n\nLatest Snapshot:\n\n${await playwrightTools.getSnapshot()}`;
        }
    };
    const tools = {
        browser_navigate: maybeWrapTool("browser_navigate", (0, ai_1.tool)({
            description: "Navigate to a URL. This tool should be used only when an explicit instruction to navigate is given in a particular step",
            inputSchema: playwrightTools.navigateSchema,
            execute: async (args) => withSnapshot(playwrightTools.navigate.bind(playwrightTools), args),
        })),
        browser_click: maybeWrapTool("browser_click", (0, ai_1.tool)({
            description: "Click on an element",
            inputSchema: playwrightTools.clickSchema,
            execute: async (args) => withSnapshot(playwrightTools.click.bind(playwrightTools), args),
        })),
        browser_type: maybeWrapTool("browser_type", (0, ai_1.tool)({
            description: "Type text into an element",
            inputSchema: playwrightTools.typeSchema,
            execute: async (args) => withSnapshot(playwrightTools.type.bind(playwrightTools), args),
        })),
        browser_take_screenshot: maybeWrapTool("browser_take_screenshot", (0, ai_1.tool)({
            description: "Take a screenshot",
            inputSchema: playwrightTools.screenshotSchema,
            execute: async (args) => {
                const fn = playwrightTools.takeScreenshot.bind(playwrightTools);
                const screenshot = await fn(args);
                return screenshot;
            },
            toModelOutput: (result) => {
                const base64 = (typeof result === "string" ? result : result.output);
                return {
                    type: "content",
                    value: [
                        { type: "media", data: base64, mediaType: "image/png" },
                    ],
                };
            },
        })),
        browser_press_key: maybeWrapTool("browser_press_key", (0, ai_1.tool)({
            description: "Press a key",
            inputSchema: playwrightTools.pressKeySchema,
            execute: async (args) => withSnapshot(playwrightTools.pressKey.bind(playwrightTools), args),
        })),
        browser_navigate_back: maybeWrapTool("browser_navigate_back", (0, ai_1.tool)({
            description: "Go back to previous page",
            inputSchema: zod_1.z.object({}),
            execute: async () => withSnapshot(playwrightTools.goBack.bind(playwrightTools), {}),
        })),
        browser_navigate_forward: maybeWrapTool("browser_navigate_forward", (0, ai_1.tool)({
            description: "Go forward to next page",
            inputSchema: zod_1.z.object({}),
            execute: async () => withSnapshot(playwrightTools.goForward.bind(playwrightTools), {}),
        })),
        browser_reload: maybeWrapTool("browser_reload", (0, ai_1.tool)({
            description: "Reload the current page",
            inputSchema: zod_1.z.object({
                reasoning: zod_1.z.string().describe("A quick one-line reasoning behind this action"),
            }),
            execute: async (args) => withSnapshot(playwrightTools.reload.bind(playwrightTools), args),
        })),
        browser_snapshot: maybeWrapTool("browser_snapshot", (0, ai_1.tool)({
            description: "Take fresh snapshot of the current page",
            inputSchema: zod_1.z.object({
                reasoning: zod_1.z.string().describe("A quick one-line reasoning behind this action"),
            }),
            execute: async (_args) => {
                return await playwrightTools.getSnapshot();
            },
        })),
        browser_wait: maybeWrapTool("browser_wait", (0, ai_1.tool)({
            description: "Wait for a specified amount of time",
            inputSchema: playwrightTools.waitSchema,
            execute: async (args) => withSnapshot(playwrightTools.wait.bind(playwrightTools), args),
        })),
        browser_mouse_move: maybeWrapTool("browser_mouse_move", (0, ai_1.tool)({
            description: "Move the mouse to a specific coordinate",
            inputSchema: playwrightTools.mouseMoveSchema,
            execute: async (args) => withSnapshot(playwrightTools.mouseMove.bind(playwrightTools), args),
        })),
        browser_mouse_down: maybeWrapTool("browser_mouse_down", (0, ai_1.tool)({
            description: "Press the left mouse button.",
            inputSchema: playwrightTools.mouseDownSchema,
            execute: async (args) => withSnapshot(playwrightTools.mouseDown.bind(playwrightTools), args),
        })),
        browser_mouse_up: maybeWrapTool("browser_mouse_up", (0, ai_1.tool)({
            description: "Release the left mouse button",
            inputSchema: playwrightTools.mouseUpSchema,
            execute: async (args) => withSnapshot(playwrightTools.mouseUp.bind(playwrightTools), args),
        })),
        browser_select_dropdown_option: maybeWrapTool("browser_select_dropdown_option", (0, ai_1.tool)({
            description: "Select an option from a dropdown",
            inputSchema: playwrightTools.selectDropdownOptionSchema,
            execute: async (args) => withSnapshot(playwrightTools.selectDropdownOption.bind(playwrightTools), args),
        })),
        browser_stop: maybeWrapTool("browser_stop", (0, ai_1.tool)({
            description: "Stop the user flow test",
            inputSchema: playwrightTools.stopSchema,
            execute: async (args) => playwrightTools.stop(args),
        })),
        browser_drag_and_drop: maybeWrapTool("browser_drag_and_drop", (0, ai_1.tool)({
            description: "Drag an element and drop it onto another element",
            inputSchema: playwrightTools.dragAndDropSchema,
            execute: async (args) => withSnapshot(playwrightTools.dragAndDrop.bind(playwrightTools), args),
        })),
        browser_hover: maybeWrapTool("browser_hover", (0, ai_1.tool)({
            description: "Hover over an element",
            inputSchema: playwrightTools.hoverSchema,
            execute: async (args) => withSnapshot(playwrightTools.hover.bind(playwrightTools), args),
        })),
        browser_upload_file: maybeWrapTool("browser_upload_file", (0, ai_1.tool)({
            description: "Upload a file",
            inputSchema: playwrightTools.uploadFileSchema,
            execute: async (args) => withSnapshot(playwrightTools.uploadFile.bind(playwrightTools), args),
        })),
        browser_trigger_blur: maybeWrapTool("browser_trigger_blur", (0, ai_1.tool)({
            description: "Trigger a blur event by clicking on the body. Useful for when an element needs to lose focus.",
            inputSchema: playwrightTools.triggerBlurSchema,
            execute: async (args) => withSnapshot(playwrightTools.triggerBlur.bind(playwrightTools), args),
        })),
        get_unique_value: maybeWrapTool("get_unique_value", (0, ai_1.tool)({
            description: "Generate a unique value by appending a shortid to a prefix",
            inputSchema: playwrightTools.getUniqueValueSchema,
            execute: async (args) => playwrightTools.getUniqueValue(args),
        })),
    };
    return {
        tools,
        getPendingCacheData: () => playwrightTools.pendingCacheData,
        clearPendingCacheData: () => {
            playwrightTools.pendingCacheData = null;
        },
    };
}
class PlaywrightTools {
    initialPage;
    tabManager;
    currentStep;
    abortController;
    pendingCacheData = null;
    get page() {
        return this.tabManager ? this.tabManager.active() : this.initialPage;
    }
    constructor(page, settings = {}) {
        const { currentStep, abortController, tabManager } = settings;
        this.initialPage = page;
        this.tabManager = tabManager;
        this.currentStep = currentStep;
        this.abortController = abortController;
    }
    async getSnapshot() {
        const snapshot = await this.page.ariaSnapshot({ mode: "ai", timeout: constants_1.SNAPSHOT_TIMEOUT });
        return `url: ${this.page.url()}\n\n${snapshot}`;
    }
    navigateSchema = zod_1.z.object({
        url: zod_1.z.string().describe("The URL to navigate to"),
        reasoning: zod_1.z.string().describe("A quick one-line reasoning behind this action"),
        doesActionAdvanceUsTowardsGoal: zod_1.z
            .boolean()
            .describe('"true" indicates high confidence that this action will advance us towards the goal. "false" indicates low confidence and could be an AI hallucination.'),
    });
    async navigate({ url }) {
        await this.page.goto(url, { waitUntil: "load" });
        return { success: true, url };
    }
    clickSchema = zod_1.z.object({
        ref: zod_1.z.string().describe("The ref of the element to click"),
        elementDescription: zod_1.z
            .string()
            .describe("A description of the element to click, used for debugging"),
        button: zod_1.z
            .enum(["left", "right", "middle"])
            .optional()
            .describe("Button to click, defaults to left"),
        doubleClick: zod_1.z
            .boolean()
            .optional()
            .describe("Whether to perform a double click instead of a single click"),
        reasoning: zod_1.z.string().describe("A quick one-line reasoning behind this action"),
        doesActionAdvanceUsTowardsGoal: zod_1.z
            .boolean()
            .describe('"true" indicates high confidence that this action will advance us towards the goal. "false" indicates low confidence and could be an AI hallucination.'),
    });
    async click({ ref, elementDescription, button, doubleClick, }) {
        const locator = this.page.locator(`aria-ref=${ref}`).describe(elementDescription);
        let cachedLocator = "";
        if (this.currentStep) {
            cachedLocator = await this.resolveLocator(locator);
        }
        if (doubleClick) {
            await locator.dblclick({ button, timeout: constants_1.LOCATOR_ACTION_TIMEOUT });
        }
        else {
            await locator.click({ button, timeout: constants_1.LOCATOR_ACTION_TIMEOUT });
        }
        this.prepareCacheData(cachedLocator, doubleClick ? "dblclick" : "click", elementDescription);
        return {
            success: true,
        };
    }
    typeSchema = zod_1.z.object({
        ref: zod_1.z.string().describe("The ref of the element to type into"),
        elementDescription: zod_1.z.string().describe("A description of the element, used for debugging"),
        text: zod_1.z.string().describe("The text to type"),
        reasoning: zod_1.z.string().describe("A quick one-line reasoning behind this action"),
        doesActionAdvanceUsTowardsGoal: zod_1.z
            .boolean()
            .describe('"true" indicates high confidence that this action will advance us towards the goal. "false" indicates low confidence and could be an AI hallucination.'),
    });
    async type({ ref, elementDescription, text }) {
        const locator = this.page.locator(`aria-ref=${ref}`).describe(elementDescription);
        let cachedLocator = "";
        if (this.currentStep) {
            cachedLocator = await this.resolveLocator(locator);
        }
        await locator.fill(text, { timeout: constants_1.LOCATOR_ACTION_TIMEOUT });
        this.prepareCacheData(cachedLocator, "fill", elementDescription, text);
        return {
            success: true,
            text,
        };
    }
    screenshotSchema = zod_1.z.object({
        fullPage: zod_1.z.boolean().describe("Whether to take a screenshot of the full scrollable page"),
        reasoning: zod_1.z.string().describe("A quick one-line reasoning behind this action"),
    });
    async takeScreenshot({ fullPage: _fullPage }) {
        // temporarily disabling fullPage as it sometimes causes issues with vision based models if dimension is too large.
        // we can re-enable this in the future with some dimension checks and optimizations if needed
        const screenshot = (await this.page.screenshot({ fullPage: false })).toString("base64");
        return screenshot;
    }
    pressKeySchema = zod_1.z.object({
        key: zod_1.z
            .string()
            .describe("Name of the key to press or a character to generate, such as `ArrowLeft` or `a`"),
    });
    async pressKey({ key }) {
        await this.page.keyboard.press(key);
        return { success: true, key };
    }
    async goBack() {
        await this.page.goBack();
        return { success: true };
    }
    async goForward() {
        await this.page.goForward();
        return { success: true };
    }
    async reload() {
        await this.page.reload({ waitUntil: "load" });
        return { success: true };
    }
    waitSchema = zod_1.z.object({
        timeout: zod_1.z.number().describe("Time to wait in milliseconds"),
        reasoning: zod_1.z.string().describe("A quick one-line reasoning behind this action"),
    });
    async wait({ timeout }) {
        await this.page.waitForTimeout(timeout);
        return {
            success: true,
            timeout,
            message: `Waited for ${timeout}ms. You can either 1. wait more or 2. retry a previous action or 3. try a new action.`,
        };
    }
    mouseMoveSchema = zod_1.z.object({
        x: zod_1.z.number().describe("x-coordinate to move to"),
        y: zod_1.z.number().describe("y-coordinate to move to"),
        reasoning: zod_1.z.string().describe("A quick one-line reasoning behind this action"),
    });
    async mouseMove({ x, y }) {
        await this.page.mouse.move(x, y);
        return { success: true };
    }
    mouseDownSchema = zod_1.z.object({
        reasoning: zod_1.z.string().describe("A quick one-line reasoning behind this action"),
    });
    async mouseDown(_) {
        await this.page.mouse.down();
        return { success: true };
    }
    mouseUpSchema = zod_1.z.object({
        reasoning: zod_1.z.string().describe("A quick one-line reasoning behind this action"),
    });
    async mouseUp(_) {
        await this.page.mouse.up();
        return { success: true };
    }
    selectDropdownOptionSchema = zod_1.z.object({
        ref: zod_1.z.string().describe("The ref of the dropdown element to select from"),
        elementDescription: zod_1.z
            .string()
            .describe("A description of the dropdown element, used for debugging"),
        value: zod_1.z.string().describe("The value of the option to select"),
        reasoning: zod_1.z.string().describe("A quick one-line reasoning behind this action"),
        doesActionAdvanceUsTowardsGoal: zod_1.z
            .boolean()
            .describe('"true" indicates high confidence that this action will advance us towards the goal. "false" indicates low confidence and could be an AI hallucination.'),
    });
    async selectDropdownOption({ ref, elementDescription, value, }) {
        const locator = this.page.locator(`aria-ref=${ref}`).describe(elementDescription);
        let cachedLocator = "";
        if (this.currentStep) {
            cachedLocator = await this.resolveLocator(locator);
        }
        await locator.selectOption(value, { timeout: constants_1.LOCATOR_ACTION_TIMEOUT });
        this.prepareCacheData(cachedLocator, "selectOption", elementDescription, value);
        return { success: true, value };
    }
    stopSchema = zod_1.z.object({
        reasoning: zod_1.z.string().describe("A quick one-line reasoning behind this action"),
    });
    async stop(_) {
        const DELAY = constants_1.STOP_DELAY; // 3 seconds
        // brief sleep to ensure any ongoing navigation or actions are complete
        // In future we could add graceful stop logic here
        await new Promise((resolve) => setTimeout(resolve, DELAY));
        if (this.abortController) {
            this.abortController.abort();
        }
        return { success: true, message: "Execution stopped" };
    }
    dragAndDropSchema = zod_1.z.object({
        sourceRef: zod_1.z.string().describe("The ref of the element to drag"),
        sourceElementDescription: zod_1.z
            .string()
            .describe("A description of the source element being dragged, used for debugging"),
        targetRef: zod_1.z.string().describe("The ref of the element to drop onto"),
        targetElementDescription: zod_1.z
            .string()
            .describe("A description of the target element to drop onto, used for debugging"),
        reasoning: zod_1.z.string().describe("A quick one-line reasoning behind this action"),
        doesActionAdvanceUsTowardsGoal: zod_1.z
            .boolean()
            .describe('"true" indicates high confidence that this action will advance us towards the goal. "false" indicates low confidence and could be an AI hallucination.'),
    });
    async dragAndDrop({ sourceRef, sourceElementDescription, targetRef, targetElementDescription, }) {
        const sourceLocator = this.page
            .locator(`aria-ref=${sourceRef}`)
            .describe(sourceElementDescription);
        const targetLocator = this.page
            .locator(`aria-ref=${targetRef}`)
            .describe(targetElementDescription);
        // Use two hover steps to ensure dragover events fire correctly across browsers
        await sourceLocator.hover({ timeout: constants_1.LOCATOR_ACTION_TIMEOUT });
        await this.page.mouse.down();
        await targetLocator.hover({ timeout: constants_1.LOCATOR_ACTION_TIMEOUT });
        await targetLocator.hover({ timeout: constants_1.LOCATOR_ACTION_TIMEOUT });
        await this.page.mouse.up();
        return {
            success: true,
        };
    }
    hoverSchema = zod_1.z.object({
        ref: zod_1.z.string().describe("The ref of the element to hover over"),
        elementDescription: zod_1.z
            .string()
            .describe("A description of the element to hover, used for debugging"),
        reasoning: zod_1.z.string().describe("A quick one-line reasoning behind this action"),
        doesActionAdvanceUsTowardsGoal: zod_1.z
            .boolean()
            .describe('"true" indicates high confidence that this action will advance us towards the goal. "false" indicates low confidence and could be an AI hallucination.'),
    });
    async hover({ ref, elementDescription }) {
        const locator = this.page.locator(`aria-ref=${ref}`).describe(elementDescription);
        let cachedLocator = "";
        if (this.currentStep) {
            cachedLocator = await this.resolveLocator(locator);
        }
        await locator.hover({ timeout: constants_1.LOCATOR_ACTION_TIMEOUT });
        this.prepareCacheData(cachedLocator, "hover", elementDescription);
        return {
            success: true,
        };
    }
    uploadFileSchema = zod_1.z.object({
        ref: zod_1.z.string().describe('The ref of the "button" that triggers a FileChooser to upload files'),
        elementDescription: zod_1.z.string().describe("A description of the element, used for debugging"),
        filePaths: zod_1.z.array(zod_1.z.string()).describe("Array of absolute file paths to upload"),
        reasoning: zod_1.z.string().describe("A quick one-line reasoning behind this action"),
        doesActionAdvanceUsTowardsGoal: zod_1.z
            .boolean()
            .describe('"true" indicates high confidence that this action will advance us towards the goal. "false" indicates low confidence and could be an AI hallucination.'),
    });
    async uploadFile({ ref, elementDescription, filePaths, // This is not a full path. It accepts a string filename which should be available in `uploads` directory
     }) {
        const locator = this.page.locator(`aria-ref=${ref}`).describe(elementDescription);
        // We expect to find these files in the `./uploads` directory if no base path is configured
        const uploadBasePath = (0, config_1.getConfig)().uploadBasePath || "./uploads";
        const prefixedFilePaths = filePaths.map((filePath) => `${uploadBasePath}/${filePath}`);
        // File uploads are not cached for now as it needs a two step process
        // We can solve this later by introducing multi-action caching if needed
        const fileChooserPromise = this.page.waitForEvent("filechooser");
        await locator.click({ timeout: constants_1.LOCATOR_ACTION_TIMEOUT });
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles(prefixedFilePaths, {
            timeout: constants_1.LOCATOR_ACTION_TIMEOUT,
        });
        return {
            success: true,
            prefixedFilePaths,
        };
    }
    triggerBlurSchema = zod_1.z.object({
        reasoning: zod_1.z.string().describe("A quick one-line reasoning behind this action"),
        doesActionAdvanceUsTowardsGoal: zod_1.z
            .boolean()
            .describe('"true" indicates high confidence that this action will advance us towards the goal. "false" indicates low confidence and could be an AI hallucination.'),
    });
    async triggerBlur(_args) {
        await this.page.locator("body").click({ position: { x: 0, y: 0 } });
        return {
            success: true,
        };
    }
    getUniqueValueSchema = zod_1.z.object({
        prefix: zod_1.z.string().describe('The prefix to prepend to the unique id, e.g. "Topic", "Username"'),
    });
    async getUniqueValue({ prefix }) {
        const uniqueValue = `${prefix} ${shortid_1.default.generate()}`;
        return { success: true, value: uniqueValue };
    }
    async resolveLocator(locator) {
        let generatedLocator = "";
        try {
            generatedLocator = (await locator.normalize()).toString();
        }
        catch (e) {
            logger_1.logger.error({ err: e }, "Error generating locator");
        }
        return generatedLocator;
    }
    /**
     * Prepares cache data for a step action. Stores it on the instance
     * instead of writing to Redis directly. The caller (runSteps in index.ts)
     * decides whether to persist based on a logic (for now the number of tool calls).
     */
    prepareCacheData(cachedLocator, action, elementDescription, value) {
        if (!this.currentStep) {
            return;
        }
        const ACTIONS_THAT_REQUIRE_NO_LOCATOR = ["waitForText"];
        // Skip caching if no locator is provided, unless it's an action that doesn't require a locator
        if (!cachedLocator && ACTIONS_THAT_REQUIRE_NO_LOCATOR.indexOf(action) === -1) {
            return;
        }
        /**
         *  If the current step's data contains values that are also present in the generated locator, it's likely that the locator is overfitted to those specific values and may not be reusable in future runs.
         *  In such cases, we should avoid caching to prevent storing non-reusable locators.
         */
        let isCacheable = true;
        if (this.currentStep.data && cachedLocator) {
            for (const key in this.currentStep.data) {
                const dataValue = this.currentStep.data[key];
                if (cachedLocator.includes(dataValue)) {
                    isCacheable = false;
                    break;
                }
            }
        }
        if (isCacheable) {
            const cacheData = {
                action,
                description: elementDescription,
            };
            if (cachedLocator) {
                cacheData.locator = cachedLocator;
            }
            if (value) {
                cacheData.value = value;
            }
            this.pendingCacheData = cacheData;
        }
    }
}
