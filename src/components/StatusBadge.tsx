import { cn } from "@/lib/utils";
import {
  PRIORITY_CONFIG,
  STATUS_CONFIG,
  CATEGORY_LABELS,
} from "@/lib/utils";
import type { Priority, TicketStatus, Category } from "@prisma/client";

interface BadgeProps {
  className?: string;
}

export function StatusBadge({
  status,
  className,
}: BadgeProps & { status: TicketStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-tight",
        config.bg,
        config.color,
        className
      )}
    >
      {config.label}
    </span>
  );
}

export function PriorityBadge({
  priority,
  className,
}: BadgeProps & { priority: Priority }) {
  const config = PRIORITY_CONFIG[priority];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-tight",
        config.bg,
        config.color,
        className
      )}
    >
      {config.label}
    </span>
  );
}

export function CategoryBadge({
  category,
  className,
}: BadgeProps & { category: Category }) {
  const label = CATEGORY_LABELS[category];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium leading-tight text-gray-700",
        className
      )}
    >
      {label}
    </span>
  );
}

export function LanguageBadge({
  language,
  className,
}: BadgeProps & { language: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        language === "en"
          ? "bg-slate-100 text-slate-600"
          : "bg-amber-100 text-amber-700",
        className
      )}
    >
      {language}
    </span>
  );
}
