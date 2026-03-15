"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Send,
  Sparkles,
  ChevronDown,
  ChevronUp,
  User,
  UserPlus,
  Headphones,
  Clock,
  AlertTriangle,
  Languages,
} from "lucide-react";
import { cn, formatRelativeTime, getLanguageName } from "@/lib/utils";
import {
  CategoryBadge,
  LanguageBadge,
} from "./StatusBadge";
import { EnrichmentPanel } from "./EnrichmentPanel";
import type { Priority, TicketStatus, Category, Direction } from "@prisma/client";

/* ---------- Types ---------- */

interface Message {
  id: string;
  direction: Direction;
  fromEmail: string;
  fromName: string;
  bodyText: string;
  bodyHtml: string | null;
  sentAt: string;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  role: string;
}

interface Ticket {
  id: string;
  subject: string;
  fromEmail: string;
  fromName: string;
  bodyText: string;
  status: TicketStatus;
  priority: Priority;
  category: Category | null;
  language: string | null;
  summary: string | null;
  aiDraft: string | null;
  createdAt: string;
  updatedAt: string;
  assignedTo: TeamMember | null;
  messages: Message[];
}

/* ---------- Component ---------- */

export function TicketDetail({ ticketId }: { ticketId: string }) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  // Reply composer
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  // AI draft
  const [showAiDraft, setShowAiDraft] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [aiInstructions, setAiInstructions] = useState("");

  // Field editing
  const [updatingField, setUpdatingField] = useState<string | null>(null);

  // Translation
  const [translations, setTranslations] = useState<
    Record<string, string>
  >({});
  const [translating, setTranslating] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);

  const fetchTicket = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tickets/${ticketId}`);
      if (!res.ok) throw new Error("Ticket not found");
      const data: Ticket = await res.json();
      setTicket(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ticket");
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    fetchTicket();
  }, [fetchTicket]);

  // Fetch team members for assignment dropdown
  useEffect(() => {
    fetch("/api/team")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setTeamMembers(data))
      .catch(() => setTeamMembers([]));
  }, []);

  /* ── Actions ── */

  async function handleSendReply() {
    if (!replyText.trim() || !ticket) return;
    setSending(true);
    try {
      const bodyHtml = replyText
        .split("\n")
        .map((line) => `<p>${line || "&nbsp;"}</p>`)
        .join("");

      const res = await fetch(`/api/tickets/${ticket.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bodyHtml }),
      });

      if (!res.ok) throw new Error("Failed to send");
      setReplyText("");
      await fetchTicket();
    } catch (err) {
      console.error("Send failed:", err);
    } finally {
      setSending(false);
    }
  }

  async function handleUseAiDraft() {
    if (ticket?.aiDraft) {
      setReplyText(ticket.aiDraft);
      setShowAiDraft(false);
    }
  }

  async function handleRegenerateDraft() {
    if (!ticket) return;
    setRegenerating(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/ai-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instructions: aiInstructions || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to regenerate");
      const data = await res.json();
      setTicket((prev) => (prev ? { ...prev, aiDraft: data.draft } : prev));
      setAiInstructions("");
    } catch (err) {
      console.error("Regenerate failed:", err);
    } finally {
      setRegenerating(false);
    }
  }

  async function handleTranslate() {
    if (!ticket || translating) return;
    if (Object.keys(translations).length > 0) {
      // Already translated — just toggle visibility
      setShowTranslation(!showTranslation);
      return;
    }
    setTranslating(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetLanguage: "en" }),
      });
      if (!res.ok) throw new Error("Translation failed");
      const data = await res.json();
      const map: Record<string, string> = {};
      for (const t of data.translations) {
        map[t.messageId] = t.translated;
      }
      setTranslations(map);
      setShowTranslation(true);
    } catch (err) {
      console.error("Translation failed:", err);
    } finally {
      setTranslating(false);
    }
  }

  async function handleUpdateField(field: string, value: string | null) {
    if (!ticket) return;
    setUpdatingField(field);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error("Failed to update");
      const updated = await res.json();
      setTicket((prev) =>
        prev
          ? {
              ...prev,
              [field]: updated[field],
              assignedTo: updated.assignedTo ?? null,
            }
          : prev
      );
    } catch (err) {
      console.error("Update failed:", err);
    } finally {
      setUpdatingField(null);
    }
  }

  /* ── Loading / Error ── */

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading ticket...
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-gray-400">
        <AlertTriangle className="mb-2 h-8 w-8 text-red-400" />
        <p className="text-sm">{error || "Ticket not found"}</p>
      </div>
    );
  }

  /* ── Render ── */

  const selectClass =
    "h-7 rounded-md border border-gray-200 bg-white px-2 text-xs font-medium text-gray-700 outline-none hover:border-gray-300 focus:ring-1 focus:ring-blue-500";

  return (
    <div className="flex h-full">
      {/* ── Left: conversation column ── */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header bar */}
        <header className="flex-shrink-0 border-b bg-white px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-gray-900 truncate">
                {ticket.subject}
              </h2>
              <div className="mt-1 flex items-center gap-2 text-sm text-gray-500">
                <span>{ticket.fromName || ticket.fromEmail}</span>
                <span className="text-gray-300">|</span>
                <span>{formatRelativeTime(ticket.createdAt)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex flex-shrink-0 items-center gap-2">
              {ticket.language && (
                <LanguageBadge language={ticket.language} />
              )}

              {/* Translate toggle — only show for non-English tickets */}
              {ticket.language && ticket.language !== "en" && (
                <button
                  onClick={handleTranslate}
                  disabled={translating}
                  className={cn(
                    "flex items-center gap-1 h-7 rounded-md border px-2 text-xs font-medium transition-colors",
                    showTranslation
                      ? "border-blue-300 bg-blue-50 text-blue-700"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  )}
                  title={showTranslation ? "Show original" : "Translate to English"}
                >
                  {translating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Languages className="h-3 w-3" />
                  )}
                  {showTranslation ? "Original" : "Translate"}
                </button>
              )}

              {/* Status */}
              <select
                value={ticket.status}
                onChange={(e) => handleUpdateField("status", e.target.value)}
                disabled={updatingField === "status"}
                className={selectClass}
              >
                <option value="OPEN">Open</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="WAITING">Waiting</option>
                <option value="RESOLVED">Resolved</option>
                <option value="CLOSED">Closed</option>
              </select>

              {/* Priority */}
              <select
                value={ticket.priority}
                onChange={(e) => handleUpdateField("priority", e.target.value)}
                disabled={updatingField === "priority"}
                className={selectClass}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>

              {/* Assignee */}
              <select
                value={ticket.assignedTo?.id ?? ""}
                onChange={(e) =>
                  handleUpdateField(
                    "assignedToId",
                    e.target.value || null
                  )
                }
                disabled={updatingField === "assignedToId"}
                className={selectClass}
              >
                <option value="">Unassigned</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Summary + category row */}
          <div className="mt-3 flex items-start gap-3">
            {ticket.category && (
              <CategoryBadge category={ticket.category} />
            )}
            {ticket.assignedTo && (
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                <UserPlus className="h-3 w-3" />
                {ticket.assignedTo.name}
              </span>
            )}
            {ticket.summary && (
              <p className="text-sm text-gray-600 leading-snug">
                {ticket.summary}
              </p>
            )}
          </div>
        </header>

        {/* Message thread */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {ticket.messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              translation={showTranslation ? translations[msg.id] : undefined}
            />
          ))}
        </div>

        {/* AI Draft panel */}
        {ticket.aiDraft && (
          <div className="flex-shrink-0 border-t bg-blue-50/50">
            <button
              onClick={() => setShowAiDraft(!showAiDraft)}
              className="flex w-full items-center gap-2 px-6 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 transition-colors"
            >
              <Sparkles className="h-4 w-4" />
              AI Suggested Reply
              {showAiDraft ? (
                <ChevronUp className="ml-auto h-4 w-4" />
              ) : (
                <ChevronDown className="ml-auto h-4 w-4" />
              )}
            </button>

            {showAiDraft && (
              <div className="px-6 pb-3">
                <div className="rounded-lg border border-blue-200 bg-white p-3 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {ticket.aiDraft}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={handleUseAiDraft}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
                  >
                    Use this draft
                  </button>
                  <div className="flex flex-1 items-center gap-1.5">
                    <input
                      type="text"
                      value={aiInstructions}
                      onChange={(e) => setAiInstructions(e.target.value)}
                      placeholder="Custom instructions (optional)..."
                      className="h-7 flex-1 rounded-md border border-gray-200 px-2 text-xs outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRegenerateDraft();
                      }}
                    />
                    <button
                      onClick={handleRegenerateDraft}
                      disabled={regenerating}
                      className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      {regenerating ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3" />
                      )}
                      Regenerate
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Reply composer */}
        <div className="flex-shrink-0 border-t bg-white px-6 py-3">
          <div className="flex gap-2">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={`Reply to ${ticket.fromName || ticket.fromEmail}...`}
              rows={3}
              className="flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none transition-colors placeholder:text-gray-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  handleSendReply();
                }
              }}
            />
            <button
              onClick={handleSendReply}
              disabled={!replyText.trim() || sending}
              className="flex h-10 w-10 items-center justify-center self-end rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              title="Send reply (Cmd+Enter)"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-gray-400">
            Cmd+Enter to send
            {ticket.language && ticket.language !== "en" && (
              <>
                {" "}
                &middot; Ticket language:{" "}
                <span className="font-medium">
                  {getLanguageName(ticket.language)}
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* ── Right: enrichment panel ── */}
      <EnrichmentPanel fromEmail={ticket.fromEmail} />
    </div>
  );
}

