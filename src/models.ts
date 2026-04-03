import { AIModelError, ConfigurationError } from "./errors";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { gateway, type LanguageModel } from "ai";
import { wrapAISDKModel } from "axiom/ai";
import { getConfig } from "./config";
import { axiomEnabled } from "./instrumentation";

function wrapModel(model: LanguageModel): LanguageModel {
  return axiomEnabled ? wrapAISDKModel(model) : model;
}

let _google: ReturnType<typeof createGoogleGenerativeAI> | null = null;
let _anthropic: ReturnType<typeof createAnthropic> | null = null;

function getGoogleProvider() {
  if (!_google) {
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new ConfigurationError(
  "GOOGLE_GENERATIVE_AI_API_KEY isn't set. Add it to your environment (for example: export GOOGLE_GENERATIVE_AI_API_KEY=your_key), or use the Vercel AI Gateway by calling configure({ ai: { gateway: 'vercel' } }) and setting AI_GATEWAY_API_KEY. See .env.example for reference.",
);
    }
    _google = createGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    });
  }
  return _google;
}

function getAnthropicProvider() {
  if (!_anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new ConfigurationError(
  "ANTHROPIC_API_KEY isn't set. Add it to your environment (for example: export ANTHROPIC_API_KEY=your_key), or use the Vercel AI Gateway by calling configure({ ai: { gateway: 'vercel' } }) and setting AI_GATEWAY_API_KEY. See .env.example for reference.",
);
    }
    _anthropic = createAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return _anthropic;
}

/**
 * Maps canonical model names to direct Google API names.
 * Only needed where the gateway name differs from the direct provider name.
 * Add new entries here when Google renames or graduates models.
 */
const MODEL_DIRECT_ALIASES: Record<string, string> = {
  "gemini-3-flash": "gemini-3-flash-preview",
  "claude-sonnet-4.6": "claude-sonnet-4-6",
  "claude-haiku-4.5": "claude-haiku-4-5",
};

function resolveDirectModelName(modelName: string): string {
  return MODEL_DIRECT_ALIASES[modelName] ?? modelName;
}

/**
 * Resolves a canonical model ID to a LanguageModel instance wrapped with Axiom instrumentation.
 * Input format: "provider/model-name" (e.g. "google/gemini-3-flash")
 *
 * Users always use canonical IDs (gateway-style). When using direct providers,
 * model names are automatically mapped to the correct provider-specific names
 * (e.g. "gemini-3-flash" → "gemini-3-flash-preview" for Google's direct API).
 *
 * When gateway is "vercel", routes through the Vercel AI Gateway as-is.
 * When gateway is "none" (default), creates a direct provider instance with alias resolution.
 * Both paths wrap the model with wrapAISDKModel for tracing.
 */
export function resolveModel(modelId: string): LanguageModel {
  const gatewayConfig = getConfig().ai?.gateway ?? "none";

  if (gatewayConfig === "vercel") {
    if (!process.env.AI_GATEWAY_API_KEY) {
      throw new ConfigurationError(
  "AI_GATEWAY_API_KEY isn't set. To use the Vercel AI Gateway, add AI_GATEWAY_API_KEY to your environment. If you'd rather use direct provider keys, call configure({ ai: { gateway: 'none' } }) and set GOOGLE_GENERATIVE_AI_API_KEY and/or ANTHROPIC_API_KEY.",
);
    }
    return wrapModel(gateway(modelId));
  }

  const [provider, ...rest] = modelId.split("/");
  const modelName = rest.join("/");

  switch (provider) {
    case "google":
      return wrapModel(getGoogleProvider()(resolveDirectModelName(modelName)));
    case "anthropic":
      return wrapModel(getAnthropicProvider()(resolveDirectModelName(modelName)));
    default:
      throw new AIModelError(`Unknown AI provider: ${provider}`);
  }
}
