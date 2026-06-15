import type { EmailProvider } from "../config";

type MailinatorInbox = {
  msgs?: Array<{
    id: string;
  }>;
};

type MailinatorMessage = {
  parts?: Array<{
    body?: string;
  }>;
};

export function mailinatorProvider(options: {
  apiKey?: string;
} = {}): EmailProvider {
  return {
    domain: "mailinator.com",

    extractContent: async ({ email, prompt }) => {
      // extract username from email
      // "test.user.123@mailinator.com" → "test.user.123"
      const username = email.split("@")[0];

      // Step 1 — fetch inbox
      const inboxResponse = await fetch(
        `https://mailinator.com/api/v2/domains/mailinator.com/inboxes/${username}`,
        {
          headers: options.apiKey
            ? { Authorization: `Bearer ${options.apiKey}` }
            : {},
        }
      );

      if (!inboxResponse.ok) {
        throw new Error(
          `[mailinator] Failed to fetch inbox for ${email}: HTTP ${inboxResponse.status}`
        );
      }

      const inbox = (await inboxResponse.json()) as MailinatorInbox;

      // Step 2 — check emails exist
      if (!inbox.msgs || inbox.msgs.length === 0) {
        throw new Error(
          `[mailinator] No emails found for ${email}`
        );
      }

      // Step 3 — get latest email content
      const latestEmail = inbox.msgs[0];
      const messageResponse = await fetch(
        `https://mailinator.com/api/v2/domains/mailinator.com/inboxes/${username}/messages/${latestEmail.id}`,
        {
          headers: options.apiKey
            ? { Authorization: `Bearer ${options.apiKey}` }
            : {},
        }
      );

      const message = (await messageResponse.json()) as MailinatorMessage;
      const emailBody = message.parts?.[0]?.body ?? "";

      if (!emailBody) {
        throw new Error(
          `[mailinator] Email body is empty for ${email}`
        );
      }

      return emailBody;
    },
  };
}