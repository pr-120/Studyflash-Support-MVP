# Studyflash Support Platform — Claude Code Context

## What this is
An internal support ticket platform for Studyflash. Built as a hiring challenge MVP.
Next.js 14 + PostgreSQL (via Prisma) + Microsoft Graph API (Outlook sync) + Claude Haiku (AI) + LibreTranslate (self-hosted translation).

## What's built

### Backend (API + Libraries)
- `prisma/schema.prisma` — full schema: Ticket, Message, TeamMember, all enums
- `src/lib/prisma.ts` — Prisma client singleton
- `src/lib/graph.ts` — MS Graph API: getGraphToken, sendReply (with sendMail fallback), createWebhookSubscription, getMessage
- `src/lib/ai.ts` — Claude Haiku pipeline: analyzeTicket (summary + draft only), regenerateDraft. Template fallback when no API key
- `src/lib/classify.ts` — Local classifiers: language detection (franc, 180+ langs), category (keyword scoring, 7 langs), priority (keyword signals), assignee suggestion
- `src/lib/translate.ts` — Translation: LibreTranslate (free, self-hosted) → Claude Haiku fallback → original text
- `src/lib/enrichment.ts` — Enrichment: Sentry API, PostHog API, custom Postgres DB (all optional, real integrations)
- `src/lib/utils.ts` — cn(), configs, LANGUAGE_NAMES (40 languages), formatRelativeTime
- `src/app/api/tickets/route.ts` — GET (list with filters: status, priority, category, assignedToId, search) + POST
- `src/app/api/tickets/[id]/route.ts` — GET, PATCH, DELETE
- `src/app/api/tickets/[id]/reply/route.ts` — POST: sends via Graph API (reply + sendMail fallback) + saves to DB
- `src/app/api/tickets/[id]/ai-draft/route.ts` — POST: regenerate AI draft with custom instructions
- `src/app/api/tickets/[id]/translate/route.ts` — POST: translate ticket messages (LibreTranslate + Claude fallback)
- `src/app/api/translate/route.ts` — POST: general-purpose text translation
- `src/app/api/enrichment/route.ts` — GET: fetch Sentry/PostHog/DB data for a user email
- `src/app/api/team/route.ts` — GET/POST team members
- `src/app/api/webhook/graph/route.ts` — Graph webhook: validation (GET+POST) + processes new emails (POST)
- `src/app/api/webhook/setup/route.ts` — POST: register Graph webhook subscription

### Frontend (UI)
- `src/app/layout.tsx` — root layout with Geist Sans + Mono fonts
- `src/app/globals.css` — CSS variables, sidebar theming, scrollbar, filter styles
- `src/app/page.tsx` — home page: sidebar + "select a ticket" empty state
- `src/app/tickets/[id]/page.tsx` — ticket detail page: sidebar + detail view
- `src/components/TicketSidebar.tsx` — dark sidebar (#0f0f0f, 380px): search, status/priority/category/assignee filters, ticket list with team member fetch
- `src/components/TicketRow.tsx` — ticket list item: sender, time, subject, summary, badges, assignee initials
- `src/components/TicketDetail.tsx` — full detail: header (subject, status/priority/assignee dropdowns, translate toggle), message thread (with translation overlay), AI draft panel ("Use this draft" + "Show in English" + regenerate), reply composer (translate button + Cmd+Enter send), enrichment panel
- `src/components/EnrichmentPanel.tsx` — right sidebar (280px): fetches from /api/enrichment, shows Sentry errors, PostHog sessions, DB user data. Shows "not configured" hints when services aren't set up
- `src/components/StatusBadge.tsx` — StatusBadge, PriorityBadge, CategoryBadge, LanguageBadge

### Infrastructure
- `Dockerfile` — 4-stage build: deps → prisma → builder → runner (cache-optimized)
- `docker-compose.yml` — Postgres 16 + LibreTranslate + Next.js app, reads .env
- `docker-entrypoint.sh` — waits for DB, runs prisma push, optional seed (SEED_DB=true), starts server
- `.dockerignore` — excludes node_modules, .next, .git, .env, docs
- `scripts/seed.ts` — parses 100 real ticket files, uses franc for language detection, generates summaries + drafts
- `.env.example` — all required/optional env vars documented
- `README.md` — full setup, architecture, API reference, design decisions

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
- **Hybrid AI** — local classifiers for language/category/priority (free), Claude Haiku only for summary + draft (~$0.002/ticket)
- **LibreTranslate** (not paid API) — self-hosted, free, unlimited translation for 7 EU languages + Claude fallback
- **Webhook** (not polling) — real-time email ingestion
- **Configurable DB enrichment** — SQL query in .env, no code changes needed for different schemas
- **No auth in MVP** — single shared login; NextAuth ready to add
- **4-stage Docker** — cache-optimized; source changes rebuild in ~2s

## How to run
```bash
# Docker (recommended — starts Postgres + LibreTranslate + app)
docker compose up --build

# Manual
npm install && cp .env.example .env
npx prisma db push
npm run db:seed    # optional
npm run dev
```

## What could be added next
- Authentication (NextAuth is already a dependency)
- Webhook subscription auto-renewal (function exists, needs a scheduled route)
- Bulk AI analysis for existing tickets
- Email template editor
- Ticket merge/dedup for same sender
- Real-time updates (WebSocket for live ticket list)
