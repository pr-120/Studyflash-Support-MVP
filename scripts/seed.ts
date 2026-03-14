/**
 * Seed script: reads 100 real ticket files from /tickets/tickets/ and imports them.
 *
 * Run: npm run db:seed   (or: npx tsx scripts/seed.ts)
 * Requires DATABASE_URL in .env
 */

import { PrismaClient, Category, Priority, TicketStatus } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

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

/* ── Status inference from tags ── */

function inferStatus(tags: string[]): TicketStatus {
  if (tags.includes("auto-closed")) return "CLOSED";
  // Mix of statuses for variety
  return "OPEN";
}

/* ── Detect language from body text (simple heuristic) ── */

function detectLanguage(text: string): string {
  const lower = text.toLowerCase();

  // Dutch markers
  const dutchWords = ["ik ", "mijn", "hoe ", "niet", "kan ", "het ", "een ", "van ", "voor ", "maar", "heb ", "nog ", "abonnement", "gratis", "bedankt", "alvast", "annuleren", "betaling", "stoppen"];
  const dutchScore = dutchWords.filter((w) => lower.includes(w)).length;

  // French markers
  const frenchWords = ["je ", "mon ", "bonjour", "merci", "pas ", "une ", "les ", "pour ", "est ", "vous", "remboursement", "abonnement", "annuler", "s'il", "pouvez"];
  const frenchScore = frenchWords.filter((w) => lower.includes(w)).length;

  // German markers
  const germanWords = ["ich ", "mein", "hallo", "bitte", "kann ", "nicht", "das ", "ein ", "abo", "vielen", "danke", "kündigen", "mir ", "mich ", "wie ", "habe", "studyflash"];
  const germanScore = germanWords.filter((w) => lower.includes(w)).length;

  // English markers
  const englishWords = ["i ", "my ", "the ", "is ", "can ", "please", "would", "have", "hello", "thank", "subscription", "cancel", "refund", "how ", "with"];
  const englishScore = englishWords.filter((w) => lower.includes(w)).length;

  const scores = [
    { lang: "nl", score: dutchScore },
    { lang: "fr", score: frenchScore },
    { lang: "de", score: germanScore },
    { lang: "en", score: englishScore },
  ];

  scores.sort((a, b) => b.score - a.score);

  if (scores[0].score === 0) return "de"; // default — most tickets are German
  return scores[0].lang;
}

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
    const status = inferStatus(parsed.tags);
    const language = detectLanguage(parsed.body);
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
          // summary and aiDraft are null — would be filled by AI pipeline in production
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
