"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailsinkProvider = emailsinkProvider;
/**
 *  Emailsink is a simple email service by Bug0 that allows you to receive emails at a unique address and retrieve their content via an API
 *  The free plan doesn't require an API key, but you can consider getting one by upgrading to a paid plan for higher rate limits and reliability.
 *
 * @param options - Configuration options for the Emailsink provider
 * @returns An EmailProvider instance
 */
function emailsinkProvider(options) {
    return {
        domain: "emailsink.dev",
        extractContent: async ({ email, prompt }) => {
            let url = `https://get.emailsink.dev/?email=${encodeURIComponent(email)}&prompt=${encodeURIComponent(prompt)}`;
            if (options.apiKey) {
                url += `&secret=${encodeURIComponent(options.apiKey)}`;
            }
            const response = await fetch(url);
            const data = (await response.json());
            let result = data.result;
            // Handle case where result is a string containing a JSON object
            if (typeof result === "string" && result.startsWith("{")) {
                try {
                    const parsedResult = JSON.parse(result);
                    result = parsedResult.result;
                }
                catch {
                    // Keep the original result if parsing fails
                }
            }
            if (result !== undefined && result !== null && result !== "") {
                return result;
            }
            throw new Error("No email content found");
        },
    };
}
