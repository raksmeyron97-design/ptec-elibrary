"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, X, ClipboardCheck, BookOpen, GraduationCap, Pencil } from "lucide-react";
import { approveContent, rejectContent } from "@/app/actions/review";
import type { ReviewItem, ReviewStatus } from "@/app/actions/review";

const STATUS_STYLES: Record<ReviewStatus, string> = {
  pending_review: "bg-yellow-100 text-yellow-800",
  rejected: "bg-red-100 text-red-800",
};

const STATUS_LABEL: Record<ReviewStatus, string> = {
  pending_review: "Pending review",
  rejected: "Rejected",
};

function ItemRow({
  item,
  onDone,
}: {
  item: ReviewItem;
  onDone: (id: string, status: ReviewStatus | "published") => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const TypeIcon = item.type === "book" ? BookOpen : GraduationCap;

  async function act(action: "approve" | "reject") {
    setBusy(true);
    setError(null);
    const res =
      action === "approve"
        ? await approveContent(item.type, item.id)
        : await rejectContent(item.type, item.id);
    if ("error" in res) {
      setError(res.error);
      setBusy(false);
      return;
    }
    onDone(item.id, action === "approve" ? "published" : "rejected");
  }

  return (
    <div className="rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-start gap-3">
        {item.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.coverUrl}
            alt=""
            className="h-16 w-12 shrink-0 rounded-lg border border-divider object-cover"
          />
        ) : (
          <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded-lg border border-divider bg-paper">
            <TypeIcon className="h-5 w-5 text-text-muted/50" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${STATUS_STYLES[item.status]}`}>
              {STATUS_LABEL[item.status]}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-text-muted">
              <TypeIcon className="h-3.5 w-3.5" />
              {item.type === "book" ? "E-Book" : "Thesis"}
            </span>
            <span className="text-[11px] text-text-muted">
              {new Date(item.createdAt).toLocaleDateString()}
            </span>
          </div>
          <h3 className="mt-1.5 text-[15px] font-bold leading-snug text-text-heading">{item.title}</h3>
          <p className="text-[13px] text-text-muted">by {item.author}</p>
          {error && <p className="mt-1 text-[12px] font-medium text-red-600">{error}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={item.editUrl}
            className="inline-flex items-center gap-1.5 rounded-lg border border-divider px-3 py-1.5 text-[12px] font-semibold text-text-muted transition hover:border-brand/40 hover:text-brand"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Link>
          <button
            type="button"
            onClick={() => act("approve")}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-green-700 disabled:opacity-60"
          >
            <Check className="h-3.5 w-3.5" /> Approve &amp; publish
          </button>
          {item.status !== "rejected" && (
            <button
              type="button"
              onClick={() => act("reject")}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
            >
              <X className="h-3.5 w-3.5" /> Reject
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const FILTERS: { label: string; value: ReviewStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending_review" },
  { label: "Rejected", value: "rejected" },
];

export default function ReviewQueueClient({ items: initial }: { items: ReviewItem[] }) {
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<ReviewStatus | "all">("all");

  function handleDone(id: string, status: ReviewStatus | "published") {
    if (status === "published") {
      setItems((prev) => prev.filter((i) => i.id !== id));
    } else {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    }
  }

  const visible = filter === "all" ? items : items.filter((i) => i.status === filter);

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-4 py-1.5 text-[12.5px] font-semibold transition-all ${
              filter === f.value
                ? "bg-brand text-white shadow-sm"
                : "border border-divider bg-paper text-text-muted hover:border-brand/40 hover:text-text-body"
            }`}
          >
            {f.label}
            {f.value !== "all" && (
              <span className="ml-1.5 text-[11px] opacity-70">
                ({items.filter((i) => i.status === f.value).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-divider bg-bg-surface py-16 text-center">
          <ClipboardCheck className="mx-auto mb-3 h-10 w-10 text-text-muted/40" />
          <p className="text-[14px] font-semibold text-text-muted">Nothing waiting for review</p>
          <p className="mt-1 text-[12.5px] text-text-muted">
            Uploads submitted for review will appear here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((item) => (
            <ItemRow key={`${item.type}-${item.id}`} item={item} onDone={handleDone} />
          ))}
        </div>
      )}
    </div>
  );
}
