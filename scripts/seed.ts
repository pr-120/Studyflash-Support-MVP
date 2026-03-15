/**
 * Seed script: reads 100 real ticket files from /tickets/tickets/ and imports them.
 *
 * Run: npm run db:seed   (or: npx tsx scripts/seed.ts)
 * Requires DATABASE_URL in .env
 */

import { PrismaClient, Category, Priority, TicketStatus } from "@prisma/client";
import { franc } from "franc";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

/* ── Language detection using franc (same library as production code) ── */

const ISO3_TO_ISO1: Record<string, string> = {
  deu: "de", fra: "fr", eng: "en", nld: "nl",
  ita: "it", spa: "es", por: "pt", swe: "sv", und: "en",
};

function detectLang(text: string): string {
  const result = franc(text, { minLength: 10 });
  return ISO3_TO_ISO1[result] ?? "en";
}

/* ── Tag → Category mapping ── */

const TAG_TO_CATEGORY: Record<string, Category> = {
  "refund-request": "REFUND_REQUEST",
  "subscription-cancellation": "BILLING",
  "subscription-info": "BILLING",
  "billing-invoice": "BILLING",
  "account-issues": "ACCOUNT_ISSUE",
  "flashcard-issues": "BUG_REPORT",
  "technical-errors": "TECHNICAL_SUPPORT",
  "language-issues": "BUG_REPORT",
  "content-upload": "TECHNICAL_SUPPORT",
  "quiz-issues": "BUG_REPORT",
  "podcast-issues": "BUG_REPORT",
  "summary-issues": "BUG_REPORT",
  "mock-exam-issues": "BUG_REPORT",
  "mindmap-issues": "BUG_REPORT",
  "data-loss": "BUG_REPORT",
  "general-how-to": "CONTENT_QUESTION",
  misunderstanding: "OTHER",
  garbage: "OTHER",
};

/* ── Priority inference from tags ── */

function inferPriority(tags: string[]): Priority {
  if (tags.includes("refund-request") || tags.includes("data-loss")) return "HIGH";
  if (tags.includes("account-issues") || tags.includes("billing-invoice")) return "HIGH";
  if (tags.includes("technical-errors")) return "MEDIUM";
  if (tags.includes("garbage") || tags.includes("misunderstanding")) return "LOW";
  if (tags.includes("subscription-cancellation")) return "MEDIUM";
  return "MEDIUM";
}

/* ── Status inference from tags + index for variety ── */

function inferStatus(tags: string[], index: number): TicketStatus {
  if (tags.includes("auto-closed")) return "CLOSED";
  // Distribute statuses for a realistic-looking demo
  const mod = index % 10;
  if (mod < 4) return "OPEN";       // 40% open
  if (mod < 6) return "IN_PROGRESS"; // 20% in progress
  if (mod < 7) return "WAITING";     // 10% waiting
  if (mod < 9) return "RESOLVED";    // 20% resolved
  return "CLOSED";                   // 10% closed
}

/* ── Language detection uses franc (imported above) ── */

/* ── Extract subject from body ── */

function extractSubject(body: string, ticketNumber: string): string {
  // Many MOBILE tickets have "MOBILE: Subject rest of body"
  if (body.startsWith("MOBILE:")) {
    const afterMobile = body.slice(7).trim();
    // Take the first sentence-like chunk as subject
    const firstLine = afterMobile.split(/[.!?\n]/)[0].trim();
    if (firstLine.length > 5 && firstLine.length < 120) {
      return firstLine;
    }
  }

  // For longer emails, take first meaningful line
  const lines = body.split("\n").filter((l) => l.trim().length > 3);
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip greetings
    if (/^(hallo|guten|bonjour|dear|hello|hi |hey|beste|liebe)/i.test(trimmed)) continue;
    if (trimmed.length > 10 && trimmed.length < 150) {
      return trimmed.length > 100 ? trimmed.slice(0, 97) + "..." : trimmed;
    }
  }

  return `Support Request #${ticketNumber}`;
}

