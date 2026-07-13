"use client";

import { CheckCircle2, AlertTriangle, XCircle, Search } from "lucide-react";
import { scoreBookSeo, type BookSeoFields, type SeoCheckStatus } from "@/lib/admin/book-seo-score";
import { bookMetaDescription } from "@/lib/seo/book-seo";

const STATUS_ICON: Record<SeoCheckStatus, React.ReactNode> = {
  ok: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  warn: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  missing: <XCircle className="h-4 w-4 text-rose-500" />,
};

function ring(percent: number): string {
  if (percent >= 85) return "#0f9d6b";
  if (percent >= 60) return "#d97706";
  return "#dc2626";
}

/**
 * Live SEO/bibliographic completeness panel for the admin editor.
 * Read-only mirror of the current form values — it never blocks saving, so
 * legacy records with gaps stay fully editable.
 */
export default function BookSeoPanel({
  fields,
  slug,
}: {
  fields: BookSeoFields;
  slug: string;
}) {
  const { checks, percent } = scoreBookSeo(fields);
  const previewTitle = fields.title.trim() || "Untitled book";
  const previewDescription = bookMetaDescription(
    {
      slug,
      title: fields.title,
      description: fields.summary,
      language: fields.language,
      authors: fields.author ? [fields.author] : [],
      category: "",
    },
    "en",
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm">
      <div className="flex items-center gap-3.5 border-b border-divider bg-paper/60 px-6 py-4">
        <span className="sec-chip sec-chip--details">
          <Search className="h-[18px] w-[18px]" />
        </span>
        <div className="flex-1">
          <h2 className="text-sm font-bold text-text-heading">SEO &amp; Metadata Quality</h2>
          <p className="text-xs text-text-muted">Factual completeness — never blocks saving</p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-full text-xs font-bold text-white"
            style={{ background: ring(percent) }}
          >
            {percent}%
          </div>
        </div>
      </div>

      <div className="space-y-4 p-6">
        {/* Search-result preview */}
        <div className="rounded-xl border border-divider bg-paper p-3">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Google preview
          </p>
          <p className="truncate text-sm font-medium text-[#1a0dab]">{previewTitle}</p>
          <p className="truncate text-xs text-emerald-700">library.ptec.edu.kh › books › {slug || "…"}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-text-body">{previewDescription}</p>
        </div>

        {/* Checklist */}
        <ul className="space-y-2">
          {checks.map((c) => (
            <li key={c.id} className="flex items-start gap-2.5">
              <span className="mt-0.5 shrink-0">{STATUS_ICON[c.status]}</span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-text-body">
                  {c.label}
                  {!c.weighted && (
                    <span className="ml-1.5 rounded bg-paper px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-text-muted">
                      optional
                    </span>
                  )}
                </p>
                {c.status !== "ok" && <p className="text-[11px] leading-4 text-text-muted">{c.hint}</p>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
