import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { analyzeTicket } from "@/lib/ai";
import { z } from "zod";

const CreateTicketSchema = z.object({
  subject: z.string().min(1),
  fromEmail: z.string().email(),
  fromName: z.string().default(""),
  bodyText: z.string().min(1),
  bodyHtml: z.string().optional(),
  outlookThreadId: z.string().optional(),
  outlookMessageId: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const assignedToId = searchParams.get("assignedToId");
  const category = searchParams.get("category");
  const search = searchParams.get("search");

  const tickets = await prisma.ticket.findMany({
    where: {
      ...(status ? { status: status as any } : {}),
      ...(assignedToId ? { assignedToId } : {}),
      ...(category ? { category: category as any } : {}),
      ...(search
        ? {
            OR: [
              { subject: { contains: search, mode: "insensitive" } },
              { fromEmail: { contains: search, mode: "insensitive" } },
              { summary: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      assignedTo: { select: { id: true, name: true, avatar: true } },
      _count: { select: { messages: true } },
    },
    orderBy: [
      { priority: "desc" },
      { createdAt: "desc" },
    ],
    take: 100,
  });

  return NextResponse.json(tickets);
}

// Manual ticket creation (for testing / importing without Outlook)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = CreateTicketSchema.parse(body);

  const analysis = await analyzeTicket(parsed.subject, parsed.bodyText);

  const ticket = await prisma.ticket.create({
    data: {
      ...parsed,
      language: analysis.language,
      summary: analysis.summary,
      category: analysis.category,
      priority: analysis.priority,
      aiDraft: analysis.aiDraft,
      status: "OPEN",
      messages: {
        create: {
          direction: "INBOUND",
          fromEmail: parsed.fromEmail,
          fromName: parsed.fromName,
          bodyText: parsed.bodyText,
          bodyHtml: parsed.bodyHtml,
        },
      },
    },
    include: { assignedTo: true, messages: true },
  });

  return NextResponse.json(ticket, { status: 201 });
}
