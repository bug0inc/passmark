import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { trace } from "@opentelemetry/api";
import { initAxiomAI, RedactionPolicy } from "axiom/ai";
import { getConfig } from "./config";
import { logger } from "./logger";

let initialized = false;
let enabled = false;

/**
 * Initializes Axiom AI tracing. Idempotent — safe to call multiple times.
 *
 * Resolution order: `configure({ telemetry: ... })` first, then
 * `AXIOM_TOKEN`/`AXIOM_DATASET` env vars. If neither is set, telemetry stays
 * disabled and AI calls run unwrapped.
 */
export function initTelemetry() {
  if (initialized) return;
  initialized = true;

  const telemetry = getConfig().telemetry;
  const axiomToken = telemetry?.axiomToken ?? process.env.AXIOM_TOKEN;
  const axiomDataset = telemetry?.axiomDataset ?? process.env.AXIOM_DATASET;

  if (!axiomToken || !axiomDataset) return;

  logger.info("Axiom AI instrumentation enabled");
  const tracer = trace.getTracer("ai-logs-tracer");

  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes(
      {
        [ATTR_SERVICE_NAME]: "passmark",
      },
      {
        schemaUrl: "https://opentelemetry.io/schemas/1.37.0",
      },
    ),
    spanProcessors: [
      new SimpleSpanProcessor(
        new OTLPTraceExporter({
          url: `https://api.axiom.co/v1/traces`,
          headers: {
            Authorization: `Bearer ${axiomToken}`,
            "X-Axiom-Dataset": axiomDataset,
          },
        }),
      ),
    ],
  });

  provider.register();

  initAxiomAI({ tracer, redactionPolicy: RedactionPolicy.AxiomDefault });
  enabled = true;
}

/**
 * Returns true iff `initTelemetry()` succeeded (token + dataset were set).
 * Use this at call sites — not a cached const — so post-`configure()` state
 * is reflected.
 */
export function isAxiomEnabled(): boolean {
  if (!initialized) initTelemetry();
  return enabled;
}

/** @internal Reset for tests. */
export function resetTelemetry() {
  initialized = false;
  enabled = false;
}
