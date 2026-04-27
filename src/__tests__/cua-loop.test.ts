import type { Page } from "@playwright/test";
import type OpenAI from "openai";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runCUALoop } from "../cua/loop";
import { resetConfig } from "../config";

type ScriptedResponse = {
  id: string;
  output?: Array<Record<string, unknown>>;
};

function makePage() {
  const screenshot = vi.fn().mockResolvedValue(Buffer.from("pngbytes"));
  const mouse = {
    click: vi.fn().mockResolvedValue(undefined),
    dblclick: vi.fn().mockResolvedValue(undefined),
    move: vi.fn().mockResolvedValue(undefined),
    wheel: vi.fn().mockResolvedValue(undefined),
    down: vi.fn().mockResolvedValue(undefined),
    up: vi.fn().mockResolvedValue(undefined),
  };
  const keyboard = {
    type: vi.fn().mockResolvedValue(undefined),
    press: vi.fn().mockResolvedValue(undefined),
  };
  const waitForTimeout = vi.fn().mockResolvedValue(undefined);
  const waitForLoadState = vi.fn().mockResolvedValue(undefined);
  const evaluate = vi.fn().mockResolvedValue(undefined);
  const viewportSize = vi.fn().mockReturnValue({ width: 1280, height: 720 });
  const page = {
    screenshot,
    mouse,
    keyboard,
    waitForTimeout,
    waitForLoadState,
    evaluate,
    viewportSize,
  };
  return { page, mouse, keyboard, screenshot };
}

function makeMockClient(scriptedResponses: ScriptedResponse[]) {
  let i = 0;
  const create = vi.fn().mockImplementation(async () => {
    const r = scriptedResponses[i];
    i += 1;
    return r;
  });
  return { client: { responses: { create } }, create };
}

describe("cua/loop/runCUALoop", () => {
  beforeEach(() => {
    resetConfig();
  });

  it("executes actions, screenshots back, and terminates when no computer_call", async () => {
    const { page, mouse, keyboard } = makePage();
    const { client, create } = makeMockClient([
      {
        id: "resp_1",
        output: [
          {
            type: "computer_call",
            call_id: "call_1",
            actions: [{ type: "click", x: 100, y: 150 }],
          },
        ],
      },
      {
        id: "resp_2",
        output: [
          {
            type: "computer_call",
            call_id: "call_2",
            actions: [{ type: "type", text: "hello" }],
          },
        ],
      },
      {
        id: "resp_3",
        output: [{ type: "message", content: [{ text: "All done." }] }],
      },
    ]);

    const finalText = await runCUALoop({
      page: page as unknown as Page,
      instruction: "click something and type hello",
      maxSteps: 10,
      client: client as unknown as OpenAI,
    });

    expect(mouse.click).toHaveBeenCalledWith(100, 150, { button: "left" });
    expect(keyboard.type).toHaveBeenCalledWith("hello");
    expect(finalText).toBe("All done.");

    // First call is the initial instruction; subsequent calls carry the screenshot back.
    expect(create).toHaveBeenCalledTimes(3);
    const firstArgs = create.mock.calls[0][0];
    expect(firstArgs.input).toEqual([
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "click something and type hello" }],
      },
    ]);
    expect(firstArgs.tools[0]).toEqual({ type: "computer" });

    const secondArgs = create.mock.calls[1][0];
    expect(secondArgs.previous_response_id).toBe("resp_1");
    expect(secondArgs.input[0]).toMatchObject({
      type: "computer_call_output",
      call_id: "call_1",
    });
    expect(secondArgs.input[0].output.type).toBe("computer_screenshot");
    expect(secondArgs.input[0].output.image_url).toMatch(/^data:image\/png;base64,/);
  });

  it("respects maxSteps and exits if model never stops", async () => {
    const { page } = makePage();
    const infiniteResponse = {
      id: "resp_loop",
      output: [
        {
          type: "computer_call",
          call_id: "c",
          actions: [{ type: "wait" }],
        },
      ],
    };
    const { client, create } = makeMockClient([
      infiniteResponse,
      infiniteResponse,
      infiniteResponse,
      infiniteResponse,
    ]);

    await runCUALoop({
      page: page as unknown as Page,
      instruction: "loop forever",
      maxSteps: 3,
      client: client as unknown as OpenAI,
    });

    // 1 initial + 3 screenshot turns = 4 calls.
    expect(create).toHaveBeenCalledTimes(4);
  });

  it("fires onReasoning callback when response includes reasoning items", async () => {
    const { page } = makePage();
    const { client } = makeMockClient([
      {
        id: "r1",
        output: [
          { type: "reasoning", summary: [{ text: "I see a login form." }] },
          { type: "computer_call", call_id: "c", actions: [{ type: "click", x: 1, y: 2 }] },
        ],
      },
      {
        id: "r2",
        output: [{ type: "message", content: [{ text: "done" }] }],
      },
    ]);

    const reasonings: string[] = [];
    await runCUALoop({
      page: page as unknown as Page,
      instruction: "click login",
      maxSteps: 5,
      onReasoning: (r) => reasonings.push(r),
      client: client as unknown as OpenAI,
    });

    expect(reasonings).toContain("I see a login form.");
  });
});
