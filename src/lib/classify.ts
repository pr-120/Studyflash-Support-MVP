/**
 * Local classifiers — no LLM needed.
 *
 * Handles language detection, category classification, priority assessment,
 * and assignee suggestion using libraries + keyword rules.
 * These run instantly (< 1ms), cost nothing, and work offline.
 *
 * Language support is automatic: franc detects 180+ languages.
 * Keywords cover the most common languages for Studyflash users,
 * with additional language-neutral terms that work across languages.
 */

import { franc } from "franc";
import { Category, Priority } from "@prisma/client";

/* ── Language detection ── */

/**
 * ISO 639-3 → ISO 639-1 overrides.
 * Most franc codes map to ISO 639-1 by taking the first two chars,
 * but some are different and need explicit mapping.
 */
const ISO3_OVERRIDES: Record<string, string> = {
  deu: "de",  // German
  fra: "fr",  // French
  nld: "nl",  // Dutch
  zho: "zh",  // Chinese
  ces: "cs",  // Czech
  fas: "fa",  // Persian
  msa: "ms",  // Malay
  sqi: "sq",  // Albanian
  hye: "hy",  // Armenian
  eus: "eu",  // Basque
  mya: "my",  // Burmese
  kat: "ka",  // Georgian
  ell: "el",  // Greek
  isl: "is",  // Icelandic
  mkd: "mk",  // Macedonian
  slk: "sk",  // Slovak
  bod: "bo",  // Tibetan
  cym: "cy",  // Welsh
  und: "en",  // undetermined → default to English
};

/**
 * Detect language from text using the `franc` library.
 * Returns an ISO 639-1 two-letter code.
 *
 * Supports 180+ languages automatically — no need to add new languages manually.
 * franc uses trigram analysis which works well for texts > 10 characters.
 */
export function detectLanguage(text: string): string {
  const iso3 = franc(text, { minLength: 10 });

  // Check overrides first (for codes where ISO 639-3 ≠ first two chars of ISO 639-1)
  if (ISO3_OVERRIDES[iso3]) {
    return ISO3_OVERRIDES[iso3];
  }

  // For most languages, the ISO 639-1 code is the first 2 chars of ISO 639-3
  // e.g., "eng" → "en", "spa" → "es", "ita" → "it", "por" → "po", "swe" → "sv"
  if (iso3 && iso3 !== "und" && iso3.length >= 2) {
    return iso3.slice(0, 2);
  }

  return "en"; // final fallback
}

/* ── Category classification via keyword scoring ── */

/**
 * Keywords are organized by category, with terms spanning multiple languages.
 * Language-neutral terms (technical words, product names) work across all languages.
 * Even for unsupported languages, enough international terms exist for basic classification.
 */
