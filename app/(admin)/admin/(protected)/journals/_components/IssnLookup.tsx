"use client";

// "Look up ISSN": asks Crossref and the ISSN Portal (through the lookupJournal
// Server Action — the browser talks to neither) and shows what they hold beside
// what the form holds. Nothing changes until the librarian ticks values and
// presses "Use selected values"; nothing is saved until they save the form.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";

import { lookupJournal } from "@/app/actions/journals";
import { BTN_PRIMARY, BTN_SECONDARY, ButtonBusy } from "@/components/admin/kit/form";
import { changedSuggestionFields, type JournalLookupResult, type JournalSuggestion } from "@/lib/journals/lookup";
import { isValidIssn } from "@/lib/seo/identifiers";

type Key = keyof JournalSuggestion;
export type LookupCurrent = Partial<Record<Key, string | string[] | null>>;

const FIELD_LABEL: Record<Key, string> = {
  title: "fieldTitle",
  publisher_name: "fieldPublisher",
  print_issn: "fieldPrintIssn",
  e_issn: "fieldEIssn",
  issn_l: "fieldIssnL",
  country: "fieldCountry",
  subjects: "fieldSubjects",
};

export default function IssnLookup({
  candidates,
  current,
  onApply,
  disabled,
}: {
  /** The ISSN fields as typed; the first valid one is looked up. */
  candidates: (string | null | undefined)[];
  current: LookupCurrent;
  onApply: (values: JournalSuggestion, source: "crossref" | "issn_portal") => void;
  disabled?: boolean;
}) {
  const t = useTranslations("adminJournals");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<JournalLookupResult | null>(null);
  const [chosen, setChosen] = useState<Set<Key>>(new Set());

  const issn = candidates.find((c) => isValidIssn(c)) ?? null;
  const sourceName = (s: "crossref" | "issn_portal") => (s === "crossref" ? t("sourceCrossref") : t("sourceIssnPortal"));

  async function run() {
    if (!issn) {
      setMessage(t("lookupNeedIssn"));
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await lookupJournal(issn);
    setBusy(false);
    if (!res.ok) {
      setMessage(t(res.error));
      setResult(null);
      return;
    }
    const r = res.data;
    const notes = [
      ...r.unavailable.map((s) => t("lookupUnavailable", { source: sourceName(s) })),
      r.sources.length === 0 && r.unavailable.length < 2 ? t("lookupNothing", { issn: r.issn }) : null,
      r.sources.length > 0 ? t("lookupSources", { sources: r.sources.map(sourceName).join(", ") }) : null,
    ].filter(Boolean);
    setMessage(notes.join(" "));
    setResult(r.sources.length > 0 ? r : null);
    // Pre-tick only what fills an EMPTY field; replacing a value the
    // librarian typed is their decision.
    const changed = changedSuggestionFields(r.suggestion, current);
    setChosen(new Set(changed.filter((k) => !hasValue(current[k]))));
  }

  const changed = result ? changedSuggestionFields(result.suggestion, current) : [];

  function apply() {
    if (!result) return;
    const picked: JournalSuggestion = {};
    for (const k of changed) {
      if (!chosen.has(k)) continue;
      (picked as Record<Key, unknown>)[k] = result.suggestion[k];
    }
    onApply(picked, result.sources.includes("crossref") ? "crossref" : "issn_portal");
    setResult(null);
    setMessage(t("lookupApplied"));
  }

  return (
    <div className="rounded-xl border border-divider bg-paper/50 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={BTN_SECONDARY} onClick={run} disabled={disabled || busy}>
          {busy ? (
            <ButtonBusy label={t("lookupBusy")} />
          ) : (
            <>
              <Search className="h-4 w-4" aria-hidden="true" />
              {t("lookupButton")}
            </>
          )}
        </button>
        <p className="min-w-0 text-xs text-text-muted" aria-live="polite">
          {message ?? (issn ? `ISSN ${issn}` : t("lookupNeedIssn"))}
        </p>
      </div>

      {result && (
        <div className="mt-4">
          <h4 className="text-sm font-semibold text-text-heading">{t("lookupHeading")}</h4>
          {changed.length === 0 ? (
            <p className="mt-1 text-sm text-text-body">{t("lookupSame")}</p>
          ) : (
            <>
              <p className="mt-1 text-xs text-text-muted">{t("lookupIntro")}</p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead className="text-left text-xs text-text-muted">
                    <tr>
                      <th scope="col" className="w-8 py-1.5"><span className="sr-only">{t("lookupApply")}</span></th>
                      <th scope="col" className="py-1.5 pr-3 font-semibold" />
                      <th scope="col" className="py-1.5 pr-3 font-semibold">{t("lookupCurrent")}</th>
                      <th scope="col" className="py-1.5 font-semibold">{t("lookupSuggested")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-divider">
                    {changed.map((k) => {
                      const id = `lookup-${k}`;
                      return (
                        <tr key={k}>
                          <td className="py-2 align-top">
                            <input
                              id={id}
                              type="checkbox"
                              className="focus-field h-4 w-4 rounded border-divider"
                              checked={chosen.has(k)}
                              onChange={(e) =>
                                setChosen((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(k);
                                  else next.delete(k);
                                  return next;
                                })
                              }
                            />
                          </td>
                          <th scope="row" className="py-2 pr-3 text-left align-top font-medium text-text-body">
                            <label htmlFor={id}>{t(FIELD_LABEL[k])}</label>
                          </th>
                          <td className="py-2 pr-3 align-top text-text-muted">{show(current[k]) || t("lookupEmpty")}</td>
                          <td className="py-2 align-top font-medium text-text-heading">{show(result.suggestion[k])}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={BTN_SECONDARY} onClick={() => setResult(null)}>
                  {t("lookupDismiss")}
                </button>
                <button type="button" className={BTN_PRIMARY} onClick={apply} disabled={chosen.size === 0}>
                  {t("lookupApply")}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function hasValue(v: string | string[] | null | undefined) {
  return Array.isArray(v) ? v.length > 0 : !!v?.trim();
}

function show(v: string | string[] | null | undefined) {
  return Array.isArray(v) ? v.join(", ") : (v ?? "");
}
