"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Search, Inbox, Loader2, LogOut } from "lucide-react";
import { TicketRow, type TicketListItem } from "@/components/TicketRow";
import { CATEGORY_LABELS } from "@/lib/utils";

type StatusFilter = "" | "OPEN" | "IN_PROGRESS" | "WAITING" | "RESOLVED" | "CLOSED";
type PriorityFilter = "" | "LOW" | "MEDIUM" | "HIGH" | "URGENT";

interface TeamMemberOption {
  id: string;
  name: string;
}

export function TicketSidebar() {
  const router = useRouter();
  const params = useParams();
  const { data: session } = useSession();
  const selectedId = (params?.id as string) ?? null;

  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<TeamMemberOption[]>([]);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");

  // Fetch team members for the assignee filter
  useEffect(() => {
    fetch("/api/team")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setTeamMembers(data))
      .catch(() => setTeamMembers([]));
  }, []);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (priorityFilter) params.set("priority", priorityFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      if (assigneeFilter) params.set("assignedToId", assigneeFilter);

      const res = await fetch(`/api/tickets?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data: TicketListItem[] = await res.json();
      setTickets(data);
    } catch {
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, priorityFilter, categoryFilter, assigneeFilter]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Debounced search
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  function handleTicketClick(ticket: TicketListItem) {
    router.push(`/tickets/${ticket.id}`);
  }

  const openCount = tickets.filter((t) => t.status === "OPEN").length;

  return (
    <aside className="flex h-full w-full flex-col bg-[#0f0f0f]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold text-white">
            Support Tickets
          </h1>
          {!loading && (
            <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white">
              {openCount} open
            </span>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="px-4 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search tickets..."
            className="h-8 w-full rounded-md border border-white/10 bg-white/5 pl-8 pr-3 text-xs text-white placeholder-white/40 outline-none transition-colors focus:border-white/20 focus:ring-1 focus:ring-white/20"
          />
        </div>
      </div>

      {/* Filters row 1 */}
      <div className="flex gap-1.5 px-4 pb-1.5">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="filter-select flex-1 min-w-0"
        >
          <option value="">All Status</option>
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="WAITING">Waiting</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </select>

        <select
          value={priorityFilter}
          onChange={(e) =>
            setPriorityFilter(e.target.value as PriorityFilter)
          }
          className="filter-select flex-1 min-w-0"
        >
          <option value="">All Priority</option>
          <option value="URGENT">Urgent</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
      </div>

      {/* Filters row 2 */}
      <div className="flex gap-1.5 px-4 pb-3">
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="filter-select flex-1 min-w-0"
        >
          <option value="">All Category</option>
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>

        <select
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          className="filter-select flex-1 min-w-0"
        >
          <option value="">All Assignees</option>
          <option value="unassigned">Unassigned</option>
          {teamMembers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {/* Ticket list */}
      <div className="flex-1 overflow-y-auto sidebar-scroll">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-white/40" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-white/40">
            <Inbox className="mb-2 h-8 w-8" />
            <p className="text-sm">No tickets found</p>
          </div>
        ) : (
          tickets.map((ticket) => (
            <TicketRow
              key={ticket.id}
              ticket={ticket}
              isSelected={selectedId === ticket.id}
              onClick={() => handleTicketClick(ticket)}
            />
          ))
        )}
      </div>

      {/* Footer — user info + sign out */}
      <div className="border-t border-[hsl(var(--sidebar-border))] px-4 py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
              {session?.user?.name
                ?.split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)
                .toUpperCase() ?? "?"}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-white truncate">
                {session?.user?.name ?? "Unknown"}
              </p>
              <p className="text-[10px] text-[hsl(var(--sidebar-muted-foreground))] truncate">
                {tickets.length} ticket{tickets.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex h-7 w-7 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/10 hover:text-white"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
