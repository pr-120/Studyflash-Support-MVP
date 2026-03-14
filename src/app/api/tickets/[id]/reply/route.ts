import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendReply } from "@/lib/graph";
import { z } from "zod";

const SendReplySchema = z.object({
  bodyHtml: z.string().min(1),
  senderName: z.string().default("Studyflash Support"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: params.id },
    include: { messages: { orderBy: { sentAt: "asc" }, take: 1 } },
  });

  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const body = await req.json();
  const { bodyHtml, senderName } = SendReplySchema.parse(body);

  // If we have an Outlook message ID, send via Graph API (stays in thread)
  if (ticket.outlookMessageId) {
    try {
      await sendReply(ticket.outlookMessageId, bodyHtml);
    } catch (err) {
      console.error("Graph send failed:", err);
      return NextResponse.json(
        { error: "Failed to send via Outlook. Check Graph API credentials." },
        { status: 502 }
      );
    }
  }

  // Always save to our DB regardless of Outlook sync
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

  return NextResponse.json(message, { status: 201 });
}
