import OpenAI from "openai";
import { ConfigurationError } from "../errors";
import type { AIGateway } from "../config";

let _client: OpenAI | null = null;

/**
 * Returns a lazy singleton OpenAI client for CUA mode.
 *
 * CUA requires direct OpenAI access (Responses API + built-in `computer` tool).
 * Throws ConfigurationError if OPENAI_API_KEY is missing, or if the resolved
 * gateway for this call is not "none" (a non-"none" gateway routes through a
 * proxy that does not expose the Responses API).
 *
 * @param gateway - The resolved gateway for this call (defaults to "none").
 *   Pass the per-step / per-call resolved gateway, not the global one — this
 *   is what enables hybrid runs where the global gateway is `openrouter` but
 *   one step opts into CUA with `gateway: "none"`.
 */
export function getOpenAIClient(gateway: AIGateway = "none"): OpenAI {
  if (gateway !== "none") {
    throw new ConfigurationError(
      `CUA mode requires gateway: "none" (got "${gateway}"). ` +
        `The OpenAI Responses API computer tool is only available on direct OpenAI access. ` +
        `Set ai: { mode: "cua", gateway: "none" } (per-step or via configure()) and provide OPENAI_API_KEY.`,
    );
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new ConfigurationError(
      "OPENAI_API_KEY isn't set. CUA mode uses OpenAI's Responses API — add OPENAI_API_KEY to your environment.",
    );
  }
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

/** @internal Reset client singleton. Used for testing only. */
export function resetOpenAIClient() {
  _client = null;
}
