/**
 * AI Pipeline — hybrid approach
 *
 * Local classifiers (src/lib/classify.ts) handle:
 *   - Language detection (franc library)
 *   - Category classification (keyword rules)
 *   - Priority assessment (keyword rules)
 *   - Assignee suggestion (category mapping)
 *
 * This module handles the parts that genuinely need an LLM:
 *   - English summary generation (understanding + translation)
 *   - Draft reply in the user's language (creative generation)
 *
 * Uses Claude Haiku (30x cheaper than Opus) since summarization
 * and reply drafting don't need the most powerful model.
 *
 * When ANTHROPIC_API_KEY is not set, returns template-based fallbacks
 * so the app works fully without any API key.
 */

import Anthropic from "@anthropic-ai/sdk";
import { Category, Priority } from "@prisma/client";
import { classifyTicket } from "./classify";
import { getLanguageName } from "./utils";

const MODEL = "claude-haiku-4-5-20251001";

function getClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

export interface TicketAnalysis {
  language: string;
  summary: string;
  category: Category;
  priority: Priority;
  suggestedAssignee?: string;
  aiDraft: string;
}

/* ── Template-based fallbacks (no API key needed) ── */

function templateSummary(
  subject: string,
  bodyText: string,
  language: string,
  category: Category
): string {
  const langName = getLanguageName(language);
  const snippet = bodyText.replace(/\n/g, " ").slice(0, 100).trim();
  const catLabel = category.replace(/_/g, " ").toLowerCase();
  return `${langName}-speaking user (${catLabel}): "${snippet}..."`;
}

/**
 * Template-based draft replies for when the LLM is unavailable.
 * Covers DE, FR, NL, IT, ES, PT, EN explicitly.
 * For any other language, falls back to English — the LLM path handles
 * all languages natively via the language code in the prompt.
 */
function templateDraft(language: string, category: Category): string {
  const templates: Record<string, Record<string, string>> = {
    de: {
      REFUND_REQUEST:
        "Guten Tag,\n\nvielen Dank für Ihre Nachricht bezüglich einer Rückerstattung. Wir haben Ihre Anfrage erhalten und werden diese innerhalb von 2-3 Werktagen bearbeiten.\n\nMit freundlichen Grüßen,\nDas Studyflash Support Team",
      BILLING:
        "Guten Tag,\n\nvielen Dank für Ihre Anfrage zu Ihrem Abonnement. Wir werden Ihr Anliegen so schnell wie möglich prüfen.\n\nMit freundlichen Grüßen,\nDas Studyflash Support Team",
      DEFAULT:
        "Guten Tag,\n\nvielen Dank für Ihre Nachricht. Wir haben Ihre Anfrage erhalten und werden uns so schnell wie möglich bei Ihnen melden.\n\nMit freundlichen Grüßen,\nDas Studyflash Support Team",
    },
    fr: {
      REFUND_REQUEST:
        "Bonjour,\n\nMerci de nous avoir contactés concernant un remboursement. Nous avons bien reçu votre demande et la traiterons dans les 2-3 jours ouvrables.\n\nCordialement,\nL'équipe Support Studyflash",
      DEFAULT:
        "Bonjour,\n\nMerci de nous avoir contactés. Nous avons bien reçu votre message et reviendrons vers vous dans les plus brefs délais.\n\nCordialement,\nL'équipe Support Studyflash",
    },
    nl: {
      DEFAULT:
        "Beste,\n\nBedankt voor uw bericht. We hebben uw verzoek ontvangen en zullen zo snel mogelijk contact met u opnemen.\n\nMet vriendelijke groeten,\nHet Studyflash Support Team",
    },
    it: {
      DEFAULT:
        "Salve,\n\nGrazie per averci contattato. Abbiamo ricevuto il suo messaggio e le risponderemo il prima possibile.\n\nCordiali saluti,\nIl Team di Supporto Studyflash",
    },
    es: {
      DEFAULT:
        "Hola,\n\nGracias por contactarnos. Hemos recibido su mensaje y le responderemos lo antes posible.\n\nSaludos cordiales,\nEl Equipo de Soporte Studyflash",
    },
    pt: {
      DEFAULT:
        "Olá,\n\nObrigado por nos contactar. Recebemos a sua mensagem e responderemos o mais breve possível.\n\nCom os melhores cumprimentos,\nA Equipa de Suporte Studyflash",
    },
    en: {
      REFUND_REQUEST:
        "Hello,\n\nThank you for reaching out regarding a refund. We've received your request and will process it within 2-3 business days.\n\nBest regards,\nThe Studyflash Support Team",
      DEFAULT:
        "Hello,\n\nThank you for contacting us. We've received your message and will get back to you as soon as possible.\n\nBest regards,\nThe Studyflash Support Team",
    },
  };

  const langTemplates = templates[language] || templates.en;
  return langTemplates[category] || langTemplates.DEFAULT;
}

/* ── Main analysis function ── */

export async function analyzeTicket(
  subject: string,
  bodyText: string
): Promise<TicketAnalysis> {
  // Step 1: Local classifiers (instant, free)
  const { language, category, priority, suggestedAssignee } =
    classifyTicket(subject, bodyText);

  // Step 2: LLM for summary + draft (if API key is available)
  const client = getClient();

  if (!client) {
    // No API key — use template fallbacks
    console.log("No ANTHROPIC_API_KEY set — using template-based analysis");
    return {
      language,
      category,
      priority,
      suggestedAssignee,
      summary: templateSummary(subject, bodyText, language, category),
      aiDraft: templateDraft(language, category),
    };
  }

  try {
    const prompt = `You are a Studyflash customer support assistant. Studyflash is a flashcard and study app.

Given this support ticket, provide two things:

TICKET SUBJECT: ${subject}
TICKET BODY:
${bodyText}

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "summary": "<1-2 sentences in English summarizing the specific issue>",
  "aiDraft": "<a polite, helpful reply in ${language.toUpperCase()} (the user's language), referencing their specific issue, signed off as The Studyflash Support Team, 2-4 paragraphs>"
}

For the draft:
- Write in ${language.toUpperCase()} — this is the user's language
- Be empathetic and specific to their issue
- Don't promise things you can't guarantee
- Keep it concise`;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 768,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      language,
      category,
      priority,
      suggestedAssignee,
      summary: parsed.summary ?? templateSummary(subject, bodyText, language, category),
      aiDraft: parsed.aiDraft ?? templateDraft(language, category),
    };
  } catch (err) {
    console.error("LLM call failed, using template fallback:", err);
    return {
      language,
      category,
      priority,
      suggestedAssignee,
      summary: templateSummary(subject, bodyText, language, category),
      aiDraft: templateDraft(language, category),
    };
  }
}

/**
 * Regenerate a draft reply with optional custom instructions.
 * This always requires an LLM — falls back to a message if no key.
 */
export async function regenerateDraft(
  ticketSubject: string,
  ticketBody: string,
  language: string,
  customInstructions?: string
): Promise<string> {
  const client = getClient();

  if (!client) {
    return templateDraft(language, "OTHER" as Category);
  }

  const prompt = `You are a Studyflash customer support agent. Write a reply to this support ticket.

ORIGINAL TICKET SUBJECT: ${ticketSubject}
ORIGINAL TICKET BODY:
${ticketBody}

${customInstructions ? `SPECIAL INSTRUCTIONS: ${customInstructions}\n` : ""}
Requirements:
- Write in language: ${language} (ISO 639-1)
- Be empathetic and helpful
- Address the specific issue raised
- Sign off as "The Studyflash Support Team"
- Return ONLY the reply text, no JSON, no preamble`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
}
