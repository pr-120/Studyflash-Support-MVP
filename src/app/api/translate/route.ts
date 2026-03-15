import { NextRequest, NextResponse } from "next/server";
import { translateText } from "@/lib/translate";
import { requireAuth } from "@/lib/auth";

/**
 * POST /api/translate
 *
 * General-purpose translation endpoint.
 * Uses LibreTranslate (free, self-hosted) with Claude Haiku fallback.
 *
 * Body: { "text": string, "source": string, "target": string }
 * Returns: { "translated": string, "engine": string }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const { text, source, target } = body;

  if (!text || !source || !target) {
    return NextResponse.json(
      { error: "Required: text, source, target" },
      { status: 400 }
    );
  }

  if (source === target) {
    return NextResponse.json({ translated: text, engine: "none" });
  }

  try {
    const result = await translateText(text, source, target);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Translation failed:", err);
    return NextResponse.json(
      { error: "Translation failed" },
      { status: 500 }
    );
  }
}
