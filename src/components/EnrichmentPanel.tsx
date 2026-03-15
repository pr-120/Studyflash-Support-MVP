"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Bug,
  Video,
  Database,
  ExternalLink,
  Info,
  Loader2,
  AlertCircle,
} from "lucide-react";

interface EnrichmentPanelProps {
  fromEmail: string;
}

interface SentryIssue {
  id: string;
  title: string;
  culprit: string;
  count: string;
  lastSeen: string;
  level: string;
  permalink: string;
}

interface PostHogSession {
  id: string;
  startTime: string;
  duration: number;
  pageViews: number;
  recordingUrl: string | null;
}

interface EnrichmentData {
  sentry: { configured: boolean; issues: SentryIssue[] } | null;
  posthog: { configured: boolean; sessions: PostHogSession[] } | null;
  database: { configured: boolean; data: Record<string, unknown>[] } | null;
}

function CollapsibleSection({
  title,
  icon: Icon,
  defaultOpen = false,
  badge,
  children,
}: {
  title: string;
  icon: React.ElementType;
  defaultOpen?: boolean;
  badge?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <Icon className="h-3.5 w-3.5 text-gray-400" />
        {title}
        {badge && (
          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
            {badge}
          </span>
        )}
        {open ? (
          <ChevronDown className="ml-auto h-3.5 w-3.5 text-gray-400" />
        ) : (
          <ChevronRight className="ml-auto h-3.5 w-3.5 text-gray-400" />
        )}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

function NotConfigured({ service }: { service: string }) {
  return (
    <div className="flex items-start gap-1.5 rounded-md bg-gray-50 p-2.5 text-[11px] text-gray-400">
      <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
      <span>
        {service} not configured. Add credentials to <code className="font-mono">.env</code> to enable.
      </span>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${s}s`;
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function EnrichmentPanel({ fromEmail }: EnrichmentPanelProps) {
  const [data, setData] = useState<EnrichmentData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/enrichment?email=${encodeURIComponent(fromEmail)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [fromEmail]);

  const anyConfigured = data?.sentry || data?.posthog || data?.database;

  return (
    <aside className="flex w-[280px] flex-shrink-0 flex-col border-l bg-white overflow-y-auto">
      <div className="px-4 pt-4 pb-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
          Enrichment
        </h3>
      </div>

      {/* Always show email */}
      <div className="px-4 pb-3">
        <div className="rounded-md bg-gray-50 p-2.5">
          <p className="text-[11px] font-medium text-gray-500 mb-1">Email</p>
          <p className="text-xs text-gray-800 font-mono truncate">{fromEmail}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-4 w-4 animate-spin text-gray-300" />
        </div>
      ) : (
        <>
          {/* ── User Database ── */}
          <CollapsibleSection
            title="User Data"
            icon={Database}
            defaultOpen={true}
            badge={
              data?.database?.configured
                ? `${data.database.data.length} rows`
                : undefined
            }
          >
            {!data?.database ? (
              <NotConfigured service="Database enrichment" />
            ) : data.database.data.length === 0 ? (
              <p className="text-[11px] text-gray-400">
                No user data found for this email
              </p>
            ) : (
              <div className="space-y-2">
                {data.database.data.map((row, i) => (
                  <div key={i} className="grid grid-cols-2 gap-1.5">
                    {Object.entries(row).map(([key, value]) => (
                      <div key={key} className="rounded-md bg-gray-50 p-2">
                        <p className="text-[10px] font-medium text-gray-400 truncate">
                          {key}
                        </p>
                        <p className="text-xs text-gray-700 truncate">
                          {value == null ? "—" : String(value)}
                        </p>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>

          {/* ── Sentry ── */}
          <CollapsibleSection
            title="Sentry Errors"
            icon={Bug}
            badge={
              data?.sentry?.configured
                ? `${data.sentry.issues.length}`
                : undefined
            }
          >
            {!data?.sentry ? (
              <NotConfigured service="Sentry" />
            ) : data.sentry.issues.length === 0 ? (
              <p className="text-[11px] text-gray-400">
                No recent errors for this user
              </p>
            ) : (
              <div className="space-y-2">
                {data.sentry.issues.map((issue) => (
                  <div
                    key={issue.id}
                    className={`rounded-md border p-2.5 ${
                      issue.level === "fatal" || issue.level === "error"
                        ? "border-red-100 bg-red-50/50"
                        : "border-orange-100 bg-orange-50/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-red-700 truncate">
                        {issue.title}
                      </span>
                      <span className="text-[10px] text-red-500 flex-shrink-0 ml-1">
                        {formatTimeAgo(issue.lastSeen)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-red-600 truncate">
                      {issue.culprit}
                    </p>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-[10px] text-red-400">
                        {issue.count} events
                      </span>
                      {issue.permalink && (
                        <a
                          href={issue.permalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-0.5 text-[10px] text-blue-600 hover:underline"
                        >
                          <ExternalLink className="h-2.5 w-2.5" />
                          View
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>

          {/* ── PostHog ── */}
          <CollapsibleSection
            title="PostHog Sessions"
            icon={Video}
            badge={
              data?.posthog?.configured
                ? `${data.posthog.sessions.length}`
                : undefined
            }
          >
            {!data?.posthog ? (
              <NotConfigured service="PostHog" />
            ) : data.posthog.sessions.length === 0 ? (
              <p className="text-[11px] text-gray-400">
                No recent sessions for this user
              </p>
            ) : (
              <div className="space-y-2">
                {data.posthog.sessions.map((session) => (
                  <div
                    key={session.id}
                    className="rounded-md border border-gray-100 bg-gray-50/50 p-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-gray-700">
                        Session
                      </span>
                      <span className="text-[10px] text-gray-500">
                        {formatTimeAgo(session.startTime)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-gray-600">
                      Duration: {formatDuration(session.duration)}
                    </p>
                    {session.recordingUrl && (
                      <a
                        href={session.recordingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
                      >
                        <Video className="h-3 w-3" />
                        Watch recording
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>
        </>
      )}

      {/* Footer */}
      <div className="mt-auto px-4 py-3 border-t border-gray-100">
        <div className="flex items-start gap-1.5 text-[10px] text-gray-400">
          <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
          <span>
            {anyConfigured
              ? "Enrichment data fetched from configured services."
              : "Configure Sentry, PostHog, or database in .env to enrich tickets."}
          </span>
        </div>
      </div>
    </aside>
  );
}
