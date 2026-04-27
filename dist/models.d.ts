import { type LanguageModel } from "ai";
/**
 * Resolves a canonical model ID to a LanguageModel instance wrapped with Axiom instrumentation.
 * Input format: "provider/model-name" (e.g. "google/gemini-3-flash")
 *
 * Users always use canonical IDs (gateway-style). When using direct providers,
 * model names are automatically mapped to the correct provider-specific names
 * (e.g. "gemini-3-flash" → "gemini-3-flash-preview" for Google's direct API).
 *
 * When gateway is "vercel", routes through the Vercel AI Gateway as-is.
 * When gateway is "openrouter", routes through OpenRouter.
 * When gateway is "cloudflare", routes through Cloudflare AI Gateway using the
 * provider-native paths (google-ai-studio, anthropic) so provider-specific fields
 * like Gemini's thought_signature pass through unchanged.
 * When gateway is "none" (default), creates a direct provider instance with alias resolution.
 * All paths wrap the model with wrapAISDKModel for tracing when Axiom is enabled.
 */
export declare function resolveModel(modelId: string): LanguageModel;
