"use client";

// Zero-result action center: librarians resolve failed searches with
// reviewed responses — synonym mappings, curated results, acquisition
// requests, or spam dismissal (migration 0087). Every action is recorded
// per normalized term so the list shows what has already been handled.

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  BookPlus, Check, EyeOff, Link2, Lightbulb, SearchX, Shuffle,
} from "lucide-react";
import {
  actOnSearchTerm,
  addCuratedSearchResult,
  addSearchSynonym,
  createAcquisitionRequest,
  type TermActionKind,
  type ZeroResultEntry,
} from "@/app/actions/search-insights";
import { useToast } from "@/components/admin/kit";

type T = (key: string, values?: Record<string, string | number>) => string;

function timeAgo(iso: string, t: T): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return t("time.today");
  if (days === 1) return t("time.yesterday");
  if (days < 30) return t("time.daysAgo", { count: days });
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: "UTC" });
}

type PanelKind = "synonym" | "curated" | null;

function EntryRow({ entry, onUpdated }: { entry: ZeroResultEntry; onUpdated: (e: ZeroResultEntry) => void }) {
  const t = useTranslations("adminSearchInsights.actionCenter");
  const tRoot = useTranslations("adminSearchInsights");
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<PanelKind>(null);
  const [synonymInput, setSynonymInput] = useState(entry.suggestions[0] ?? "");
  const [curatedUrl, setCuratedUrl] = useState("");
  const [curatedTitle, setCuratedTitle] = useState("");

  async function runAction(fn: () => Promise<{ success: true } | { error: string }>, kind: TermActionKind, note?: string) {
    setBusy(true);
    try {
      const res = await fn();
      if ("error" in res) {
        toast.error(res.error || t("toasts.failed"));
        return;
      }
      setPanel(null);
      toast.success(t(`toasts.${kind === "redirect" ? "reviewed" : kind}`));
      onUpdated({ ...entry, action: { kind, note: note ?? null, actedAt: new Date().toISOString() } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toasts.failed"));
    } finally {
      setBusy(false);
    }
  }

  const chip = "inline-flex items-center gap-1 rounded-lg border border-divider px-2 py-1 text-[11.5px] font-semibold text-text-muted transition hover:border-brand/40 hover:text-brand disabled:opacity-50";

  const metaParts = [
    `${entry.count}×`,
    t("last", { time: timeAgo(entry.lastSearchedAt, tRoot) }),
    entry.language === "km" ? tRoot("language.khmer") : tRoot("language.english"),
  ];
  if (entry.variants.length > 1) metaParts.push(t("spellings", { count: entry.variants.length }));
  if (entry.withFilters) metaParts.push(t("filtersUsed"));

  return (
    <div className="rounded-xl bg-paper px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold text-text-heading" dir="auto">{entry.term}</p>
          <p className="text-[11.5px] text-text-muted">{metaParts.join(" · ")}</p>
          {entry.suggestions.length > 0 && !entry.action && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-[11.5px] text-warning">
              <Lightbulb className="h-3 w-3" aria-hidden="true" /> {t("possibleMatch", { matches: entry.suggestions.join(", ") })}
            </p>
          )}
        </div>

        {entry.action ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-[11.5px] font-semibold text-success">
            <Check className="h-3 w-3" aria-hidden="true" /> {t(`actionLabels.${entry.action.kind}`)}
            {entry.action.note && <span className="max-w-[160px] truncate font-normal">· {entry.action.note}</span>}
          </span>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" disabled={busy} className={chip} onClick={() => setPanel(panel === "synonym" ? null : "synonym")}>
              <Shuffle className="h-3 w-3" aria-hidden="true" /> {t("actions.synonym")}
            </button>
            <button type="button" disabled={busy} className={chip} onClick={() => setPanel(panel === "curated" ? null : "curated")}>
              <Link2 className="h-3 w-3" aria-hidden="true" /> {t("actions.curate")}
            </button>
            <button
              type="button"
              disabled={busy}
              className={chip}
              onClick={() => runAction(() => createAcquisitionRequest(entry.term, entry.normalizedTerm), "acquisition", "Book request created")}
            >
              <BookPlus className="h-3 w-3" aria-hidden="true" /> {t("actions.acquire")}
            </button>
            <button
              type="button"
              disabled={busy}
              className={chip}
              onClick={() => runAction(() => actOnSearchTerm(entry.normalizedTerm, "reviewed"), "reviewed")}
            >
              <Check className="h-3 w-3" aria-hidden="true" /> {t("actions.reviewed")}
            </button>
            <button
              type="button"
              disabled={busy}
              className={chip}
              onClick={() => runAction(() => actOnSearchTerm(entry.normalizedTerm, "ignored", "spam/bot"), "ignored", "spam/bot")}
            >
              <EyeOff className="h-3 w-3" aria-hidden="true" /> {t("actions.spam")}
            </button>
          </div>
        )}
      </div>

      {panel === "synonym" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-divider bg-bg-surface p-2.5">
          <input
            aria-label={t("synonymPanel.aria", { term: entry.term })}
            value={synonymInput}
            onChange={(e) => setSynonymInput(e.target.value)}
            placeholder={t("synonymPanel.placeholder")}
            className="min-w-0 flex-1 rounded-lg border border-divider bg-paper px-2.5 py-1.5 text-[13px]"
          />
          <button
            type="button"
            disabled={busy || !synonymInput.trim()}
            className="rounded-lg bg-brand px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
            onClick={() =>
              runAction(
                () => addSearchSynonym(entry.normalizedTerm, synonymInput.split(",")),
                "synonym",
                `→ ${synonymInput}`,
              )
            }
          >
            {t("synonymPanel.save")}
          </button>
          <p className="w-full text-[11px] text-text-muted">{t("synonymPanel.note", { term: entry.term })}</p>
        </div>
      )}

      {panel === "curated" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-divider bg-bg-surface p-2.5">
          <input
            aria-label={t("curatedPanel.ariaTitle", { term: entry.term })}
            value={curatedTitle}
            onChange={(e) => setCuratedTitle(e.target.value)}
            placeholder={t("curatedPanel.titlePlaceholder")}
            className="min-w-0 flex-1 rounded-lg border border-divider bg-paper px-2.5 py-1.5 text-[13px]"
          />
          <input
            aria-label={t("curatedPanel.ariaUrl", { term: entry.term })}
            value={curatedUrl}
            onChange={(e) => setCuratedUrl(e.target.value)}
            placeholder={t("curatedPanel.urlPlaceholder")}
            className="min-w-0 flex-1 rounded-lg border border-divider bg-paper px-2.5 py-1.5 text-[13px]"
          />
          <button
            type="button"
            disabled={busy || !curatedUrl.trim() || !curatedTitle.trim()}
            className="rounded-lg bg-brand px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
            onClick={() =>
              runAction(
                () =>
                  addCuratedSearchResult(entry.normalizedTerm, {
                    type: curatedUrl.startsWith("/books/") ? "book" : curatedUrl.startsWith("/theses/") ? "thesis" : curatedUrl.startsWith("/publications/") ? "publication" : "page",
                    url: curatedUrl,
                    title: curatedTitle,
                  }),
                "curated",
                `→ ${curatedUrl}`,
              )
            }
          >
            {t("curatedPanel.pin")}
          </button>
        </div>
      )}
    </div>
  );
}

