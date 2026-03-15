/**
 * Translation service — LibreTranslate (self-hosted, free, unlimited)
 * with Claude Haiku fallback for unsupported language pairs.
 *
 * Priority:
 * 1. LibreTranslate (if LIBRETRANSLATE_URL is set) — free, fast, unlimited
 * 2. Claude Haiku (if ANTHROPIC_API_KEY is set) — paid, handles any language
 * 3. Returns original text unchanged
 *
 * LibreTranslate runs as a Docker service alongside the app.
 * Supports: en, de, fr, nl, it, es, pt (configured in docker-compose.yml)
 */

import Anthropic from "@anthropic-ai/sdk";

const LT_URL = process.env.LIBRETRANSLATE_URL;

interface TranslationResult {
  translated: string;
  engine: "libretranslate" | "claude" | "none";
}

/* ── LibreTranslate ── */

/**
 * Check which languages LibreTranslate supports.
 * Cached after first call.
 */
let supportedLanguages: Set<string> | null = null;

async function getLibreTranslateLanguages(): Promise<Set<string>> {
  if (supportedLanguages) return supportedLanguages;
  if (!LT_URL) return new Set();

  try {
    const res = await fetch(`${LT_URL}/languages`, { 
      signal: AbortSignal.timeout(5000) 
    });
    if (!res.ok) return new Set();
    const langs: Array<{ code: string }> = await res.json();
    supportedLanguages = new Set(langs.map((l) => l.code));
    return supportedLanguages;
  } catch {
    return new Set();
  }
}

async function translateWithLibre(
  text: string,
  source: string,
  target: string
): Promise<string | null> {
  if (!LT_URL) return null;

  const langs = await getLibreTranslateLanguages();
  if (!langs.has(source) || !langs.has(target)) return null;

  try {
    const res = await fetch(`${LT_URL}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: text,
        source,
        target,
        format: "text",
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.warn(`LibreTranslate error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    return data.translatedText ?? null;
  } catch (err) {
    console.warn("LibreTranslate failed:", err);
    return null;
  }
}

/* ── Claude fallback ── */

async function translateWithClaude(
  text: string,
  targetLanguage: string
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `Translate the following text to ${targetLanguage}. Return ONLY the translation, no commentary.\n\n${text}`,
        },
      ],
    });

    return response.content[0].type === "text"
      ? response.content[0].text
      : null;
  } catch (err) {
    console.warn("Claude translation failed:", err);
    return null;
  }
}

/* ── Public API ── */

/**
 * Translate text from source language to target language.
 * Tries LibreTranslate first (free, self-hosted), falls back to Claude.
 */
export async function translateText(
  text: string,
  source: string,
  target: string
): Promise<TranslationResult> {
  if (source === target) {
    return { translated: text, engine: "none" };
  }

  // Try LibreTranslate first
  const ltResult = await translateWithLibre(text, source, target);
  if (ltResult) {
    return { translated: ltResult, engine: "libretranslate" };
  }

  // Fall back to Claude
  const claudeResult = await translateWithClaude(text, target);
  if (claudeResult) {
    return { translated: claudeResult, engine: "claude" };
  }

  // No translation available
  return { translated: text, engine: "none" };
}

/**
 * Translate multiple texts in batch.
 * LibreTranslate doesn't support batch, so we parallelize individual calls.
 */
export async function translateBatch(
  texts: Array<{ id: string; text: string }>,
  source: string,
  target: string
): Promise<Array<{ id: string; original: string; translated: string; engine: string }>> {
  const results = await Promise.all(
    texts.map(async ({ id, text }) => {
      const result = await translateText(text, source, target);
      return {
        id,
        original: text,
        translated: result.translated,
        engine: result.engine,
      };
    })
  );

  return results;
}
