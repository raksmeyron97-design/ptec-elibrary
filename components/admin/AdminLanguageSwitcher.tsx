"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
// Plain next/navigation on purpose: /admin sits outside the locale-prefixed
// routing scheme — its locale comes from the ptec_locale cookie, so switching
// is a cookie write + refresh, never a path change.
import { useRouter } from "next/navigation";
import { setLocaleCookie } from "@/app/actions/locale";

/** EN/ខ្មែរ segmented toggle for the admin topbar (cookie-driven locale). */
export default function AdminLanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations("adminShell.locale");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function switchTo(next: "en" | "km") {
    if (next === locale || pending) return;
    startTransition(async () => {
      await setLocaleCookie(next);
      router.refresh();
    });
  }

  return (
    <div
      role="group"
      aria-label={t("label")}
      className="inline-flex items-center rounded-xl border border-divider bg-paper p-0.5"
    >
      {(["en", "km"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => switchTo(l)}
          aria-pressed={locale === l}
          disabled={pending}
          className={`cursor-pointer rounded-[10px] px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60 ${
            locale === l
              ? "bg-bg-surface text-brand shadow-sm"
              : "text-text-muted hover:text-text-heading"
          }`}
        >
          {t(l)}
        </button>
      ))}
    </div>
  );
}
