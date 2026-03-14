# Studyflash Support Platform — Claude Code Context

## What this is
An internal support ticket platform for Studyflash. Built as a hiring challenge MVP.
Next.js 14 + PostgreSQL (via Prisma) + Microsoft Graph API (Outlook sync) + Anthropic Claude API.

## What's built

### Backend (API + Libraries)
- `prisma/schema.prisma` — full schema: Ticket, Message, TeamMember, all enums
- `src/lib/prisma.ts` — Prisma client singleton
- `src/lib/graph.ts` — MS Graph API: getGraphToken, sendReply, createWebhookSubscription, getMessage
- `src/lib/ai.ts` — Claude AI pipeline: analyzeTicket (language detect, categorize, summarize, draft reply), regenerateDraft
- `src/lib/utils.ts` — cn(), PRIORITY_CONFIG, STATUS_CONFIG, CATEGORY_LABELS, LANGUAGE_NAMES, formatRelativeTime
- `src/app/api/tickets/route.ts` — GET (list with filters: status, priority, category, assignedToId, search) + POST (create ticket)
- `src/app/api/tickets/[id]/route.ts` — GET, PATCH (status, priority, category, assignedToId), DELETE
- `src/app/api/tickets/[id]/reply/route.ts` — POST: sends via Graph API + saves to DB
- `src/app/api/tickets/[id]/ai-draft/route.ts` — POST: regenerate AI draft with custom instructions
- `src/app/api/team/route.ts` — GET list team members (with ticket count), POST create
- `src/app/api/webhook/graph/route.ts` — Graph webhook: validates token (GET) + processes new emails (POST)
- `src/app/api/webhook/setup/route.ts` — POST: register Graph webhook subscription

### Frontend (UI)
- `src/app/layout.tsx` — root layout with Geist Sans + Mono fonts
- `src/app/globals.css` — CSS variables (shadcn/ui compatible), sidebar theming, scrollbar, filter styles
- `src/app/page.tsx` — home page: sidebar + "select a ticket" empty state
- `src/app/tickets/[id]/page.tsx` — ticket detail page: sidebar + detail view
- `src/components/TicketSidebar.tsx` — dark sidebar (#0f0f0f, 380px): search, status/priority/category/assignee filters, ticket list
- `src/components/TicketRow.tsx` — ticket list item: sender, time, subject, summary, badges, assignee initials
- `src/components/TicketDetail.tsx` — three-column detail: header (subject, status/priority/assignee dropdowns), message thread (inbound/outbound bubbles), AI draft panel (collapsible, "Use this draft" + regenerate), reply composer (Cmd+Enter)
- `src/components/EnrichmentPanel.tsx` — right sidebar (280px): Sentry errors, PostHog sessions, user data (stub/mock data)
- `src/components/StatusBadge.tsx` — StatusBadge, PriorityBadge, CategoryBadge, LanguageBadge

### Infrastructure
- `Dockerfile` — multi-stage: deps → build → production (standalone)
- `docker-compose.yml` — Postgres 16 + Next.js app, auto-migrate + seed
- `docker-entrypoint.sh` — waits for DB, runs prisma push, seeds if empty, starts server
- `.dockerignore` — excludes node_modules, .next, .git, .env
- `scripts/seed.ts` — parses 100 real ticket files, detects language, generates summaries + draft replies
- `.env.example` — all required/optional env vars documented
- `README.md` — setup instructions, architecture, API reference, design decisions

## Ticket data model
```
Ticket {
  id, subject, fromEmail, fromName, bodyText, bodyHtml
  outlookThreadId, outlookMessageId
  status: OPEN | IN_PROGRESS | WAITING | RESOLVED | CLOSED
  priority: LOW | MEDIUM | HIGH | URGENT
  category: BUG_REPORT | REFUND_REQUEST | ACCOUNT_ISSUE | FEATURE_REQUEST
           | BILLING | CONTENT_QUESTION | TECHNICAL_SUPPORT | OTHER
  language (ISO 639-1), summary, aiDraft
  assignedTo → TeamMember
  messages → Message[] (direction: INBOUND | OUTBOUND)
}
```

## Key technical decisions
- **MS Graph API** (not IMAP) — bidirectional thread parity with Outlook
- **Claude claude-opus-4-5** — best quality for multilingual support (DE/FR/NL/EN)
- **Webhook** (not polling) — real-time email ingestion
- **No auth in MVP** — single shared login; NextAuth ready to add
- **Enrichment as stubs** — UI panel with mock Sentry/PostHog/user data; architecture supports real integration
- **Docker** — `docker compose up` for zero-config runnable demo

## How to run
```bash
# Docker (recommended)
docker compose up --build

# Manual
npm install && cp .env.example .env
# Edit .env with DATABASE_URL
npx prisma db push
npm run db:seed
npm run dev
```

## What could be added next
- Real Sentry/PostHog/Postgres enrichment (replace stubs with API calls)
- Authentication (NextAuth is already a dependency)
- Webhook subscription renewal (function exists, needs a scheduled route)
- Bulk AI analysis for existing tickets
- Email template editor
- Ticket merge/dedup for same sender
