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
 * First tries the Graph `reply` endpoint (stays in-thread).
 * If that fails (e.g., spam block on new tenants), falls back to `sendMail`
 * with proper SMTP threading headers to maintain thread parity.
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

  // Try in-thread reply first
  try {
    return await graphFetch(
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
  } catch (replyErr) {
    console.warn("Graph reply failed, trying sendMail fallback:", replyErr);

    // Fallback: sendMail with SMTP threading headers.
    // Note: conversationId is READ-ONLY in Graph — setting it is silently ignored.
    // Instead, we use In-Reply-To and References headers which is how SMTP
    // threading actually works. Both Outlook and Gmail respect these.
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

    // Set proper SMTP threading headers so mail clients thread correctly
    if (internetMessageId) {
      message.internetMessageHeaders = [
        { name: "In-Reply-To", value: internetMessageId },
        { name: "References", value: internetMessageId },
      ];
    }

    return graphFetch(`/users/${mailbox}/sendMail`, {
      method: "POST",
      body: JSON.stringify({ message }),
    });
  }
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
