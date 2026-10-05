"use client";
// "Fetch by ISBN" on the edit form (docs/CATALOG-REVIEW.md, Slice 5): ask this
// catalogue, Koha, Open Library and Google Books about the ISBN in the field,
// show what each REALLY answered as it answers, and offer a PREVIEW — nothing
// reaches the form until the librarian presses Apply, and nothing is saved
// until the ordinary Save (for a record Koha owns, the ordinary Koha write).
//
// The rules live in lib/isbn/enrich.ts and are unchanged: empty fields are
// fillable, different values are only offered, and nothing is filled while the
// found title disagrees with this record's. lib/isbn/fetch-review.ts arranges
// the answer: safe to apply / needs review / no trusted data, and editions as
// choices rather than a merge.
//
// Two requests, so each step's status is real: the catalogue and Koha first,
// then the providers (which run in parallel on the server, so they finish
// together — and the list says so rather than pretending otherwise).

import { useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, CircleDashed, CircleSlash, DownloadCloud, Loader2, XCircle } from "lucide-react";
import { ButtonBusy, BTN_PRIMARY, BTN_SECONDARY } from "@/components/admin/kit/form";
import { useToast } from "@/components/admin/kit";
import { checkIsbnIdentity, lookupIsbnProviders, type IsbnIdentityResponse } from "../../../isbn-actions";
import { parseIsbnInput } from "@/lib/isbn/identity";
import { isAllowedCoverSource } from "@/lib/isbn/cover-source";
import type { CurrentRecord, EnrichField, FillValue } from "@/lib/isbn/enrich";
import {
  chosenValues,
  classifyLookup,
  fetchPreview,
  sameWorkCandidates,
  type EditionGroup,
  type FetchPreview,
} from "@/lib/isbn/fetch-review";
import type { IsbnCandidate, IsbnProvider } from "@/lib/isbn/types";

type StepState = "waiting" | "running" | "done" | "warn" | "error" | "skipped";
type StepId = "catalog" | "koha" | "open_library" | "google_books";
type Steps = Record<StepId, { state: StepState; text: string }>;
type Ok = Extract<IsbnIdentityResponse, { status: "ok" }>;

type View =
  | { kind: "idle" }
  | { kind: "mismatch"; candidates: IsbnCandidate[]; foundTitle: string; provider: IsbnProvider }
  | { kind: "editions"; groups: EditionGroup[] }
  | { kind: "preview"; preview: FetchPreview; chosen: Set<EnrichField>; partial: boolean }
  | { kind: "ended" };

const STEP_ORDER: StepId[] = ["catalog", "koha", "open_library", "google_books"];

