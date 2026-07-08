import Link from "next/link";
import {
  AlertTriangle, BookOpen, FileText, BookPlus, Bell, Library, type LucideIcon,
} from "lucide-react";
import type { AttentionItem, LowStockItem } from "@/lib/admin/dashboard";
import AttentionCard from "./AttentionCard";

const ITEM_ICONS: Record<AttentionItem["key"], LucideIcon> = {
  book_drafts: BookOpen,
  post_drafts: FileText,
  pending_requests: BookPlus,
  subscriptions: Bell,
  low_stock: Library,
};

/**
 * "What needs my attention today?" — sits directly under the KPI row so
 * pending work is never below the fold.
 */
export default function NeedsAttention({
  items,
  lowStock,
}: {
  items: AttentionItem[];
  lowStock: LowStockItem[];
}) {
  const openCount = items.filter((i) => i.status === "warning" || i.status === "danger").length;

  return (
    <section
      className="rounded-2xl bg-bg-surface p-5 shadow-sm sm:p-6"
      style={{ border: "1px solid var(--ptec-divider)" }}
      aria-label="Needs attention"
    >
      <div className="mb-4 flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}
          aria-hidden="true"
        >
          <AlertTriangle className="h-4 w-4 text-amber-500" />
        </span>
        <div>
          <h2 className="text-base font-bold text-text-heading">Needs attention</h2>
          <p className="text-xs text-text-muted">
            {openCount === 0
              ? "Everything is handled — nothing waiting on you."
              : `${openCount} item${openCount === 1 ? "" : "s"} waiting for action`}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {items.map((item) => (
          <AttentionCard
            key={item.key}
            title={item.title}
            count={item.count}
            status={item.status}
            description={item.description}
            href={item.href}
            icon={ITEM_ICONS[item.key]}
          />
        ))}
      </div>

      {lowStock.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Catalog low on copies
          </p>
          <ul className="divide-y divide-slate-100">
            {lowStock.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium leading-relaxed text-text-body" title={c.title}>
                    {c.title}
                  </p>
                  {c.author && <p className="truncate text-xs text-text-muted">{c.author}</p>}
                </div>
                <span
                  className={`shrink-0 rounded-lg px-2.5 py-0.5 text-xs font-bold tabular-nums ${
                    c.copiesAvailable === 0
                      ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {c.copiesAvailable} / {c.copiesTotal} left
                </span>
              </li>
            ))}
          </ul>
          <Link
            href="/admin/catalogs"
            className="mt-2 inline-block text-xs font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Manage catalog →
          </Link>
        </div>
      )}
    </section>
  );
}
