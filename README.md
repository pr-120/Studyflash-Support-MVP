# Studyflash Support Platform

An internal support ticket platform for Studyflash. Ingests customer emails via Microsoft Graph webhooks, auto-classifies them, generates AI-drafted replies, and provides self-hosted translation — all in a single containerized stack.

Built with **Next.js 14**, **Prisma** (PostgreSQL), **Microsoft Graph API** (Outlook sync), **Anthropic Claude** (AI summaries + drafts), and **LibreTranslate** (free self-hosted translation).

---

## Quick Start

```bash
docker compose up --build
```

This starts three services:
- **PostgreSQL 16** on port 5432
- **LibreTranslate** on port 5000 (self-hosted translation, loads DE/FR/NL/IT/ES/PT/EN models)
- **Next.js app** on [http://localhost:3000](http://localhost:3000)

On first launch, LibreTranslate downloads language models (~500MB, cached for subsequent starts). Set `SEED_DB=true` in the app environment to seed 100 real support tickets for demo purposes.

No external API keys required for the base experience. Outlook integration requires Azure credentials, AI summaries/drafts require an Anthropic key (see [Environment Variables](#environment-variables)).

---

## Manual Setup

### Prerequisites

- Node.js 18+
- PostgreSQL (local or Supabase)
- LibreTranslate (optional — `docker run -p 5000:5000 libretranslate/libretranslate`)

### Steps

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — at minimum set DATABASE_URL

# 3. Push schema to database
npx prisma db push

# 4. (Optional) Seed with 100 real support tickets
npm run db:seed

# 5. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Architecture

```
┌──────────────┐     ┌───────────────────────────────────────────┐     ┌────────────┐
│   Outlook    │────▶│          Next.js 14 (App Router)          │────▶│ PostgreSQL │
│   Mailbox    │◀────│                                           │     │  (Prisma)  │
│              │     │  API Routes:                              │     └────────────┘
│  Graph API   │     │  ├─ /api/tickets (CRUD + filters)        │
│  Webhooks    │     │  ├─ /api/tickets/[id]/reply              │     ┌────────────┐
└──────────────┘     │  ├─ /api/tickets/[id]/ai-draft           │────▶│  Claude    │
                     │  ├─ /api/tickets/[id]/translate           │     │  Haiku     │
┌──────────────┐     │  ├─ /api/translate                        │     │ (fallback) │
│ LibreTranslate│◀───│  ├─ /api/enrichment                      │     └────────────┘
│ (self-hosted)│     │  ├─ /api/team                             │
│  free, 7 langs│     │  ├─ /api/webhook/graph                  │     ┌────────────┐
└──────────────┘     │  └─ /api/webhook/setup                    │────▶│  Sentry    │
                     │                                           │     │  PostHog   │
                     │  Local classifiers (no LLM):              │     │  Custom DB │
                     │  ├─ Language detection (franc, 180+ langs)│     │ (optional) │
                     │  ├─ Category (keyword scoring)            │     └────────────┘
                     │  └─ Priority (keyword signals)            │
                     └───────────────────────────────────────────┘
```

### Data flow

1. **Inbound email** → MS Graph webhook → `/api/webhook/graph` → local classifiers (language, category, priority) + Claude AI (summary, draft reply) → Ticket + Message saved to PostgreSQL
2. **Agent views tickets** → sidebar with search + filters → clicks ticket → message thread + enrichment panel + AI draft panel
3. **Agent translates** → "Translate" button on messages, "Show in English" on AI draft, translate button on reply composer — all via LibreTranslate (free) with Claude fallback
4. **Agent replies** → writes in English → translates to customer's language → sends via Graph API (stays in Outlook thread) + saves to DB
5. **AI draft** → generated on ticket creation in customer's language; agent can view English translation, regenerate with custom instructions, or use as-is

### Hybrid AI approach

Not everything needs an LLM. The platform splits work between free local tools and paid AI:

| Task | Method | Cost |
|---|---|---|
| Language detection | `franc` library (180+ languages) | Free |
| Category classification | Keyword scoring (7 languages) | Free |
| Priority assessment | Keyword signals | Free |
| Translation | LibreTranslate (self-hosted) | Free |
| Assignee suggestion | Category-to-role mapping | Free |
| English summary | Claude Haiku | ~$0.001/ticket |
| Draft reply generation | Claude Haiku | ~$0.001/ticket |
| Translation fallback | Claude Haiku (for unsupported langs) | ~$0.001/call |

Without an Anthropic API key, the platform still works fully — summaries and drafts use template-based fallbacks.

---

## Features

| Feature | Details |
|---|---|
| **Ticket list** | Dark sidebar with search, status/priority/category/assignee filters |
| **Ticket detail** | Message thread with inbound/outbound bubbles, inline status/priority/assignee editing |
| **Team assignment** | Assign tickets to team members via dropdown, filter by assignee |
| **AI categorization** | Local classifiers for language, category, priority (free, instant) |
| **AI summaries** | Claude Haiku generates English summary for each ticket |
| **AI draft replies** | Generated in the customer's language, with "Show in English" translation |
| **Draft regeneration** | Regenerate AI draft with custom instructions |
| **Message translation** | Translate inbound messages to English (LibreTranslate, free) |
| **Reply translation** | Write reply in English, translate to customer's language before sending |
| **Outlook sync** | Bidirectional via Graph API — inbound webhooks + in-thread replies |
| **Enrichment panel** | Sentry errors, PostHog sessions, custom DB queries (all optional, real API integrations) |
| **Custom DB enrichment** | Configurable SQL query in `.env` — query your own Postgres for user data |
| **Docker setup** | `docker compose up` starts Postgres + LibreTranslate + app |
| **Language support** | Detection: 180+ languages. Translation: 7 EU languages (LibreTranslate) + all via Claude fallback |

---

## Environment Variables

### Required

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string. Set automatically by Docker Compose |
| `DIRECT_URL` | Direct PostgreSQL connection (for Supabase PgBouncer). Same as DATABASE_URL for local Postgres |

### Outlook Integration

| Variable | Description |
|---|---|
| `AZURE_CLIENT_ID` | Azure App Registration client ID |
| `AZURE_CLIENT_SECRET` | Azure App Registration client secret |
| `AZURE_TENANT_ID` | Azure tenant ID |
| `SUPPORT_MAILBOX` | Shared mailbox to monitor (e.g. `support@company.com`) |
| `GRAPH_WEBHOOK_SECRET` | Random string for webhook validation |

### AI (optional)

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Enables Claude Haiku for summaries, draft replies, and translation fallback. Without it, template-based fallbacks are used |

### Translation (auto-configured)

| Variable | Description |
|---|---|
| `LIBRETRANSLATE_URL` | Set automatically to `http://translate:5000` by Docker Compose. For manual setup, point to your LibreTranslate instance |

### Enrichment (all optional)

| Variable | Description |
|---|---|
| `SENTRY_API_TOKEN` | Sentry auth token — shows recent errors for the ticket sender |
| `SENTRY_ORG` | Sentry organization slug |
| `SENTRY_PROJECT` | Sentry project slug |
| `POSTHOG_API_KEY` | PostHog personal API key — shows session recordings |
| `POSTHOG_HOST` | PostHog host (default: `https://eu.posthog.com`) |
| `ENRICHMENT_DB_URL` | Connection string for your product database |
| `ENRICHMENT_DB_QUERY` | SQL query with `$1` as email placeholder (e.g. `SELECT * FROM users WHERE email = $1`) |

---

## API Routes

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/tickets` | List tickets (query: `status`, `priority`, `category`, `assignedToId`, `search`) |
| `POST` | `/api/tickets` | Create ticket manually (runs AI analysis) |
| `GET` | `/api/tickets/[id]` | Get ticket with messages |
| `PATCH` | `/api/tickets/[id]` | Update status, priority, category, assignee |
| `DELETE` | `/api/tickets/[id]` | Delete ticket |
| `POST` | `/api/tickets/[id]/reply` | Send reply via Graph API + save to DB |
| `POST` | `/api/tickets/[id]/ai-draft` | Regenerate AI draft with custom instructions |
| `POST` | `/api/tickets/[id]/translate` | Translate ticket messages (LibreTranslate + Claude fallback) |
| `POST` | `/api/translate` | General-purpose text translation |
| `GET` | `/api/enrichment?email=` | Fetch enrichment data from Sentry/PostHog/custom DB |
| `GET/POST` | `/api/team` | List / create team members |
| `GET/POST` | `/api/webhook/graph` | Graph webhook validation + notification processing |
| `POST` | `/api/webhook/setup` | Register Graph webhook subscription |

---

## Key Design Decisions

**MS Graph API over IMAP** — Enables bidirectional thread parity. Replies sent from the platform appear in the same Outlook conversation thread. IMAP would only support one-way ingestion.

**Hybrid AI: local classifiers + LLM** — Language detection, category, and priority are handled by free local tools (`franc` library, keyword scoring). Claude Haiku is only used for tasks that genuinely need understanding: English summaries and draft reply generation. This reduces API costs by ~95% compared to sending everything to an LLM.

**LibreTranslate over paid APIs** — Self-hosted, free, unlimited translation for 7 EU languages. Claude Haiku serves as a fallback for unsupported language pairs. At 1,000 tickets/month, translation costs $0 instead of ~$10-20 with a paid API.

**Webhook over polling** — Graph webhooks provide real-time email ingestion (<5s latency). Polling would introduce delays and waste API calls.

**Configurable DB enrichment** — The `ENRICHMENT_DB_QUERY` env var lets teams point at their own Postgres database with a custom SQL query. No code changes needed to adapt to different schemas — just update the `.env` file.

**No auth in MVP** — The platform is internal-only. NextAuth is a dependency and can be added when needed.

**4-stage Docker build** — Optimized cache layers: dependencies, Prisma generation, Next.js build, and runtime are separated so source-only changes rebuild in ~2 seconds.

---

## Project Structure

```
src/
├── app/
│   ├── layout.tsx                      # Root layout (Geist fonts)
│   ├── globals.css                     # Theme variables + sidebar styles
│   ├── page.tsx                        # Home: sidebar + empty state
│   ├── tickets/[id]/page.tsx           # Ticket detail page
│   └── api/
│       ├── tickets/                    # Tickets CRUD + reply + ai-draft + translate
│       ├── translate/                  # General-purpose translation
│       ├── enrichment/                 # Sentry/PostHog/DB enrichment
│       ├── team/                       # Team members
│       └── webhook/                    # Graph webhook + setup
├── components/
│   ├── TicketSidebar.tsx               # Dark sidebar with search + filters
│   ├── TicketRow.tsx                   # Ticket list item with badges
│   ├── TicketDetail.tsx                # Thread + AI draft + reply + translation
│   ├── EnrichmentPanel.tsx             # Sentry/PostHog/DB data panel
│   └── StatusBadge.tsx                 # Status/Priority/Category/Language badges
└── lib/
    ├── prisma.ts                       # DB client singleton
    ├── graph.ts                        # MS Graph API (OAuth, reply, webhook)
    ├── ai.ts                           # Claude Haiku (summary + draft only)
    ├── classify.ts                     # Local classifiers (language, category, priority)
    ├── translate.ts                    # LibreTranslate client + Claude fallback
    ├── enrichment.ts                   # Sentry/PostHog/DB enrichment clients
    └── utils.ts                        # Helpers, configs, 40 language names
```

---

## Seed Data

The seed script (`scripts/seed.ts`) reads 100 real anonymized support tickets from `tickets/tickets/`. For each ticket it:

- Detects language using `franc` (same library as production)
- Maps tags to categories (refund, billing, bug report, etc.)
- Assesses priority from keyword signals
- Extracts subject line and sender name
- Generates an English summary and a draft reply in the ticket's language
- Assigns to team members by category
- Distributes across varied statuses

Run manually: `npm run db:seed`
Or via Docker: set `SEED_DB=true` in the app's environment.

---

## What Could Be Added Next

- **Authentication** — NextAuth is already a dependency; add login to restrict access
- **Webhook renewal** — The Graph subscription expires after 3 days; add a cron/scheduled route to auto-renew
- **Bulk AI analysis** — Re-analyze existing tickets with Claude for better summaries
- **Email templates** — Reusable response templates for common ticket types
- **Ticket merge** — Detect and merge duplicate tickets from the same sender
- **Real-time updates** — WebSocket or polling for live ticket list updates when new emails arrive
