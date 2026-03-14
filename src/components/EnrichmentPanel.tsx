"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Bug,
  Video,
  Database,
  ExternalLink,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface EnrichmentPanelProps {
  fromEmail: string;
}

function CollapsibleSection({
  title,
  icon: Icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: React.ElementType;
  defaultOpen?: boolean;
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

export function EnrichmentPanel({ fromEmail }: EnrichmentPanelProps) {
  return (
    <aside className="flex w-[280px] flex-shrink-0 flex-col border-l bg-white overflow-y-auto">
      <div className="px-4 pt-4 pb-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
          Enrichment
        </h3>
      </div>

      {/* User Data */}
      <CollapsibleSection title="User Data" icon={Database} defaultOpen={true}>
        <div className="space-y-2">
          <div className="rounded-md bg-gray-50 p-2.5">
            <p className="text-[11px] font-medium text-gray-500 mb-1">Email</p>
            <p className="text-xs text-gray-800 font-mono truncate">{fromEmail}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <InfoField label="Plan" value="Premium" />
            <InfoField label="Since" value="Oct 2024" />
            <InfoField label="Last active" value="2h ago" />
            <InfoField label="Platform" value="iOS + Web" />
            <InfoField label="App version" value="3.2.1" />
            <InfoField label="Country" value="CH" />
          </div>
          <a
            href="#"
            className="flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            View in admin panel
          </a>
        </div>
      </CollapsibleSection>

      {/* Sentry Errors */}
      <CollapsibleSection title="Sentry Errors" icon={Bug}>
        <div className="space-y-2">
          <div className="rounded-md border border-red-100 bg-red-50/50 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-red-700">
                TypeError
              </span>
              <span className="text-[10px] text-red-500">3h ago</span>
            </div>
            <p className="mt-0.5 text-[11px] text-red-600 truncate">
              Cannot read property &apos;cards&apos; of undefined
            </p>
            <p className="mt-1 text-[10px] text-red-400">
              DeckView.tsx:142 &middot; 12 events
            </p>
          </div>
          <div className="rounded-md border border-orange-100 bg-orange-50/50 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-orange-700">
                NetworkError
              </span>
              <span className="text-[10px] text-orange-500">1d ago</span>
            </div>
            <p className="mt-0.5 text-[11px] text-orange-600 truncate">
              Failed to fetch /api/sync
            </p>
            <p className="mt-1 text-[10px] text-orange-400">
              SyncService.ts:89 &middot; 3 events
            </p>
          </div>
          <a
            href="#"
            className="flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            View in Sentry
          </a>
        </div>
      </CollapsibleSection>

      {/* PostHog Recordings */}
      <CollapsibleSection title="PostHog Sessions" icon={Video}>
        <div className="space-y-2">
          <div className="rounded-md border border-gray-100 bg-gray-50/50 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-gray-700">
                Session Recording
              </span>
              <span className="text-[10px] text-gray-500">2h ago</span>
            </div>
            <p className="mt-0.5 text-[11px] text-gray-600">
              Duration: 12m 34s &middot; 8 pages viewed
            </p>
            <a
              href="#"
              className="mt-1 flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
            >
              <Video className="h-3 w-3" />
              Watch recording
            </a>
          </div>
          <div className="rounded-md border border-gray-100 bg-gray-50/50 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-gray-700">
                Session Recording
              </span>
              <span className="text-[10px] text-gray-500">1d ago</span>
            </div>
            <p className="mt-0.5 text-[11px] text-gray-600">
              Duration: 45m 12s &middot; 23 pages viewed
            </p>
            <a
              href="#"
              className="mt-1 flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
            >
              <Video className="h-3 w-3" />
              Watch recording
            </a>
          </div>
          <a
            href="#"
            className="flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            View in PostHog
          </a>
        </div>
      </CollapsibleSection>

      {/* Footer note */}
      <div className="mt-auto px-4 py-3 border-t border-gray-100">
        <div className="flex items-start gap-1.5 text-[10px] text-gray-400">
          <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
          <span>
            Enrichment data shown here is a stub. Connect Sentry, PostHog, and
            your Postgres DB via environment variables to show real data.
          </span>
        </div>
      </div>
    </aside>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-gray-50 p-2">
      <p className="text-[10px] font-medium text-gray-400">{label}</p>
      <p className="text-xs text-gray-700">{value}</p>
    </div>
  );
}
