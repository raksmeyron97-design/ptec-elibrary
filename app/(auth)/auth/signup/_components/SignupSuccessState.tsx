"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2, MailCheck } from "lucide-react";

const RESEND_COOLDOWN_SECONDS = 30;

/**
 * The dedicated "check your email" state (step 14).
 *
 * Replaces the old generic green success box: signup is not actually done
 * until the reader clicks the emailed link, and this screen says so, gives
 * them the one thing they need to recognise (the address it went to), and a
 * way back — plus a real resend, which did not exist anywhere before this.
 *
 * The cooldown is a client-side courtesy against double-clicks, not the
 * security control — Supabase's own `auth.rate_limit.email_sent` (2/hour,
 * see supabase/config.toml) is what actually stops abuse, and a resend that
 * hits it surfaces through the same friendly-error mapping as any other
 * auth error.
 */
export default function SignupSuccessState({
  email,
  onResend,
}: {
  email: string;
  onResend: () => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const t = useTranslations("auth");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function handleResend() {
    setState("sending");
    setError(null);
    const result = await onResend();
    if (result.ok) {
      setState("sent");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } else {
      setState("error");
      setError(result.error);
    }
  }

  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success-text">
        <MailCheck className="h-8 w-8" aria-hidden="true" />
      </div>
      <h1 className="text-3xl font-bold text-text-heading">{t("checkEmailTitle")}</h1>
      <p className="mt-3 text-text-muted">{t("checkEmailSentTo")}</p>
      <p className="mt-1 break-all text-lg font-semibold text-text-heading" dir="auto">{email}</p>
      <p className="mt-4 max-w-[340px] text-sm leading-relaxed text-text-muted">
        {t("checkEmailInstructions")}
      </p>

      <div className="mt-7 w-full space-y-3">
        <Link
          href="/auth/login"
          className="flex h-12 w-full items-center justify-center rounded-xl bg-brand text-sm font-semibold text-brand-contrast shadow-sm transition hover:bg-brand-hover hover:shadow-md motion-safe:active:scale-[0.99]"
        >
          {t("backToLogin")}
        </Link>

        <div className="text-sm text-text-muted">
          {state === "sent" ? (
            <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5 text-success-text">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {t("resendSent")}
            </span>
          ) : (
            <>
              {t("didntReceiveEmail")}{" "}
              <button
                type="button"
                onClick={handleResend}
                disabled={state === "sending" || cooldown > 0}
                className="font-semibold text-brand hover:underline disabled:cursor-not-allowed disabled:text-text-muted disabled:no-underline"
              >
                {state === "sending" ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    {t("resendSending")}
                  </span>
                ) : cooldown > 0 ? (
                  t("resendCooldown", { seconds: cooldown })
                ) : (
                  t("resendVerification")
                )}
              </button>
            </>
          )}
        </div>

        {state === "error" && error && (
          <p role="alert" className="text-xs text-danger-text">{error}</p>
        )}

        <p className="text-xs text-text-muted">{t("checkEmailSpam")}</p>
      </div>
    </div>
  );
}
