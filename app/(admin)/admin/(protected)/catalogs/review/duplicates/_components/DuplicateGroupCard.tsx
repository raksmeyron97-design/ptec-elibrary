"use client";
// One possible-duplicate group (docs/CATALOG-REVIEW.md, Slice 6). Shows the
// evidence and the records side by side; the only write is "Keep as separate
// editions" (a waiver per record). Nothing merges — opening a record is how a
// librarian fixes one, and "review later" is simply leaving the group here.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, type BadgeTone } from "@/components/admin/kit";
import { BTN_SECONDARY } from "@/components/admin/kit/form";
import { keepAsSeparateEditions } from "../../actions";

export type DuplicateCardRecord = {
  id: string;
  href: string;
  title: string;
  author: string | null;
  isbn: string | null;
  year: number | null;
  callNumber: string | null;
  languageLabel: string;
  version: number;
  waived: boolean;
};

const TONE: Record<string, BadgeTone> = { high: "danger", medium: "warning", low: "neutral" };

export default function DuplicateGroupCard({
  confidence,
  signals,
  records,
  canReview,
}: {
  confidence: "high" | "medium" | "low";
  signals: string[];
  records: DuplicateCardRecord[];
  canReview: boolean;
}) {
  const t = useTranslations("adminCatalog.review");
  const td = useTranslations("adminDuplicates");
  const router = useRouter();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const open = records.filter((r) => !r.waived);

  function keep() {
    startTransition(async () => {
      let res;
      try {
        res = await keepAsSeparateEditions(records.map((r) => ({ id: r.id, version: r.version })));
      } catch {
        res = { ok: false as const, error: "invalid" as const };
      }
      if (!res.ok) return setMessage({ tone: "error", text: t(`error.${res.error === "disabled" ? "disabled" : "invalid"}`) });
      setMessage({ tone: res.refused.length ? "error" : "ok", text: t("keptSeparate", { done: res.done, refused: res.refused.length }) });
      router.refresh();
    });
  }

  return (
    <li className="rounded-xl border border-divider bg-bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={TONE[confidence]}>{td(`confidence.${confidence}`)}</Badge>
        {signals.map((s) => (
          <span key={s} className="rounded-full border border-divider px-2 py-0.5 text-[11px] text-text-body">
            {td(`signals.${s}`)}
          </span>
        ))}
        {confidence === "low" && <span className="text-[11px] text-text-muted">{t("weakSignal")}</span>}
      </div>
      <ul className="mt-3 grid gap-2 md:grid-cols-2">
        {records.map((r) => (
          <li key={r.id} className="rounded-lg border border-divider bg-paper/40 p-3 text-sm">
            <Link href={r.href} className="font-semibold text-text-heading hover:text-brand">
              {r.title}
            </Link>
            <p className="text-xs text-text-muted">{[r.author, r.year, r.isbn].filter(Boolean).join(" · ") || "—"}</p>
            <p className="text-xs text-text-muted">
              <span className="font-mono">{r.callNumber || "—"}</span> · {r.languageLabel}
              {r.waived && <span className="ml-1 font-semibold text-success-text">· {t("separateEdition")}</span>}
            </p>
          </li>
        ))}
      </ul>
      {canReview && confidence !== "low" && open.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" disabled={pending} onClick={keep} className={BTN_SECONDARY}>
            {t("keepSeparate")}
          </button>
          <span className="text-xs text-text-muted">{t("reviewLaterHint")}</span>
        </div>
      )}
      <div role="status" aria-live="polite">
        {message && <p className={`mt-2 text-sm ${message.tone === "error" ? "text-danger-text" : "text-success-text"}`}>{message.text}</p>}
      </div>
    </li>
  );
}
