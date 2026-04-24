import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Cache recording, replay, and invalidation tests.
 * Tests the multi-step cache behaviour introduced in:
 *   - tools.ts: pendingCacheData accumulates as an array
 *   - index.ts: redis.get/set/del replace hgetall/hset, full replay loop with per-action verifyActionEffect
 */

vi.mock("../../instrumentation", () => ({ axiomEnabled: false }));

// New Redis API: get / set / del (string-key JSON array)
vi.mock("../../redis", () => ({
    redis: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue("OK"),
        del: vi.fn().mockResolvedValue(1),
        hset: vi.fn().mockResolvedValue("OK"),   // used by global-values path
        hgetall: vi.fn().mockResolvedValue({}),  // used by global-values path
        expire: vi.fn().mockResolvedValue(1),
    },
}));

vi.mock("ai", async (importOriginal) => {
    const actual = await importOriginal<typeof import("ai")>();
    return {
        ...actual,
        generateText: vi.fn().mockResolvedValue({ text: "done", steps: [], output: {} }),
        streamText: vi.fn(),
    };
});

vi.mock("axiom/ai", () => ({
    withSpan: vi.fn((_meta: unknown, fn: () => unknown) => fn()),
    wrapAISDKModel: vi.fn((model: unknown) => model),
    wrapTool: vi.fn((_name: unknown, tool: unknown) => tool),
    initAxiomAI: vi.fn(),
    RedactionPolicy: { AxiomDefault: {} },
}));

vi.mock("../../models", () => ({
    resolveModel: vi.fn().mockReturnValue("mocked-model"),
}));

// getPendingCacheData returns [] by default (empty : no cacheable actions)
vi.mock("../../tools", () => ({
    getAItools: vi.fn().mockReturnValue({
        tools: {},
        getPendingCacheData: vi.fn().mockReturnValue([]),
        clearPendingCacheData: vi.fn(),
    }),
}));

vi.mock("../../utils", () => ({
    runLocatorCode: vi.fn().mockResolvedValue(undefined),
    safeSnapshot: vi.fn().mockResolvedValue("snapshot content"),
    verifyActionEffect: vi.fn().mockResolvedValue(undefined),
    waitForCondition: vi.fn().mockResolvedValue(undefined),
    waitForDOMStabilization: vi.fn().mockResolvedValue(undefined),
    generatePhoneNumber: vi.fn().mockReturnValue("1234567890"),
    resolvePage: vi.fn((input: unknown) => input),
}));

vi.mock("../../extract", () => ({
    extractDataWithAI: vi.fn().mockResolvedValue("extracted-value"),
}));

vi.mock("../../assertion", () => ({
    assert: vi.fn().mockResolvedValue("assertion passed"),
}));

vi.mock("../../logger", () => ({
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../email", () => ({
    extractEmailContent: vi.fn(),
    generateEmail: vi.fn().mockReturnValue("test@example.com"),
}));

vi.mock("../../utils/secure-script-runner", () => ({
    runSecureScript: vi.fn().mockResolvedValue(undefined),
}));

import { runSteps } from "../../index";
import { resetConfig } from "../../config";
import { redis } from "../../redis";
import { generateText } from "ai";
import { runLocatorCode, verifyActionEffect } from "../../utils";
import { getAItools } from "../../tools";
import type { Page } from "@playwright/test";

function createMockPage() {
    const mockLocator = {
        click: vi.fn().mockResolvedValue(undefined),
        fill: vi.fn().mockResolvedValue(undefined),
        describe: vi.fn().mockReturnThis(),
    };
    return {
        locator: vi.fn().mockReturnValue(mockLocator),
        getByRole: vi.fn().mockReturnValue(mockLocator),
        getByText: vi.fn().mockReturnValue(mockLocator),
        ariaSnapshot: vi.fn().mockResolvedValue("snapshot content"),
        screenshot: vi.fn().mockResolvedValue(Buffer.from("fake-screenshot")),
        url: vi.fn().mockReturnValue("https://example.com"),
        evaluate: vi.fn().mockResolvedValue(undefined),
        waitForLoadState: vi.fn().mockResolvedValue(undefined),
        context: vi.fn().mockReturnValue({ on: vi.fn(), off: vi.fn() }),
    } as unknown as Page;
}

