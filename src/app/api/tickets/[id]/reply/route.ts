import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendReply } from "@/lib/graph";
import { requireAuth } from "@/lib/auth";
import { z } from "zod";

const SendReplySchema = z.object({
  bodyHtml: z.string().min(1),
  senderName: z.string().default("Studyflash Support"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const ticket = await prisma.ticket.findUnique({
    where: { id: params.id },
    include: { messages: { orderBy: { sentAt: "asc" }, take: 1 } },
  });

  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const body = await req.json();
  const { bodyHtml, senderName } = SendReplySchema.parse(body);

  // Send via Graph API if we have an Outlook message ID
  let emailSent = false;
  let emailError: string | null = null;
  if (ticket.outlookMessageId) {
    try {
      await sendReply(
        ticket.outlookMessageId,
        bodyHtml,
        ticket.fromEmail,
        ticket.subject,
        ticket.outlookThreadId // conversationId for sendMail fallback
      );
      emailSent = true;
    } catch (err) {
      emailError = err instanceof Error ? err.message : "Unknown error";
      console.error("Graph send failed (reply saved to DB anyway):", err);
      // Don't return an error — save the message to DB regardless
    }
  }

  // Always save to our DB regardless of email delivery status
  const plainText = bodyHtml.replace(/<[^>]+>/g, "");
  const message = await prisma.message.create({
    data: {
      ticketId: ticket.id,
      direction: "OUTBOUND",
      fromEmail: process.env.SUPPORT_MAILBOX ?? "support@studyflash.ch",
      fromName: senderName,
      bodyText: plainText,
      bodyHtml,
    },
  });

  // Move ticket to IN_PROGRESS if it was OPEN
  if (ticket.status === "OPEN") {
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: "IN_PROGRESS" },
    });
  }

  return NextResponse.json(
    {
      ...message,
      emailSent,
      emailError,
    },
    { status: 201 }
  );
}
