"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, ChevronDown, FileStack, ExternalLink, PenLine } from "lucide-react";
import type { TopContentRow } from "@/lib/admin/intelligence";

type Preset = "top" | "rising" | "viewedNotOpened" | "openedNotDownloaded" | "incomplete";

const PRESETS: Preset[] = ["top", "rising", "viewedNotOpened", "openedNotDownloaded", "incomplete"];
const VISIBLE = 6;

/**
 * Compact content performance list for the Overview.
 *
 * Presets are the questions an administrator actually asks ("what is rising?",
 * "what gets viewed but never opened?"), applied client-side over the rows the
 * server already computed — switching a preset costs no request. The full
 * table with pagination, search and every column lives in the Content view,
 * one link away.
 *
 * Layout is a definition-style list rather than a wide table so it degrades to
 * one column on a phone without horizontal scrolling; secondary metrics move
 * into the expandable detail.
 */
export default function ContentPerformancePanel({
  rows,
  contentHref,
  compare,
}: {
  rows: TopContentRow[];
  contentHref: string;
  compare: boolean;
}) {
  const t = useTranslations("adminDashboard.contentPanel");
  const tTypes = useTranslations("adminDashboard.toolbar");
  const locale = useLocale();
  const nf = useMemo(() => new Intl.NumberFormat(locale === "km" ? "km-KH" : "en-US"), [locale]);
  const [preset, setPreset] = useState<Preset>("top");
  const [openRow, setOpenRow] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const copy = [...rows];
    switch (preset) {
      case "rising":
        return copy
          .filter((r) => r.views > r.prevViews && r.views >= 3)
          .sort((a, b) => b.views - b.prevViews - (a.views - a.prevViews));
      case "viewedNotOpened":
        return copy.filter((r) => r.views >= 5 && r.readerOpens === 0).sort((a, b) => b.views - a.views);
      case "openedNotDownloaded":
        return copy.filter((r) => r.readerOpens >= 3 && r.downloads === 0).sort((a, b) => b.readerOpens - a.readerOpens);
      case "incomplete":
        return copy
          .filter((r) => r.missing.length > 0 || r.fileBroken)
          .sort((a, b) => b.missing.length - a.missing.length || b.views - a.views);
      case "top":
      default:
        return copy.sort((a, b) => b.views - a.views);
    }
  }, [rows, preset]);

  const visible = filtered.slice(0, VISIBLE);

  return (
    <section aria-labelledby="content-perf-heading" className="dash-card flex h-full flex-col p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="dash-ico dash-ico--md dash-ico--views" aria-hidden="true">
            <FileStack className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <h2 id="content-perf-heading" className="text-[14px] font-bold text-text-heading">
              {t("title")}
            </h2>
            <p className="text-[11.5px] text-text-muted">{t("subtitle")}</p>
          </div>
        </div>
        <Link
          href={contentHref}
          className="shrink-0 rounded-lg px-1.5 py-1 text-[11.5px] font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {t("openTable")}
        </Link>
      </div>

      <div className="dash-seg mt-2.5 flex-wrap self-start" role="group" aria-label={t("presetLabel")}>
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={preset === p}
            onClick={() => {
              setPreset(p);
              setOpenRow(null);
            }}
            className="dash-seg-btn text-[11.5px]"
          >
            {t(`preset.${p}`)}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="mt-3 flex flex-1 items-center justify-center rounded-xl bg-paper/60 px-3 py-8 text-center text-[12px] text-text-muted">
          {t(`empty.${preset}`)}
        </p>
      ) : (
        <ul className="mt-2.5 flex-1 divide-y divide-divider/60">
          {visible.map((r) => {
            const key = `${r.type}:${r.id}`;
            const isOpen = openRow === key;
            const delta = r.views - r.prevViews;
            return (
              <li key={key} className="dash-row py-2">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5">
                      <Link
                        href={r.editHref}
                        className="min-w-0 truncate text-[12.5px] font-semibold text-text-heading hover:text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                        title={r.title}
                        dir="auto"
                      >
                        {r.title}
                      </Link>
                      {!r.published && (
                        <span className="shrink-0 rounded bg-slate-100 px-1 py-px text-[9.5px] font-bold uppercase text-slate-700">
                          {t("draft")}
                        </span>
                      )}
                      {r.fileBroken && (
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-rose-50 px-1 py-px text-[9.5px] font-bold uppercase text-rose-700">
                          <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
                          {t("fileBroken")}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-text-muted">
                      <span>{tTypes(`type.${r.type}`)}</span>
                      <span className="tabular-nums">{t("views", { count: nf.format(r.views) })}</span>
                      {compare && delta !== 0 && (
                        <span className={`tabular-nums font-semibold ${delta > 0 ? "text-emerald-700" : "text-rose-700"}`}>
                          {delta > 0 ? "+" : ""}
                          {nf.format(delta)}
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenRow(isOpen ? null : key)}
                    className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-[10px] text-text-muted transition-colors hover:bg-paper hover:text-text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    />
                    <span className="sr-only">{t("rowDetails", { title: r.title })}</span>
                  </button>
                </div>

                {isOpen && (
                  <div className="mt-1.5 rounded-xl bg-paper/60 p-2.5">
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4">
                      {(
                        [
                          ["visitors", nf.format(r.visitors)],
                          ["readerOpens", nf.format(r.readerOpens)],
                          ["downloads", nf.format(r.downloads)],
                          ["engagement", r.engagementPct === null ? "—" : `${r.engagementPct}%`],
                        ] as const
                      ).map(([k, v]) => (
                        <div key={k}>
                          <dt className="text-[10.5px] text-text-muted">{t(`metric.${k}`)}</dt>
                          <dd className="text-[12.5px] font-bold tabular-nums text-text-heading">{v}</dd>
                        </div>
                      ))}
                    </dl>
                    {r.missing.length > 0 && (
                      <p className="mt-1.5 text-[11px] text-text-muted">
                        {t("missingMeta", { fields: r.missing.join(", ") })}
                      </p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Link
                        href={r.editHref}
                        className="flex h-8 items-center gap-1 rounded-lg border border-brand/25 bg-brand/5 px-2 text-[11.5px] font-semibold text-brand transition-colors hover:bg-brand/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
                      >
                        <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
                        {t("edit")}
                      </Link>
                      {r.publicHref && (
                        <a
                          href={r.publicHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-8 items-center gap-1 rounded-lg px-2 text-[11.5px] font-semibold text-text-muted transition-colors hover:bg-paper hover:text-text-heading focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          {t("viewPublic")}
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