describe("Multi-step cache: Phase 2 — Replay", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetConfig();
        vi.mocked(redis!.get).mockResolvedValue(null);
    });

    it("replays a single cached action without calling AI", async () => {
        const cached = [
            { action: "click", locator: 'getByRole("button", { name: "Submit" })', description: "Submit button" },
        ];
        vi.mocked(redis!.get).mockResolvedValue(JSON.stringify(cached));

        await runSteps({ page: createMockPage(), userFlow: "submit flow", steps: [{ description: "Click submit" }] });

        expect(generateText).not.toHaveBeenCalled();
        expect(runLocatorCode).toHaveBeenCalledTimes(1);
        expect(verifyActionEffect).toHaveBeenCalledTimes(1);
    });

    it("replays a multi-action cached sequence in order without calling AI", async () => {
        const cached = [
            { action: "fill", locator: 'getByLabel("Email")', description: "email field", value: "user@test.com" },
            { action: "click", locator: 'getByRole("button", { name: "Submit" })', description: "submit button" },
        ];
        vi.mocked(redis!.get).mockResolvedValue(JSON.stringify(cached));

        await runSteps({ page: createMockPage(), userFlow: "login flow", steps: [{ description: "Fill email and submit" }] });

        expect(generateText).not.toHaveBeenCalled();
        // Both actions must be executed and verified individually
        expect(runLocatorCode).toHaveBeenCalledTimes(2);
        expect(verifyActionEffect).toHaveBeenCalledTimes(2);
    });

    it("resolves {{run.*}} placeholders in cached action values during replay", async () => {
        const cached = [
            { action: "fill", locator: 'getByLabel("Email")', description: "email field", value: "{{run.email}}" },
        ];
        vi.mocked(redis!.get).mockResolvedValue(JSON.stringify(cached));

        await runSteps({ page: createMockPage(), userFlow: "login flow", steps: [{ description: "Fill email" }] });

        expect(generateText).not.toHaveBeenCalled();
        // The code built from the cached action must NOT contain the raw placeholder
        const codeArg = vi.mocked(runLocatorCode).mock.calls[0][1] as string;
        expect(codeArg).not.toContain("{{run.email}}");
    });

    it("skips cache when cachedActions array is empty (corrupt / missing key)", async () => {
        vi.mocked(redis!.get).mockResolvedValue(JSON.stringify([]));

        await runSteps({ page: createMockPage(), userFlow: "flow", steps: [{ description: "Do something" }] });

        // Empty array : falls through to AI
        expect(generateText).toHaveBeenCalled();
    });
});

describe("Multi-step cache: Phase 3 — Invalidation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetConfig();
    });

    it("evicts cache key and falls back to AI when runLocatorCode throws", async () => {
        const cached = [
            { action: "click", locator: 'getByRole("button", { name: "Gone" })', description: "gone button" },
        ];
        vi.mocked(redis!.get).mockResolvedValue(JSON.stringify(cached));
        vi.mocked(runLocatorCode).mockRejectedValueOnce(new Error("Timeout: element not found"));

        await runSteps({ page: createMockPage(), userFlow: "broken flow", steps: [{ description: "Click gone button" }] });

        expect(redis!.del).toHaveBeenCalledWith("step:broken flow:Click gone button");
        expect(generateText).toHaveBeenCalled();
    });

    it("evicts cache key and falls back to AI when verifyActionEffect throws", async () => {
        const cached = [
            { action: "click", locator: 'getByRole("button")', description: "button" },
        ];
        vi.mocked(redis!.get).mockResolvedValue(JSON.stringify(cached));
        vi.mocked(verifyActionEffect).mockRejectedValueOnce(new Error("Action had no effect"));

        await runSteps({ page: createMockPage(), userFlow: "stale flow", steps: [{ description: "Click button" }] });

        expect(redis!.del).toHaveBeenCalledWith("step:stale flow:Click button");
        expect(generateText).toHaveBeenCalled();
    });

    it("evicts the key only for the failing step, not others", async () => {
        // Step 1 has a valid cache, Step 2 has a broken one
        vi.mocked(redis!.get)
            .mockResolvedValueOnce(
                JSON.stringify([{ action: "click", locator: 'getByRole("link")', description: "nav link" }]),
            )
            .mockResolvedValueOnce(
                JSON.stringify([{ action: "click", locator: 'getByRole("button", { name: "Gone" })', description: "gone" }]),
            );

        vi.mocked(runLocatorCode)
            .mockResolvedValueOnce(undefined)   // step 1 OK
            .mockRejectedValueOnce(new Error("Timeout")); // step 2 fails

        await runSteps({
            page: createMockPage(),
            userFlow: "partial flow",
            steps: [
                { description: "Click nav link" },
                { description: "Click gone button" },
            ],
        });

        // Only step 2's key should be evicted
        expect(redis!.del).toHaveBeenCalledTimes(1);
        expect(redis!.del).toHaveBeenCalledWith("step:partial flow:Click gone button");
    });
});

