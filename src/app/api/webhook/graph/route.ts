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

// Graph requires validation token echoed back as plain text
export async function GET(req: NextRequest) {
  const validationToken = req.nextUrl.searchParams.get("validationToken");
  if (validationToken) {
    return new NextResponse(decodeURIComponent(validationToken), {
      headers: { "Content-Type": "text/plain" },
    });
  }
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

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

  // Fetch full message from Graph
  const message = await getMessage(messageId);
  if (!message) return;

  const fromEmail = message.from?.emailAddress?.address ?? "";
  const fromName = message.from?.emailAddress?.name ?? fromEmail;
  const subject = message.subject ?? "(no subject)";
  const bodyText = message.body?.content ?? "";
  const bodyHtml = message.body?.contentType === "html" ? bodyText : undefined;
  const conversationId = message.conversationId;

  // Check if this is a reply to an existing ticket thread
  const existingTicket = conversationId
    ? await prisma.ticket.findUnique({ where: { outlookThreadId: conversationId } })
    : null;

  if (existingTicket) {
    // Add as a new message on existing ticket
    await prisma.message.create({
      data: {
        ticketId: existingTicket.id,
        direction: "INBOUND",
        fromEmail,
        fromName,
        bodyText: bodyText.replace(/<[^>]+>/g, ""), // strip HTML for text
        bodyHtml,
        outlookMessageId: messageId,
      },
    });

    // Re-open if it was resolved/waiting
    if (["RESOLVED", "WAITING"].includes(existingTicket.status)) {
      await prisma.ticket.update({
        where: { id: existingTicket.id },
        data: { status: "OPEN" },
      });
    }
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
