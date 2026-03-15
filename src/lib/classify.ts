/**
 * Local classifiers — no LLM needed.
 *
 * Handles language detection, category classification, priority assessment,
 * and assignee suggestion using libraries + keyword rules.
 * These run instantly (< 1ms), cost nothing, and work offline.
 */

import { franc } from "franc";
import { Category, Priority } from "@prisma/client";

/* ── ISO 639-3 → ISO 639-1 mapping (franc returns 3-letter codes) ── */

const ISO3_TO_ISO1: Record<string, string> = {
  deu: "de",
  fra: "fr",
  eng: "en",
  nld: "nl",
  ita: "it",
  spa: "es",
  por: "pt",
  swe: "sv",
  dan: "da",
  nor: "no",
  pol: "pl",
  tur: "tr",
  ron: "ro",
  hun: "hu",
  ces: "cs",
  und: "en", // undetermined → default to English
};

/**
 * Detect language from text using the `franc` library.
 * Returns an ISO 639-1 two-letter code.
 */
export function detectLanguage(text: string): string {
  const result = franc(text, { minLength: 10 });
  return ISO3_TO_ISO1[result] ?? "en";
}

/* ── Category classification via keyword scoring ── */

interface CategoryRule {
  category: Category;
  keywords: string[];
  weight: number;
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: "REFUND_REQUEST",
    weight: 3,
    keywords: [
      "refund", "rückerstattung", "remboursement", "terugbetaling",
      "geld zurück", "money back", "argent retourné",
      "rembourser", "remboursé", "erstattung",
    ],
  },
  {
    category: "BILLING",
    weight: 2,
    keywords: [
      "abo", "abonnement", "subscription", "kündigen", "cancel",
      "annuler", "opzeggen", "billing", "invoice", "rechnung",
      "facture", "factuur", "payment", "zahlung", "betaling",
      "bezahlt", "charged", "paiement", "prix", "preis", "price",
      "premium", "gratis", "free trial", "renew", "verlängern",
    ],
  },
  {
    category: "ACCOUNT_ISSUE",
    weight: 2,
    keywords: [
      "login", "log in", "anmelden", "passwort", "password",
      "mot de passe", "wachtwoord", "account", "konto", "compte",
      "locked out", "gesperrt", "can't access", "zugang",
      "e-mail ändern", "email change", "benutzername", "username",
    ],
  },
  {
    category: "BUG_REPORT",
    weight: 2,
    keywords: [
      "bug", "crash", "error", "fehler", "erreur", "fout",
      "doesn't work", "funktioniert nicht", "ne fonctionne pas",
      "werkt niet", "broken", "kaputt", "stuck", "hängt",
      "stürzt ab", "absturz", "freezes", "loading forever",
      "nicht laden", "black screen", "white screen",
      "data loss", "daten verloren", "lost my", "verschwunden",
    ],
  },
  {
    category: "FEATURE_REQUEST",
    weight: 2,
    keywords: [
      "feature", "wunsch", "wish", "would be great", "wäre toll",
      "suggestion", "vorschlag", "could you add", "können sie",
      "it would be nice", "please add", "bitte hinzufügen",
    ],
  },
  {
    category: "CONTENT_QUESTION",
    weight: 1,
    keywords: [
      "how to", "how do i", "wie kann ich", "wie geht",
      "comment faire", "hoe kan ik", "help me", "hilfe",
      "question", "frage", "explain", "erklären",
      "tutorial", "anleitung", "löschen", "delete",
      "erstellen", "create", "deck", "karteikarten",
    ],
  },
  {
    category: "TECHNICAL_SUPPORT",
    weight: 1,
    keywords: [
      "upload", "hochladen", "sync", "synchron",
      "download", "export", "import", "format",
      "file", "datei", "fichier", "bestand",
      "language", "sprache", "langue", "taal",
      "notification", "benachrichtigung",
    ],
  },
];

/**
 * Classify a ticket into a category using keyword scoring.
 * Each matching keyword adds the rule's weight to that category's score.
 */
export function classifyCategory(subject: string, bodyText: string): Category {
  const text = `${subject} ${bodyText}`.toLowerCase();
  const scores: Record<string, number> = {};

  for (const rule of CATEGORY_RULES) {
    let score = 0;
    for (const kw of rule.keywords) {
      if (text.includes(kw)) {
        score += rule.weight;
      }
    }
    if (score > 0) {
      scores[rule.category] = score;
    }
  }

  // Return the highest scoring category, or OTHER
  const entries = Object.entries(scores);
  if (entries.length === 0) return "OTHER";

  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0] as Category;
}

/* ── Priority classification via keyword signals ── */

const URGENT_KEYWORDS = [
  "urgent", "dringend", "asap", "sofort", "immediately",
  "locked out", "gesperrt", "can't access", "data loss",
  "daten verloren", "exam tomorrow", "prüfung morgen",
  "exam today", "prüfung heute",
];

const HIGH_KEYWORDS = [
  "refund", "rückerstattung", "remboursement",
  "double charged", "doppelt abgebucht", "charged twice",
  "not working", "funktioniert nicht", "ne fonctionne pas",
  "crash", "absturz", "broken", "kaputt",
  "please help", "bitte helfen", "frustrated", "frustriert",
];

const LOW_KEYWORDS = [
  "feature", "wunsch", "suggestion", "vorschlag",
  "would be nice", "wäre schön", "just wondering",
  "curious", "frage mich",
];

/**
 * Assess ticket priority from keywords.
 */
export function assessPriority(subject: string, bodyText: string): Priority {
  const text = `${subject} ${bodyText}`.toLowerCase();

  if (URGENT_KEYWORDS.some((kw) => text.includes(kw))) return "URGENT";
  if (HIGH_KEYWORDS.some((kw) => text.includes(kw))) return "HIGH";
  if (LOW_KEYWORDS.some((kw) => text.includes(kw))) return "LOW";
  return "MEDIUM";
}

/* ── Assignee suggestion from category ── */

/**
 * Suggest which team role should handle this ticket.
 */
export function suggestAssignee(category: Category): string {
  switch (category) {
    case "BUG_REPORT":
    case "TECHNICAL_SUPPORT":
      return "engineering";
    case "REFUND_REQUEST":
    case "BILLING":
      return "billing";
    default:
      return "support";
  }
}

/**
 * Run all local classifiers on a ticket.
 * This replaces ~60% of what the LLM used to do, at zero cost.
 */
export function classifyTicket(subject: string, bodyText: string) {
  const language = detectLanguage(`${subject} ${bodyText}`);
  const category = classifyCategory(subject, bodyText);
  const priority = assessPriority(subject, bodyText);
  const suggestedAssignee = suggestAssignee(category);

  return { language, category, priority, suggestedAssignee };
}
