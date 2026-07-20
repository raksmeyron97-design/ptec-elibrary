"use client";

import { useTranslations } from "next-intl";
import { Check, Loader2, AlertCircle } from "lucide-react";

export type AutosaveStatus = "idle" | "unsaved" | "saving" | "saved" | "error";

const DISPLAY: Record<Exclude<AutosaveStatus, "idle">, { className: string; icon: React.ReactNode }> = {
  unsaved: { className: "text-text-muted", icon: null },
  saving: { className: "text-text-muted", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  saved: { className: "text-emerald-600", icon: <Check className="h-3 w-3" /> },
  error: { className: "text-red-600", icon: <AlertCircle className="h-3 w-3" /> },
};

export default function ThesisAutosaveStatus({ status }: { status: AutosaveStatus }) {
  const t = useTranslations("adminThesisForm.autosave");
  if (status === "idle") return null;
  const display = DISPLAY[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${display.className}`} aria-live="polite">
      {display.icon}
      {t(status)}
    </span>
  );
}
