/**
 * POST /api/webhook/graph
 *
 * Microsoft Graph sends notifications here when new emails arrive.
 * Two cases:
 * 1. Validation request (GET with validationToken query param) - must echo back the token
 * 2. Notification (POST with JSON body) - process the new email
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMessage } from "@/lib/graph";
import { analyzeTicket } from "@/lib/ai";

// Known system sender prefixes — these are never real support tickets
const SYSTEM_SENDER_PREFIXES = [
  "postmaster@",
  "mailer-daemon@",
  "noreply@",
  "no-reply@",
  "microsoft-noreply@",
  "msonlineservicesteam@",
];

// Graph sends validation as either GET or POST with ?validationToken=...
// Must echo the token back as plain text with 200 OK.
export async function GET(req: NextRequest) {
  const validationToken = req.nextUrl.searchParams.get("validationToken");
  if (validationToken) {
    return new NextResponse(validationToken, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function POST(req: NextRequest) {
  // Graph may send validation via POST with validationToken in query string
  const validationToken = req.nextUrl.searchParams.get("validationToken");
  if (validationToken) {
    return new NextResponse(validationToken, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // Parse the notification body (safe against empty/malformed JSON)
  const body = await req.json().catch(() => ({}));

  // Validate the clientState secret
  const notifications = body?.value ?? [];
  for (const notification of notifications) {
    if (notification.clientState !== process.env.GRAPH_WEBHOOK_SECRET) {
      console.error("Invalid webhook secret");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Process asynchronously - Graph requires a 200 response within 3s
    processNotification(notification).catch(console.error);
  }

  return NextResponse.json({ status: "ok" });
}

async function processNotification(notification: {
  resourceData?: { id?: string };
  conversationId?: string;
}) {
  const messageId = notification.resourceData?.id;
  if (!messageId) return;

  // ── Deduplication: skip if we already processed this message ──
  const existingMessage = await prisma.message.findFirst({
    where: { outlookMessageId: messageId },
  });
  if (existingMessage) {
    console.log(`Skipping duplicate notification for message ${messageId}`);
    return;
  }

  // Fetch full message from Graph (includes internetMessageHeaders for auto-reply detection)
  const message = await getMessage(messageId);
  if (!message) return;

  const fromEmail = message.from?.emailAddress?.address ?? "";
  const fromName = message.from?.emailAddress?.name ?? fromEmail;
  const subject = message.subject ?? "(no subject)";
  const bodyText = message.body?.content ?? "";
  const bodyHtml = message.body?.contentType === "html" ? bodyText : undefined;
  const conversationId = message.conversationId;
  const internetMsgId = message.internetMessageId;
  const headers: Array<{ name: string; value: string }> =
    message.internetMessageHeaders ?? [];

  // ── Filter 1: Skip emails from ourselves ──
  const supportMailbox = process.env.SUPPORT_MAILBOX?.toLowerCase();
  if (supportMailbox && fromEmail.toLowerCase() === supportMailbox) {
    console.log(`Skipping self-email from ${fromEmail}`);
    return;
  }

  // ── Filter 2: Skip system senders (postmaster, mailer-daemon, etc.) ──
  const fromLower = fromEmail.toLowerCase();
  if (SYSTEM_SENDER_PREFIXES.some((prefix) => fromLower.startsWith(prefix))) {
    console.log(`Skipping system email from ${fromEmail}`);
    return;
  }

  // ── Filter 3: Skip auto-generated messages (bounces, delivery receipts, auto-replies) ──
  const autoSubmitted = headers.find(
    (h) => h.name.toLowerCase() === "auto-submitted"
  );
  if (autoSubmitted && autoSubmitted.value.toLowerCase() !== "no") {
    console.log(
      `Skipping auto-generated email (Auto-Submitted: ${autoSubmitted.value})`
    );
    return;
  }

  // ── Filter 4: Skip delivery status notifications / read receipts ──
  const contentType = headers.find(
    (h) => h.name.toLowerCase() === "content-type"
  );
  if (
    contentType &&
    (contentType.value.includes("delivery-status") ||
      contentType.value.includes("disposition-notification"))
  ) {
    console.log(`Skipping delivery notification from ${fromEmail}`);
    return;
  }

  // ── Filter 5: Skip subjects that look like bounce notifications ──
  const subjectLower = subject.toLowerCase();
  if (
    subjectLower.startsWith("undeliverable:") ||
    subjectLower.startsWith("delivery has failed") ||
    subjectLower.startsWith("mail delivery failed") ||
    subjectLower.startsWith("returned mail:") ||
    subjectLower.startsWith("failure notice")
  ) {
    console.log(`Skipping bounce notification: ${subject}`);
    return;
  }

  // ── Thread matching: check if this belongs to an existing ticket ──
  const existingTicket = conversationId
    ? await prisma.ticket.findUnique({
        where: { outlookThreadId: conversationId },
      })
    : null;

  if (existingTicket) {
    // Add as a new message on existing ticket
    const plainText = bodyText.replace(/<[^>]+>/g, "");
    await prisma.message.create({
      data: {
        ticketId: existingTicket.id,
        direction: "INBOUND",
        fromEmail,
        fromName,
        bodyText: plainText,
        bodyHtml,
        outlookMessageId: messageId,
      },
    });

    // Update the ticket's outlookMessageId and internetMessageId to the latest
    await prisma.ticket.update({
      where: { id: existingTicket.id },
      data: {
        outlookMessageId: messageId,
        internetMessageId: internetMsgId ?? undefined,
        // Re-open if it was resolved/waiting
        ...(["RESOLVED", "WAITING"].includes(existingTicket.status)
          ? { status: "OPEN" as const }
          : {}),
      },
    });

    console.log(
      `Added message to ticket ${existingTicket.id} from ${fromEmail}`
    );
  } else {
    // New ticket - run AI analysis
    const plainText = bodyText.replace(/<[^>]+>/g, "");
    const analysis = await analyzeTicket(subject, plainText);

    const ticket = await prisma.ticket.create({
      data: {
        subject,
        fromEmail,
        fromName,
        bodyText: plainText,
        bodyHtml,
        outlookThreadId: conversationId,
        outlookMessageId: messageId,
        internetMessageId: internetMsgId,
        language: analysis.language,
        summary: analysis.summary,
        category: analysis.category,
        priority: analysis.priority,
        aiDraft: analysis.aiDraft,
        status: "OPEN",
        messages: {
          create: {
            direction: "INBOUND",
            fromEmail,
            fromName,
            bodyText: plainText,
            bodyHtml,
            outlookMessageId: messageId,
          },
        },
      },
    });

    console.log(`Created ticket ${ticket.id} from ${fromEmail}`);
  }
}
