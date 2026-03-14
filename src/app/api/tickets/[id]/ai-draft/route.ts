import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { regenerateDraft } from "@/lib/ai";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ticket = await prisma.ticket.findUnique({ where: { id: params.id } });
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const customInstructions = body.instructions ?? undefined;

  const draft = await regenerateDraft(
    ticket.subject,
    ticket.bodyText,
    ticket.language ?? "en",
    customInstructions
  );

  // Persist the new draft
  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { aiDraft: draft },
  });

  return NextResponse.json({ draft });
}
