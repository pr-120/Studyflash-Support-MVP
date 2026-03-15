/**
 * Microsoft Graph API client
 *
 * Handles:
 * - Getting access tokens via client credentials flow
 * - Reading emails from shared mailbox
 * - Sending replies that stay within the same Outlook thread
 * - Managing webhook subscriptions for real-time email notifications
 */

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

interface GraphToken {
  access_token: string;
  expires_in: number;
  token_type: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getGraphToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.AZURE_CLIENT_ID!,
    client_secret: process.env.AZURE_CLIENT_SECRET!,
    scope: "https://graph.microsoft.com/.default",
  });

  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
    { method: "POST", body: params }
  );

  if (!res.ok) {
    throw new Error(`Graph token error: ${await res.text()}`);
  }

  const data: GraphToken = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.token;
}

async function graphFetch(path: string, options: RequestInit = {}) {
  const token = await getGraphToken();
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Graph API error ${res.status}: ${error}`);
  }

  // Handle empty responses (204 No Content, 202 Accepted with empty body)
  if (res.status === 204 || res.status === 202) {
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  return res.json();
}

/**
 * Send a reply to an existing email thread.
 *
 * Strategy (in order of preference):
 * 1. createReply → patch body → send: creates a draft reply (with proper
 *    threading headers set by Graph automatically), updates the body with
 *    our content, then sends it. Best thread parity.
 * 2. reply endpoint: direct one-shot reply (simpler but returns empty body).
 * 3. sendMail: last resort, no threading (creates a new conversation).
 */
export async function sendReply(
  outlookMessageId: string,
  replyBodyHtml: string,
  recipientEmail: string,
  subject: string,
  conversationId?: string | null,
  internetMessageId?: string | null,
  comment?: string
) {
  const mailbox = process.env.SUPPORT_MAILBOX!;

  // ── Strategy 1: createReply → patch → send (best threading) ──
  try {
    // Step 1: Create a draft reply (Graph sets In-Reply-To, References, conversationId automatically)
    const draft = await graphFetch(
      `/users/${mailbox}/messages/${outlookMessageId}/createReply`,
      {
        method: "POST",
        body: JSON.stringify({}),
      }
    );

    if (draft?.id) {
      // Step 2: Update the draft body with our content
      await graphFetch(`/users/${mailbox}/messages/${draft.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          body: {
            contentType: "HTML",
            content: replyBodyHtml,
          },
        }),
      });

      // Step 3: Send the draft
      await graphFetch(`/users/${mailbox}/messages/${draft.id}/send`, {
        method: "POST",
      });

      console.log("Reply sent via createReply → patch → send");
      return null;
    }
  } catch (createReplyErr) {
    console.warn("createReply failed, trying reply endpoint:", createReplyErr);
  }

  // ── Strategy 2: Direct reply endpoint ──
  try {
    const result = await graphFetch(
      `/users/${mailbox}/messages/${outlookMessageId}/reply`,
      {
        method: "POST",
        body: JSON.stringify({
          message: {
            body: {
              contentType: "HTML",
              content: replyBodyHtml,
            },
          },
          comment: comment ?? "",
        }),
      }
    );
    console.log("Reply sent via direct reply endpoint");
    return result;
  } catch (replyErr) {
    console.warn("Reply endpoint failed, trying sendMail:", replyErr);
  }

  // ── Strategy 3: sendMail (no threading, last resort) ──
  const message: Record<string, unknown> = {
    subject: subject.startsWith("RE:") ? subject : `RE: ${subject}`,
    body: {
      contentType: "HTML",
      content: replyBodyHtml,
    },
    toRecipients: [
      {
        emailAddress: { address: recipientEmail },
      },
    ],
  };

  console.warn("Sending via sendMail (no thread parity)");
  return graphFetch(`/users/${mailbox}/sendMail`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

/**
 * Subscribe to new mail notifications via Graph webhook.
 * Call this once during setup — subscriptions expire after 3 days,
 * so you need to renew them (see renewWebhookSubscription).
 */
export async function createWebhookSubscription(notificationUrl: string) {
  const mailbox = process.env.SUPPORT_MAILBOX!;
  const expiryDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days

  return graphFetch("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      changeType: "created",
      notificationUrl,
      resource: `/users/${mailbox}/mailFolders/Inbox/messages`,
      expirationDateTime: expiryDate.toISOString(),
      clientState: process.env.GRAPH_WEBHOOK_SECRET,
    }),
  });
}

export async function renewWebhookSubscription(subscriptionId: string) {
  const expiryDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  return graphFetch(`/subscriptions/${subscriptionId}`, {
    method: "PATCH",
    body: JSON.stringify({ expirationDateTime: expiryDate.toISOString() }),
  });
}

/**
 * Fetch full message content by ID from the shared mailbox.
 * Includes internetMessageId (for SMTP threading) and internetMessageHeaders
 * (for detecting auto-replies, bounces, etc.).
 */
export async function getMessage(messageId: string) {
  const mailbox = process.env.SUPPORT_MAILBOX!;
  return graphFetch(
    `/users/${mailbox}/messages/${messageId}?$select=id,subject,from,body,conversationId,internetMessageId,internetMessageHeaders,receivedDateTime`
  );
}
