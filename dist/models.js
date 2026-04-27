"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveModel = resolveModel;
const errors_1 = require("./errors");
const anthropic_1 = require("@ai-sdk/anthropic");
const google_1 = require("@ai-sdk/google");
const ai_sdk_provider_1 = require("@openrouter/ai-sdk-provider");
const ai_1 = require("ai");
const ai_2 = require("axiom/ai");
const config_1 = require("./config");
const instrumentation_1 = require("./instrumentation");
function wrapModel(model) {
    return instrumentation_1.axiomEnabled ? (0, ai_2.wrapAISDKModel)(model) : model;
}
let _google = null;
let _anthropic = null;
let _openrouter = null;
let _cloudflareGoogle = null;
let _cloudflareAnthropic = null;
function getGoogleProvider() {
    if (!_google) {
        if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
            throw new errors_1.ConfigurationError("GOOGLE_GENERATIVE_AI_API_KEY isn't set. Add it to your environment (for example: export GOOGLE_GENERATIVE_AI_API_KEY=your_key), or use a gateway: configure({ ai: { gateway: 'vercel' } }) with AI_GATEWAY_API_KEY, configure({ ai: { gateway: 'openrouter' } }) with OPENROUTER_API_KEY, or configure({ ai: { gateway: 'cloudflare' } }) with CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_AI_GATEWAY, GOOGLE_GENERATIVE_AI_API_KEY, and CLOUDFLARE_AI_GATEWAY_API_KEY. See .env.example for reference.");
        }
        _google = (0, google_1.createGoogleGenerativeAI)({
            apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
        });
    }
    return _google;
}
function getAnthropicProvider() {
    if (!_anthropic) {
        if (!process.env.ANTHROPIC_API_KEY) {
            throw new errors_1.ConfigurationError("ANTHROPIC_API_KEY isn't set. Add it to your environment (for example: export ANTHROPIC_API_KEY=your_key), or use a gateway: configure({ ai: { gateway: 'vercel' } }) with AI_GATEWAY_API_KEY, configure({ ai: { gateway: 'openrouter' } }) with OPENROUTER_API_KEY, or configure({ ai: { gateway: 'cloudflare' } }) with CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_AI_GATEWAY, ANTHROPIC_API_KEY, and CLOUDFLARE_AI_GATEWAY_API_KEY. See .env.example for reference.");
        }
        _anthropic = (0, anthropic_1.createAnthropic)({
            apiKey: process.env.ANTHROPIC_API_KEY,
        });
    }
    return _anthropic;
}
function getOpenRouterProvider() {
    if (!_openrouter) {
        if (!process.env.OPENROUTER_API_KEY) {
            throw new errors_1.ConfigurationError("OPENROUTER_API_KEY isn't set. Add it to your environment (for example: export OPENROUTER_API_KEY=your_key). See .env.example for reference.");
        }
        _openrouter = (0, ai_sdk_provider_1.createOpenRouter)({
            apiKey: process.env.OPENROUTER_API_KEY,
        });
    }
    return _openrouter;
}
/**
 * Builds the per-provider Cloudflare AI Gateway base URL and (optional)
 * `cf-aig-authorization` header. We route through Cloudflare's native
 * provider paths (not the Unified/OpenAI-compat endpoint) so that
 * provider-specific fields — notably Gemini's `thought_signature` on
 * thinking models — pass through unmodified.
 *
 * @see https://developers.cloudflare.com/ai-gateway/usage/providers/google-ai-studio/
 * @see https://developers.cloudflare.com/ai-gateway/usage/providers/anthropic/
 */