/* ── Extract sender name from body ── */

function extractSender(body: string): { fromName: string; fromEmail: string } {
  // Look for signatures — common patterns
  const lines = body.split("\n");

  // Check for [EMAIL] placeholder
  const emailLine = lines.find((l) => l.includes("[EMAIL]"));
  const email = emailLine ? `user${Math.floor(Math.random() * 9000 + 1000)}@example.com` : `user${Math.floor(Math.random() * 9000 + 1000)}@example.com`;

  // Look for name-like patterns near end of body
  // Common: "Freundliche Grüsse\nName" or "Kind regards,\nName" or "Mvg Name"
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 5); i--) {
    const line = lines[i].trim();
    // Skip common closing phrases and empty lines
    if (!line || /^(freundliche|liebe|grüße|grüsse|kind|best|regards|cordialement|merci|mvg|vielen|danke|\[email\]|mobile:)/i.test(line)) continue;
    // A name line is typically 2-4 words, not too long
    if (line.length >= 3 && line.length <= 40 && !line.includes("@") && !line.includes("[")) {
      // Check it looks like a name (capitalized words)
      const words = line.split(/\s+/);
      if (words.length >= 1 && words.length <= 4 && /^[A-ZÜÖÄÈÉÊ]/.test(words[0])) {
        return { fromName: line, fromEmail: email };
      }
    }
  }

  return { fromName: "", fromEmail: email };
}

/* ── Parse a single ticket file ── */

interface ParsedTicket {
  ticketNumber: string;
  tags: string[];
  body: string;
}

