/**
 * AI Pipeline using Anthropic Claude
 *
 * Handles:
 * 1. Language detection
 * 2. Ticket categorization
 * 3. Priority assessment
 * 4. English summary (for non-English tickets)
 * 5. Suggested assignee
 * 6. Draft reply (in the user's language)
 */

import Anthropic from "@anthropic-ai/sdk";
import { Category, Priority } from "@prisma/client";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface TicketAnalysis {
  language: string;           // ISO 639-1 code: "de", "fr", "en", etc.
  summary: string;            // 1-2 sentence English summary
  category: Category;
  priority: Priority;
  suggestedAssignee?: string; // team member name/role hint
  aiDraft: string;            // reply draft in the user's original language
}

const CATEGORY_DESCRIPTIONS: Record<Category, string> = {
  BUG_REPORT: "User reports something broken or not working as expected",
  REFUND_REQUEST: "User asks for money back or cancellation",
  ACCOUNT_ISSUE: "Login, password, access, or account management problems",
  FEATURE_REQUEST: "User asks for new functionality or improvements",
  BILLING: "Subscription, payment, invoice questions (but not refund)",
  CONTENT_QUESTION: "Questions about study content, cards, or learning material",
  TECHNICAL_SUPPORT: "Technical help that doesn't fit bug report",
  OTHER: "Doesn't fit any of the above categories",
};

export async function analyzeTicket(
  subject: string,
  bodyText: string
): Promise<TicketAnalysis> {
  const categoryList = Object.entries(CATEGORY_DESCRIPTIONS)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");

  const prompt = `You are an AI assistant for Studyflash customer support. Studyflash is a flashcard and study app.

Analyze this support ticket and respond with a JSON object only — no markdown, no explanation.

TICKET SUBJECT: ${subject}
TICKET BODY:
${bodyText}

Return exactly this JSON structure:
{
  "language": "<ISO 639-1 two-letter code>",
  "summary": "<1-2 sentences in English summarizing the issue>",
  "category": "<one of the category keys below>",
  "priority": "<LOW | MEDIUM | HIGH | URGENT>",
  "suggestedAssignee": "<optional: 'engineering' for bugs, 'billing' for refunds, 'support' for general>",
  "aiDraft": "<a polite, helpful reply to the user in THEIR OWN LANGUAGE, referencing their specific issue>"
}

Categories:
${categoryList}

Priority guidelines:
- URGENT: Account completely inaccessible, payment charged but no access, data loss
- HIGH: Core feature broken, billing error, user very frustrated
- MEDIUM: Non-critical bug, general question
- LOW: Feature request, minor cosmetic issue

For the draft reply:
- Write in the same language as the ticket
- Be empathetic and specific to their issue
- Don't promise things you can't guarantee
- Sign off as "The Studyflash Support Team"
- Keep it concise (2-4 paragraphs)`;

  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  try {
    // Strip any accidental markdown fences
    const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      language: parsed.language ?? "en",
      summary: parsed.summary ?? subject,
      category: (parsed.category as Category) ?? Category.OTHER,
      priority: (parsed.priority as Priority) ?? Priority.MEDIUM,
      suggestedAssignee: parsed.suggestedAssignee,
      aiDraft: parsed.aiDraft ?? "",
    };
  } catch {
    console.error("Failed to parse AI response:", text);
    return {
      language: "en",
      summary: subject,
      category: Category.OTHER,
      priority: Priority.MEDIUM,
      aiDraft: "",
    };
  }
}

/**
 * Regenerate a draft reply with optional custom instructions
 */
export async function regenerateDraft(
  ticketSubject: string,
  ticketBody: string,
  language: string,
  customInstructions?: string
): Promise<string> {
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

  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
}
