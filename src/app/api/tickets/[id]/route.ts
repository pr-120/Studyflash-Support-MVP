import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const UpdateTicketSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  category: z.enum([
    "BUG_REPORT", "REFUND_REQUEST", "ACCOUNT_ISSUE",
    "FEATURE_REQUEST", "BILLING", "CONTENT_QUESTION",
    "TECHNICAL_SUPPORT", "OTHER"
  ]).optional(),
  assignedToId: z.string().nullable().optional(),
  aiDraft: z.string().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: params.id },
    include: {
      assignedTo: true,
      messages: { orderBy: { sentAt: "asc" } },
    },
  });

  if (!ticket) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(ticket);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const data = UpdateTicketSchema.parse(body);

  const ticket = await prisma.ticket.update({
    where: { id: params.id },
    data,
    include: { assignedTo: true },
  });

  return NextResponse.json(ticket);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await prisma.ticket.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}
