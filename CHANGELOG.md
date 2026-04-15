# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **OpenAI Support**: Direct integration with OpenAI models via `@ai-sdk/openai` and `OPENAI_API_KEY`

## [1.0.0] - 2026-03-27

### Added

- **Core execution functions**: `runSteps()`, `runUserFlow()`, `generatePlaywrightTest()`, `executeWithAutoHealing()`
- **Multi-model assertion engine**: consensus-based validation using Claude and Gemini with arbiter for disagreements
- **Redis-based step caching**: cache-first execution with AI fallback and auto-healing
- **Configurable AI models**: 8 model slots for different use cases (step execution, assertions, extraction, etc.)
- **AI Gateway support**: route through Vercel AI Gateway or use direct provider SDKs
- **Placeholder system**: `{{run.*}}`, `{{global.*}}`, `{{data.*}}`, and `{{email.*}}` dynamic value injection
- **Email extraction**: pluggable email provider interface with built-in emailsink provider
- **Data extraction**: AI-powered extraction of values from page snapshots and URLs
- **Wait conditions**: AI-evaluated wait conditions with exponential backoff
- **Secure script runner**: AST-validated Playwright script execution with whitelisted APIs
- **Telemetry**: optional Axiom/OpenTelemetry tracing via environment variables
- **Structured logging**: Pino-based logger with configurable log levels
- **Global configuration**: `configure()` function for models, gateway, email provider, upload path
