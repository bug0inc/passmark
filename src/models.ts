import { AIModelError, ConfigurationError } from "./errors";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { gateway, type LanguageModel } from "ai";
import { wrapAISDKModel } from "axiom/ai";
import { getConfig } from "./config";
import { axiomEnabled } from "./instrumentation";

function wrapModel(model: LanguageModel): LanguageModel {
  return axiomEnabled ? wrapAISDKModel(model) : model;
}

let _google: ReturnType<typeof createGoogleGenerativeAI> | null = null;
let _anthropic: ReturnType<typeof createAnthropic> | null = null;
let _openrouter: ReturnType<typeof createOpenRouter> | null = null;

function getGoogleProvider() {
  if (!_google) {
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new ConfigurationError(
        "GOOGLE_GENERATIVE_AI_API_KEY isn't set. Add it to your environment (for example: export GOOGLE_GENERATIVE_AI_API_KEY=your_key), or use a gateway by calling configure({ ai: { gateway: 'vercel' } }) with AI_GATEWAY_API_KEY, or configure({ ai: { gateway: 'openrouter' } }) with OPENROUTER_API_KEY. See .env.example for reference.",
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
        "ANTHROPIC_API_KEY isn't set. Add it to your environment (for example: export ANTHROPIC_API_KEY=your_key), or use a gateway by calling configure({ ai: { gateway: 'vercel' } }) with AI_GATEWAY_API_KEY, or configure({ ai: { gateway: 'openrouter' } }) with OPENROUTER_API_KEY. See .env.example for reference.",
      );
    }
    _anthropic = createAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return _anthropic;
}

function getOpenRouterProvider() {
  if (!_openrouter) {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new ConfigurationError(
        "OPENROUTER_API_KEY isn't set. Add it to your environment (for example: export OPENROUTER_API_KEY=your_key). See .env.example for reference.",
      );
    }
    _openrouter = createOpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY,
    });
  }
  return _openrouter;
}

/**
 * Maps canonical model names to direct Google/Anthropic API names.
 * Only needed where the gateway name differs from the direct provider name.
 * Add new entries here when providers rename or graduate models.
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
 * Maps canonical model IDs (provider/model) to OpenRouter model IDs.
 * OpenRouter uses its own naming — add entries here when they differ from canonical IDs.
 */
const OPENROUTER_MODEL_ALIASES: Record<string, string> = {
  "google/gemini-3-flash": "google/gemini-3-flash-preview",
};

function resolveOpenRouterModelId(modelId: string): string {
  return OPENROUTER_MODEL_ALIASES[modelId] ?? modelId;
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

  if (gatewayConfig === "openrouter") {
    return wrapModel(getOpenRouterProvider()(resolveOpenRouterModelId(modelId)));
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