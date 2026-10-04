"use client";
// "Fetch by ISBN" on the edit form: ask Open Library and Google Books about
// the ISBN in the field and fill what this record is MISSING. It saves
// nothing — values land in the form, and the ordinary Save (and, for a record
// Koha owns, the ordinary Koha write) decides what happens to them.
//
// The rules live in lib/isbn/enrich.ts: empty fields are filled, different
// values are only offered, and nothing is filled while the found title
// disagrees with this record's.

import { useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle, DownloadCloud } from "lucide-react";
import { ButtonBusy, BTN_PRIMARY, BTN_SECONDARY } from "@/components/admin/kit/form";
import { useToast } from "@/components/admin/kit";
import { lookupCatalogIsbn, type IsbnLookupResponse } from "../../../isbn-actions";
import { parseIsbnInput } from "@/lib/isbn/identity";
import {
  mergeIsbnCandidates,
  planIsbnFill,
  titlesLookAlike,
  type CurrentRecord,
  type EnrichField,
  type EnrichPlan,
  type FillValue,
} from "@/lib/isbn/enrich";
import type { IsbnCandidate, IsbnProvider, ProviderOutcome } from "@/lib/isbn/types";

type Ok = Extract<IsbnLookupResponse, { status: "ok" }>;
type Conflict = EnrichPlan["conflicts"][number];
/** One decision at a time: a found book with another title, or values that differ from the record's. */
type Review =
  | { kind: "mismatch"; candidates: IsbnCandidate[]; title: string; provider: IsbnProvider }
  | { kind: "conflicts"; items: Conflict[]; sources: EnrichPlan["sources"]; chosen: Set<Conflict["field"]> };

