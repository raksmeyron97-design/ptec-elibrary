"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  BookPlus, Check, EyeOff, Link2, Lightbulb, Loader2, MoreHorizontal, Shuffle, X,
} from "lucide-react";
import {
  actOnSearchTerm,
  addCuratedSearchResult,
  addSearchSynonym,
  createAcquisitionRequest,
  type TermActionKind,
  type ZeroResultEntry,
} from "@/app/actions/search-insights";
import { StatusBadge, useToast, type StatusTone } from "@/components/admin/kit";

/**
 * Status never travels on colour alone: every badge carries its label, and
 * "needs review" is deliberately the neutral tone rather than a warning —
 * an unreviewed term is a queue item, not an error.
 */
const STATUS_TONE: Record<TermActionKind | "needsReview", StatusTone> = {
  needsReview: "neutral",
  reviewed: "success",
  curated: "success",
  acquisition: "info",
  synonym: "info",
  redirect: "info",
  ignored: "neutral",
};

type PanelKind = "synonym" | "curated" | null;

/**
 * Module scope, not a component-body closure: `Date.now()` inside a function
 * defined and called within render is flagged as impure by the purity lint
 * (see `ThisAutosaveStatus`/`StickyActionBar` for the `useSyncExternalStore`
 * variant used where a value must tick on its own). Here the value only needs
 * to be correct for this render, matching `timeAgo()` in `CommentsSection.tsx`.
 */
function lastSearchedLabel(iso: string, relative: Intl.RelativeTimeFormat): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return "—";
  return relative.format(Math.round((parsed - Date.now()) / 86_400_000), "day");
}

function useDismiss(onDismiss: () => void, active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    const onPointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onDismiss();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [active, onDismiss]);
  return ref;
}