/* ---------- Message bubble ---------- */

function MessageBubble({
  message,
  translation,
}: {
  message: Message;
  translation?: string;
}) {
  const isInbound = message.direction === "INBOUND";
  const displayText = translation ?? message.bodyText;

  return (
    <div className={cn("flex", isInbound ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-4 py-3",
          isInbound
            ? "bg-white border border-gray-200 rounded-tl-sm"
            : "bg-blue-600 text-white rounded-tr-sm"
        )}
      >
        <div
          className={cn(
            "mb-1 flex items-center gap-2 text-xs",
            isInbound ? "text-gray-500" : "text-blue-100"
          )}
        >
          {isInbound ? (
            <User className="h-3 w-3" />
          ) : (
            <Headphones className="h-3 w-3" />
          )}
          <span className="font-medium">
            {message.fromName || message.fromEmail}
          </span>
          <span className="flex items-center gap-0.5">
            <Clock className="h-2.5 w-2.5" />
            {formatRelativeTime(message.sentAt)}
          </span>
          {translation && isInbound && (
            <span className="flex items-center gap-0.5 text-blue-500">
              <Languages className="h-2.5 w-2.5" />
              translated
            </span>
          )}
        </div>

        <div
          className={cn(
            "text-sm leading-relaxed whitespace-pre-wrap",
            isInbound ? "text-gray-800" : "text-white"
          )}
        >
          {displayText}
        </div>
      </div>
    </div>
  );
}