export default function ZeroResultActionCenter({ entries: initial }: { entries: ZeroResultEntry[] }) {
  const t = useTranslations("adminSearchInsights.actionCenter");
  const [entries, setEntries] = useState(initial);
  const [showHandled, setShowHandled] = useState(false);

  const open = entries.filter((e) => !e.action);
  const visible = showHandled ? entries : open;

  function handleUpdated(updated: ZeroResultEntry) {
    setEntries((prev) => prev.map((e) => (e.normalizedTerm === updated.normalizedTerm ? updated : e)));
  }

  return (
    <section className="rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SearchX className="h-4 w-4 text-brand" aria-hidden="true" />
          <h2 className="text-[15px] font-bold text-text-heading">{t("title")}</h2>
          {open.length > 0 && (
            <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-white">
              {t("open", { count: open.length })}
            </span>
          )}
        </div>
        <label className="flex items-center gap-1.5 text-[12px] text-text-muted">
          <input type="checkbox" checked={showHandled} onChange={(e) => setShowHandled(e.target.checked)} />
          {t("showHandled")}
        </label>
      </div>
      <p className="mt-1 text-[12.5px] text-text-muted">{t("description")}</p>

      {visible.length === 0 ? (
        <p className="mt-5 rounded-xl bg-paper px-4 py-6 text-center text-[13px] text-text-muted">
          {entries.length === 0 ? t("emptyNone") : t("emptyHandled")}
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {visible.map((entry) => (
            <EntryRow key={entry.normalizedTerm} entry={entry} onUpdated={handleUpdated} />
          ))}
        </div>
      )}
    </section>
  );
}
