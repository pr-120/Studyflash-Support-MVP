# Studyflash Support Platform

An internal support ticket platform for Studyflash. Ingests support emails, structures them into actionable tickets, enriches them with internal context, and assists the team with triage and AI-drafted responses.

Built with **Next.js 14**, **Prisma** (PostgreSQL), **Microsoft Graph API** (Outlook sync), and **Anthropic Claude** (AI pipeline).

---

## Quick Start (Docker)

The fastest way to run the platform:

```bash
docker compose up --build
```

This starts:
- **PostgreSQL 16** on port 5432
- **Next.js app** on [http://localhost:3000](http://localhost:3000)
- Auto-runs database migrations and seeds 100 real support tickets

No external services needed for the demo. MS Graph (Outlook) and Claude AI features require API keys (see [Environment Variables](#environment-variables)).

---

## Manual Setup

### Prerequisites

- Node.js 18+
- PostgreSQL (local or Supabase)

### Steps

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template
cp .env.example .env
# Edit .env with your DATABASE_URL (see below)

# 3. Push schema to database
npx prisma db push

# 4. Seed with 100 real support tickets
npm run db:seed

# 5. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Architecture

```
┌──────────────┐     ┌──────────────────────────────────┐     ┌────────────┐
│   Outlook    │────▶│       Next.js 14 (App Router)     │────▶│ PostgreSQL │
│   Mailbox    │◀────│                                    │     │  (Prisma)  │
│              │     │  API Routes:                       │     └────────────┘
│  Graph API   │     │  ├─ /api/tickets (CRUD + filters) │
│  Webhooks    │     │  ├─ /api/tickets/[id]/reply       │     ┌────────────┐
└──────────────┘     │  ├─ /api/tickets/[id]/ai-draft    │────▶│  Anthropic │
                     │  ├─ /api/webhook/graph             │     │   Claude   │
                     │  ├─ /api/team                      │     └────────────┘
                     │  └─ /api/webhook/setup             │
                     │                                    │     ┌────────────┐
                     │  UI:                               │     │  Sentry    │
                     │  ├─ Dark sidebar (ticket list)     │·····│  PostHog   │
                     │  ├─ Ticket detail + thread          │     │  (stubs)   │
                     │  ├─ AI draft panel                  │     └────────────┘
                     │  └─ Enrichment panel (stubs)        │
                     └──────────────────────────────────────┘
```

### Data flow

1. **Inbound email** → MS Graph webhook → `/api/webhook/graph` → creates Ticket + Message + runs Claude AI analysis → saved to PostgreSQL
2. **Agent views tickets** → sidebar fetches `GET /api/tickets` with filters → clicks ticket → loads thread + enrichment panel
3. **Agent replies** → `POST /api/tickets/[id]/reply` → sends via Graph API (stays in Outlook thread) + saves outbound Message
4. **AI draft** → generated on ticket creation; can be regenerated with custom instructions via `/api/tickets/[id]/ai-draft`

### Outlook thread parity

Replies sent from the platform use the Graph API `reply` endpoint, which places the message in the same Outlook conversation thread. Inbound replies from Outlook are picked up via Graph webhooks and added to the existing ticket (matched by `outlookThreadId`).

---

## Features

| Feature | Status | Details |
|---|---|---|
| Ticket list with search + filters | Done | Status, priority, category, assignee filters. Full-text search on subject, email, summary |
| Ticket detail with message thread | Done | Inbound (left) / outbound (right) chat bubbles |
| Assign tickets to team members | Done | Dropdown in ticket header + assignee filter in sidebar |
| AI categorization + draft replies | Done | Claude analyzes language, category, priority, generates English summary + draft reply in user's language |
| AI draft regeneration | Done | Regenerate with custom instructions |
| Outlook bidirectional sync | Done | Graph API webhooks (inbound) + threaded replies (outbound) |
| Enrichment panel | Stub | Sentry errors, PostHog sessions, user data — displays mock data, architecture ready for real integration |
| Language detection + display | Done | Detects DE/FR/EN/NL, shows language badge, non-English tickets highlighted |
| Status/priority inline editing | Done | Dropdowns in ticket header, instant PATCH to API |
| Docker one-command setup | Done | `docker compose up` with auto-migration + seed |

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string (with PgBouncer for Supabase) |
| `DIRECT_URL` | Yes (Supabase) | Direct PostgreSQL connection (bypasses PgBouncer). Same as DATABASE_URL for local Postgres |
| `AZURE_CLIENT_ID` | For Outlook | Azure App Registration client ID |
| `AZURE_CLIENT_SECRET` | For Outlook | Azure App Registration client secret |
| `AZURE_TENANT_ID` | For Outlook | Azure tenant ID |
| `SUPPORT_MAILBOX` | For Outlook | Shared mailbox email (e.g. `support@studyflash.ch`) |
| `ANTHROPIC_API_KEY` | For AI | Anthropic API key for Claude |
| `GRAPH_WEBHOOK_SECRET` | For Outlook | Random string for webhook validation |

Optional enrichment (stubs only in MVP):
- `SENTRY_API_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`
- `POSTHOG_API_KEY`, `POSTHOG_HOST`

---

## API Routes

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/tickets` | List tickets (query: `status`, `priority`, `category`, `assignedToId`, `search`) |
| `POST` | `/api/tickets` | Create ticket manually (runs AI analysis) |
| `GET` | `/api/tickets/[id]` | Get ticket with messages |
| `PATCH` | `/api/tickets/[id]` | Update status, priority, category, assignee |
| `DELETE` | `/api/tickets/[id]` | Delete ticket |
| `POST` | `/api/tickets/[id]/reply` | Send reply (via Graph API + DB) |
| `POST` | `/api/tickets/[id]/ai-draft` | Regenerate AI draft |
| `GET` | `/api/team` | List team members |
| `POST` | `/api/team` | Create team member |
| `GET/POST` | `/api/webhook/graph` | Graph webhook (validation + notifications) |
| `POST` | `/api/webhook/setup` | Register Graph webhook subscription |

---

## Key Design Decisions

**MS Graph API over IMAP** — Enables bidirectional thread parity. Replies from the platform appear in the same Outlook conversation. IMAP would only support one-way ingestion.

**Claude claude-opus-4-5 for AI** — Best quality for multilingual support. The prompt returns structured JSON with language detection, categorization, priority, English summary, and a draft reply in the user's own language.

**Webhook over polling** — Graph webhooks provide real-time email ingestion. Polling would introduce latency and waste API calls.

**No auth in MVP** — The platform is internal-only. NextAuth is a dependency and can be added when needed, but for the MVP a shared session is fine.

**Enrichment as stubs** — Sentry, PostHog, and user data enrichment are shown as a UI panel with mock data. The architecture supports real integration by adding API calls to the enrichment panel component. This demonstrates the design intent without requiring access to production systems.

**Docker for runnable demo** — A `docker compose up` experience is the strongest way to deliver a runnable platform. No external DB setup needed.

---

## Project Structure

```
src/
├── app/
│   ├── layout.tsx              # Root layout (Geist fonts)
│   ├── globals.css             # Theme variables + utilities
│   ├── page.tsx                # Home: sidebar + empty state
│   ├── tickets/[id]/page.tsx   # Ticket detail page
│   └── api/
│       ├── tickets/            # Tickets CRUD
│       ├── team/               # Team members
│       └── webhook/            # Graph webhook + setup
├── components/
│   ├── TicketSidebar.tsx       # Dark sidebar with filters
│   ├── TicketRow.tsx           # Ticket list item
│   ├── TicketDetail.tsx        # Detail view + thread + reply
│   ├── EnrichmentPanel.tsx     # Sentry/PostHog/User stubs
│   └── StatusBadge.tsx         # Badge components
└── lib/
    ├── prisma.ts               # DB client singleton
    ├── graph.ts                # MS Graph API client
    ├── ai.ts                   # Claude AI pipeline
    └── utils.ts                # Helpers + constants
```

---

## Seed Data

The seed script (`scripts/seed.ts`) reads 100 real anonymized support tickets from `tickets/tickets/`. For each ticket it:

- Parses tags and maps to categories (refund, billing, bug report, etc.)
- Detects language (DE/FR/EN/NL) via heuristic word matching
- Extracts subject line and sender name from the body
- Generates an English summary and a draft reply in the ticket's language
- Assigns to team members by category
- Creates varied statuses and priorities

Run: `npm run db:seed`
