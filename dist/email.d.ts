/**
 * Generates a unique test email address using the configured email provider's domain.
 *
 * @param options - Optional email generation parameters
 * @param options.prefix - Email prefix before the timestamp. Default: "test.user"
 * @param options.timestamp - Timestamp for uniqueness. Default: Date.now()
 * @returns Email address in the format `prefix.timestamp@domain`
 * @throws If no email provider is configured via `configure()`
 *
 * @example
 * ```typescript
 * const email = generateEmail(); // "test.user.1711234567890@emailsink.dev"
 * const custom = generateEmail({ prefix: "signup" }); // "signup.1711234567890@emailsink.dev"
 * ```
 */
export declare const generateEmail: ({ prefix, timestamp, }?: {
    prefix?: string;
    timestamp?: number;
}) => string;
/**
 * Extracts content from an email using the configured email provider.
 * Waits for the email to arrive, then polls the provider with retries.
 *
 * @param options - Extraction configuration
 * @param options.email - The email address to extract content from
 * @param options.prompt - Natural language prompt describing what to extract (e.g. "get the 6 digit verification code")
 * @param options.maxRetries - Maximum number of extraction attempts. Default: 3
 * @param options.retryDelayMs - Delay between retries in milliseconds. Default: 60000 (1 minute)
 * @returns The extracted content as a string
 * @throws If no email provider is configured via `configure()`
 * @throws If content cannot be extracted after all retry attempts
 *
 * @example
 * ```typescript
 * const otp = await extractEmailContent({
 *   email: "test.user.123@emailsink.dev",
 *   prompt: "get the 6 digit verification code",
 * });
 * ```
 */
export declare function extractEmailContent({ email, prompt, maxRetries, retryDelayMs, }: {
    email: string;
    prompt: string;
    maxRetries?: number;
    retryDelayMs?: number;
}): Promise<string>;
