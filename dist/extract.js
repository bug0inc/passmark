"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractDataWithAI = extractDataWithAI;
const ai_1 = require("ai");
const zod_1 = require("zod");
const config_1 = require("./config");
const models_1 = require("./models");
const extractionSchema = zod_1.z.object({
    extractedValue: zod_1.z.string().describe("The extracted value based on the prompt"),
});
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
async function extractDataWithAI({ snapshot, url, prompt, }) {
    const { output } = await (0, ai_1.generateText)({
        model: (0, models_1.resolveModel)((0, config_1.getModelId)("utility")),
        temperature: 0,
        output: ai_1.Output.object({ schema: extractionSchema }),
        prompt: `You are an AI assistant that extracts specific data from web pages.

Given the following page snapshot and URL, extract the value described in the extraction prompt.

<URL>
${url}
</URL>

<PageSnapshot>
${snapshot}
</PageSnapshot>

<ExtractionPrompt>
${prompt}
</ExtractionPrompt>

<Rules>
- Extract exactly what is requested in the prompt
- If extracting from the URL, parse query parameters, path segments, or hash values as needed
- If extracting from the page content, find the relevant text in the snapshot
- Return only the extracted value, not the surrounding context
- If the value cannot be found, return an empty string
</Rules>

Return the extracted value.`,
    });
    return output.extractedValue;
}
