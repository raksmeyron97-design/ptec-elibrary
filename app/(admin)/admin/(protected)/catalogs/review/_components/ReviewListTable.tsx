"use client";
// The review queue's list, with selection for the two bulk actions a
// selection can safely carry — take and give back — and the CSV export
// (docs/CATALOG-REVIEW.md, Slice 3). The rows are computed on the server; this
// component only selects, presses and reports.
//
// A bulk press names its queue, and the server refuses any record that is not
// in it, so a selection can never reach across languages. There is no bulk
// verify: verifying means checking the book in hand.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Download, Lock, Unlock } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/admin/kit";
import { BTN_SECONDARY } from "@/components/admin/kit/form";
import type { ReviewQueue, ReviewStatus } from "@/lib/catalogs/review";
import { bulkCatalogReview, exportReviewQueue } from "../actions";

export type ReviewListRow = {
  id: string;
  href: string;
  title: string;
  author: string | null;
  callNumber: string | null;
  isActive: boolean;
  status: ReviewStatus;
  version: number;
  staleClaim: boolean;
  who: string;
  openTasks: number;
  blockingTasks: number;
};

const STATUS_TONE: Record<ReviewStatus, BadgeTone> = {
  needs_review: "warning",
  in_review: "info",
  verified: "success",
  blocked: "danger",
};

export default function ReviewListTable({
  rows,
  queue,
  queueLabel,
  canReview,
  queryString,
}: {
  rows: ReviewListRow[];
  queue: ReviewQueue;
  queueLabel: string;
  canReview: boolean;
  queryString: string;
}) {
  const t = useTranslations("adminCatalog.review");
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // A refreshed page may no longer hold a row that was selected.
  const visible = new Set(rows.map((r) => r.id));
  const chosen = [...selected].filter((id) => visible.has(id));
  const allChosen = rows.length > 0 && chosen.length === rows.length;

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function bulk(action: "claim" | "release") {
    const items = rows.filter((r) => chosen.includes(r.id)).map((r) => ({ id: r.id, version: r.version }));
    startTransition(async () => {
      let result;
      try {
        result = await bulkCatalogReview(action, queue, items);
      } catch {
        result = { ok: false as const, error: "invalid" as const };
      }
      if (!result.ok) {
        setMessage({ tone: "error", text: t(`error.${result.error === "disabled" ? "disabled" : "invalid"}`) });
        return;
      }
      setSelected(new Set());
      setMessage({
        tone: result.refused.length ? "error" : "ok",
        text: t(action === "claim" ? "bulkTaken" : "bulkGivenBack", { done: result.done, refused: result.refused.length }),
      });
      router.refresh();
    });
  }

  function exportCsv() {
    startTransition(async () => {
      let result;
      try {
        result = await exportReviewQueue(queryString);
      } catch {
        result = { ok: false as const, error: "failed" as const };
      }
      if (!result.ok) {
        setMessage({ tone: "error", text: t("exportFailed") });
        return;
      }
      const url = URL.createObjectURL(new Blob([result.csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({ tone: "ok", text: t("exported") });
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {canReview && (
          <>
            <span className="text-sm text-text-muted" aria-live="polite">
              {t("selectedCount", { count: chosen.length })}
            </span>
            <button type="button" disabled={pending || chosen.length === 0} onClick={() => bulk("claim")} className={BTN_SECONDARY}>
              <Lock className="h-4 w-4" aria-hidden="true" />
              {t("bulkTake")}
            </button>
            <button type="button" disabled={pending || chosen.length === 0} onClick={() => bulk("release")} className={BTN_SECONDARY}>
              <Unlock className="h-4 w-4" aria-hidden="true" />
              {t("bulkGiveBack")}
            </button>
          </>
        )}
        <button type="button" disabled={pending} onClick={exportCsv} className={`${BTN_SECONDARY} ml-auto`}>
          <Download className="h-4 w-4" aria-hidden="true" />
          {t("exportCsv")}
        </button>
      </div>
      <div role="status" aria-live="polite">
        {message && <p className={`text-sm ${message.tone === "error" ? "text-danger-text" : "text-success-text"}`}>{message.text}</p>}
      </div>

      <div className="overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{queueLabel}</caption>
            <thead>
              <tr className="border-b border-divider bg-paper/60 text-left">
                {canReview && (
                  <th scope="col" className="w-14 px-2 py-1">
                    {/* A 40px target around a 20px box: the whole cell selects. */}
                    <label className="inline-flex h-10 w-10 cursor-pointer items-center justify-center">
                      <input
                        type="checkbox"
                        checked={allChosen}
                        onChange={() => setSelected(allChosen ? new Set() : new Set(rows.map((r) => r.id)))}
                        aria-label={t("selectAll")}
                        className="h-5 w-5"
                      />
                    </label>
                  </th>
                )}
                <th scope="col" className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-text-muted">{t("colCallNumber")}</th>
                <th scope="col" className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-text-muted">{t("colBook")}</th>
                <th scope="col" className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-text-muted">{t("colTasks")}</th>
                <th scope="col" className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-text-muted">{t("colStatus")}</th>
                <th scope="col" className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-text-muted">{t("colWho")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {rows.map((row) => (
                <tr key={row.id} className={chosen.includes(row.id) ? "bg-admin-accent/5" : "hover:bg-paper/50"}>
                  {canReview && (
                    <td className="px-2 py-1">
                      <label className="inline-flex h-10 w-10 cursor-pointer items-center justify-center">
                        <input
                          type="checkbox"
                          checked={chosen.includes(row.id)}
                          onChange={() => toggle(row.id)}
                          aria-label={t("selectRow", { title: row.title })}
                          className="h-5 w-5"
                        />
                      </label>
                    </td>
                  )}
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-text-body">{row.callNumber || "—"}</td>
                  <td className="max-w-[360px] px-4 py-3">
                    {canReview ? (
                      <Link href={row.href} className="font-semibold text-text-heading hover:text-brand">
                        {row.title}
                      </Link>
                    ) : (
                      <span className="font-semibold text-text-heading">{row.title}</span>
                    )}
                    {row.author && <p className="truncate text-xs text-text-muted">{row.author}</p>}
                    {!row.isActive && <p className="text-[11px] font-semibold text-text-muted">{t("unlisted")}</p>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">
                    {row.openTasks ? (
                      <span className="text-text-body">
                        {t("needsTasks", { count: row.openTasks })}
                        {row.blockingTasks > 0 && (
                          <span className="ml-1 font-semibold text-danger-text">· {t("blockingCount", { count: row.blockingTasks })}</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-success-text">{t("noOpenTasks")}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Badge tone={STATUS_TONE[row.status]}>{t(`status.${row.status}`)}</Badge>
                    {row.staleClaim && <span className="ml-2 text-[11px] text-text-muted">{t("staleClaim")}</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-text-body">{row.who}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
