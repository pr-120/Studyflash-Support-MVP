/**
 * Enrichment — fetch user context from external services.
 *
 * All integrations are optional. Each returns data when configured,
 * or null when env vars are missing. The API route aggregates results.
 *
 * Supported services:
 * - Sentry: recent errors for the user's email
 * - PostHog: recent sessions/recordings for the user
 * - Custom DB: run a configurable SQL query against an external Postgres
 *
 * Environment variables:
 * - SENTRY_API_TOKEN, SENTRY_ORG, SENTRY_PROJECT
 * - POSTHOG_API_KEY, POSTHOG_HOST
 * - ENRICHMENT_DB_URL, ENRICHMENT_DB_QUERY
 */

import pg from "pg";

/* ── Types ── */

export interface SentryIssue {
  id: string;
  title: string;
  culprit: string;
  count: string;
  lastSeen: string;
  level: string;
  permalink: string;
}

export interface PostHogSession {
  id: string;
  startTime: string;
  duration: number; // seconds
  pageViews: number;
  recordingUrl: string | null;
}

export interface EnrichmentResult {
  sentry: { configured: boolean; issues: SentryIssue[] } | null;
  posthog: { configured: boolean; sessions: PostHogSession[] } | null;
  database: { configured: boolean; data: Record<string, unknown>[] } | null;
}

/* ── Sentry ── */

async function fetchSentryIssues(email: string): Promise<{
  configured: boolean;
  issues: SentryIssue[];
} | null> {
  const token = process.env.SENTRY_API_TOKEN;
  const org = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;

  if (!token || !org || !project) return null;

  try {
    const query = encodeURIComponent(`user.email:${email}`);
    const res = await fetch(
      `https://sentry.io/api/0/projects/${org}/${project}/issues/?query=${query}&limit=5`,
      {
        headers: { Authorization: `Bearer ${token}` },
        next: { revalidate: 60 }, // cache for 60s
      }
    );

    if (!res.ok) {
      console.error(`Sentry API error: ${res.status}`);
      return { configured: true, issues: [] };
    }

    const data = await res.json();
    const issues: SentryIssue[] = data.map((issue: Record<string, unknown>) => ({
      id: String(issue.id ?? ""),
      title: String(issue.title ?? ""),
      culprit: String(issue.culprit ?? ""),
      count: String(issue.count ?? "0"),
      lastSeen: String(issue.lastSeen ?? ""),
      level: String(issue.level ?? "error"),
      permalink: String(issue.permalink ?? ""),
    }));

    return { configured: true, issues };
  } catch (err) {
    console.error("Sentry enrichment failed:", err);
    return { configured: true, issues: [] };
  }
}

/* ── PostHog ── */

async function fetchPostHogSessions(email: string): Promise<{
  configured: boolean;
  sessions: PostHogSession[];
} | null> {
  const apiKey = process.env.POSTHOG_API_KEY;
  const host = process.env.POSTHOG_HOST || "https://app.posthog.com";

  if (!apiKey) return null;

  try {
    // First, find the person by email
    const personsRes = await fetch(
      `${host}/api/persons/?search=${encodeURIComponent(email)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      }
    );

    if (!personsRes.ok) {
      console.error(`PostHog API error: ${personsRes.status}`);
      return { configured: true, sessions: [] };
    }

    const personsData = await personsRes.json();
    const person = personsData.results?.[0];

    if (!person) {
      return { configured: true, sessions: [] };
    }

    // Fetch recent recordings for this person
    const recordingsRes = await fetch(
      `${host}/api/projects/@current/session_recordings/?person_uuid=${person.uuid}&limit=5`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      }
    );

    if (!recordingsRes.ok) {
      return { configured: true, sessions: [] };
    }

    const recordingsData = await recordingsRes.json();
    const sessions: PostHogSession[] = (recordingsData.results ?? []).map(
      (rec: Record<string, unknown>) => ({
        id: String(rec.id ?? ""),
        startTime: String(rec.start_time ?? ""),
        duration: Number(rec.recording_duration ?? 0),
        pageViews: Number(rec.viewed ?? 0),
        recordingUrl: `${host}/recordings/${rec.id}`,
      })
    );

    return { configured: true, sessions };
  } catch (err) {
    console.error("PostHog enrichment failed:", err);
    return { configured: true, sessions: [] };
  }
}

/* ── Custom Database ── */

async function fetchDatabaseData(email: string): Promise<{
  configured: boolean;
  data: Record<string, unknown>[];
} | null> {
  const dbUrl = process.env.ENRICHMENT_DB_URL;
  const query = process.env.ENRICHMENT_DB_QUERY;

  if (!dbUrl || !query) return null;

  // The query should contain $1 as a placeholder for the user's email.
  // Example: SELECT id, name, plan, created_at FROM users WHERE email = $1

  let client: pg.Client | null = null;
  try {
    client = new pg.Client({ connectionString: dbUrl });
    await client.connect();

    const result = await client.query(query, [email]);
    return { configured: true, data: result.rows };
  } catch (err) {
    console.error("DB enrichment failed:", err);
    return { configured: true, data: [] };
  } finally {
    if (client) await client.end().catch(() => {});
  }
}

/* ── Aggregate ── */

export async function enrichUser(email: string): Promise<EnrichmentResult> {
  const [sentry, posthog, database] = await Promise.allSettled([
    fetchSentryIssues(email),
    fetchPostHogSessions(email),
    fetchDatabaseData(email),
  ]);

  return {
    sentry: sentry.status === "fulfilled" ? sentry.value : null,
    posthog: posthog.status === "fulfilled" ? posthog.value : null,
    database: database.status === "fulfilled" ? database.value : null,
  };
}
