# Studyflash Support Platform

An internal support ticket platform for Studyflash. Ingests customer emails via Microsoft Graph webhooks, auto-classifies them, generates AI-drafted replies, and provides self-hosted translation — all in a single containerized stack.

Built with **Next.js 14**, **Prisma** (PostgreSQL), **Microsoft Graph API** (Outlook sync), **Anthropic Claude** (AI summaries + drafts), and **LibreTranslate** (free self-hosted translation).

---

## Table of Contents

- [Quick Start (Demo)](#quick-start-demo)
- [Setup Guide](#setup-guide)
  - [1. Connecting Outlook](#1-connecting-outlook)
  - [2. Exposing the App (Webhook Requirement)](#2-exposing-the-app-webhook-requirement)
  - [3. Registering the Webhook](#3-registering-the-webhook)
  - [4. Enabling AI Features](#4-enabling-ai-features)
  - [5. Configuring Enrichment](#5-configuring-enrichment)
- [Manual Setup (Without Docker)](#manual-setup-without-docker)
- [Architecture](#architecture)
- [Features](#features)
- [Environment Variables](#environment-variables)
- [API Routes](#api-routes)
- [Key Design Decisions](#key-design-decisions)
- [Troubleshooting](#troubleshooting)

---

## Quick Start (Demo)

Run the entire platform with a single command:

```bash
docker compose up --build
```

This starts three services:

| Service | Port | Description |
|---|---|---|
| PostgreSQL 16 | 5432 | Ticket database |
| LibreTranslate | 5000 | Self-hosted translation (DE/FR/NL/IT/ES/PT/EN) |
| Next.js app | 3000 | Support platform UI + API |

Open [http://localhost:3000](http://localhost:3000).

To seed the database with 100 real support tickets for demo purposes, add `SEED_DB=true` to the app's environment in `docker-compose.yml` or run:

```bash
docker compose exec app sh -c 'node node_modules/tsx/dist/cli.mjs scripts/seed.ts'
```

> **Note:** On first launch, LibreTranslate downloads language models (~500MB). This takes ~5-7 minutes. Subsequent starts take ~30-60 seconds because models are cached in a Docker volume.

The demo mode works without any API keys. Outlook integration, AI features, and enrichment are optional and can be enabled by following the setup guide below.

---

## Setup Guide

### 1. Connecting Outlook

To receive real emails as tickets and send replies through Outlook, you need a Microsoft 365 account and an Azure App Registration.

#### a. Create a shared mailbox (or use an existing inbox)

1. Go to [admin.microsoft.com](https://admin.microsoft.com)
2. Navigate to **Teams & Groups > Shared mailboxes > Add**
3. Create a mailbox (e.g., `support@yourcompany.com`)
4. No license is needed for shared mailboxes

Alternatively, you can use any existing Outlook inbox for testing.

#### b. Register an Azure App

1. Go to [portal.azure.com](https://portal.azure.com)
2. Navigate to **Azure Active Directory > App registrations > New registration**
3. Set:
   - Name: `Studyflash Support`
   - Supported account types: **Single tenant**
   - Redirect URI: leave blank
4. Click **Register**
5. Note down:
   - **Application (client) ID** → `AZURE_CLIENT_ID`
   - **Directory (tenant) ID** → `AZURE_TENANT_ID`

#### c. Create a client secret

1. In your app registration, go to **Certificates & secrets**
2. Click **New client secret**, set an expiry (e.g., 12 months)
3. Copy the **Value** immediately (it won't be shown again) → `AZURE_CLIENT_SECRET`

#### d. Add API permissions

1. Go to **API permissions > Add a permission > Microsoft Graph > Application permissions**
2. Add:
   - `Mail.Read`
   - `Mail.ReadWrite`
   - `Mail.Send`
3. Click **Grant admin consent for [your organization]** (requires admin role)

#### e. Update your `.env`

```env
AZURE_CLIENT_ID="your-client-id"
AZURE_CLIENT_SECRET="your-client-secret"
AZURE_TENANT_ID="your-tenant-id"
SUPPORT_MAILBOX="support@yourcompany.com"
GRAPH_WEBHOOK_SECRET="any-random-string"
```

Restart the app for the changes to take effect:

```bash
docker compose down && docker compose up -d
```

---

### 2. Exposing the App (Webhook Requirement)

Microsoft Graph webhooks need to reach your app over the internet. When Microsoft receives a new email, it sends an HTTP POST to your app's webhook URL. If your app is running on `localhost`, Microsoft can't reach it.

**This is only needed during development.** In production, your app would have a real domain.

#### Option A: Cloudflare Tunnel (no account needed)

```bash
# Install (macOS)
brew install cloudflared

# Install (Linux)
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
  -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared

# Start tunnel
cloudflared tunnel --url http://localhost:3000
```

This outputs a public URL like `https://abc-def-ghi.trycloudflare.com`. Copy this URL — you'll need it to register the webhook.

#### Option B: ngrok (requires free account)

```bash
# Sign up at https://dashboard.ngrok.com/signup
# Install and configure your authtoken
ngrok config add-authtoken YOUR_TOKEN
ngrok http 3000
```

> **Important:** The tunnel URL changes every time you restart `cloudflared` or `ngrok`. When it changes, you need to [re-register the webhook](#3-registering-the-webhook).

---

### 3. Registering the Webhook

With the app running and a tunnel active, register the Graph webhook subscription:

```bash
curl -X POST http://localhost:3000/api/webhook/setup \
  -H "Content-Type: application/json" \
  -d '{"notificationUrl": "https://YOUR-TUNNEL-URL/api/webhook/graph"}'
```

Replace `YOUR-TUNNEL-URL` with the URL from step 2.

A successful response looks like:

```json
{
  "message": "Webhook subscription created",
  "subscription": {
    "id": "...",
    "expirationDateTime": "2026-03-18T13:55:04.786Z",
    ...
  }
}
```

#### Testing it

1. Send an email from any account to your support mailbox
2. Within a few seconds, the email should appear as a new ticket in the UI at `http://localhost:3000`
3. The ticket will have auto-detected language, category, priority, and (if Claude is configured) an AI-generated summary and draft reply

#### Webhook expiration

The Graph subscription **expires after 3 days** (see `expirationDateTime` in the response). To keep receiving emails, re-run the same `curl` command before it expires. In production, you'd automate this with a cron job or scheduled route.

#### When to re-register

You need to re-register the webhook when:
- The tunnel URL changes (restarted cloudflared/ngrok)
- The subscription expires (after 3 days)
- You restart the Docker containers (the subscription itself is on Microsoft's side and persists, but verify it's still active)

---

### 4. Enabling AI Features

AI features (ticket summaries, draft replies, translation fallback) use Anthropic's Claude Haiku.

#### Getting an API key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an account and add a payment method (required even for low usage)
3. Go to **API Keys** and create a new key
4. Copy it → `ANTHROPIC_API_KEY`

#### What works without it

| Feature | Without API key | With API key |
|---|---|---|
| Language detection | Works (franc library) | Same |
| Category / priority | Works (keyword rules) | Same |
| Translation | Works (LibreTranslate) | Same + fallback for rare languages |
| Ticket summary | Template: "German-speaking user (billing)..." | Real AI summary of the specific issue |
| Draft reply | Generic template per category/language | Specific, contextual reply addressing the user's issue |

The model used is `claude-haiku-4-5-20251001`. Cost is approximately $0.002 per ticket.

---

### 5. Configuring Enrichment

The enrichment panel (right sidebar in ticket detail) can pull real data from external services. All three integrations are optional and independent.

#### Sentry — Show recent errors for the ticket sender

1. Go to [sentry.io](https://sentry.io) > Settings > **API Keys** (or Auth Tokens)
2. Create a token with `project:read` and `event:read` scopes
3. Find your organization slug and project slug in the URL: `sentry.io/organizations/YOUR_ORG/projects/YOUR_PROJECT/`

```env
SENTRY_API_TOKEN="sntrys_..."
SENTRY_ORG="your-org-slug"
SENTRY_PROJECT="your-project-slug"
```

The panel will show recent errors filtered by the ticket sender's email (`user.email` in Sentry).

#### PostHog — Show recent session recordings

1. Go to [posthog.com](https://posthog.com) (or your self-hosted instance)
2. Navigate to **Settings > Personal API Keys** and create a key
3. Note your host URL (EU: `https://eu.posthog.com`, US: `https://app.posthog.com`)

```env
POSTHOG_API_KEY="phx_..."
POSTHOG_HOST="https://eu.posthog.com"
```

The panel will show recent session recordings for the user, with links to watch them in PostHog.

#### Custom Database — Query your own Postgres for user data

This is the most flexible integration. You provide a connection string and a SQL query, and the platform runs it against your database to show user data in the enrichment panel.

```env
ENRICHMENT_DB_URL="postgresql://readonly:password@your-db-host:5432/your_app_db"
ENRICHMENT_DB_QUERY="SELECT id, name, email, plan, created_at, last_active FROM users WHERE email = $1"
```

- `$1` is replaced with the ticket sender's email address
- The query result rows are displayed as key-value fields in the panel
- Use a **read-only database user** for security

##### Example queries for different schemas

```sql
-- Basic user info
SELECT id, name, plan, created_at FROM users WHERE email = $1

-- With subscription details
SELECT u.name, u.plan, s.status, s.expires_at
FROM users u LEFT JOIN subscriptions s ON s.user_id = u.id
WHERE u.email = $1

-- With activity stats
SELECT name, plan, total_decks, total_cards, last_study_session
FROM users WHERE email = $1
```

No code changes are needed — just update the `.env` file and restart:

```bash
docker compose down && docker compose up -d
```

---

## Manual Setup (Without Docker)

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
# For LibreTranslate, set LIBRETRANSLATE_URL=http://localhost:5000

# 3. Generate Prisma client
npx prisma generate

# 4. Push schema to database
npx prisma db push

# 5. (Optional) Seed with 100 real support tickets
npm run db:seed

# 6. Start development server
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
│  free, 7 langs│    │  ├─ /api/webhook/graph                   │     ┌────────────┐
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
| **Enrichment panel** | Sentry errors, PostHog sessions, custom DB queries (all optional, real integrations) |
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
| `SUPPORT_MAILBOX` | Shared mailbox to monitor (e.g., `support@company.com`) |
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
| `SENTRY_API_TOKEN` | Sentry auth token |
| `SENTRY_ORG` | Sentry organization slug |
| `SENTRY_PROJECT` | Sentry project slug |
| `POSTHOG_API_KEY` | PostHog personal API key |
| `POSTHOG_HOST` | PostHog host (default: `https://eu.posthog.com`) |
| `ENRICHMENT_DB_URL` | Connection string for your product database |
| `ENRICHMENT_DB_QUERY` | SQL query with `$1` as email placeholder |

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

## Troubleshooting

### LibreTranslate is slow to start

On first launch, LibreTranslate downloads ~500MB of language models. This takes 5-7 minutes. Models are cached in a Docker volume (`lt-models`), so subsequent starts take ~30-60 seconds. If you want to check progress:

```bash
docker compose logs -f translate
```

### Webhook registration fails with "ValidationError"

Microsoft sends a validation request to your webhook URL when registering. If it fails:

1. **Check the tunnel is running** and the URL is correct
2. **Test the endpoint manually**: `curl https://YOUR-TUNNEL-URL/api/webhook/graph?validationToken=test` — should return `test` as plain text
3. **Check the app is running**: `curl http://localhost:3000/api/tickets` — should return JSON
4. If using ngrok, make sure you've set up your authtoken

### Outlook reply fails with "550 5.7.501 Spam abuse detected"

New Microsoft 365 tenants often have their outbound email blocked until they build reputation. Options:

- **Wait 24-48 hours** — Microsoft often lifts the block automatically
- **Set up SPF/DKIM/DMARC** for your domain in the M365 Admin Center
- **Contact Microsoft support** to request delisting

The reply is still saved to the database even if the email fails to send. The app uses a `sendMail` fallback when the in-thread `reply` endpoint fails.

### Translation button does nothing

1. Check LibreTranslate is running: `curl http://localhost:5000/languages`
2. If LibreTranslate is down, the app falls back to Claude Haiku (requires `ANTHROPIC_API_KEY`)
3. If neither is available, translation returns the original text unchanged
4. Check the browser console for errors — the API might be returning a 500

### Enrichment panel shows "not configured"

This is expected when enrichment environment variables are not set. Add the relevant credentials to your `.env` file and restart:

```bash
docker compose down && docker compose up -d
```

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
