"use client";

import { cn, formatRelativeTime } from "@/lib/utils";
import { StatusBadge, PriorityBadge, LanguageBadge } from "./StatusBadge";
import type { Priority, TicketStatus, Category } from "@prisma/client";

export interface TicketListItem {
  id: string;
  subject: string;
  fromEmail: string;
  fromName: string;
  status: TicketStatus;
  priority: Priority;
  category: Category | null;
  language: string | null;
  summary: string | null;
  createdAt: string;
  assignedTo: { id: string; name: string; avatar: string | null } | null;
  _count: { messages: number };
}

interface TicketRowProps {
  ticket: TicketListItem;
  isSelected: boolean;
  onClick: () => void;
}

export function TicketRow({ ticket, isSelected, onClick }: TicketRowProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3 border-b transition-colors",
        "border-[hsl(var(--sidebar-border))]",
        isSelected
          ? "bg-[hsl(var(--sidebar-accent))]"
          : "hover:bg-[hsl(var(--sidebar-muted))]"
      )}
    >
      {/* Row 1: sender + time */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-sm font-medium text-white truncate">
          {ticket.fromName || ticket.fromEmail}
        </span>
        <span className="text-[11px] text-[hsl(var(--sidebar-muted-foreground))] whitespace-nowrap flex-shrink-0">
          {formatRelativeTime(ticket.createdAt)}
        </span>
      </div>

      {/* Row 2: subject */}
      <p className="text-[13px] text-[hsl(var(--sidebar-foreground))] truncate mb-1.5">
        {ticket.subject}
      </p>

      {/* Row 3: summary preview */}
      {ticket.summary && (
        <p className="text-xs text-[hsl(var(--sidebar-muted-foreground))] truncate mb-2">
          {ticket.summary}
        </p>
      )}

      {/* Row 4: badges + assignee */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <StatusBadge status={ticket.status} />
        <PriorityBadge priority={ticket.priority} />
        {ticket.language && <LanguageBadge language={ticket.language} />}
        <span className="ml-auto flex items-center gap-1.5">
          {ticket.assignedTo && (
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[9px] font-bold text-white/70"
              title={ticket.assignedTo.name}
            >
              {ticket.assignedTo.name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)}
            </span>
          )}
          {ticket._count.messages > 1 && (
            <span className="text-[10px] text-[hsl(var(--sidebar-muted-foreground))]">
              {ticket._count.messages} msgs
            </span>
          )}
        </span>
      </div>
    </button>
  );
}
