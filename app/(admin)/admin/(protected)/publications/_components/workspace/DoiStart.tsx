"use client";

// "Start from a DOI": the first thing a new article offers. The library
// indexes articles that already exist (decision 2026-10-02), so their facts
// are in the publisher's Crossref record — the librarian checks them rather
// than retyping them.
//
// Look up is read-only (lookupArticleDoi). "Use these details" is the consent:
// it creates the author/affiliation records the preview lists as new
// (prepareDoiAuthorships) and fills the form. The ARTICLE is saved by the
// normal Save, after the librarian has looked at every step.

import { useId, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Search, Sparkles, UserPlus } from "lucide-react";

import {
  lookupArticleDoi,
  prepareDoiAuthorships,
  type ArticleDoiLookup,
  type PreparedAuthorship,
} from "@/app/actions/article-doi";
import { BTN_PRIMARY, BTN_SECONDARY, ButtonBusy, MONO_INPUT_CLASS } from "@/components/admin/kit/form";
import type { ArticleFromDoi } from "@/lib/publications/doi-article";

export type DoiApplyPayload = {
  article: ArticleFromDoi;
  /** The canonical title of the matched journal record, else the deposited name. */
  journalName: string | null;
  authorships: PreparedAuthorship[];
};

type Found = Extract<ArticleDoiLookup, { status: "ok" }>;

const MESSAGE: Record<Exclude<ArticleDoiLookup["status"], "ok">, string> = {
  invalid: "That is not a DOI. A DOI starts with 10. — for example 10.1021/ed500287q.",
  not_found: "Crossref has no record for this DOI. Check it, or enter the article by hand.",
  rate_limited: "Too many lookups in the last minute. Wait a moment and try again.",
  unavailable: "Crossref did not answer. Try again, or enter the article by hand.",
  forbidden: "You do not have permission to add journal articles.",
};

function citationLine(a: ArticleFromDoi): string {
  const where = [
    a.volume ? (a.issue ? `${a.volume}(${a.issue})` : a.volume) : null,
    a.pageStart ? [a.pageStart, a.pageEnd].filter(Boolean).join("–") : a.articleNo,
  ]
    .filter(Boolean)
    .join(", ");
  return [a.journalTitle, a.year, where].filter(Boolean).join(" · ");
}

