# Studyflash Support Platform — Claude Code Context

## What this is
An internal support ticket platform for Studyflash. Built as a hiring challenge MVP.
Next.js 14 + Supabase (Postgres via Prisma) + Microsoft Graph API (Outlook sync) + Anthropic Claude API.

## What's already built
- `prisma/schema.prisma` — full schema: Ticket, Message, TeamMember, all enums
- `src/lib/prisma.ts` — Prisma client singleton
- `src/lib/graph.ts` — MS Graph API: getGraphToken, sendReply, createWebhookSubscription, getMessage
- `src/lib/ai.ts` — Claude AI pipeline: analyzeTicket (language detect, categorize, summarize, draft reply), regenerateDraft
- `src/lib/utils.ts` — cn(), PRIORITY_CONFIG, STATUS_CONFIG, CATEGORY_LABELS, formatRelativeTime
- `src/app/api/webhook/graph/route.ts` — Graph webhook: validates token (GET) + processes new emails (POST)
- `src/app/api/tickets/route.ts` — GET (list with filters) + POST (create ticket)
- `src/app/api/tickets/[id]/route.ts` — GET, PATCH, DELETE single ticket
- `src/app/api/tickets/[id]/reply/route.ts` — POST: sends via Graph API + saves to DB
- `src/app/api/tickets/[id]/ai-draft/route.ts` — POST: regenerate AI draft
- `.env.example` — all required env vars documented

## What still needs to be built

### Priority 1 — UI (most important for demo)
- `src/app/layout.tsx` — root layout with fonts, global CSS
- `src/app/globals.css` — CSS variables, base styles (shadcn/ui compatible)
- `src/app/page.tsx` — ticket list with filters (status, priority, category, search)
- `src/app/tickets/[id]/page.tsx` — ticket detail: thread view + AI draft editor + send reply
- `src/components/TicketRow.tsx` — ticket list item component
- `src/components/TicketDetail.tsx` — right panel with thread + reply composer
- `src/components/StatusBadge.tsx` — colored status/priority/category badges

### Priority 2 — Supporting routes
- `src/app/api/team/route.ts` — GET list team members, POST create team member
- `src/app/api/webhook/setup/route.ts` — POST: register the Graph webhook subscription

### Priority 3 — Demo data
- `scripts/seed.ts` — seed 10-15 realistic tickets in multiple languages (DE, FR, EN)
  with varied statuses, priorities, categories, and assigned team members

### Priority 4 — Docs
- `README.md` — setup instructions, architecture decisions, env var guide

## Design direction for UI
- Dark sidebar (#0f0f0f) with ticket list on the left (~380px)
- Light main panel on the right for ticket detail
- Font: Geist (already in Next.js 14)
- Status badges: colored pills (blue=open, purple=in_progress, yellow=waiting, green=resolved)
- Priority badges: red=urgent, orange=high, yellow=medium, green=low
- Language flag or code shown on each ticket (important feature — team doesn't speak all languages)
- AI draft shown in a collapsible panel with "Use this draft" button
- Ticket detail shows full message thread with inbound (left) / outbound (right) bubbles

## Key technical decisions made
- **MS Graph API** (not IMAP) for Outlook sync — enables bidirectional thread parity
- **Supabase** for Postgres + connection pooling (PgBouncer on port 6543)
- **Claude claude-opus-4-5** for AI analysis — best quality for multilingual support
- **Webhook approach** (not polling) for real-time email ingestion
- **No auth in MVP** — single shared login is fine, can add NextAuth later
- Enrichment (Sentry, PostHog, Postgres lookup) is **stub UI only** in MVP — architecture supports it

## Ticket data model (simplified)
```
Ticket {
  id, subject, fromEmail, fromName
  bodyText, bodyHtml
  outlookThreadId (conversationId from Graph — links to Outlook thread)
  outlookMessageId (used to send replies in-thread)
  status: OPEN | IN_PROGRESS | WAITING | RESOLVED | CLOSED
  priority: LOW | MEDIUM | HIGH | URGENT
  category: BUG_REPORT | REFUND_REQUEST | ACCOUNT_ISSUE | FEATURE_REQUEST
           | BILLING | CONTENT_QUESTION | TECHNICAL_SUPPORT | OTHER
  language (ISO 639-1 code)
  summary (AI-generated English summary)
  aiDraft (AI-generated reply draft)
  assignedTo → TeamMember
  messages → Message[]
}
```

## How to continue
Run: `npm install && npx prisma generate`
Then build the UI starting with `src/app/layout.tsx` → `globals.css` → `page.tsx` → `tickets/[id]/page.tsx`
