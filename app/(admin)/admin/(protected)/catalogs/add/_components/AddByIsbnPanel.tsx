"use client";
// "Add by ISBN" — step one of adding a physical book. Looks an ISBN up and
// lets the librarian pick the edition in their hands; it saves nothing. The
// chosen candidate pre-fills the ordinary Add form, where the librarian
// reviews and saves.

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { AlertTriangle, BookOpen, ScanBarcode } from "lucide-react";
import { Field, FormShell, ButtonBusy, BTN_PRIMARY, BTN_SECONDARY, ERROR_CLASS } from "@/components/admin/kit/form";
import { StatusBadge } from "@/components/admin/kit";
import { lookupCatalogIsbn, type IsbnLookupResponse } from "../../isbn-actions";
import type { IsbnCandidate } from "@/lib/isbn/types";
import { isAllowedCoverSource } from "@/lib/isbn/cover-source";

export default function AddByIsbnPanel({
  input,
  onInput,
  result,
  onResult,
  onUse,
  onManual,
}: {
  input: string;
  onInput: (v: string) => void;
  result: IsbnLookupResponse | null;
  onResult: (r: IsbnLookupResponse | null) => void;
  onUse: (c: IsbnCandidate) => void;
  /** Leave for the blank form, optionally carrying the looked-up ISBN. */
  onManual: (isbn?: string) => void;
}) {
  const t = useTranslations("adminCatalog.isbn");
  const tf = useTranslations("adminCatalog.form");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  async function run(lookUpEvenIfCatalogued = false) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      onResult(await lookupCatalogIsbn(input, { lookUpEvenIfCatalogued }));
    } catch (e) {
      onResult({ status: "error", message: e instanceof Error ? e.message : "" });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const fieldError = result?.status === "invalid" ? t(`err.${result.reason}`) : undefined;
  const formError =
    result?.status === "rate_limited" ? t("err.rate_limited")
    : result?.status === "error" ? t("err.failed", { message: result.message })
    : null;
  const ok = result?.status === "ok" ? result : null;

  return (
    <FormShell
      backHref="/admin/catalogs"
      backLabel={tf("backToCatalog")}
      title={tf("addBookTitle")}
      description={t("description")}
      headerActions={
        <button type="button" className={BTN_SECONDARY} onClick={() => onManual()}>
          {t("manual")}
        </button>
      }
      onSubmit={(e) => {
        e.preventDefault();
        void run();
      }}
    >
      <div className="space-y-6">
        {/* A barcode scanner types the digits and presses Enter, so the form
            submit is the scan path — no scanner-specific code. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <Field label={tf("isbn")} htmlFor="isbn-lookup" required error={fieldError} hint={t("inputHint")} className="min-w-0 flex-1">
            {(p) => (
              <input
                {...p}
                className={`${p.className} font-mono text-base tracking-wide`}
                value={input}
                onChange={(e) => onInput(e.target.value)}
                inputMode="text"
                autoComplete="off"
                autoFocus
                maxLength={40}
                placeholder="978-0-13-468599-1"
              />
            )}
          </Field>
          <button type="submit" disabled={busy} className={`${BTN_PRIMARY} sm:mt-[1.625rem]`}>
            {busy ? <ButtonBusy label={t("finding")} /> : (<><ScanBarcode className="h-4 w-4" aria-hidden="true" />{t("find")}</>)}
          </button>
        </div>

        {formError && <p role="alert" className={ERROR_CLASS}>{formError}</p>}

        <div aria-live="polite" className="space-y-6">
          {ok && ok.local.length > 0 && (
            <section className="rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-warning-text">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                {t("localTitle")}
              </h3>
              <p className="mt-1 text-xs">{t("localBody")}</p>
              <ul className="mt-3 space-y-2">
                {ok.local.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-bg-surface px-3 py-2 text-text-body">
                    <span className="min-w-0 flex-1 text-sm font-semibold">
                      {r.title}
                      {r.author && <span className="font-normal text-text-muted"> · {r.author}</span>}
                    </span>
                    <span className="text-xs text-text-muted">{t("copiesCount", { count: r.copiesTotal })}</span>
                    {!r.isActive && <StatusBadge tone="neutral">{t("unlisted")}</StatusBadge>}
                    <Link href={`/admin/catalogs/edit/${r.id}`} className={`${BTN_SECONDARY} h-8 px-3 text-xs`}>{t("openRecord")}</Link>
                    <Link href={`/admin/catalogs/edit/${r.id}?tab=copies`} className={`${BTN_PRIMARY} h-8 px-3 text-xs`}>{t("addCopies")}</Link>
                  </li>
                ))}
              </ul>
              {!ok.lookedUp && (
                <button type="button" disabled={busy} className={`${BTN_SECONDARY} mt-3 h-8 px-3 text-xs`} onClick={() => void run(true)}>
                  {t("lookUpAnyway")}
                </button>
              )}
            </section>
          )}

          {ok && <KohaLine koha={ok.koha} />}

          {ok?.lookedUp && (
            <section aria-labelledby="isbn-sources" className="space-y-1">
              <h3 id="isbn-sources" className="text-xs font-semibold uppercase tracking-wider text-text-muted">{t("sources")}</h3>
              <ul className="space-y-0.5 text-xs text-text-body">
                {ok.outcomes.map((o) => (
                  <li key={o.provider}>
                    <span className="font-semibold">{t(`provider.${o.provider}`)}:</span>{" "}
                    {o.status === "found" ? t("outcome.found", { count: o.count, cached: String(o.cached) })
                      : o.status === "not_found" ? t("outcome.not_found", { cached: String(o.cached) })
                      : o.status === "skipped" ? t("outcome.skipped")
                      : <span className="text-warning-text">{t(`outcomeError.${o.kind}`)}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {ok?.lookedUp && ok.candidates.length > 0 && (
            <section aria-labelledby="isbn-results" className="space-y-3">
              <div>
                <h3 id="isbn-results" className="text-sm font-semibold text-text-heading">{t("resultsTitle", { count: ok.candidates.length })}</h3>
                <p className="mt-0.5 text-xs text-text-muted">{t("resultsHint")}</p>
              </div>
              <ul className="space-y-3">
                {ok.candidates.map((c) => (
                  <CandidateCard key={`${c.provider}:${c.providerRecordId}`} c={c} onUse={() => onUse(c)} />
                ))}
              </ul>
            </section>
          )}

          {ok?.lookedUp && ok.candidates.length === 0 && (
            <section className="rounded-xl border border-divider bg-paper px-4 py-5 text-center">
              <h3 className="text-sm font-semibold text-text-heading">{t("noResultsTitle")}</h3>
              <p className="mt-1 text-xs text-text-muted">{t("noResultsBody")}</p>
              <button type="button" className={`${BTN_PRIMARY} mt-3`} onClick={() => onManual(ok.isbn13)}>
                {t("manual")}
              </button>
            </section>
          )}
        </div>
      </div>
    </FormShell>
  );
}

function KohaLine({ koha }: { koha: Extract<IsbnLookupResponse, { status: "ok" }>["koha"] }) {
  const t = useTranslations("adminCatalog.isbn");
  if (koha.status === "not_connected") return <p className="text-xs text-text-muted">{t("koha.not_connected")}</p>;
  if (koha.status === "error") return <p className="text-xs text-warning-text">{t("koha.error", { message: koha.message })}</p>;
  if (koha.matches.length === 0) return <p className="text-xs text-text-muted">{t("koha.none")}</p>;
  return (
    <div className="rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-xs text-warning-text">
      <p className="font-semibold">{t("koha.found", { count: koha.matches.length })}</p>
      <ul className="mt-1 list-disc pl-5">
        {koha.matches.map((m) => (
          <li key={m.biblioId}>#{m.biblioId} {m.title}{m.author ? ` · ${m.author}` : ""}</li>
        ))}
      </ul>
    </div>
  );
}

function CandidateCard({ c, onUse }: { c: IsbnCandidate; onUse: () => void }) {
  const t = useTranslations("adminCatalog.isbn");
  const meta = [c.publisher, c.year, c.pageCount ? t("pages", { count: c.pageCount }) : null, c.edition].filter(Boolean).join(" · ");
  return (
    <li className="flex gap-4 rounded-xl border border-divider bg-bg-surface p-4 shadow-sm">
      <div className="flex h-24 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-divider bg-paper text-text-muted">
        {isAllowedCoverSource(c.coverSource) ? (
          // Through the same-origin proxy: the provider's image host is not in the CSP.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/admin/catalogs/cover-preview?src=${encodeURIComponent(c.coverSource)}`}
            alt={t("coverAlt", { title: c.title })}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <BookOpen className="h-5 w-5" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="min-w-0 text-sm font-semibold text-text-heading">
            {c.title}
            {c.subtitle && <span className="font-normal text-text-body">: {c.subtitle}</span>}
          </p>
          <StatusBadge tone="info">{t(`provider.${c.provider}`)}</StatusBadge>
        </div>
        <p className="text-sm text-text-body">{c.authors.length ? c.authors.join("; ") : <span className="text-text-muted">{t("noAuthor")}</span>}</p>
        {meta && <p className="text-xs text-text-muted">{meta}</p>}
        <p className="font-mono text-xs text-text-muted">ISBN {c.isbn13}{c.isbn10 ? ` · ${c.isbn10}` : ""}</p>
        {(c.subjects.length > 0 || c.description) && (
          <details className="pt-1 text-xs text-text-body">
            <summary className="focus-field cursor-pointer rounded font-medium text-text-muted">{t("details")}</summary>
            {c.subjects.length > 0 && <div className="mt-2"><span className="font-semibold">{t("subjects")}:</span> {c.subjects.join(", ")}</div>}
            {c.description && <div className="mt-2 max-w-prose leading-relaxed">{c.description}</div>}
          </details>
        )}
        <div className="pt-2">
          <button type="button" className={`${BTN_PRIMARY} h-9 px-4`} onClick={onUse}>
            {t("use")}
          </button>
        </div>
      </div>
    </li>
  );
}