export default function DoiStart({
  onApply,
  onSkip,
}: {
  onApply: (payload: DoiApplyPayload) => void;
  onSkip: () => void;
}) {
  const inputId = `doi${useId().replace(/:/g, "")}`;
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState<"lookup" | "apply" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  // Authors whose NEW record should use family-then-given order. Publishers
  // swap East Asian names (ACS deposited "Tomita Shinpei"); a matched author
  // keeps the name of the record it matched, so this only applies to new ones.
  const [swapped, setSwapped] = useState<Set<number>>(new Set());

  async function lookup() {
    if (!value.trim() || busy) return;
    setBusy("lookup");
    setMessage(null);
    setFound(null);
    setSwapped(new Set());
    const res = await lookupArticleDoi(value);
    setBusy(null);
    if (res.status === "ok") setFound(res);
    else setMessage(MESSAGE[res.status]);
  }

  async function apply() {
    if (!found || busy) return;
    setBusy("apply");
    setMessage(null);
    const res = await prepareDoiAuthorships(
      found.authors.map((a, i) => ({
        fullName: a.match?.fullName ?? (swapped.has(i) && a.reversedName ? a.reversedName : a.fullName),
        orcid: a.orcid,
        matchId: a.match?.id ?? null,
        affiliations: a.affiliationMatches,
      })),
    );
    setBusy(null);
    if (!res.ok) {
      setMessage(res.error);
      return;
    }
    onApply({
      article: found.article,
      journalName: found.journal?.title ?? found.article.journalTitle,
      authorships: res.rows,
    });
  }

  const newAuthors = found ? found.authors.filter((a) => !a.match).length : 0;
  const newAffiliations = found
    ? new Set(found.authors.flatMap((a) => a.affiliationMatches.filter((m) => !m.id).map((m) => m.name))).size
    : 0;

  return (
    <section aria-labelledby={`${inputId}-heading`} className="rounded-xl border border-brand/30 bg-brand/5 p-4 sm:p-5">
      <h3 id={`${inputId}-heading`} className="flex items-center gap-2 text-sm font-semibold text-text-heading">
        <Sparkles className="h-4 w-4 text-brand" aria-hidden="true" />
        Start from a DOI
      </h3>
      <p className="mt-1 text-xs text-text-muted">
        Paste the article&apos;s DOI and the publisher&apos;s record fills the form: title, authors, journal, issue,
        pages, date and references. You check every step before saving.
      </p>

      {/* Not a <form>: this sits inside the editor's own form, and forms do not nest. */}
      <div role="group" aria-labelledby={`${inputId}-heading`} className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 basis-64">
          <label htmlFor={inputId} className="sr-only">
            DOI
          </label>
          <input
            id={inputId}
            className={MONO_INPUT_CLASS}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="10.1021/ed500287q or https://doi.org/…"
            autoComplete="off"
            spellCheck={false}
            disabled={!!busy}
            onKeyDown={(e) => {
              // Enter looks up — and must not submit (save) the article form around it.
              if (e.key === "Enter") {
                e.preventDefault();
                void lookup();
              }
            }}
          />
        </div>
        <button type="button" className={BTN_PRIMARY} disabled={!value.trim() || !!busy} onClick={lookup}>
          {busy === "lookup" ? (
            <ButtonBusy label="Looking up…" />
          ) : (
            <>
              <Search className="h-4 w-4" aria-hidden="true" />
              Look up
            </>
          )}
        </button>
        <button type="button" className="min-h-10 px-2 text-sm font-medium text-text-muted underline-offset-2 hover:text-brand hover:underline" onClick={onSkip}>
          Enter the article by hand
        </button>
      </div>

      <p className="mt-2 text-sm text-danger-text" role="status" aria-live="polite">
        {message}
      </p>

      {found && (
        <div className="mt-3 space-y-3 rounded-lg border border-divider bg-bg-surface p-4">
          {found.duplicate ? (
            <div className="flex items-start gap-2 rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-sm text-warning-text">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>
                The library already has this article:{" "}
                <Link href={`/admin/publications/edit/${found.duplicate.id}`} className="font-semibold underline">
                  {found.duplicate.title}
                </Link>
                . Open it instead of creating a second record.
              </p>
            </div>
          ) : null}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Found at Crossref</p>
            <p className="mt-1 text-sm font-semibold leading-snug text-text-heading">{found.article.title ?? "Untitled"}</p>
            <p className="mt-0.5 text-sm text-text-body">{citationLine(found.article)}</p>
          </div>

          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-text-muted">Journal</dt>
              <dd className="text-text-body">
                {found.journal ? (
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                    Linked to the journal record &ldquo;{found.journal.title}&rdquo;
                  </span>
                ) : (
                  <>
                    No journal record yet.{" "}
                    {found.article.journalTitle && (
                      <Link
                        href={`/admin/journals/new?title=${encodeURIComponent(found.article.journalTitle)}`}
                        target="_blank"
                        className="font-medium text-brand underline-offset-2 hover:underline"
                      >
                        Create &ldquo;{found.article.journalTitle}&rdquo;
                      </Link>
                    )}
                  </>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Also filled</dt>
              <dd className="text-text-body">
                {[
                  `${found.article.references.length} reference${found.article.references.length === 1 ? "" : "s"}`,
                  found.article.abstract ? "abstract" : "no abstract deposited",
                  found.article.license ?? "no licence deposited",
                  found.article.publicationDate ? null : "no full publication date",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </dd>
            </div>
          </dl>

          <div>
            <p className="text-xs text-text-muted">Authors</p>
            <ol className="mt-1 space-y-1 text-sm">
              {found.authors.map((a, i) => (
                <li key={`${a.fullName}-${i}`} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium text-text-heading">
                    {a.match?.fullName ?? (swapped.has(i) && a.reversedName ? a.reversedName : a.fullName)}
                  </span>
                  {a.match ? (
                    <span className="text-xs text-success-text">
                      existing record{a.match.by === "orcid" ? " (same ORCID)" : a.match.by === "reversed-name" ? " (name order reversed at Crossref)" : ""}
                    </span>
                  ) : a.ambiguous ? (
                    <span className="text-xs text-warning-text">two records share this name — a new one will be created; merge or pick in Authors</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                      <UserPlus className="h-3 w-3" aria-hidden="true" /> new author record
                    </span>
                  )}
                  {!a.match && a.reversedName && (
                    <button
                      type="button"
                      className="text-xs font-medium text-brand underline-offset-2 hover:underline"
                      onClick={() =>
                        setSwapped((prev) => {
                          const next = new Set(prev);
                          if (next.has(i)) next.delete(i);
                          else next.add(i);
                          return next;
                        })
                      }
                    >
                      Swap name order
                    </button>
                  )}
                </li>
              ))}
            </ol>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-3">
            <p className="text-xs text-text-muted">
              {newAuthors + newAffiliations > 0
                ? `Using these details creates ${[
                    newAuthors ? `${newAuthors} author record${newAuthors === 1 ? "" : "s"}` : null,
                    newAffiliations ? `${newAffiliations} affiliation${newAffiliations === 1 ? "" : "s"}` : null,
                  ]
                    .filter(Boolean)
                    .join(" and ")}. Nothing else is saved until you save the article.`
                : "Nothing is saved until you save the article."}
            </p>
            <div className="flex gap-2">
              <button type="button" className={BTN_SECONDARY} onClick={() => setFound(null)} disabled={!!busy}>
                Cancel
              </button>
              <button type="button" className={BTN_PRIMARY} onClick={apply} disabled={!!busy || !!found.duplicate}>
                {busy === "apply" ? <ButtonBusy label="Filling the form…" /> : "Use these details"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
