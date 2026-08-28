# Contributing to Passmark

Thank you for your interest in contributing to Passmark! This document provides guidelines and information for contributors.

## Getting Started

1. **Fork** the repository
2. **Clone** your fork locally
3. **Install dependencies**: `pnpm install` (this repo is pinned to `pnpm@10.33.0` via `packageManager`)
4. **Create a branch** for your change: `git checkout -b feature/your-feature`

## Development Setup

### Prerequisites

- Node.js >= 18.0.0
- pnpm 10 (`corepack enable` will use the version in `package.json`)
- Redis instance (local or remote) — only needed for live cache / `{{global.*}}` flows
- API keys for Anthropic and Google Generative AI — only needed for live AI runs, not for `pnpm test`
- Playwright: `npx playwright install` — only needed for running tests against a real browser

### Checks (same as CI)

```bash
pnpm run format:check
pnpm run lint
pnpm run build
pnpm test
```

`pnpm run build` runs the TypeScript compiler (`tsc`). Fix any type errors before submitting.

CI runs these on every pull request to `main` (tests on Node 18, 20, 22, and 24). The unit suite is mocked and does not need API keys, Redis, or a browser.

## Code Style

- **TypeScript** with strict mode enabled
- **Module system**: Node16
- **Target**: ES2022
- Keep code simple and focused. Avoid over-engineering.
- Use named constants from `src/constants.ts` instead of magic numbers
- Use the logger (`src/logger.ts`) instead of `console.log`

## Making Changes

### Branch Naming

- `feature/description` for new features
- `fix/description` for bug fixes
- `docs/description` for documentation changes
- `ci/description` for CI/CD changes

### Commit Messages

Use conventional commit messages. PR titles are checked the same way:

```
feat: add support for custom model providers
fix: handle empty email extraction gracefully
docs: update environment variables table
```

Allowed prefixes: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

### Pull Requests

1. Ensure CI would pass locally (`pnpm run format:check`, `pnpm run lint`, `pnpm run build`, `pnpm test`)
2. Update documentation if your change affects the public API
3. Add entries to `CHANGELOG.md` under an `[Unreleased]` section
4. Keep PRs focused on a single change
5. Provide a clear description of what changed and why

Publishing to npm is automated: creating a GitHub Release on `main` runs `.github/workflows/release.yml`. That workflow needs an `NPM_TOKEN` repository secret with publish access to the `passmark` package.

## Project Structure

```
src/
  config.ts        # Global configuration (configure(), ModelConfig, EmailProvider)
  constants.ts     # Named constants for timeouts, limits, retries
  logger.ts        # Pino logger instance
  models.ts        # AI model resolution (gateway vs direct providers)
  index.ts         # Main entry point and core functions
  types.ts         # TypeScript type definitions
  assertion.ts     # Multi-model consensus assertion engine
  extract.ts       # AI-powered data extraction
  email.ts         # Email generation and content extraction
  redis.ts         # Redis client
  data-cache.ts    # Placeholder resolution and caching
  instrumentation.ts # OpenTelemetry/Axiom setup
  tools.ts         # Playwright browser automation tools
  prompts/         # AI system prompts
  providers/       # Built-in providers (emailsink)
  utils/           # Utility functions and secure script runner
```

## Questions?

Open an issue for discussion before starting large changes. This helps ensure your contribution aligns with the project's direction.