function Row({
  entry,
  onUpdated,
  columns,
}: {
  entry: ZeroResultEntry;
  onUpdated: (entry: ZeroResultEntry) => void;
  columns: number;
}) {
  const t = useTranslations("adminSearchInsights.zero");
  const locale = useLocale();
  const toast = useToast();
  const menuId = useId();
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<PanelKind>(null);
  const [synonymInput, setSynonymInput] = useState(entry.suggestions[0] ?? "");
  const [curatedUrl, setCuratedUrl] = useState("");
  const [curatedTitle, setCuratedTitle] = useState("");
  const menuRef = useDismiss(() => setMenuOpen(false), menuOpen);

  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const lastSearched = lastSearchedLabel(entry.lastSearchedAt, relative);

  async function run(
    fn: () => Promise<{ success: true } | { error: string }>,
    kind: TermActionKind,
    note?: string,
  ) {
    setBusy(true);
    setMenuOpen(false);
    try {
      const result = await fn();
      if ("error" in result) {
        toast.error(result.error || t("toasts.failed"));
        return;
      }
      setPanel(null);
      toast.success(t(`toasts.${kind === "redirect" ? "reviewed" : kind}`));
      onUpdated({ ...entry, action: { kind, note: note ?? null, actedAt: new Date().toISOString() } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("toasts.failed"));
    } finally {
      setBusy(false);
    }
  }

  const menuItem =
    "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-start text-[12.5px] font-medium text-text-body transition hover:bg-paper disabled:opacity-50";
  const statusKey = entry.action?.kind ?? "needsReview";

  return (
    <>
      <tr className="border-t border-divider align-top transition hover:bg-paper/50">
        <td className="px-4 py-2.5">
          <p className="max-w-[280px] truncate text-[13px] font-semibold text-text-heading" dir="auto" title={entry.term}>
            {entry.term}
          </p>
          {entry.variants.length > 1 && (
            <p className="text-[10.5px] text-text-muted">{t("spellings", { count: entry.variants.length })}</p>
          )}
          {entry.withFilters && (
            <p className="text-[10.5px] text-text-muted">{t("filtersUsed")}</p>
          )}
        </td>
        <td className="px-4 py-2.5 text-end text-[13px] font-bold tabular-nums text-text-heading">{entry.count}</td>
        <td className="whitespace-nowrap px-4 py-2.5 text-[12px] text-text-muted">{lastSearched}</td>
        <td className="px-4 py-2.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{entry.language}</span>
        </td>
        <td className="px-4 py-2.5">
          {entry.suggestions.length > 0 ? (
            <span className="inline-flex max-w-[220px] items-center gap-1 text-[11.5px] text-warning-text" title={entry.suggestions.join(", ")}>
              <Lightbulb className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate" dir="auto">{entry.suggestions.join(", ")}</span>
            </span>
          ) : (
            <span className="text-[11.5px] text-text-muted">—</span>
          )}
        </td>
        <td className="px-4 py-2.5">
          <StatusBadge tone={STATUS_TONE[statusKey]}>
            {entry.action ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
            {t(`status.${statusKey === "redirect" ? "reviewed" : statusKey}`)}
          </StatusBadge>
          {entry.action?.note && (
            <p className="mt-0.5 max-w-[180px] truncate text-[10.5px] text-text-muted" title={entry.action.note}>
              {entry.action.note}
            </p>
          )}
        </td>
        <td className="px-4 py-2.5">
          <div className="flex items-center justify-end gap-1">
            {!entry.action && (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => actOnSearchTerm(entry.normalizedTerm, "reviewed"), "reviewed")}
                className="inline-flex items-center gap-1 rounded-lg border border-divider px-2.5 py-1.5 text-[11.5px] font-semibold text-text-body transition hover:border-brand/40 hover:text-brand disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
                {t("actions.review")}
              </button>
            )}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                disabled={busy}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-controls={menuOpen ? menuId : undefined}
                aria-label={t("actions.more", { term: entry.term })}
                onClick={() => setMenuOpen((open) => !open)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition hover:bg-paper hover:text-brand disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </button>
              {menuOpen && (
                <div id={menuId} role="menu" aria-label={t("actions.menuLabel")} className="dash-popover absolute end-0 top-full z-30 mt-1 w-52 p-1.5">
                  <button type="button" role="menuitem" className={menuItem} onClick={() => { setPanel("synonym"); setMenuOpen(false); }}>
                    <Shuffle className="h-3.5 w-3.5" aria-hidden="true" /> {t("actions.synonym")}
                  </button>
                  <button type="button" role="menuitem" className={menuItem} onClick={() => { setPanel("curated"); setMenuOpen(false); }}>
                    <Link2 className="h-3.5 w-3.5" aria-hidden="true" /> {t("actions.curate")}
                  </button>
                  <button
                    type="button" role="menuitem" className={menuItem} disabled={busy}
                    onClick={() => run(() => createAcquisitionRequest(entry.term, entry.normalizedTerm), "acquisition", "Book request created")}
                  >
                    <BookPlus className="h-3.5 w-3.5" aria-hidden="true" /> {t("actions.acquire")}
                  </button>
                  <button
                    type="button" role="menuitem" className={menuItem} disabled={busy}
                    onClick={() => run(() => actOnSearchTerm(entry.normalizedTerm, "reviewed"), "reviewed")}
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" /> {t("actions.reviewed")}
                  </button>
                  <button
                    type="button" role="menuitem" className={menuItem} disabled={busy}
                    onClick={() => run(() => actOnSearchTerm(entry.normalizedTerm, "ignored", "spam/bot"), "ignored", "spam/bot")}
                  >
                    <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> {t("actions.spam")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </td>
      </tr>

      {/* Inline expansion, not a modal: the row stays in place and the table
          does not jump under the reader's cursor. */}
      {panel && (
        <tr className="border-t border-divider bg-paper/60">
          <td colSpan={columns} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              {panel === "synonym" ? (
                <>
                  <input
                    aria-label={t("synonymPanel.aria", { term: entry.term })}
                    value={synonymInput}
                    onChange={(event) => setSynonymInput(event.target.value)}
                    placeholder={t("synonymPanel.placeholder")}
                    dir="auto"
                    className="h-9 min-w-0 flex-1 rounded-lg border border-divider bg-bg-surface px-2.5 text-[12.5px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  />
                  <button
                    type="button"
                    disabled={busy || !synonymInput.trim()}
                    onClick={() => run(
                      () => addSearchSynonym(entry.normalizedTerm, synonymInput.split(",")),
                      "synonym",
                      `→ ${synonymInput}`,
                    )}
                    className="h-9 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    {t("synonymPanel.save")}
                  </button>
                  <p className="w-full text-[11px] text-text-muted">{t("synonymPanel.note", { term: entry.term })}</p>
                </>
              ) : (
                <>
                  <input
                    aria-label={t("curatedPanel.ariaTitle", { term: entry.term })}
                    value={curatedTitle}
                    onChange={(event) => setCuratedTitle(event.target.value)}
                    placeholder={t("curatedPanel.titlePlaceholder")}
                    dir="auto"
                    className="h-9 min-w-0 flex-1 rounded-lg border border-divider bg-bg-surface px-2.5 text-[12.5px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  />
                  <input
                    aria-label={t("curatedPanel.ariaUrl", { term: entry.term })}
                    value={curatedUrl}
                    onChange={(event) => setCuratedUrl(event.target.value)}
                    placeholder={t("curatedPanel.urlPlaceholder")}
                    className="h-9 min-w-0 flex-1 rounded-lg border border-divider bg-bg-surface px-2.5 text-[12.5px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  />
                  <button
                    type="button"
                    disabled={busy || !curatedUrl.trim() || !curatedTitle.trim()}
                    onClick={() => run(
                      () => addCuratedSearchResult(entry.normalizedTerm, {
                        type: curatedUrl.startsWith("/books/") ? "book"
                          : curatedUrl.startsWith("/theses/") ? "thesis"
                          : curatedUrl.startsWith("/publications/") ? "publication"
                          : "page",
                        url: curatedUrl,
                        title: curatedTitle,
                      }),
                      "curated",
                      `→ ${curatedUrl}`,
                    )}
                    className="h-9 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    {t("curatedPanel.pin")}
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setPanel(null)}
                aria-label={t("closePanel")}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition hover:bg-bg-surface hover:text-text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

const COLUMNS = ["query", "searches", "lastSearched", "language", "suggested", "status", "actions"] as const;

export default function ZeroResultTable({ entries: initial }: { entries: ZeroResultEntry[] }) {
  const t = useTranslations("adminSearchInsights.zero");
  const [entries, setEntries] = useState(initial);

  // The page is server-rendered per URL, so a new page/filter must replace
  // the optimistic local copy rather than leave the previous page on screen.
  // Adjusted during render, not in an effect — see the `prevAq` note in
  // `ActivityFilters.tsx`.
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setEntries(initial);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-left">
        <caption className="sr-only">{t("caption")}</caption>
        <thead className="sticky top-0 z-10 bg-paper">
          <tr className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
            {COLUMNS.map((column) => (
              <th
                key={column}
                scope="col"
                className={`px-4 py-2.5 ${column === "searches" ? "text-end" : ""} ${column === "actions" ? "text-end" : ""}`}
              >
                {column === "actions" ? <span className="sr-only">{t("col.actions")}</span> : t(`col.${column}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <Row
              key={entry.normalizedTerm}
              entry={entry}
              columns={COLUMNS.length}
              onUpdated={(updated) =>
                setEntries((previous) =>
                  previous.map((item) => (item.normalizedTerm === updated.normalizedTerm ? updated : item)),
                )
              }
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