function StepIcon({ state }: { state: StepState }) {
  const cls = "h-3.5 w-3.5 shrink-0";
  if (state === "running") return <Loader2 className={`${cls} animate-spin text-info-text motion-reduce:animate-none`} aria-hidden="true" />;
  if (state === "done") return <CheckCircle2 className={`${cls} text-success-text`} aria-hidden="true" />;
  if (state === "warn") return <AlertTriangle className={`${cls} text-warning-text`} aria-hidden="true" />;
  if (state === "error") return <XCircle className={`${cls} text-danger-text`} aria-hidden="true" />;
  if (state === "skipped") return <CircleSlash className={`${cls} text-text-muted`} aria-hidden="true" />;
  return <CircleDashed className={`${cls} text-text-muted`} aria-hidden="true" />;
}

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
  /**
   * Values to put in the form, with the provider each came from and the ISBN
   * asked — so the editor can say where they came from once they are SAVED
   * (lib/catalogs/provenance.ts). The server re-checks every credit.
   */
  onApply: (
    values: Partial<Record<EnrichField, FillValue>>,
    sources: Partial<Record<EnrichField, IsbnProvider>>,
    isbn13: string | null,
  ) => void;
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
  const [steps, setSteps] = useState<Steps | null>(null);
  const [duplicates, setDuplicates] = useState<Ok["local"]>([]);
  const [view, setView] = useState<View>({ kind: "idle" });
  const [askedIsbn, setAskedIsbn] = useState<string | null>(null);

  const parsed = parseIsbnInput(isbn);
  const fieldLabel = (f: EnrichField) => t(`field.${f}`);
  const providerName = (p: IsbnProvider | null) => (p ? ti(`provider.${p}`) : "—");
  const show = (f: EnrichField, v: FillValue | null) =>
    v == null ? "—" : Array.isArray(v) ? v.join(", ") : f === "language" ? tf(`lang.${v}`) : f === "cover" ? t("coverFound") : v;

  const setStep = (id: StepId, state: StepState, text: string) =>
    setSteps((s) => (s ? { ...s, [id]: { state, text } } : s));

  function openPreview(candidates: IsbnCandidate[], partial: boolean) {
    const preview = fetchPreview(readCurrent(), candidates);
    if (!preview || (preview.safe.length === 0 && preview.review.length === 0)) {
      toast.info(t("nothingToFill", { sources: [...new Set(candidates.map((c) => providerName(c.provider)))].join(", ") }));
      setView({ kind: "ended" });
      return;
    }
    const chosen = new Set<EnrichField>([...preview.safe, ...preview.review].filter((i) => i.preselected).map((i) => i.field));
    setView({ kind: "preview", preview, chosen, partial });
  }

  async function run() {
    if (inFlight.current || !parsed.ok) return;
    inFlight.current = true;
    setBusy(true);
    setView({ kind: "idle" });
    setDuplicates([]);
    setAskedIsbn(parsed.isbn13);
    const waiting = { state: "waiting" as const, text: t("step.waiting") };
    setSteps({ catalog: { state: "running", text: t("step.checking") }, koha: { state: "running", text: t("step.checking") }, open_library: waiting, google_books: waiting });
    try {
      // Step 1 — this catalogue and Koha. This record may already carry the ISBN; that is not a reason to stop.
      const id = await checkIsbnIdentity(isbn);
      if (id.status !== "ok") {
        const text = id.status === "invalid" ? ti(`err.${id.reason}`) : id.status === "rate_limited" ? ti("err.rate_limited") : ti("err.failed", { message: id.message });
        setSteps({ catalog: { state: "error", text }, koha: { state: "skipped", text: t("step.notAsked") }, open_library: { state: "skipped", text: t("step.notAsked") }, google_books: { state: "skipped", text: t("step.notAsked") } });
        setView({ kind: "ended" });
        return;
      }
      const others = id.local.filter((r) => r.id !== bookId);
      setDuplicates(others);
      setStep("catalog", others.length ? "warn" : "done", others.length ? t("step.catalogOthers", { count: others.length }) : t("step.catalogNone"));
      if (id.koha.status === "not_connected") setStep("koha", "skipped", t("step.kohaNotConnected"));
      else if (id.koha.status === "error") setStep("koha", "warn", t("step.kohaError"));
      else setStep("koha", "done", id.koha.matches.length ? t("step.kohaFound", { ids: id.koha.matches.map((m) => `#${m.biblioId}`).join(", ") }) : t("step.kohaNone"));

      // Step 2 — the cache, then the providers (in parallel on the server).
      setStep("open_library", "running", t("step.asking"));
      setStep("google_books", "running", t("step.asking"));
      const res = await lookupIsbnProviders(id.isbn13);
      if (res.status !== "ok") {
        const text = res.status === "rate_limited" ? ti("err.rate_limited") : ti("err.not_an_isbn");
        setStep("open_library", "error", text);
        setStep("google_books", "error", text);
        setView({ kind: "ended" });
        return;
      }
      for (const o of res.outcomes) {
        if (o.status === "found") setStep(o.provider, "done", ti("outcome.found", { count: o.count, cached: String(o.cached) }));
        else if (o.status === "not_found") setStep(o.provider, "done", ti("outcome.not_found", { cached: String(o.cached) }));
        else if (o.status === "skipped") setStep(o.provider, "skipped", ti("outcome.skipped"));
        else setStep(o.provider, "error", ti(`outcomeError.${o.kind}`));
      }

      const result = classifyLookup(recordTitle, res.candidates, res.outcomes);
      if (result.kind === "not_found") {
        toast.warning(t("fetchNotFound"));
        setView({ kind: "ended" });
      } else if (result.kind === "incomplete") {
        toast.warning(t("fetchIncomplete"));
        setView({ kind: "ended" });
      } else if (result.kind === "mismatch") {
        setView({ kind: "mismatch", candidates: res.candidates, foundTitle: result.foundTitle, provider: result.provider });
      } else if (result.kind === "ambiguous") {
        setView({ kind: "editions", groups: result.groups });
      } else {
        openPreview(sameWorkCandidates(recordTitle, res.candidates), result.partial);
      }
    } catch (e) {
      toast.error(ti("err.failed", { message: e instanceof Error ? e.message : "" }));
      setView({ kind: "ended" });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function apply(v: Extract<View, { kind: "preview" }>) {
    const { values, sources } = chosenValues(v.preview, v.chosen);
    const fields = Object.keys(values) as EnrichField[];
    if (fields.length) {
      onApply(values, sources, askedIsbn);
      const onMedia = fields.some((f) => f === "keywords" || f === "cover");
      toast.success(t("applied", { fields: fields.map(fieldLabel).join(", ") }) + (onMedia ? ` ${t("onMediaTab")}` : ""));
    }
    setView({ kind: "ended" });
  }

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
        {steps && (
          <ol className="space-y-1 rounded-xl border border-divider bg-paper/40 px-3 py-2 text-xs" aria-label={t("stepsLabel")}>
            {STEP_ORDER.map((id) => (
              <li key={id} className="flex items-start gap-2">
                <span className="mt-0.5"><StepIcon state={steps[id].state} /></span>
                <span className="min-w-0">
                  <span className="font-semibold text-text-body">{t(`step.name.${id}`)}:</span>{" "}
                  <span className={steps[id].state === "error" ? "text-danger-text" : steps[id].state === "warn" ? "text-warning-text" : "text-text-muted"}>
                    {steps[id].text}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}

        {duplicates.length > 0 && (
          <div className="rounded-xl border border-warning-line bg-warning-soft px-3 py-2 text-xs text-warning-text">
            <p className="font-semibold">{t("duplicate")}</p>
            <ul className="mt-1 list-disc pl-5">
              {duplicates.map((d) => (
                <li key={d.id}>
                  <Link href={`/admin/catalogs/edit/${d.id}`} className="underline underline-offset-2">{d.title}</Link>
                  {d.author ? ` · ${d.author}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}

        {view.kind === "mismatch" && (
          <div role="alert" className="rounded-xl border border-warning-line bg-warning-soft p-3 text-xs leading-relaxed text-warning-text">
            <p className="font-semibold">{t("mismatchTitle")}</p>
            <p className="mt-1 flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{t("titleMismatch", { found: view.foundTitle, source: providerName(view.provider) })}</span>
            </p>
            <p className="mt-1 text-text-body">{t("mismatchCurrent", { title: recordTitle })}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {/* A deliberate override: it still goes to the preview, never straight into the form. */}
              <button type="button" className={`${BTN_SECONDARY} px-3 text-xs`} onClick={() => {
                const groups = classifyLookup(view.foundTitle, view.candidates, []);
                if (groups.kind === "ambiguous") setView({ kind: "editions", groups: groups.groups });
                else openPreview(view.candidates, false);
              }}>
                {t("useAnyway")}
              </button>
              <button type="button" className={`${BTN_SECONDARY} px-3 text-xs`} onClick={() => setView({ kind: "ended" })}>
                {t("dismiss")}
              </button>
            </div>
          </div>
        )}

        {view.kind === "editions" && (
          <fieldset className="rounded-xl border border-info-line bg-info-soft p-3 text-xs text-info-text">
            <legend className="float-left w-full font-semibold">{t("editionsTitle")}</legend>
            <p className="clear-both pt-1 text-text-body">{t("editionsBody")}</p>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {view.groups.map((g) => {
                const c = g.candidates[0];
                return (
                  <li key={g.key} className="flex gap-3 rounded-lg bg-bg-surface p-3 text-text-body">
                    {isAllowedCoverSource(c.coverSource) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/admin/catalogs/cover-preview?src=${encodeURIComponent(c.coverSource!)}`}
                        alt={ti("coverAlt", { title: c.title })}
                        className="h-20 w-14 shrink-0 rounded border border-divider object-cover"
                      />
                    ) : (
                      <span aria-hidden="true" className="h-20 w-14 shrink-0 rounded border border-dashed border-divider" />
                    )}
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="font-semibold">{c.subtitle ? `${c.title}: ${c.subtitle}` : c.title}</p>
                      {c.authors.length > 0 && <p className="text-text-muted">{c.authors.join(", ")}</p>}
                      <p>{[g.publisher, g.year].filter(Boolean).join(" · ") || "—"}</p>
                      <p className="text-text-muted">
                        {[...new Set(g.candidates.map((x) => providerName(x.provider)))].join(", ")} · {t("identityExact")}
                      </p>
                      <button type="button" className={`${BTN_SECONDARY} mt-1 px-3 text-xs`} onClick={() => openPreview(g.candidates, false)}>
                        {t("useEdition")}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <button type="button" className={`${BTN_SECONDARY} mt-2 px-3 text-xs`} onClick={() => setView({ kind: "ended" })}>
              {t("dismiss")}
            </button>
          </fieldset>
        )}

        {view.kind === "preview" && (
          <section aria-labelledby="isbn-preview-heading" className="space-y-3 rounded-xl border border-divider bg-bg-surface p-3 text-xs">
            <h3 id="isbn-preview-heading" className="text-sm font-semibold text-text-heading">{t("previewTitle")}</h3>
            {view.partial && <p className="text-warning-text">{t("partialNote")}</p>}
            {(["safe", "review"] as const).map((section) =>
              view.preview[section].length === 0 ? null : (
                <fieldset key={section}>
                  <legend className="font-bold uppercase tracking-wider text-text-muted">{t(`section.${section}`)}</legend>
                  <ul className="mt-1.5 space-y-1.5">
                    {view.preview[section].map((item) => (
                      <li key={item.field}>
                        <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-paper/50 px-3 py-2 text-text-body">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4"
                            checked={view.chosen.has(item.field)}
                            onChange={(e) => {
                              const chosen = new Set(view.chosen);
                              if (e.target.checked) chosen.add(item.field);
                              else chosen.delete(item.field);
                              setView({ ...view, chosen });
                            }}
                          />
                          <span className="min-w-0 flex-1 space-y-0.5">
                            <span className="block font-semibold">
                              {fieldLabel(item.field)}
                              <span className="font-normal text-text-muted"> · {t("found", { source: providerName(item.source) })}</span>
                              {section === "review" && item.preselected && <span className="font-normal text-text-muted"> ({t("derived")})</span>}
                            </span>
                            {section === "review" && (
                              <span className="block text-text-muted">{t("current")}: <span className="line-clamp-2">{show(item.field, item.current)}</span></span>
                            )}
                            <span className="block line-clamp-3">{show(item.field, item.found)}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </fieldset>
              ),
            )}
            <div>
              <p className="font-bold uppercase tracking-wider text-text-muted">{t("section.noTrusted")}</p>
              <p className="mt-1 text-text-muted">
                {view.preview.noTrusted.map((f) => t(`noTrustedField.${f}`)).join(", ")} — {t("noTrustedBody")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={BTN_PRIMARY} disabled={view.chosen.size === 0} onClick={() => apply(view)}>
                {t("applySelected", { count: view.chosen.size })}
              </button>
              <button type="button" className={BTN_SECONDARY} onClick={() => setView({ kind: "ended" })}>
                {t("discard")}
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
