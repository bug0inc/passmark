import type { Page } from "@playwright/test";
import { describe, it, expect, vi } from "vitest";
import { executeAction, mapKey, type ComputerAction } from "../cua/actions";

type MouseStub = {
  click: ReturnType<typeof vi.fn>;
  dblclick: ReturnType<typeof vi.fn>;
  move: ReturnType<typeof vi.fn>;
  wheel: ReturnType<typeof vi.fn>;
  down: ReturnType<typeof vi.fn>;
  up: ReturnType<typeof vi.fn>;
};

type KeyboardStub = {
  type: ReturnType<typeof vi.fn>;
  press: ReturnType<typeof vi.fn>;
};

function makePage() {
  const mouse: MouseStub = {
    click: vi.fn().mockResolvedValue(undefined),
    dblclick: vi.fn().mockResolvedValue(undefined),
    move: vi.fn().mockResolvedValue(undefined),
    wheel: vi.fn().mockResolvedValue(undefined),
    down: vi.fn().mockResolvedValue(undefined),
    up: vi.fn().mockResolvedValue(undefined),
  };
  const keyboard: KeyboardStub = {
    type: vi.fn().mockResolvedValue(undefined),
    press: vi.fn().mockResolvedValue(undefined),
  };
  const waitForTimeout = vi.fn().mockResolvedValue(undefined);
  const page = { mouse, keyboard, waitForTimeout };
  return { page, mouse, keyboard, waitForTimeout };
}

describe("cua/actions/mapKey", () => {
  it("maps OpenAI uppercase keys to Playwright names", () => {
    expect(mapKey("ENTER")).toBe("Enter");
    expect(mapKey("CTRL")).toBe("Control");
    expect(mapKey("META")).toBe("Meta");
    expect(mapKey("CMD")).toBe("Meta");
    expect(mapKey("ARROWDOWN")).toBe("ArrowDown");
    expect(mapKey("UP")).toBe("ArrowUp");
    expect(mapKey("ESC")).toBe("Escape");
  });

  it("passes unknown keys through unchanged", () => {
    expect(mapKey("a")).toBe("a");
    expect(mapKey("1")).toBe("1");
    expect(mapKey("F5")).toBe("F5");
  });

  it("is case-insensitive for mapped keys", () => {
    expect(mapKey("enter")).toBe("Enter");
    expect(mapKey("Ctrl")).toBe("Control");
  });
});

describe("cua/actions/executeAction", () => {
  it("click calls page.mouse.click with coords and button", async () => {
    const { page, mouse } = makePage();
    await executeAction(page as unknown as Page, { type: "click", x: 120, y: 80, button: "right" });
    expect(mouse.click).toHaveBeenCalledWith(120, 80, { button: "right" });
  });

  it("click defaults to left button", async () => {
    const { page, mouse } = makePage();
    await executeAction(page as unknown as Page, { type: "click", x: 10, y: 20 });
    expect(mouse.click).toHaveBeenCalledWith(10, 20, { button: "left" });
  });

  it("double_click calls page.mouse.dblclick", async () => {
    const { page, mouse } = makePage();
    await executeAction(page as unknown as Page, { type: "double_click", x: 50, y: 60 });
    expect(mouse.dblclick).toHaveBeenCalledWith(50, 60);
  });

  it("type calls page.keyboard.type with text", async () => {
    const { page, keyboard } = makePage();
    await executeAction(page as unknown as Page, { type: "type", text: "hello world" });
    expect(keyboard.type).toHaveBeenCalledWith("hello world");
  });

  it("keypress joins mapped keys with +", async () => {
    const { page, keyboard } = makePage();
    await executeAction(page as unknown as Page, { type: "keypress", keys: ["CTRL", "A"] });
    expect(keyboard.press).toHaveBeenCalledWith("Control+A");
  });

  it("keypress handles single Enter", async () => {
    const { page, keyboard } = makePage();
    await executeAction(page as unknown as Page, { type: "keypress", keys: ["ENTER"] });
    expect(keyboard.press).toHaveBeenCalledWith("Enter");
  });

  it("scroll moves then wheels", async () => {
    const { page, mouse } = makePage();
    await executeAction(page as unknown as Page, {
      type: "scroll",
      x: 100,
      y: 200,
      scrollX: 0,
      scrollY: 400,
    });
    expect(mouse.move).toHaveBeenCalledWith(100, 200);
    expect(mouse.wheel).toHaveBeenCalledWith(0, 400);
  });

  it("drag: tuple path triggers move+down, intermediate move, up", async () => {
    const { page, mouse } = makePage();
    const action: ComputerAction = {
      type: "drag",
      path: [
        [10, 10] as [number, number],
        [20, 20] as [number, number],
        [30, 30] as [number, number],
      ],
    };
    await executeAction(page as unknown as Page, action);
    expect(mouse.move).toHaveBeenNthCalledWith(1, 10, 10);
    expect(mouse.down).toHaveBeenCalledOnce();
    expect(mouse.move).toHaveBeenNthCalledWith(2, 20, 20);
    expect(mouse.move).toHaveBeenNthCalledWith(3, 30, 30);
    expect(mouse.up).toHaveBeenCalledOnce();
  });

  it("drag: object-shape path also works", async () => {
    const { page, mouse } = makePage();
    await executeAction(page as unknown as Page, {
      type: "drag",
      path: [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ],
    });
    expect(mouse.move).toHaveBeenNthCalledWith(1, 1, 2);
    expect(mouse.move).toHaveBeenNthCalledWith(2, 3, 4);
  });

  it("wait calls page.waitForTimeout", async () => {
    const { page, waitForTimeout } = makePage();
    await executeAction(page as unknown as Page, { type: "wait" });
    expect(waitForTimeout).toHaveBeenCalledWith(1000);
  });

  it("screenshot is a no-op (loop captures separately)", async () => {
    const { page, mouse, keyboard } = makePage();
    await executeAction(page as unknown as Page, { type: "screenshot" });
    expect(mouse.click).not.toHaveBeenCalled();
    expect(keyboard.type).not.toHaveBeenCalled();
  });

  it("unknown action type is skipped without throwing", async () => {
    const { page, mouse } = makePage();
    await expect(
      executeAction(
        page as unknown as Page,
        { type: "quantum_leap", x: 1 } as unknown as ComputerAction,
      ),
    ).resolves.toBeUndefined();
    expect(mouse.click).not.toHaveBeenCalled();
  });
});