export default function FetchByIsbn({
  bookId,
  isbn,
  recordTitle,
  readCurrent,
  onApply,
  disabled,
  field,
}: {
  bookId: string;
  /** The ISBN field's live value. */
  isbn: string;
  /** The title field's live value — what found records are checked against. */
  recordTitle: string;
  /** This record's values as they stand in the form right now. */
  readCurrent: () => CurrentRecord;
  onApply: (values: Partial<Record<EnrichField, FillValue>>) => void;
  disabled?: boolean;
  /** The ISBN <Field>, laid out beside the button. */
  field: React.ReactNode;
}) {
  const t = useTranslations("adminCatalog.isbnFetch");
  const ti = useTranslations("adminCatalog.isbn");
  const tf = useTranslations("adminCatalog.form");
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  // What the last lookup said: each source's outcome, and other records with this ISBN.
  const [answer, setAnswer] = useState<{ outcomes: ProviderOutcome[]; duplicates: Ok["local"] } | null>(null);
  const [review, setReview] = useState<Review | null>(null);

  const parsed = parseIsbnInput(isbn);
  const fieldLabel = (f: EnrichField) => t(`field.${f}`);
  const providerList = (ps: (IsbnProvider | undefined)[]) =>
    [...new Set(ps.filter((p): p is IsbnProvider => !!p))].map((p) => ti(`provider.${p}`)).join(", ");

  function fill(candidates: IsbnCandidate[]) {
    setReview(null);
    const merged = mergeIsbnCandidates(candidates);
    if (!merged) return;
    const plan = planIsbnFill(readCurrent(), merged);
    const filled = Object.keys(plan.fill) as EnrichField[];
    if (filled.length) onApply(plan.fill);
    if (plan.conflicts.length) {
      const chosen = new Set<Conflict["field"]>();
      for (const c of plan.conflicts) if (c.suggested) chosen.add(c.field);
      setReview({ kind: "conflicts", items: plan.conflicts, sources: plan.sources, chosen });
    }

    if (filled.length) {
      const onMedia = filled.some((f) => f === "keywords" || f === "cover");
      toast.success(
        t("fetchSuccess", { fields: filled.map(fieldLabel).join(", "), sources: providerList(filled.map((f) => plan.sources[f])) }) +
          (onMedia ? ` ${t("onMediaTab")}` : ""),
      );
    } else if (!plan.conflicts.length) {
      toast.info(t("nothingToFill", { sources: providerList(candidates.map((c) => c.provider)) }));
    }
  }

  async function run() {
    if (inFlight.current || !parsed.ok) return;
    inFlight.current = true;
    setBusy(true);
    setAnswer(null);
    setReview(null);
    try {
      // This record may already carry the ISBN — that is not a reason to stop.
      const res = await lookupCatalogIsbn(isbn, { lookUpEvenIfCatalogued: true });
      if (res.status === "invalid") return void toast.error(ti(`err.${res.reason}`));
      if (res.status === "rate_limited") return void toast.error(ti("err.rate_limited"));
      if (res.status === "error") return void toast.error(ti("err.failed", { message: res.message }));

      setAnswer({ outcomes: res.outcomes, duplicates: res.local.filter((r) => r.id !== bookId) });
      if (res.candidates.length === 0) {
        // "Not found" is only true when every provider actually answered.
        const allAnswered = res.outcomes.every((o) => o.status === "not_found");
        return void (allAnswered ? toast.warning(t("fetchNotFound")) : toast.warning(t("fetchIncomplete")));
      }

      const same = res.candidates.filter(
        (c) => titlesLookAlike(recordTitle, c.title) || (!!c.subtitle && titlesLookAlike(recordTitle, `${c.title} ${c.subtitle}`)),
      );
      if (same.length === 0) {
        const c = res.candidates[0];
        setReview({ kind: "mismatch", candidates: res.candidates, title: c.subtitle ? `${c.title}: ${c.subtitle}` : c.title, provider: c.provider });
        return;
      }
      // An edition that names some other work is dropped, not merged in.
      fill(same);
    } catch (e) {
      toast.error(ti("err.failed", { message: e instanceof Error ? e.message : "" }));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function replaceChosen(conflicts: Extract<Review, { kind: "conflicts" }>) {
    const values: Partial<Record<EnrichField, FillValue>> = {};
    for (const c of conflicts.items) if (conflicts.chosen.has(c.field)) values[c.field] = c.found;
    const fields = Object.keys(values) as EnrichField[];
    if (fields.length) {
      onApply(values);
      toast.success(t("replaced", { fields: fields.map(fieldLabel).join(", ") }));
    }
    setReview(null);
  }

  const show = (c: Conflict, v: FillValue) =>
    Array.isArray(v) ? v.join(", ") : c.field === "language" ? tf(`lang.${v}`) : v;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">{field}</div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={disabled || busy || !parsed.ok}
          title={parsed.ok ? undefined : t("needIsbn")}
          className={`${BTN_SECONDARY} sm:mt-[1.625rem]`}
        >
          {busy ? <ButtonBusy label={t("fetching")} /> : (<><DownloadCloud className="h-4 w-4" aria-hidden="true" />{t("fetchByIsbn")}</>)}
        </button>
      </div>

      <div aria-live="polite" className="space-y-3">
        {answer && (
          <p className="text-xs text-text-muted">
            <span className="font-semibold">{ti("sources")}:</span>{" "}
            {answer.outcomes.map((o, i) => (
              <span key={o.provider}>
                {i > 0 && " · "}
                {ti(`provider.${o.provider}`)}:{" "}
                {o.status === "found" ? ti("outcome.found", { count: o.count, cached: String(o.cached) })
                  : o.status === "not_found" ? ti("outcome.not_found", { cached: String(o.cached) })
                  : o.status === "skipped" ? ti("outcome.skipped")
                  : <span className="text-warning-text">{ti(`outcomeError.${o.kind}`)}</span>}
              </span>
            ))}
          </p>
        )}

        {answer && answer.duplicates.length > 0 && (
          <div className="rounded-xl border border-warning-line bg-warning-soft px-3 py-2 text-xs text-warning-text">
            <p className="font-semibold">{t("duplicate")}</p>
            <ul className="mt-1 list-disc pl-5">
              {answer.duplicates.map((d) => (
                <li key={d.id}>
                  <Link href={`/admin/catalogs/edit/${d.id}`} className="underline underline-offset-2">{d.title}</Link>
                  {d.author ? ` · ${d.author}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}

        {review?.kind === "mismatch" && (
          <div role="alert" className="rounded-xl border border-warning-line bg-warning-soft p-3 text-xs leading-relaxed text-warning-text">
            <p className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{t("titleMismatch", { found: review.title, source: ti(`provider.${review.provider}`) })}</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className={`${BTN_SECONDARY} h-8 px-3 text-xs`} onClick={() => fill(review.candidates)}>
                {t("useAnyway")}
              </button>
              <button type="button" className={`${BTN_SECONDARY} h-8 px-3 text-xs`} onClick={() => setReview(null)}>
                {t("dismiss")}
              </button>
            </div>
          </div>
        )}

        {review?.kind === "conflicts" && (
          <fieldset className="rounded-xl border border-info-line bg-info-soft p-3 text-xs text-info-text">
            {/* float + w-full keeps the legend inside the box instead of on its border. */}
            <legend className="float-left w-full font-semibold">{t("conflictsTitle")}</legend>
            <ul className="clear-both space-y-2 pt-2">
              {review.items.map((c) => (
                <li key={c.field}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-bg-surface px-3 py-2 text-text-body">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={review.chosen.has(c.field)}
                      onChange={(e) => {
                        const chosen = new Set(review.chosen);
                        if (e.target.checked) chosen.add(c.field);
                        else chosen.delete(c.field);
                        setReview({ ...review, chosen });
                      }}
                    />
                    <span className="min-w-0 flex-1 space-y-0.5">
                      <span className="block font-semibold">
                        {fieldLabel(c.field)}
                        {c.suggested && <span className="font-normal text-text-muted"> ({t("derived")})</span>}
                      </span>
                      <span className="block text-text-muted">
                        {t("current")}: <span className="line-clamp-2">{show(c, c.current)}</span>
                      </span>
                      <span className="block">
                        {t("found", { source: providerList([review.sources[c.field]]) })}: <span className="line-clamp-3">{show(c, c.found)}</span>
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className={`${BTN_PRIMARY} h-8 px-3 text-xs`} disabled={review.chosen.size === 0} onClick={() => replaceChosen(review)}>
                {t("replaceSelected")}
              </button>
              <button type="button" className={`${BTN_SECONDARY} h-8 px-3 text-xs`} onClick={() => setReview(null)}>
                {t("keepCurrent")}
              </button>
            </div>
          </fieldset>
        )}
      </div>
    </div>
  );
}
