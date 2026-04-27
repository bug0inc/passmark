import type { EmailProvider } from "../config";
/**
 *  Emailsink is a simple email service by Bug0 that allows you to receive emails at a unique address and retrieve their content via an API
 *  The free plan doesn't require an API key, but you can consider getting one by upgrading to a paid plan for higher rate limits and reliability.
 *
 * @param options - Configuration options for the Emailsink provider
 * @returns An EmailProvider instance
 */
export declare function emailsinkProvider(options: {
    apiKey?: string;
}): EmailProvider;
