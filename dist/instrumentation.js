"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.axiomEnabled = void 0;
const exporter_trace_otlp_http_1 = require("@opentelemetry/exporter-trace-otlp-http");
const resources_1 = require("@opentelemetry/resources");
const sdk_trace_node_1 = require("@opentelemetry/sdk-trace-node");
const sdk_trace_node_2 = require("@opentelemetry/sdk-trace-node");
const semantic_conventions_1 = require("@opentelemetry/semantic-conventions");
const api_1 = require("@opentelemetry/api");
const ai_1 = require("axiom/ai");
const logger_1 = require("./logger");
const axiomToken = process.env.AXIOM_TOKEN;
const axiomDataset = process.env.AXIOM_DATASET;
exports.axiomEnabled = !!(axiomToken && axiomDataset);
if (axiomToken && axiomDataset) {
    logger_1.logger.info("Axiom AI instrumentation enabled");
    const tracer = api_1.trace.getTracer("ai-logs-tracer");
    const provider = new sdk_trace_node_1.NodeTracerProvider({
        resource: (0, resources_1.resourceFromAttributes)({
            [semantic_conventions_1.ATTR_SERVICE_NAME]: "passmark",
        }, {
            schemaUrl: "https://opentelemetry.io/schemas/1.37.0",
        }),
        spanProcessors: [
            new sdk_trace_node_2.SimpleSpanProcessor(new exporter_trace_otlp_http_1.OTLPTraceExporter({
                url: `https://api.axiom.co/v1/traces`,
                headers: {
                    Authorization: `Bearer ${axiomToken}`,
                    "X-Axiom-Dataset": axiomDataset,
                },
            })),
        ],
    });
    provider.register();
    (0, ai_1.initAxiomAI)({ tracer, redactionPolicy: ai_1.RedactionPolicy.AxiomDefault });
}