function getCloudflareGatewayConfig(providerPath) {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const gatewayName = process.env.CLOUDFLARE_AI_GATEWAY;
    if (!accountId || !gatewayName) {
        throw new errors_1.ConfigurationError("Cloudflare AI Gateway requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_GATEWAY (gateway name). You must also set the upstream provider key (GOOGLE_GENERATIVE_AI_API_KEY and/or ANTHROPIC_API_KEY). If the gateway is authenticated, also set CLOUDFLARE_AI_GATEWAY_API_KEY. See .env.example for reference.");
    }
    const cfAigToken = process.env.CLOUDFLARE_AI_GATEWAY_API_KEY;
    return {
        baseURL: `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayName}/${providerPath}`,
        headers: cfAigToken ? { "cf-aig-authorization": `Bearer ${cfAigToken}` } : undefined,
    };
}
function getCloudflareGoogleProvider() {
    if (!_cloudflareGoogle) {
        if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
            throw new errors_1.ConfigurationError("GOOGLE_GENERATIVE_AI_API_KEY isn't set. Cloudflare AI Gateway proxies requests to Google AI Studio and requires your Google API key. Add GOOGLE_GENERATIVE_AI_API_KEY to your environment.");
        }
        const { baseURL, headers } = getCloudflareGatewayConfig("google-ai-studio/v1beta");
        _cloudflareGoogle = (0, google_1.createGoogleGenerativeAI)({
            apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
            baseURL,
            headers,
        });
    }
    return _cloudflareGoogle;
}
function getCloudflareAnthropicProvider() {
    if (!_cloudflareAnthropic) {
        if (!process.env.ANTHROPIC_API_KEY) {
            throw new errors_1.ConfigurationError("ANTHROPIC_API_KEY isn't set. Cloudflare AI Gateway proxies requests to Anthropic and requires your Anthropic API key. Add ANTHROPIC_API_KEY to your environment.");
        }
        const { baseURL, headers } = getCloudflareGatewayConfig("anthropic/v1");
        _cloudflareAnthropic = (0, anthropic_1.createAnthropic)({
            apiKey: process.env.ANTHROPIC_API_KEY,
            baseURL,
            headers,
        });
    }
    return _cloudflareAnthropic;
}
/**
 * Maps canonical model names to direct Google/Anthropic API names.
 * Only needed where the gateway name differs from the direct provider name.
 * Add new entries here when providers rename or graduate models.
 */
const MODEL_DIRECT_ALIASES = {
    "gemini-3-flash": "gemini-3-flash-preview",
    "claude-sonnet-4.6": "claude-sonnet-4-6",
    "claude-haiku-4.5": "claude-haiku-4-5",
};
function resolveDirectModelName(modelName) {
    return MODEL_DIRECT_ALIASES[modelName] ?? modelName;
}
/**
 * Maps canonical model IDs (provider/model) to OpenRouter model IDs.
 * OpenRouter uses its own naming — add entries here when they differ from canonical IDs.
 */
const OPENROUTER_MODEL_ALIASES = {
    "google/gemini-3-flash": "google/gemini-3-flash-preview",
};
function resolveOpenRouterModelId(modelId) {
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
 * When gateway is "openrouter", routes through OpenRouter.
 * When gateway is "cloudflare", routes through Cloudflare AI Gateway using the
 * provider-native paths (google-ai-studio, anthropic) so provider-specific fields
 * like Gemini's thought_signature pass through unchanged.
 * When gateway is "none" (default), creates a direct provider instance with alias resolution.
 * All paths wrap the model with wrapAISDKModel for tracing when Axiom is enabled.
 */
function resolveModel(modelId) {
    const gatewayConfig = (0, config_1.getConfig)().ai?.gateway ?? "none";
    if (gatewayConfig === "vercel") {
        if (!process.env.AI_GATEWAY_API_KEY) {
            throw new errors_1.ConfigurationError("AI_GATEWAY_API_KEY isn't set. To use the Vercel AI Gateway, add AI_GATEWAY_API_KEY to your environment. If you'd rather use direct provider keys, call configure({ ai: { gateway: 'none' } }) and set GOOGLE_GENERATIVE_AI_API_KEY and/or ANTHROPIC_API_KEY.");
        }
        return wrapModel((0, ai_1.gateway)(modelId));
    }
    if (gatewayConfig === "openrouter") {
        return wrapModel(getOpenRouterProvider()(resolveOpenRouterModelId(modelId)));
    }
    const [provider, ...rest] = modelId.split("/");
    const modelName = rest.join("/");
    if (gatewayConfig === "cloudflare") {
        switch (provider) {
            case "google":
                return wrapModel(getCloudflareGoogleProvider()(resolveDirectModelName(modelName)));
            case "anthropic":
                return wrapModel(getCloudflareAnthropicProvider()(resolveDirectModelName(modelName)));
            default:
                throw new errors_1.AIModelError(`Cloudflare AI Gateway routing is not configured for provider: ${provider}`);
        }
    }
    switch (provider) {
        case "google":
            return wrapModel(getGoogleProvider()(resolveDirectModelName(modelName)));
        case "anthropic":
            return wrapModel(getAnthropicProvider()(resolveDirectModelName(modelName)));
        default:
            throw new errors_1.AIModelError(`Unknown AI provider: ${provider}`);
    }
}
