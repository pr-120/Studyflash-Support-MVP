import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";

/**
 * POST /api/tickets/[id]/translate
 *
 * Translates the ticket's message text to English (or a specified target language).
 * Uses Claude Haiku for fast, cheap translation.
 *
 * Body: { "messageId"?: string, "targetLanguage"?: string }
 * - messageId: specific message to translate (defaults to all inbound messages)
 * - targetLanguage: ISO 639-1 code (defaults to "en")
 *
 * Returns: { translations: [{ messageId, original, translated }] }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Translation requires ANTHROPIC_API_KEY" },
      { status: 503 }
    );
  }

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

  // If ticket is already in the target language, return as-is
  if (ticket.language === targetLanguage) {
    return NextResponse.json({
      translations: ticket.messages.map((m) => ({
        messageId: m.id,
        original: m.bodyText,
        translated: m.bodyText,
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

  const anthropic = new Anthropic({ apiKey });

  // Batch all messages into a single LLM call for efficiency
  const textsToTranslate = messages
    .map((m, i) => `[MSG ${i + 1}]\n${m.bodyText}`)
    .join("\n\n---\n\n");

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `Translate the following support ticket messages to ${targetLanguage}. 
Preserve the message separators [MSG 1], [MSG 2], etc.
Return ONLY the translations, no commentary.

${textsToTranslate}`,
        },
      ],
    });

    const translatedText =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Parse the response back into individual message translations
    const translatedParts = translatedText
      .split(/\[MSG \d+\]\n?/)
      .filter((p) => p.trim());

    const translations = messages.map((m, i) => ({
      messageId: m.id,
      original: m.bodyText,
      translated: translatedParts[i]?.replace(/^---\n?/, "").trim() ?? m.bodyText,
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
