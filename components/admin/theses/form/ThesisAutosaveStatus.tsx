"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2, AlertCircle } from "lucide-react";

export type AutosaveStatus = "idle" | "unsaved" | "saving" | "saved" | "error";

const DISPLAY: Record<Exclude<AutosaveStatus, "idle">, { className: string; icon: React.ReactNode }> = {
  unsaved: { className: "text-text-muted", icon: null },
  saving: { className: "text-text-muted", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  saved: { className: "text-success", icon: <Check className="h-3 w-3" /> },
  error: { className: "text-danger", icon: <AlertCircle className="h-3 w-3" /> },
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

/**
 * "Last saved 2 minutes ago", beside the save cluster.
 *
 * The transient status pill above says "Saved" for 2.5 seconds and then
 * disappears, which answers "did that just save?" but not "is my work safe?" —
 * the question an author actually has when they come back to a form they left
 * open. This is the durable half of the answer, and it stays after the pill has
 * gone.
 *
 * It re-renders on its own 30s tick rather than on the parent's state, so a
 * form with no activity still ages its label truthfully. It renders nothing
 * until the first successful save, because "never" is not reassurance.
 */
const TICK_MS = 30_000;

/**
 * The clock, as an external store.
 *
 * Reading `Date.now()` during render is impure — React may re-render this
 * component for reasons unrelated to time and get a different answer each
 * time. `useSyncExternalStore` is the sanctioned way to read a mutable
 * external source: the snapshot is the 30-second bucket, which is stable
 * between ticks, so React sees a value that changes only when the subscription
 * fires. 30s granularity is exactly the resolution "2 minutes ago" needs.
 */
function subscribeToClock(onChange: () => void) {
  const id = setInterval(onChange, TICK_MS);
  return () => clearInterval(id);
}
const clockSnapshot = () => Math.floor(Date.now() / TICK_MS);
const clockServerSnapshot = () => 0;

export function ThesisLastSaved({ at }: { at: number | null }) {
  const t = useTranslations("adminThesisForm.autosave");
  const bucket = useSyncExternalStore(subscribeToClock, clockSnapshot, clockServerSnapshot);

  if (at == null) return null;

  const seconds = Math.max(0, Math.round((bucket * TICK_MS - at) / 1000));
  const label =
    seconds < 60
      ? t("lastSavedJustNow")
      : seconds < 3600
        ? t("lastSavedMinutes", { count: Math.floor(seconds / 60) })
        : t("lastSavedHours", { count: Math.floor(seconds / 3600) });

  return (
    <span className="text-xs text-text-muted" title={new Date(at).toLocaleTimeString()}>
      {label}
    </span>
  );
}
