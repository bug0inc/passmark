"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const PLAYWRIGHT_BEST_PRACTICES = `
# Playwright Guidelines

## 1. **Start waiting for API responses before triggering actions or use Promise.all()**

Start listening for the expected network response **before** performing actions like button clicks to avoid race conditions.

**✅ Do:**

\`\`\`jsx
const [response] = await Promise.all([
  page.waitForResponse("api/submit"),
  page.getByRole('button', { name: 'Submit' }).click(),
]);

expect(response.status()).toBe(200);
// next steps
\`\`\`

**✅ Do:**

\`\`\`jsx
const response = page.waitForResponse("api/submit"); // notice no await here, start listening first
await page.getByRole('button', { name: 'Submit' }).click(); // then perform the action
await response; // wait for the response to complete
\`\`\`

Both of the above approaches are valid and good practice. But the following is a bad practice:

**🚫 Don’t:**

\`\`\`jsx
await page.getByRole('button', { name: 'Submit' }).click();
await page.waitForResponse("api/submit"); // Too late — response might have already returned
\`\`\`

---

## 2. **Use \`test.slow()\` or \`test.setTimeout()\` for longer tests**

For longer or more complex flows, use \`test.slow()\` or \`test.setTimeout()\` to increase timeout without causing unnecessary failures in CI.

\`\`\`jsx
test('generates invoice after third-party sync', async ({ page }) => {
  test.slow(); // Extends (3x) timeout for this test

  await page.click('button:has-text("Sync with Xero")');
  await expect(page.getByText('Invoice generated')).toBeVisible();
});

\`\`\`

---

## 3. Include cleanup logic using \`afterAll\`

Use \`afterAll\` to clean up any test data created during the test suite. This keeps the environment clean and prevents leftover test artifacts. It also serves as a test for delete functionality.

**✅ Example:**

\`\`\`jsx
let userId: string;

test('creates a user', async ({ page }) => {});

afterAll(async ({ request }) => {
  if (userId) {
    const res = await request.delete(\`/api/users/\${userId}\`);
    expect(res.ok()).toBeTruthy(); // Optional assertion
  }
});
\`\`\`

**🔎 Why this matters:**

- Ensures test-created entities are removed after execution
- Keeps test environments clean for future runs
- Helps catch issues in delete endpoints as well

---

## 4. **Use \`pressSequentially\` for more human-like typing**

Instead of using \`fill()\`, consider using \`pressSequentially()\` when simulating text input, especially if you're recording or showcasing tests, it mimics a real user typing, making playback more natural.

**✅ Do:**

\`\`\`jsx
await page.locator('#email').pressSequentially('test@example.com');
\`\`\`

**🚫 Don’t:**

\`\`\`jsx
await page.fill('#email', 'test@example.com'); // Instant fill, less realistic in playback
\`\`\`

---

## 6. Never use magic timeouts

Timeouts like \`await page.waitForTimeout()\` are a big reason behind flaky tests. Do not use them unless there is a very good reason behind it. Try to use other hooks like \`waitFor()\` or \`waitForResponse()\` to smartly wait for elements to appear / disappear or API calls to complete. In general, avoid \`page.waitForTimeout()\`.

## 7. Never use page.waitForLoadState('networkidle')

Using \`page.waitForLoadState('networkidle')\` is an anti-pattern that can lead to flaky tests. Instead, use more specific waits like \`waitForResponse()\` or \`waitForSelector()\` to ensure the necessary conditions are met before proceeding.
`;
exports.default = PLAYWRIGHT_BEST_PRACTICES;
