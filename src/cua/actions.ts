import type { Page } from "@playwright/test";
import { logger } from "../logger";

/**
 * Shape of actions returned by OpenAI's Responses API `computer` tool.
 * Keep this loose — the Responses API ships new action variants over time, and
 * we prefer to log-and-skip unknowns rather than fail the whole step.
 */
export type ComputerAction =
  | { type: "click"; x: number; y: number; button?: "left" | "right" | "middle"; keys?: string[] }
  | { type: "double_click"; x: number; y: number; button?: "left" | "right" | "middle" }
  | { type: "move"; x: number; y: number }
  | { type: "scroll"; x: number; y: number; scrollX?: number; scrollY?: number }
  | { type: "drag"; path: Array<[number, number] | { x: number; y: number }> }
  | { type: "type"; text: string }
  | { type: "keypress"; keys: string[] }
  | { type: "screenshot" }
  | { type: "wait" }
  | { type: "goto"; url: string }
  | { type: string; [k: string]: unknown };

/**
 * Maps OpenAI CUA key names to Playwright key names.
 * OpenAI uses uppercase words ("ENTER", "CTRL", "META"); Playwright expects
 * casing like "Enter", "Control", "Meta". Anything not in this map falls
 * through unchanged — single characters ("a", "1") already work in Playwright.
 */
export const KEY_NAME_MAP: Record<string, string> = {
  ENTER: "Enter",
  RETURN: "Enter",
  TAB: "Tab",
  ESC: "Escape",
  ESCAPE: "Escape",
  SPACE: "Space",
  BACKSPACE: "Backspace",
  DELETE: "Delete",
  SHIFT: "Shift",
  CTRL: "Control",
  CONTROL: "Control",
  ALT: "Alt",
  META: "Meta",
  CMD: "Meta",
  COMMAND: "Meta",
  WIN: "Meta",
  UP: "ArrowUp",
  DOWN: "ArrowDown",
  LEFT: "ArrowLeft",
  RIGHT: "ArrowRight",
  ARROWUP: "ArrowUp",
  ARROWDOWN: "ArrowDown",
  ARROWLEFT: "ArrowLeft",
  ARROWRIGHT: "ArrowRight",
  PAGEUP: "PageUp",
  PAGEDOWN: "PageDown",
  HOME: "Home",
  END: "End",
  INSERT: "Insert",
};

export function mapKey(key: string): string {
  return KEY_NAME_MAP[key.toUpperCase()] ?? key;
}

function normalizeDragPoint(p: [number, number] | { x: number; y: number }): {
  x: number;
  y: number;
} {
  return Array.isArray(p) ? { x: p[0], y: p[1] } : p;
}

/**
 * Executes a single CUA action via Playwright's low-level mouse/keyboard APIs.
 * Unknown action types are logged and skipped so a new OpenAI action variant
 * doesn't crash an entire test run.
 */
export async function executeAction(page: Page, action: ComputerAction): Promise<void> {
  switch (action.type) {
    case "click": {
      const {
        x,
        y,
        button = "left",
      } = action as { x: number; y: number; button?: "left" | "right" | "middle" };
      await page.mouse.click(x, y, { button });
      return;
    }
    case "double_click": {
      const { x, y } = action as { x: number; y: number };
      await page.mouse.dblclick(x, y);
      return;
    }
    case "move": {
      const { x, y } = action as { x: number; y: number };
      await page.mouse.move(x, y);
      return;
    }
    case "scroll": {
      const {
        x,
        y,
        scrollX = 0,
        scrollY = 0,
      } = action as {
        x: number;
        y: number;
        scrollX?: number;
        scrollY?: number;
      };
      await page.mouse.move(x, y);
      await page.mouse.wheel(scrollX, scrollY);
      return;
    }
    case "drag": {
      const { path } = action as {
        path: Array<[number, number] | { x: number; y: number }>;
      };
      if (!path || path.length < 2) return;
      const points = path.map(normalizeDragPoint);
      await page.mouse.move(points[0].x, points[0].y);
      await page.mouse.down();
      for (let i = 1; i < points.length; i++) {
        await page.mouse.move(points[i].x, points[i].y);
      }
      await page.mouse.up();
      return;
    }
    case "type": {
      const { text } = action as { text: string };
      await page.keyboard.type(text);
      return;
    }
    case "keypress": {
      const { keys } = action as { keys: string[] };
      if (!keys || keys.length === 0) return;
      await page.keyboard.press(keys.map(mapKey).join("+"));
      return;
    }
    case "screenshot":
      // No-op: the loop captures a screenshot after every action batch anyway.
      return;
    case "wait":
      await page.waitForTimeout(1000);
      return;
    case "goto": {
      const { url } = action as { url: string };
      await page.goto(url, { waitUntil: "domcontentloaded" });
      return;
    }
    default:
      logger.warn(`[cua] Unknown action type "${action.type}" — skipping.`);
      return;
  }
}
