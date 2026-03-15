import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { translateBatch } from "@/lib/translate";

/**
 * POST /api/tickets/[id]/translate
 *
 * Translates the ticket's inbound messages to a target language.
 *
 * Translation priority:
 * 1. LibreTranslate (self-hosted, free, unlimited) — if running
 * 2. Claude Haiku (paid fallback) — if ANTHROPIC_API_KEY is set
 * 3. Returns original text unchanged
 *
 * Body: { "messageId"?: string, "targetLanguage"?: string }
 * Returns: { translations: [{ messageId, original, translated, engine }] }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: params.id },
    include: { messages: { orderBy: { sentAt: "asc" } } },
  });

  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const targetLanguage = body.targetLanguage ?? "en";
  const messageId = body.messageId;
  const sourceLanguage = ticket.language ?? "auto";

  // If ticket is already in the target language, return as-is
  if (sourceLanguage === targetLanguage) {
    return NextResponse.json({
      translations: ticket.messages.map((m) => ({
        messageId: m.id,
        original: m.bodyText,
        translated: m.bodyText,
        engine: "none",
      })),
    });
  }

  // Select messages to translate
  const messages = messageId
    ? ticket.messages.filter((m) => m.id === messageId)
    : ticket.messages.filter((m) => m.direction === "INBOUND");

  if (messages.length === 0) {
    return NextResponse.json({ translations: [] });
  }

  try {
    const results = await translateBatch(
      messages.map((m) => ({ id: m.id, text: m.bodyText })),
      sourceLanguage,
      targetLanguage
    );

    const translations = results.map((r) => ({
      messageId: r.id,
      original: r.original,
      translated: r.translated,
      engine: r.engine,
    }));

    return NextResponse.json({ translations });
  } catch (err) {
    console.error("Translation failed:", err);
    return NextResponse.json(
      { error: "Translation failed" },
      { status: 500 }
    );
  }
}
