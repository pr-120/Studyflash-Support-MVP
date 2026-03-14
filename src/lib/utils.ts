import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Priority, TicketStatus, Category } from "@prisma/client";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const PRIORITY_CONFIG: Record<
  Priority,
  { label: string; color: string; bg: string }
> = {
  URGENT: { label: "Urgent", color: "text-red-700", bg: "bg-red-100" },
  HIGH: { label: "High", color: "text-orange-700", bg: "bg-orange-100" },
  MEDIUM: { label: "Medium", color: "text-yellow-700", bg: "bg-yellow-100" },
  LOW: { label: "Low", color: "text-green-700", bg: "bg-green-100" },
};

export const STATUS_CONFIG: Record<
  TicketStatus,
  { label: string; color: string; bg: string }
> = {
  OPEN: { label: "Open", color: "text-blue-700", bg: "bg-blue-100" },
  IN_PROGRESS: { label: "In Progress", color: "text-purple-700", bg: "bg-purple-100" },
  WAITING: { label: "Waiting", color: "text-yellow-700", bg: "bg-yellow-100" },
  RESOLVED: { label: "Resolved", color: "text-green-700", bg: "bg-green-100" },
  CLOSED: { label: "Closed", color: "text-gray-700", bg: "bg-gray-100" },
};

export const CATEGORY_LABELS: Record<Category, string> = {
  BUG_REPORT: "Bug Report",
  REFUND_REQUEST: "Refund Request",
  ACCOUNT_ISSUE: "Account Issue",
  FEATURE_REQUEST: "Feature Request",
  BILLING: "Billing",
  CONTENT_QUESTION: "Content Question",
  TECHNICAL_SUPPORT: "Technical Support",
  OTHER: "Other",
};

export const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  de: "German",
  fr: "French",
  it: "Italian",
  es: "Spanish",
  pt: "Portuguese",
  nl: "Dutch",
  pl: "Polish",
  cs: "Czech",
  sk: "Slovak",
  hu: "Hungarian",
  ro: "Romanian",
  tr: "Turkish",
  ar: "Arabic",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
};

export function getLanguageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code.toUpperCase();
}

export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
