"use client";

import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export default function ThesisErrorState() {
  const router = useRouter();
  const t = useTranslations("adminTheses.states");
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-xl border border-danger-line bg-danger-soft px-6 py-16 text-center"
    >
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-bg-surface text-danger shadow-sm">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="text-base font-bold text-danger-text">{t("loadFailed")}</p>
      <button
        type="button"
        onClick={() => router.refresh()}
        className="focus-field mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-danger px-5 text-sm font-bold text-white shadow-sm transition hover:opacity-90"
      >
        {t("retry")}
      </button>
    </div>
  );
}
