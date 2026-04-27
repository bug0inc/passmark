/**
 * Extracts data from a page snapshot and URL using AI.
 * Uses Gemini 2.5 Flash for fast, accurate extraction.
 *
 * @param snapshot - The accessibility snapshot of the page
 * @param url - The current page URL
 * @param prompt - The extraction prompt describing what to extract
 * @returns The extracted value as a string
 *
 * @example
 * ```typescript
 * const token = await extractDataWithAI({
 *   snapshot: await safeSnapshot(page),
 *   url: page.url(),
 *   prompt: 'Extract the token query parameter value from the URL'
 * });
 * // Returns: "abc123"
 * ```
 */
export declare function extractDataWithAI({ snapshot, url, prompt, }: {
    snapshot: string;
    url: string;
    prompt: string;
}): Promise<string>;