describe("Multi-step cache: Phase 1 — Recording", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetConfig();
        vi.mocked(redis!.get).mockResolvedValue(null); // no cache → AI runs
    });

    it("saves the full accumulated action array to Redis via set after AI succeeds", async () => {
        const mockCacheData = [
            { action: "click", locator: 'getByRole("button")', description: "Submit button" },
        ];
        vi.mocked(getAItools).mockReturnValue({
            tools: {} as ReturnType<typeof getAItools>["tools"],
            getPendingCacheData: vi.fn().mockReturnValue(mockCacheData),
            clearPendingCacheData: vi.fn(),
        });
        vi.mocked(generateText).mockResolvedValueOnce({
            text: "done",
            steps: [{ toolCalls: [{ toolName: "browser_click" }] }],
        } as unknown as Awaited<ReturnType<typeof generateText>>);

        await runSteps({ page: createMockPage(), userFlow: "record flow", steps: [{ description: "Click submit" }] });

        expect(redis!.set).toHaveBeenCalledWith(
            "step:record flow:Click submit",
            JSON.stringify(mockCacheData),
        );
    });

    it("saves multi-action array to Redis when AI performs several tool calls", async () => {
        const mockCacheData = [
            { action: "fill", locator: 'getByLabel("Email")', description: "email field", value: "test@test.com" },
            { action: "click", locator: 'getByRole("button")', description: "submit" },
        ];
        vi.mocked(getAItools).mockReturnValue({
            tools: {} as ReturnType<typeof getAItools>["tools"],
            getPendingCacheData: vi.fn().mockReturnValue(mockCacheData),
            clearPendingCacheData: vi.fn(),
        });
        vi.mocked(generateText).mockResolvedValueOnce({
            text: "done",
            steps: [{ toolCalls: [{ toolName: "browser_type" }, { toolName: "browser_click" }] }],
        } as unknown as Awaited<ReturnType<typeof generateText>>);

        await runSteps({ page: createMockPage(), userFlow: "record flow", steps: [{ description: "Fill and submit" }] });

        expect(redis!.set).toHaveBeenCalledWith(
            "step:record flow:Fill and submit",
            JSON.stringify(mockCacheData),
        );
    });

    it("does not write to Redis when AI only calls snapshot/stop tools", async () => {
        vi.mocked(getAItools).mockReturnValue({
            tools: {} as ReturnType<typeof getAItools>["tools"],
            getPendingCacheData: vi.fn().mockReturnValue([]), // nothing cacheable
            clearPendingCacheData: vi.fn(),
        });
        vi.mocked(generateText).mockResolvedValueOnce({
            text: "done",
            steps: [{ toolCalls: [{ toolName: "browser_snapshot" }, { toolName: "browser_stop" }] }],
        } as unknown as Awaited<ReturnType<typeof generateText>>);

        await runSteps({ page: createMockPage(), userFlow: "snapshot flow", steps: [{ description: "Just look" }] });

        expect(redis!.set).not.toHaveBeenCalled();
    });
});

describe("Multi-step cache: bypass behaviour", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetConfig();
    });

    it("skips replay entirely when global bypassCache is true", async () => {
        const cached = [{ action: "click", locator: 'getByRole("button")', description: "button" }];
        vi.mocked(redis!.get).mockResolvedValue(JSON.stringify(cached));

        await runSteps({
            page: createMockPage(),
            userFlow: "flow",
            steps: [{ description: "Click something" }],
            bypassCache: true,
        });

        expect(runLocatorCode).not.toHaveBeenCalled();
        expect(generateText).toHaveBeenCalled();
    });

    it("skips replay for a step with step.bypassCache true", async () => {
        const cached = [{ action: "click", locator: 'getByRole("button")', description: "button" }];
        vi.mocked(redis!.get).mockResolvedValue(JSON.stringify(cached));

        await runSteps({
            page: createMockPage(),
            userFlow: "flow",
            steps: [{ description: "Click something", bypassCache: true }],
        });

        expect(runLocatorCode).not.toHaveBeenCalled();
        expect(generateText).toHaveBeenCalled();
    });
});
