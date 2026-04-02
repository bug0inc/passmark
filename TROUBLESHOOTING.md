# Troubleshooting Passmark

This guide helps you diagnose and fix the common problems contributors hit when running Passmark locally or in CI. If the steps below don't help, open an issue and include logs and the commands you ran.

## Quick checklist

- Node.js >= 18
- Install dependencies: `pnpm install` (or `npm install`)
- Install Playwright browsers: `npx playwright install`
- Redis available at `REDIS_URL` (see `.env.example`)
- Required AI keys set when using direct providers: `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`
- If using the Vercel AI Gateway, set `AI_GATEWAY_API_KEY`

Refer to `.env.example` for the full list of environment variables.

## Common problems

### 1) "vitest: command not found" or tests fail immediately

Cause: dependencies (devDependencies) are not installed.

Fix:

```bash
pnpm install
pnpm test
```

If you don't have `pnpm`, install it or use `npm install` and `npm test`.

### 2) Missing AI API keys / cryptic runtime errors

Cause: The library attempts to call a model provider but API keys are not set.

Fix:

- For direct provider usage set:

```bash
export ANTHROPIC_API_KEY=sk-...
export GOOGLE_GENERATIVE_AI_API_KEY=AIza...
```

- Or use the Vercel AI Gateway by calling `configure({ ai: { gateway: 'vercel' } })` and setting `AI_GATEWAY_API_KEY`:

```bash
export AI_GATEWAY_API_KEY=your_gateway_key
```

The code now raises clear, actionable errors if these variables are missing — follow the message to pick the right approach for your setup.

### 3) Playwright browsers missing or tests that use the browser fail

Fix:

```bash
npx playwright install
```

On CI, install browsers in your pipeline or use the `--with-deps` option as needed for Linux.

### 4) Redis connection failures

Cause: Step caching and some runtime features rely on Redis.

Fix:

```bash
# start a local Redis server (if installed)
redis-server &

# or run Redis in Docker
docker run --rm -p 6379:6379 redis
```

Set `REDIS_URL` in your environment (see `.env.example`) so Passmark can connect.

If you intentionally don't want Redis, the code logs a warning and continues without caching.

### 5) Cached steps act stale or cause flaky runs

Cause: Cached step data can become invalid when the page changes.

Fix:

- Run with cache bypass for debugging: pass `bypassCache: true` when calling `runSteps`.
- Clear a specific cached step from Redis (use a Redis client) or flush the database during local troubleshooting.

### 6) Timeouts and flaky AI calls

Fix:

- Increase timeouts or retry values where appropriate (see `src/constants.ts`).
- Make sure your network to the AI provider is reliable and your API quota isn't exhausted.

### 7) Enable debug logs

Set the `PASSMARK_LOG_LEVEL` environment variable to `debug` to get more information from the logger:

```bash
export PASSMARK_LOG_LEVEL=debug
pnpm test
```

## When to open an issue

If you've tried the steps above and still can't get past a problem, open an issue and include:

- What you ran (commands)
- Relevant environment variables (mask keys)
- Full error output and stack trace
- A short description of your environment (OS, Node version, Playwright/Redis running or not)

## Helpful files

- `.env.example` — suggested env vars
- `src/models.ts` — model resolution and API key handling
- `src/config.ts` — how to call `configure()`

---

If you'd like, I can add a short link to this guide from the `README.md` or `CONTRIBUTING.md` as a follow-up.