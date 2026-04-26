/**
 * cost.ts
 *
 * Tracks LLM usage and calculates cost based on standard provider pricing.
 */

import { logger } from "./logger";
import { getConfig } from "./config";
import { BudgetExceededError } from "./errors";
import { redis } from "./redis";
import * as fs from "fs";
import * as path from "path";

// Standard provider pricing (per 1M tokens, in USD)
const PRICING: Record<string, { input: number; output: number }> = {
  "google/gemini-3-flash": { input: 0.075, output: 0.30 },
  "google/gemini-3-flash-preview": { input: 0.075, output: 0.30 },
  "google/gemini-2.5-flash": { input: 0.075, output: 0.30 },
  "google/gemini-3.1-pro-preview": { input: 1.25, output: 5.00 },
  "anthropic/claude-4.5-haiku": { input: 0.25, output: 1.25 },
  "anthropic/claude-haiku-4.5": { input: 0.25, output: 1.25 },
  "gpt-5.5": { input: 5.00, output: 15.00 }, // Typical GPT-4o level pricing
};

let localTotalCost = 0;

function getExecutionId() {
  return process.env.executionId || "default";
}

function getRedisKey() {
  return `passmark:run:cost:${getExecutionId()}`;
}

function getEffectivePricing(model: string): { input: number; output: number } {
  const config = getConfig();
  
  // 1. Check custom pricing overrides
  if (config.pricing && config.pricing[model]) {
    return config.pricing[model];
  }

  // 2. Check standard pricing (exact match)
  let price = PRICING[model];
  if (price) return price;

  // 3. Try matching suffix (e.g. "openrouter/google/gemini-3-flash" -> "google/gemini-3-flash")
  const match = Object.keys(PRICING).find(k => model.endsWith(k));
  if (match) return PRICING[match];

  // 4. Default fallback
  return PRICING["google/gemini-3-flash"];
}

export async function trackUsage(model: string, usage: any) {
  if (!usage) return;

  const promptTokens = usage.promptTokens ?? usage.prompt_tokens ?? 0;
  const completionTokens = usage.completionTokens ?? usage.completion_tokens ?? 0;

  const price = getEffectivePricing(model);
  const cost = (promptTokens / 1_000_000) * price.input + (completionTokens / 1_000_000) * price.output;
  
  let currentTotalCost = 0;

  if (redis) {
    const key = getRedisKey();
    const newTotalStr = await redis.incrbyfloat(key, cost);
    // Set a 24-hour TTL to prevent infinite cost accumulation from old runs.
    await redis.expire(key, 86400);
    currentTotalCost = parseFloat(newTotalStr);
  } else {
    localTotalCost += cost;
    currentTotalCost = localTotalCost;
  }

  // Attach usage and cost to the active OpenTelemetry span
  try {
    const { trace } = require("@opentelemetry/api");
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.setAttributes({
        "ai.usage.prompt_tokens": promptTokens,
        "ai.usage.completion_tokens": completionTokens,
        "ai.usage.cost": cost,
        "ai.model": model,
      });
    }
  } catch (err) {
    // ignore if api is missing or not installed
  }

  const maxCost = getConfig().maxCostPerRun;
  if (maxCost !== undefined && currentTotalCost > maxCost) {
    throw new BudgetExceededError(`Maximum cost per run of $${maxCost} exceeded. Current total cost across all workers: $${currentTotalCost.toFixed(4)}`);
  }
}

export async function getTotalCost(): Promise<number> {
  if (redis) {
    const val = await redis.get(getRedisKey());
    return val ? parseFloat(val) : 0;
  }
  return localTotalCost;
}

export async function resetCostTracker() {
  if (redis) {
    await redis.del(getRedisKey());
  }
  localTotalCost = 0;
}

// Log the total cost at the end of the Node.js process
// Also generate a passmark-cost.json artifact in uploadBasePath if configured.
process.on("exit", () => {
  // We use localTotalCost for the exit log because process.on("exit") is synchronous and we can't await Redis.
  // However, since tests run in workers, we will log the local worker cost.
  if (localTotalCost > 0 && !redis) {
    logger.info(`💰 Total LLM Cost for this worker: $${localTotalCost.toFixed(4)}`);
  }
  
  // Try to write artifact
  try {
    const uploadBase = getConfig().uploadBasePath || "./uploads";
    if (fs.existsSync(uploadBase)) {
      const artifactPath = path.join(uploadBase, `passmark-cost-${process.pid}.json`);
      fs.writeFileSync(artifactPath, JSON.stringify({
        workerCost: localTotalCost,
        timestamp: new Date().toISOString()
      }, null, 2));
    }
  } catch (e) {
    // Ignore artifact write errors
  }
});
