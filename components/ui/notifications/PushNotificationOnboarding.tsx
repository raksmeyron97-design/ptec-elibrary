"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { BellRing, BookOpen, Megaphone, Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import { PUSH_ONBOARDING_KEYS } from "@/lib/push-client";
import { usePushNotifications } from "@/lib/hooks/usePushNotifications";
import { PUSH_ERROR_CODES } from "@/lib/push-utils";

export default function PushNotificationOnboarding() {
  const t = useTranslations("pushNotifications");
  const pathname = usePathname();
  const titleId = useId();
  const descriptionId = useId();
  const [open, setOpen] = useState(false);
  const dialogRef = useFocusTrap<HTMLDivElement>(open);
  const { status, loading, busyAction, enable } = usePushNotifications();

  const dismiss = useCallback(() => {
    window.localStorage.setItem(PUSH_ONBOARDING_KEYS.dismissedAt, new Date().toISOString());
    setOpen(false);
  }, []);

  useEffect(() => {
    if (pathname.startsWith("/admin") || pathname.startsWith("/auth")) return;
    if (loading || open) return;
    if (status.code === PUSH_ERROR_CODES.UNAUTHORIZED) return;
    if (status.kind === "dev-disabled") return;
    if (!status.supported || !status.isStandalone || status.permission !== "default") return;

    const completed = window.localStorage.getItem(PUSH_ONBOARDING_KEYS.completed) === "true";
    const dismissed = !!window.localStorage.getItem(PUSH_ONBOARDING_KEYS.dismissedAt);
    const seen = window.localStorage.getItem(PUSH_ONBOARDING_KEYS.seen) === "true";
    if (completed || dismissed || seen) return;

    window.localStorage.setItem(PUSH_ONBOARDING_KEYS.seen, "true");
    setOpen(true);
  }, [loading, open, pathname, status.code, status.isStandalone, status.kind, status.permission, status.supported]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && busyAction !== "enable") dismiss();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [busyAction, dismiss, open]);

  useEffect(() => {
    if (open && status.kind === "enabled") setOpen(false);
  }, [open, status.kind]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && busyAction !== "enable") dismiss();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="w-full max-w-[460px] overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-divider p-5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-brand/15 bg-brand/10 text-brand">
            <BellRing className="h-6 w-6" />
          </span>
          <button
            type="button"
            onClick={dismiss}
            disabled={busyAction === "enable"}
            aria-label={t("close")}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-text-muted transition hover:bg-paper hover:text-text-heading focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">
          <h2 id={titleId} className="font-khmer-serif text-xl font-bold leading-snug text-text-heading">
            {t("onboardingTitle")}
          </h2>
          <p id={descriptionId} className="mt-2 text-sm leading-6 text-text-muted">
            {t("onboardingDescription")}
          </p>

          <ul className="mt-5 space-y-3 text-sm text-text-body">
            <li className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
                <BookOpen className="h-4 w-4" />
              </span>
              {t("benefitBooks")}
            </li>
            <li className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-amber-50 text-amber-700">
                <Megaphone className="h-4 w-4" />
              </span>
              {t("benefitAnnouncements")}
            </li>
            <li className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-sky-50 text-sky-700">
                <Sparkles className="h-4 w-4" />
              </span>
              {t("benefitAccess")}
            </li>
          </ul>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={dismiss}
              disabled={busyAction === "enable"}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-divider bg-paper px-4 py-2.5 text-sm font-bold text-text-body transition hover:border-brand/50 hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:opacity-50"
            >
              {t("notNow")}
            </button>
            <button
              type="button"
              onClick={enable}
              disabled={busyAction === "enable"}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <BellRing className="h-4 w-4" />
              {busyAction === "enable" ? t("enabling") : t("allow")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
