"use client";

import { useState, useRef, useEffect, useId } from "react";
import { useTranslations } from "next-intl";
// Plain next/link (not i18n/navigation): /auth/* lives outside the locale scheme.
import Link from "next/link";
import { BookPlus, X, CheckCircle, AlertCircle } from "lucide-react";
import { submitBookRequest } from "@/app/actions/book-requests";
import { createClient } from "@/lib/supabase/client";

// Every string comes from the homepage's request dialog (home.grow*), so the
// /books door and the homepage door say the same thing in both languages.
// This form used to be English-only and rendered as-is on /km/books.
export default function BookRequestForm() {
  const t = useTranslations("home");
  const uid = useId();
  const titleId = `${uid}-title`;
  const [open, setOpen]     = useState(false);
  const [busy, setBusy]     = useState(false);
  const [result, setResult] = useState<{ success?: boolean; error?: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Resolved client-side (local session read, no network) so the server page
  // stays free of cookie reads and its data can be cached for all users.
  // null = unknown yet; only show the sign-in prompt once we KNOW it's false —
  // the Server Action re-checks auth on submit regardless.
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data }) => setIsLoggedIn(!!data.session));
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    const data = new FormData(e.currentTarget);
    const res = await submitBookRequest(data);
    setResult(res);
    setBusy(false);
    if (res.success) formRef.current?.reset();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); setResult(null); }}
        className="inline-flex items-center gap-2 rounded-[12px] border border-divider bg-paper px-4 py-2.5 text-[13px] font-semibold text-text-body transition-colors hover:border-brand/50 hover:text-brand"
      >
        <BookPlus className="h-4 w-4" aria-hidden />
        {t("growRequestTitle")}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="w-full max-w-md rounded-[24px] border border-divider bg-bg-surface shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-divider px-6 py-4">
              <div className="flex items-center gap-2.5">
                <BookPlus className="h-5 w-5 text-brand" aria-hidden />
                <h2 id={titleId} className="text-[15px] font-bold text-text-heading">{t("growRequestTitle")}</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("growClose")}
                className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-paper hover:text-text-body"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="px-6 py-5">
              {isLoggedIn === false ? (
                <div className="rounded-xl border border-divider bg-paper p-4 text-center">
                  <p className="text-[13px] text-text-muted">
                    {t.rich("growSignIn", {
                      link: (chunks) => (
                        <Link href="/auth/login" className="font-semibold text-brand hover:underline">
                          {chunks}
                        </Link>
                      ),
                    })}
                  </p>
                </div>
              ) : result?.success ? (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <CheckCircle className="h-10 w-10 text-green-500" aria-hidden />
                  <p className="text-[14px] font-semibold text-text-heading">{t("growSentTitle")}</p>
                  <p className="text-[13px] text-text-muted">{t("growRequestSent")}</p>
                  <button
                    type="button"
                    onClick={() => { setOpen(false); setResult(null); }}
                    className="mt-2 rounded-[10px] bg-brand px-5 py-2 text-[13px] font-bold text-brand-contrast transition hover:bg-brand-hover"
                  >
                    {t("growDone")}
                  </button>
                </div>
              ) : (
                <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <p className="text-[12.5px] text-text-muted">{t("growRequestIntro")}</p>

                  {result?.error && (
                    <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] text-red-700 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-400">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      {result.error}
                    </div>
                  )}

                  <div>
                    <label htmlFor={`${uid}-title`} className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-text-muted">
                      {t("growRequestFieldTitle")} <span className="text-red-500">*</span>
                    </label>
                    <input
                      id={`${uid}-title`}
                      name="title"
                      required
                      maxLength={300}
                      placeholder={t("growRequestFieldTitlePlaceholder")}
                      className="w-full rounded-[10px] border border-divider bg-paper px-3.5 py-2.5 text-base text-text-body sm:text-[13.5px] placeholder:text-text-muted/50 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                    />
                  </div>

                  <div>
                    <label htmlFor={`${uid}-author`} className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-text-muted">
                      {t("growRequestFieldAuthor")}
                    </label>
                    <input
                      id={`${uid}-author`}
                      name="author"
                      maxLength={200}
                      placeholder={t("growRequestFieldAuthorPlaceholder")}
                      className="w-full rounded-[10px] border border-divider bg-paper px-3.5 py-2.5 text-base text-text-body sm:text-[13.5px] placeholder:text-text-muted/50 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                    />
                  </div>

                  <div>
                    <label htmlFor={`${uid}-isbn`} className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-text-muted">
                      {t("growRequestFieldIsbn")}
                    </label>
                    <input
                      id={`${uid}-isbn`}
                      name="isbn"
                      maxLength={20}
                      placeholder="978-0-06-112008-4"
                      className="w-full rounded-[10px] border border-divider bg-paper px-3.5 py-2.5 text-base text-text-body sm:text-[13.5px] placeholder:text-text-muted/50 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                    />
                  </div>

                  <div>
                    <label htmlFor={`${uid}-reason`} className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-text-muted">
                      {t("growRequestFieldReason")}
                    </label>
                    <textarea
                      id={`${uid}-reason`}
                      name="reason"
                      rows={3}
                      maxLength={500}
                      placeholder={t("growRequestFieldReasonPlaceholder")}
                      className="w-full resize-none rounded-[10px] border border-divider bg-paper px-3.5 py-2.5 text-base text-text-body sm:text-[13.5px] placeholder:text-text-muted/50 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                    />
                  </div>

                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="flex-1 rounded-[10px] border border-divider bg-paper py-2.5 text-[13px] font-semibold text-text-body transition hover:bg-bg-app"
                    >
                      {t("growCancel")}
                    </button>
                    <button
                      type="submit"
                      disabled={busy}
                      className="flex-1 rounded-[10px] bg-brand py-2.5 text-[13px] font-bold text-brand-contrast transition hover:bg-brand-hover disabled:opacity-60"
                    >
                      {busy ? t("growSubmitting") : t("growRequestSubmit")}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
