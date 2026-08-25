"use client";

// components/ui/home/ContributeDialog.tsx
// The submit half of <GrowTheCollection>. One component serves both directions
// of migration 0119's `kind` column — "deposit" (an author offers their thesis)
// and "acquisition" (a reader asks the library to source a book) — because the
// two forms differ by exactly one field and one set of labels. A second
// component would have been the same dialog with different strings.
//
// Built on the native <dialog> element rather than a hand-rolled overlay: it
// brings the focus trap, the ESC handler, the inert background and the top-layer
// stacking with it. components/ui/books/BookRequestForm.tsx predates this and
// reimplements a modal without any of the four — prefer this one.
//
// Auth is read from <SessionProvider> (a single shared /api/me call), never from
// the server: the homepage must not read cookies() or it stops prerendering.
// This is a display rule only — submitBookRequest() re-checks auth server-side.

import { useCallback, useEffect, useId, useRef, useState } from "react";
// Plain next/link: /auth/* sits outside the locale routing scheme.
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CheckCircle2, AlertCircle, X, FileUp, BookPlus } from "lucide-react";
import { submitBookRequest, type BookRequestKind } from "@/app/actions/book-requests";
import { useSession } from "@/components/providers/SessionProvider";

type Result = { success?: boolean; error?: string };

const FIELD =
  "focus-field w-full rounded-[10px] border border-divider bg-paper px-3.5 py-2.5 " +
  "text-[13.5px] text-text-body placeholder:text-text-muted/50 outline-none";

const LABEL =
  "mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-text-muted";

// Derived here rather than passed in: <GrowTheCollection> is a Server Component,
// and a React component is a function — it cannot cross the RSC boundary as a
// prop. `kind` is the only thing that needs to travel.
const ICONS = { deposit: FileUp, acquisition: BookPlus } as const;

