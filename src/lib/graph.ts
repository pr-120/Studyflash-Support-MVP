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

  if (res.status === 204) return null;
  return res.json();
}

/**
 * Send a reply to an existing email thread.
 * The reply will appear in Outlook as part of the same conversation thread.
 */
export async function sendReply(
  outlookMessageId: string,
  replyBodyHtml: string,
  comment?: string
) {
  const mailbox = process.env.SUPPORT_MAILBOX!;
  return graphFetch(
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
 */
export async function getMessage(messageId: string) {
  const mailbox = process.env.SUPPORT_MAILBOX!;
  return graphFetch(
    `/users/${mailbox}/messages/${messageId}?$select=id,subject,from,body,conversationId,receivedDateTime`
  );
}