function parseTicketFile(filePath: string): ParsedTicket {
  const content = fs.readFileSync(filePath, "utf-8");
  const fileName = path.basename(filePath, ".txt");
  const ticketNumber = fileName.replace("ticket_", "");

  const lines = content.split("\n");

  // Line 1: "Tags: tag1, tag2, ..."
  const tagsLine = lines[0] || "";
  const tags = tagsLine
    .replace(/^Tags:\s*/, "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  // Everything after "---"
  const separatorIndex = lines.findIndex((l) => l.trim() === "---");
  const body = lines
    .slice(separatorIndex + 1)
    .join("\n")
    .trim();

  return { ticketNumber, tags, body };
}

/* ── Assign team members round-robin based on category ── */

function assignTeamMember(
  category: Category,
  teamIds: { support: string; engineering: string; billing: string }
): string | null {
  switch (category) {
    case "BUG_REPORT":
    case "TECHNICAL_SUPPORT":
      return teamIds.engineering;
    case "REFUND_REQUEST":
    case "BILLING":
      return teamIds.billing;
    case "ACCOUNT_ISSUE":
    case "CONTENT_QUESTION":
      return teamIds.support;
    default:
      return null; // Unassigned
  }
}

/* ── Generate a stub English summary from category + body ── */

function generateSummary(category: Category, body: string, language: string): string {
  const snippet = body
    .replace(/^MOBILE:\s*/i, "")
    .replace(/\n/g, " ")
    .slice(0, 80)
    .trim();

  const langLabel = language === "de" ? "German" : language === "fr" ? "French" : language === "nl" ? "Dutch" : "English";

  const templates: Record<Category, string> = {
    REFUND_REQUEST: `${langLabel}-speaking user requests a refund. "${snippet}..."`,
    BILLING: `${langLabel}-speaking user has a billing/subscription question. "${snippet}..."`,
    ACCOUNT_ISSUE: `${langLabel}-speaking user reports an account access issue. "${snippet}..."`,
    BUG_REPORT: `${langLabel}-speaking user reports a bug or product issue. "${snippet}..."`,
    TECHNICAL_SUPPORT: `${langLabel}-speaking user needs technical help. "${snippet}..."`,
    FEATURE_REQUEST: `${langLabel}-speaking user requests a new feature. "${snippet}..."`,
    CONTENT_QUESTION: `${langLabel}-speaking user has a question about study content. "${snippet}..."`,
    OTHER: `${langLabel}-speaking user sent a support request. "${snippet}..."`,
  };

  return templates[category] || templates.OTHER;
}

/* ── Generate a stub draft reply based on category + language ── */

function generateStubDraft(category: Category, language: string): string {
  const drafts: Record<string, Record<string, string>> = {
    de: {
      REFUND_REQUEST:
        "Guten Tag,\n\nvielen Dank für Ihre Nachricht bezüglich einer Rückerstattung. Wir haben Ihre Anfrage erhalten und werden diese innerhalb von 2-3 Werktagen bearbeiten.\n\nBitte beachten Sie, dass Rückerstattungen gemäß unserer Richtlinien innerhalb von 14 Tagen nach Kauf möglich sind.\n\nMit freundlichen Grüßen,\nDas Studyflash Support Team",
      BILLING:
        "Guten Tag,\n\nvielen Dank für Ihre Anfrage zu Ihrem Abonnement. Wir werden Ihr Anliegen so schnell wie möglich prüfen.\n\nSie können Ihre Abonnement-Einstellungen jederzeit unter Einstellungen > Abonnement verwalten.\n\nMit freundlichen Grüßen,\nDas Studyflash Support Team",
      BUG_REPORT:
        "Guten Tag,\n\nvielen Dank, dass Sie uns dieses Problem gemeldet haben. Unser technisches Team wird sich die Sache ansehen.\n\nKönnten Sie uns bitte mitteilen, welches Gerät und welche App-Version Sie verwenden? Das hilft uns bei der Fehlerbehebung.\n\nMit freundlichen Grüßen,\nDas Studyflash Support Team",
      ACCOUNT_ISSUE:
        "Guten Tag,\n\nvielen Dank für Ihre Nachricht. Wir werden Ihr Konto überprüfen und uns so schnell wie möglich bei Ihnen melden.\n\nMit freundlichen Grüßen,\nDas Studyflash Support Team",
      DEFAULT:
        "Guten Tag,\n\nvielen Dank für Ihre Nachricht. Wir haben Ihre Anfrage erhalten und werden uns so schnell wie möglich bei Ihnen melden.\n\nMit freundlichen Grüßen,\nDas Studyflash Support Team",
    },
    fr: {
      REFUND_REQUEST:
        "Bonjour,\n\nMerci de nous avoir contactés concernant un remboursement. Nous avons bien reçu votre demande et la traiterons dans les 2-3 jours ouvrables.\n\nCordialement,\nL'équipe Support Studyflash",
      BILLING:
        "Bonjour,\n\nMerci pour votre question concernant votre abonnement. Nous allons examiner votre demande dans les plus brefs délais.\n\nVous pouvez gérer votre abonnement dans Paramètres > Abonnement.\n\nCordialement,\nL'équipe Support Studyflash",
      DEFAULT:
        "Bonjour,\n\nMerci de nous avoir contactés. Nous avons bien reçu votre message et reviendrons vers vous dans les plus brefs délais.\n\nCordialement,\nL'équipe Support Studyflash",
    },
    nl: {
      BILLING:
        "Beste,\n\nBedankt voor uw bericht over uw abonnement. We zullen uw verzoek zo snel mogelijk behandelen.\n\nU kunt uw abonnement beheren via Instellingen > Abonnement.\n\nMet vriendelijke groeten,\nHet Studyflash Support Team",
      DEFAULT:
        "Beste,\n\nBedankt voor uw bericht. We hebben uw verzoek ontvangen en zullen zo snel mogelijk contact met u opnemen.\n\nMet vriendelijke groeten,\nHet Studyflash Support Team",
    },
    en: {
      REFUND_REQUEST:
        "Hello,\n\nThank you for reaching out regarding a refund. We've received your request and will process it within 2-3 business days.\n\nPlease note that refunds are available within 14 days of purchase per our policy.\n\nBest regards,\nThe Studyflash Support Team",
      BUG_REPORT:
        "Hello,\n\nThank you for reporting this issue. Our engineering team will investigate it.\n\nCould you let us know which device and app version you're using? This helps us troubleshoot.\n\nBest regards,\nThe Studyflash Support Team",
      DEFAULT:
        "Hello,\n\nThank you for contacting us. We've received your message and will get back to you as soon as possible.\n\nBest regards,\nThe Studyflash Support Team",
    },
  };

  const langDrafts = drafts[language] || drafts.en;
  return langDrafts[category] || langDrafts.DEFAULT;
}

/* ── Main ── */

async function main() {
  console.log("Seeding database from ticket files...\n");

  // Clean existing data
  await prisma.message.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.teamMember.deleteMany();

  // Create team members
  const [anna, marco, lena] = await Promise.all([
    prisma.teamMember.create({
      data: { name: "Anna Mueller", email: "anna@studyflash.ch", role: "support" },
    }),
    prisma.teamMember.create({
      data: { name: "Marco Rossi", email: "marco@studyflash.ch", role: "engineering" },
    }),
    prisma.teamMember.create({
      data: { name: "Lena Berger", email: "lena@studyflash.ch", role: "billing" },
    }),
  ]);

  console.log("Created 3 team members\n");

  const teamIds = {
    support: anna.id,
    engineering: marco.id,
    billing: lena.id,
  };

  // Read all ticket files
  const ticketsDir = path.join(__dirname, "..", "tickets", "tickets");
  const files = fs.readdirSync(ticketsDir)
    .filter((f) => f.endsWith(".txt"))
    .sort();

  console.log(`Found ${files.length} ticket files\n`);

  const now = Date.now();
  let created = 0;

  for (let i = 0; i < files.length; i++) {
    const filePath = path.join(ticketsDir, files[i]);
    const parsed = parseTicketFile(filePath);

    // Determine category from tags
    let category: Category = "OTHER";
    for (const tag of parsed.tags) {
      if (TAG_TO_CATEGORY[tag]) {
        category = TAG_TO_CATEGORY[tag];
        break; // Use first matching category tag
      }
    }

    const priority = inferPriority(parsed.tags);
    const status = inferStatus(parsed.tags, i);
    const language = detectLang(parsed.body);
    const subject = extractSubject(parsed.body, parsed.ticketNumber);
    const { fromName, fromEmail } = extractSender(parsed.body);
    const assignedToId = assignTeamMember(category, teamIds);

    // Stagger creation times — oldest first, ~2h apart
    const createdAt = new Date(now - (files.length - i) * 7_200_000);

    try {
      const ticket = await prisma.ticket.create({
        data: {
          subject,
          fromEmail,
          fromName: fromName || `User #${parsed.ticketNumber}`,
          bodyText: parsed.body,
          status,
          priority,
          category,
          language,
          assignedToId,
          createdAt,
          summary: generateSummary(category, parsed.body, language),
          aiDraft: generateStubDraft(category, language),
          messages: {
            create: {
              direction: "INBOUND",
              fromEmail,
              fromName: fromName || `User #${parsed.ticketNumber}`,
              bodyText: parsed.body,
              sentAt: createdAt,
            },
          },
        },
      });

      created++;
      const langFlag = language.toUpperCase().padEnd(2);
      const statusFlag = status.padEnd(11);
      console.log(
        `  [${String(i + 1).padStart(3)}/${files.length}] ${langFlag} ${statusFlag} ${ticket.subject.slice(0, 60)}`
      );
    } catch (err) {
      console.error(`  [${i + 1}/${files.length}] FAILED: ${files[i]}`, err);
    }
  }

  console.log(`\nSeeded ${created} tickets from ${files.length} files.`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
