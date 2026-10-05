"use client";
// "No ISBN at hand? Search Open Library by title and author" — for a book
// whose ISBN the librarian does not have (docs/CATALOG-REVIEW.md, Slice 7; PTEC
// decision: no AI, no OCR). A result only SUGGESTS AN ISBN: "Use this ISBN" puts
// it in the field, and the details still come through Fetch by ISBN, with its
// exact-identity and title-mismatch checks. Nothing here fills another field.

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { ButtonBusy, BTN_SECONDARY } from "@/components/admin/kit/form";
import { searchOpenLibraryByTitle, type TitleSearchResponse } from "../../../isbn-actions";

export default function TitleSearch({
  readTitle,
  readAuthor,
  onUseIsbn,
  disabled,
  defaultOpen = false,
  initialTitle = "",
  initialAuthor = "",
}: {
  readTitle: () => string;
  readAuthor: () => string;
  onUseIsbn: (isbn13: string) => void;
  disabled?: boolean;
  /** Open on arrival — the Khmer review queue, where ISBNs are rarest. */
  defaultOpen?: boolean;
  /** The record's saved title and author: what a panel open on arrival starts from. */
  initialTitle?: string;
  initialAuthor?: string;
}) {
  const t = useTranslations("adminCatalog.titleSearch");
  const ti = useTranslations("adminCatalog.isbn");
  const id = useId();
  const [open, setOpen] = useState(defaultOpen);
  const [title, setTitle] = useState(defaultOpen ? initialTitle : "");
  const [author, setAuthor] = useState(defaultOpen ? initialAuthor : "");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<TitleSearchResponse | null>(null);

  function toggle() {
    if (!open) {
      // Start from the record as it stands in the form; the librarian may shorten either.
      setTitle(readTitle());
      setAuthor(readAuthor());
    }
    setOpen(!open);
  }

  async function run() {
    if (busy || title.trim().length < 2) return;
    setBusy(true);
    setAnswer(null);
    try {
      setAnswer(await searchOpenLibraryByTitle(title, author || null));
    } catch {
      setAnswer({ status: "error", kind: "unreachable" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-divider bg-paper/30 p-3 text-xs">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={open ? `${id}-panel` : undefined}
        className="focus-field inline-flex min-h-10 items-center gap-2 rounded-lg px-2 font-semibold text-admin-accent-text hover:underline"
      >
        <Search className="h-3.5 w-3.5" aria-hidden="true" />
        {t("toggle")}
      </button>

      {open && (
        <div id={`${id}-panel`} className="mt-2 space-y-3">
          <p className="text-text-muted">{t("hint")}</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="flex flex-col gap-1 font-semibold text-text-body" htmlFor={`${id}-title`}>
              {t("title")}
              <input
                id={`${id}-title`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void run();
                  }
                }}
                className="focus-field h-10 rounded-lg border border-divider bg-bg-surface px-3 text-base font-normal sm:text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 font-semibold text-text-body" htmlFor={`${id}-author`}>
              {t("author")}
              <input
                id={`${id}-author`}
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void run();
                  }
                }}
                className="focus-field h-10 rounded-lg border border-divider bg-bg-surface px-3 text-base font-normal sm:text-sm"
              />
            </label>
            <button type="button" onClick={() => void run()} disabled={disabled || busy || title.trim().length < 2} className={BTN_SECONDARY}>
              {busy ? <ButtonBusy label={t("searching")} /> : t("search")}
            </button>
          </div>

          <div aria-live="polite" className="space-y-2">
            {answer?.status === "invalid" && <p className="text-warning-text">{t("tooShort")}</p>}
            {answer?.status === "rate_limited" && <p className="text-warning-text">{ti("err.rate_limited")}</p>}
            {answer?.status === "error" && <p className="text-warning-text">{t("failed", { reason: ti(`outcomeError.${answer.kind}`) })}</p>}
            {answer?.status === "ok" && answer.results.length === 0 && (
              <div className="rounded-lg border border-divider bg-bg-surface p-3">
                <p className="font-semibold text-text-body">{t("noResultTitle")}</p>
                <p className="mt-1 text-text-muted">{t("noResultBody")}</p>
              </div>
            )}
            {answer?.status === "ok" && answer.results.length > 0 && (
              <ul className="space-y-2">
                {answer.results.map((r) => (
                  <li key={r.key} className="rounded-lg border border-divider bg-bg-surface p-3">
                    <p className="font-semibold text-text-heading">{r.subtitle ? `${r.title}: ${r.subtitle}` : r.title}</p>
                    <p className="text-text-muted">
                      {[r.authors.join(", "), r.year, r.publishers[0], r.languages.join("/")].filter(Boolean).join(" · ") || "—"}
                    </p>
                    {r.isbn13s.length ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {r.isbn13s.map((isbn) => (
                          <button
                            key={isbn}
                            type="button"
                            onClick={() => onUseIsbn(isbn)}
                            className="focus-field inline-flex min-h-10 items-center rounded-lg border border-divider px-3 font-mono text-[11px] text-text-body hover:bg-paper"
                          >
                            {t("useIsbn", { isbn })}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-text-muted">{t("noIsbn")}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