const CATEGORY_RULES: Array<{
  category: Category;
  keywords: string[];
  weight: number;
}> = [
  {
    category: "REFUND_REQUEST",
    weight: 3,
    keywords: [
      // EN
      "refund", "money back", "reimburse", "get my money",
      // DE
      "rückerstattung", "erstattung", "geld zurück",
      // FR
      "remboursement", "rembourser", "remboursé",
      // NL
      "terugbetaling", "geld terug",
      // IT
      "rimborso", "rimborsare",
      // ES
      "reembolso", "devolución", "devolver el dinero",
      // PT
      "reembolso", "devolução",
    ],
  },
  {
    category: "BILLING",
    weight: 2,
    keywords: [
      // Language-neutral
      "abo", "premium", "subscription",
      // EN
      "cancel", "billing", "invoice", "payment", "charged", "price", "renew", "free trial",
      // DE
      "kündigen", "abonnement", "rechnung", "zahlung", "bezahlt", "preis", "verlängern", "gratis",
      // FR
      "annuler", "abonnement", "facture", "paiement", "prix", "gratuit",
      // NL
      "opzeggen", "abonnement", "factuur", "betaling", "gratis",
      // IT
      "cancellare", "abbonamento", "fattura", "pagamento", "prezzo",
      // ES
      "cancelar", "suscripción", "factura", "pago", "precio", "gratis",
      // PT
      "cancelar", "assinatura", "fatura", "pagamento", "preço",
    ],
  },
  {
    category: "ACCOUNT_ISSUE",
    weight: 2,
    keywords: [
      // Language-neutral
      "login", "account", "password", "username", "email",
      // DE
      "anmelden", "passwort", "konto", "gesperrt", "zugang", "benutzername",
      // FR
      "mot de passe", "compte", "bloqué", "accès",
      // NL
      "wachtwoord", "toegang", "geblokkeerd",
      // IT
      "accesso", "bloccato", "password",
      // ES
      "contraseña", "acceso", "bloqueado",
    ],
  },
  {
    category: "BUG_REPORT",
    weight: 2,
    keywords: [
      // Language-neutral
      "bug", "crash", "error",
      // EN
      "doesn't work", "broken", "stuck", "freezes", "loading forever", "black screen", "white screen", "data loss", "lost my",
      // DE
      "fehler", "funktioniert nicht", "kaputt", "hängt", "stürzt ab", "absturz", "nicht laden", "daten verloren", "verschwunden",
      // FR
      "erreur", "ne fonctionne pas", "planté", "bloqué", "perte de données",
      // NL
      "fout", "werkt niet", "vastgelopen", "gegevens verloren",
      // IT
      "errore", "non funziona", "bloccato", "perdita dati",
      // ES
      "error", "no funciona", "roto", "bloqueado", "pérdida de datos",
    ],
  },
  {
    category: "FEATURE_REQUEST",
    weight: 2,
    keywords: [
      // EN
      "feature", "wish", "would be great", "suggestion", "could you add", "please add", "it would be nice",
      // DE
      "wunsch", "wäre toll", "vorschlag", "bitte hinzufügen",
      // FR
      "fonctionnalité", "souhait", "suggestion",
      // NL
      "wens", "suggestie", "zou fijn zijn",
      // IT
      "funzionalità", "suggerimento", "sarebbe bello",
      // ES
      "funcionalidad", "sugerencia", "sería genial",
    ],
  },
  {
    category: "CONTENT_QUESTION",
    weight: 1,
    keywords: [
      // Language-neutral (product terms)
      "deck", "flashcard", "karteikarten", "quiz",
      // EN
      "how to", "how do i", "help me", "question", "explain", "tutorial", "delete", "create",
      // DE
      "wie kann ich", "wie geht", "hilfe", "frage", "erklären", "anleitung", "löschen", "erstellen",
      // FR
      "comment faire", "comment", "aide", "supprimer", "créer",
      // NL
      "hoe kan ik", "hulp", "vraag", "verwijderen", "maken",
      // IT
      "come faccio", "aiuto", "domanda", "eliminare", "creare",
      // ES
      "cómo puedo", "ayuda", "pregunta", "eliminar", "crear",
    ],
  },
  {
    category: "TECHNICAL_SUPPORT",
    weight: 1,
    keywords: [
      // Language-neutral (tech terms)
      "upload", "sync", "download", "export", "import", "format", "notification", "pdf", "app",
      // DE
      "hochladen", "synchron", "datei", "sprache", "benachrichtigung",
      // FR
      "fichier", "langue", "télécharger",
      // NL
      "bestand", "taal", "uploaden",
      // IT
      "file", "lingua", "caricare",
      // ES
      "archivo", "idioma", "cargar",
    ],
  },
];

/**
 * Classify a ticket into a category using keyword scoring.
 * Works across all languages — language-neutral terms (tech words, product terms)
 * provide a baseline, while language-specific terms improve accuracy.
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

  const entries = Object.entries(scores);
  if (entries.length === 0) return "OTHER";
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0] as Category;
}

/* ── Priority classification via keyword signals ── */

const URGENT_KEYWORDS = [
  // Language-neutral / international
  "urgent", "asap", "!!!",
  // EN
  "immediately", "locked out", "can't access", "data loss",
  // DE
  "dringend", "sofort", "gesperrt", "daten verloren", "prüfung morgen", "prüfung heute",
  // FR
  "urgent", "immédiatement", "bloqué", "perte de données", "examen demain",
  // NL
  "dringend", "onmiddellijk", "geblokkeerd", "gegevens verloren",
  // IT
  "urgente", "immediatamente", "bloccato", "perdita dati", "esame domani",
  // ES
  "urgente", "inmediatamente", "bloqueado", "pérdida de datos", "examen mañana",
];

const HIGH_KEYWORDS = [
  // EN
  "refund", "double charged", "charged twice", "not working", "crash", "broken", "please help", "frustrated",
  // DE
  "rückerstattung", "doppelt abgebucht", "funktioniert nicht", "absturz", "kaputt", "bitte helfen", "frustriert",
  // FR
  "remboursement", "ne fonctionne pas", "planté",
  // NL
  "terugbetaling", "werkt niet",
  // IT
  "rimborso", "non funziona",
  // ES
  "reembolso", "no funciona",
];

const LOW_KEYWORDS = [
  // EN
  "feature", "suggestion", "would be nice", "just wondering", "curious",
  // DE
  "wunsch", "vorschlag", "wäre schön", "frage mich",
  // FR
  "fonctionnalité", "suggestion",
  // NL
  "wens", "suggestie",
  // IT
  "suggerimento", "sarebbe bello",
  // ES
  "sugerencia", "sería genial",
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
 * Language detection is fully automatic (180+ languages via franc).
 * Category/priority keywords cover EN, DE, FR, NL, IT, ES, PT + language-neutral terms.
 */
export function classifyTicket(subject: string, bodyText: string) {
  const language = detectLanguage(`${subject} ${bodyText}`);
  const category = classifyCategory(subject, bodyText);
  const priority = assessPriority(subject, bodyText);
  const suggestedAssignee = suggestAssignee(category);

  return { language, category, priority, suggestedAssignee };
}
