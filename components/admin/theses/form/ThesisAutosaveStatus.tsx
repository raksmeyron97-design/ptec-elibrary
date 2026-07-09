"use client";

import { Check, Loader2, AlertCircle } from "lucide-react";

export type AutosaveStatus = "idle" | "unsaved" | "saving" | "saved" | "error";

const DISPLAY: Record<Exclude<AutosaveStatus, "idle">, { label: string; className: string; icon: React.ReactNode }> = {
  unsaved: { label: "Unsaved changes", className: "text-text-muted", icon: null },
  saving: { label: "Saving…", className: "text-text-muted", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  saved: { label: "Saved", className: "text-emerald-600", icon: <Check className="h-3 w-3" /> },
  error: { label: "Autosave failed", className: "text-red-600", icon: <AlertCircle className="h-3 w-3" /> },
};

export default function ThesisAutosaveStatus({ status }: { status: AutosaveStatus }) {
  if (status === "idle") return null;
  const display = DISPLAY[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${display.className}`} aria-live="polite">
      {display.icon}
      {display.label}
    </span>
  );
}
