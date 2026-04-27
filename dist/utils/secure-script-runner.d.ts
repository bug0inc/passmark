import type { Expect } from "@playwright/test";
import type { PageInput } from "../types";
export interface RunSecureScriptOptions {
    page: PageInput;
    script: string;
    localValues?: Record<string, string>;
    globalValues?: Record<string, string>;
    expect?: Expect<{}>;
}
/**
 * Safely execute a user-supplied Playwright script.
 *
 * The script is parsed as an AST and validated to only contain allowed
 * Playwright method chains. User code is NEVER evaluated directly.
 *
 * @example
 * await runSecureScript({
 *   page,
 *   script: 'page.getByRole("button", { name: "Save" }).click()',
 * });
 *
 * @example
 * // Multi-line scripts (each line is executed in order)
 * await runSecureScript({
 *   page,
 *   script: `
 *     page.getByLabel("Email").fill("test@example.com")
 *     page.getByLabel("Password").fill("password123")
 *     page.getByRole("button", { name: "Submit" }).click()
 *   `,
 * });
 */
export declare function runSecureScript({ page: pageInput, script, localValues, globalValues, expect: expectFn, }: RunSecureScriptOptions): Promise<unknown>;
/**
 * Validate a script without executing it.
 * Useful for pre-validation before saving scripts.
 *
 * @returns true if valid, throws Error if invalid
 */
export declare function validateScript(script: string): boolean;