export default function ContributeDialog({
  kind,
  triggerClassName,
  triggerLabel,
}: {
  kind: BookRequestKind;
  triggerClassName: string;
  triggerLabel: string;
}) {
  const Icon = ICONS[kind];
  const t = useTranslations("home");
  const { user, loading } = useSession();

  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const titleId = useId();

  const isDeposit = kind === "deposit";
  /** `growDeposit*` / `growRequest*` — one key family per direction. */
  const k = (suffix: string) => `${isDeposit ? "growDeposit" : "growRequest"}${suffix}`;

  const open = useCallback(() => {
    setResult(null);
    dialogRef.current?.showModal();
  }, []);

  const close = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  // showModal() is imperative, so React state has to be told when the browser
  // closes the dialog on its own (ESC, or the form's method="dialog").
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const onClose = () => {
      setBusy(false);
      setResult(null);
      formRef.current?.reset();
    };
    el.addEventListener("close", onClose);
    return () => el.removeEventListener("close", onClose);
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    const data = new FormData(e.currentTarget);
    data.set("kind", kind);
    const res = await submitBookRequest(data);
    setResult(res);
    setBusy(false);
    if (res.success) formRef.current?.reset();
  }

  // Backdrop click. The <dialog> box fills the whole viewport as far as the
  // event target is concerned, so "clicked the backdrop" means the click landed
  // on the dialog element itself rather than on the card inside it.
  function handleDialogClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) close();
  }

  const signedOut = !loading && !user;

  return (
    <>
      <button type="button" onClick={open} className={triggerClassName}>
        <Icon className="h-4 w-4" aria-hidden strokeWidth={2} />
        {triggerLabel}
      </button>

      <dialog
        ref={dialogRef}
        onClick={handleDialogClick}
        aria-labelledby={titleId}
        className="
          m-auto w-[calc(100vw-2rem)] max-w-md rounded-[20px] border border-divider
          bg-bg-surface p-0 text-text-body shadow-2xl
          backdrop:bg-black/50 backdrop:backdrop-blur-sm
        "
      >
        <div className="flex items-center justify-between border-b border-divider px-6 py-4">
          <div className="flex items-center gap-2.5">
            <Icon className="h-5 w-5 text-brand" aria-hidden strokeWidth={2} />
            <h2 id={titleId} className="font-khmer-serif text-[15px] font-bold text-text-heading">
              {t(k("Title"))}
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label={t("growClose")}
            className="focus-field rounded-lg p-1.5 text-text-muted outline-none transition-colors hover:bg-paper hover:text-text-body"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="px-6 py-5">
          {signedOut ? (
            <div className="rounded-xl border border-divider bg-paper p-4 text-center">
              <p className="text-[13px] leading-relaxed text-text-muted">
                {t.rich("growSignIn", {
                  link: (chunks) => (
                    <Link
                      href="/auth/login"
                      className="font-semibold text-brand hover:underline"
                    >
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
            </div>
          ) : result?.success ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 className="h-10 w-10 text-[var(--ptec-success)]" aria-hidden />
              <p className="text-[14px] font-semibold text-text-heading">{t("growSentTitle")}</p>
              <p className="text-[13px] leading-relaxed text-text-muted">{t(k("Sent"))}</p>
              <button
                type="button"
                onClick={close}
                className="focus-field mt-2 rounded-[10px] bg-brand px-5 py-2 text-[13px] font-bold text-brand-contrast outline-none transition hover:bg-brand-hover"
              >
                {t("growDone")}
              </button>
            </div>
          ) : (
            <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
              <p className="text-[12.5px] leading-relaxed text-text-muted">{t(k("Intro"))}</p>

              {result?.error && (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-[var(--ptec-danger-line)] bg-[var(--ptec-danger-soft)] px-3 py-2.5 text-[12.5px] text-[var(--ptec-danger-text)]"
                >
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  {result.error}
                </p>
              )}

              <div>
                <label htmlFor={`${titleId}-title`} className={LABEL}>
                  {t(k("FieldTitle"))} <span className="text-[var(--ptec-danger-text)]">*</span>
                </label>
                <input
                  id={`${titleId}-title`}
                  name="title"
                  required
                  maxLength={300}
                  placeholder={t(k("FieldTitlePlaceholder"))}
                  className={FIELD}
                />
              </div>

              <div>
                <label htmlFor={`${titleId}-author`} className={LABEL}>
                  {t(k("FieldAuthor"))}
                </label>
                <input
                  id={`${titleId}-author`}
                  name="author"
                  maxLength={200}
                  placeholder={t(k("FieldAuthorPlaceholder"))}
                  className={FIELD}
                />
              </div>

              {/* The one structural difference between the two directions: an
                  acquisition identifies a work that exists in the world (ISBN);
                  a deposit points at a file only its author can supply. */}
              {isDeposit ? (
                <div>
                  <label htmlFor={`${titleId}-src`} className={LABEL}>
                    {t("growDepositFieldLink")}
                  </label>
                  <input
                    id={`${titleId}-src`}
                    name="source_url"
                    type="url"
                    inputMode="url"
                    maxLength={2000}
                    placeholder="https://…"
                    className={FIELD}
                  />
                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-text-muted">
                    {t("growDepositFieldLinkHelp")}
                  </p>
                </div>
              ) : (
                <div>
                  <label htmlFor={`${titleId}-isbn`} className={LABEL}>
                    {t("growRequestFieldIsbn")}
                  </label>
                  <input
                    id={`${titleId}-isbn`}
                    name="isbn"
                    maxLength={20}
                    placeholder="978-0-06-112008-4"
                    className={FIELD}
                  />
                </div>
              )}

              <div>
                <label htmlFor={`${titleId}-reason`} className={LABEL}>
                  {t(k("FieldReason"))}
                </label>
                <textarea
                  id={`${titleId}-reason`}
                  name="reason"
                  rows={3}
                  maxLength={500}
                  placeholder={t(k("FieldReasonPlaceholder"))}
                  className={`${FIELD} resize-none`}
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={close}
                  className="focus-field flex-1 rounded-[10px] border border-divider bg-paper py-2.5 text-[13px] font-semibold text-text-body outline-none transition hover:bg-bg-app"
                >
                  {t("growCancel")}
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="focus-field flex-1 rounded-[10px] bg-brand py-2.5 text-[13px] font-bold text-brand-contrast outline-none transition hover:bg-brand-hover disabled:opacity-60"
                >
                  {busy ? t("growSubmitting") : t(k("Submit"))}
                </button>
              </div>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}
