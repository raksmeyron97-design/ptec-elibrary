"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Download, Eye, MoreVertical, Pencil, ExternalLink, LinkIcon, Check, Trophy,
} from "lucide-react";
import type { TopBookItem } from "@/lib/admin/dashboard";

const RANK_STYLE = [
  { background: "linear-gradient(135deg,#EDCB55,#DDB022)", color: "#fff" }, // gold
  { background: "#E2E8F0", color: "#475569" },                              // silver
  { background: "#FDE8D3", color: "#B45309" },                              // bronze
] as const;

function RowMenu({ book, onClose }: { book: TopBookItem; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const copyLink = async () => {
    if (!book.publicUrl) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${book.publicUrl}`);
      setCopied(true);
      setTimeout(onClose, 900);
    } catch {
      onClose();
    }
  };

  const itemClass =
    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-text-body cursor-pointer transition-colors hover:bg-bg-app focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand";

  return (
    <div
      ref={ref}
      role="menu"
      className="absolute right-0 top-full z-30 mt-1 w-48 rounded-xl border border-divider bg-bg-surface p-1.5 shadow-xl"
    >
      <Link href={book.editUrl} role="menuitem" className={itemClass} onClick={onClose}>
        <Pencil className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
        Edit book
      </Link>
      {book.publicUrl && (
        <>
          <a
            href={book.publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            className={itemClass}
            onClick={onClose}
          >
            <ExternalLink className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
            Open public page
          </a>
          <button type="button" role="menuitem" className={itemClass} onClick={copyLink}>
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                Copied!
              </>
            ) : (
              <>
                <LinkIcon className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
                Copy link
              </>
            )}
          </button>
        </>
      )}
    </div>
  );
}

function BookRow({ book, index, metricIcon: MetricIcon, accent }: {
  book: TopBookItem;
  index: number;
  metricIcon: typeof Eye;
  accent: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rankStyle = RANK_STYLE[index] ?? {
    background: "rgba(30,58,138,0.08)",
    color: "var(--ptec-brand)",
  };
  const meta = [book.author, book.department].filter(Boolean).join(" · ");

  return (
    <li className="group relative flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-bg-app sm:px-3">
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold shadow-sm"
        style={rankStyle}
        aria-hidden="true"
      >
        {index + 1}
      </span>

      <div className="min-w-0 flex-1">
        {/* Khmer titles need room to breathe: clamp to 2 lines, relaxed leading, full title on hover */}
        <Link
          href={book.editUrl}
          className="line-clamp-2 text-sm font-medium leading-relaxed text-text-body transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          title={book.title}
        >
          {book.title}
        </Link>
        {meta && <p className="truncate text-xs text-text-muted">{meta}</p>}
      </div>

      <span className="flex shrink-0 items-center gap-1 text-sm font-bold tabular-nums" style={{ color: accent }}>
        <MetricIcon className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
        {book.count.toLocaleString("en-US")}
      </span>

      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={`Actions for ${book.title}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-slate-200/60 hover:text-text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <MoreVertical className="h-4 w-4" aria-hidden="true" />
        </button>
        {menuOpen && <RowMenu book={book} onClose={() => setMenuOpen(false)} />}
      </div>
    </li>
  );
}

/**
 * "Top content" card — most viewed / most downloaded books for the selected
 * period, with per-row admin actions (edit, open public page, copy link).
 */
export default function TopBooksList({
  topViewed,
  topDownloaded,
  rangeLabel,
}: {
  topViewed: TopBookItem[];
  topDownloaded: TopBookItem[];
  rangeLabel: string;
}) {
  const [tab, setTab] = useState<"viewed" | "downloaded">("viewed");
  const items = tab === "viewed" ? topViewed : topDownloaded;
  const accent = tab === "viewed" ? "var(--ptec-metric-views-num)" : "var(--ptec-metric-dl-num)";

  return (
    <section
      className="flex flex-col rounded-2xl bg-bg-surface p-5 shadow-sm sm:p-6"
      style={{ border: "1px solid var(--ptec-divider)" }}
      aria-label="Top content"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: "rgba(221,176,34,0.14)" }}
            aria-hidden="true"
          >
            <Trophy className="h-4 w-4" style={{ color: "#B8860B" }} />
          </span>
          <div>
            <h2 className="text-sm font-bold text-text-heading">Top content</h2>
            <p className="text-xs text-text-muted">Most active books · {rangeLabel}</p>
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-xl bg-bg-app p-1" role="group" aria-label="Top content metric">
          {([
            { key: "viewed", label: "Viewed" },
            { key: "downloaded", label: "Downloaded" },
          ] as const).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-pressed={tab === t.key}
              className={`cursor-pointer rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                tab === t.key ? "bg-brand text-white shadow-sm" : "text-text-muted hover:text-text-body"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {items.length > 0 ? (
        <ol className="space-y-0.5">
          {items.map((book, i) => (
            <BookRow
              key={book.id}
              book={book}
              index={i}
              metricIcon={tab === "viewed" ? Eye : Download}
              accent={accent}
            />
          ))}
        </ol>
      ) : (
        <div className="flex flex-1 items-center justify-center py-10">
          <p className="text-sm text-text-muted">
            No {tab === "viewed" ? "views" : "downloads"} yet for this period.
          </p>
        </div>
      )}
    </section>
  );
}
