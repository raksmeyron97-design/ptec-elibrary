"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, ShieldCheck } from "lucide-react";
import { retireDuplicateBook } from "@/app/actions/duplicates";

type UIBook = {
  id: string;
  slug: string;
  title: string;
  isbn: string | null;
  year: number | null;
  author: string | null;
  pages: number | null;
  fileSizeKb: number | null;
  hasHash: boolean;
};

type UIGroup = {
  key: string;
  confidence: "high" | "medium" | "low";
  signals: string[];
  books: UIBook[];
};

const CONFIDENCE_STYLES: Record<UIGroup["confidence"], string> = {
  high: "bg-red-50 text-red-700 border-red-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-slate-50 text-slate-600 border-slate-200",
};

const SIGNAL_LABELS: Record<string, string> = {
  isbn: "same ISBN",
  "content-hash": "identical PDF file",
  "file-size": "same file size",
  title: "same title",
  author: "same author",
  year: "same year",
};

export default function DuplicateGroupsClient({ groups }: { groups: UIGroup[] }) {
  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-divider bg-bg-surface p-12 text-center">
        <ShieldCheck className="h-10 w-10 text-emerald-500" />
        <p className="text-base font-semibold text-text-heading">No probable duplicates found</p>
        <p className="max-w-sm text-sm text-text-muted">
          No published books currently share an ISBN, PDF file, or a matching title with a
          corroborating signal.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <DuplicateGroup key={group.key} group={group} />
      ))}
    </div>
  );
}

function DuplicateGroup({ group }: { group: UIGroup }) {
  const router = useRouter();
  const [canonicalId, setCanonicalId] = useState<string>(group.books[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const retire = (retiredId: string) => {
    setError(null);
    startTransition(async () => {
      const res = await retireDuplicateBook({ retiredId, canonicalId });
      if (res.success) {
        setDone(`Retired /books/${res.redirectFrom} → /books/${res.redirectTo}`);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div className="overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-divider bg-paper px-4 py-3">
        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${CONFIDENCE_STYLES[group.confidence]}`}
        >
          {group.confidence} confidence
        </span>
        <span className="text-sm text-text-muted">
          {group.books.length} records ·{" "}
          {group.signals.map((s) => SIGNAL_LABELS[s] ?? s).join(", ")}
        </span>
      </div>

      <div className="divide-y divide-divider">
        {group.books.map((book) => {
          const isCanonical = book.id === canonicalId;
          return (
            <div
              key={book.id}
              className={`flex flex-wrap items-center gap-3 px-4 py-3 ${isCanonical ? "bg-emerald-50/40" : ""}`}
            >
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`canonical-${group.key}`}
                  checked={isCanonical}
                  onChange={() => setCanonicalId(book.id)}
                  disabled={pending}
                  className="h-4 w-4 accent-emerald-600"
                />
                <span className="sr-only">Keep this record</span>
              </label>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-semibold text-text-heading">{book.title}</p>
                  {isCanonical && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" /> Keep
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-text-muted">
                  /{book.slug}
                  {book.author ? ` · ${book.author}` : ""}
                  {book.year ? ` · ${book.year}` : ""}
                  {book.isbn ? ` · ISBN ${book.isbn}` : ""}
                  {book.fileSizeKb ? ` · ${book.fileSizeKb} KB` : ""}
                  {book.hasHash ? " · hashed" : ""}
                </p>
              </div>

              <Link
                href={`/books/${book.slug}`}
                target="_blank"
                className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
              >
                View <ExternalLink className="h-3 w-3" />
              </Link>

              {!isCanonical && (
                <button
                  type="button"
                  onClick={() => retire(book.id)}
                  disabled={pending}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                >
                  {pending ? "Retiring…" : "Retire → keep selected"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {(error || done) && (
        <div
          className={`border-t border-divider px-4 py-2.5 text-xs font-medium ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}
        >
          {error ?? done}
        </div>
      )}
    </div>
  );
}
