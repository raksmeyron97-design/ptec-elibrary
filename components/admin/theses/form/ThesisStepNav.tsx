"use client";

import { Check, FileText, GraduationCap, Users, AlignLeft, BookOpen, Paperclip, ClipboardCheck, type LucideIcon } from "lucide-react";

export type ThesisStepKey = "basic" | "classification" | "people" | "abstract" | "references" | "files" | "review";

export const THESIS_STEPS: { key: ThesisStepKey; label: string; icon: LucideIcon }[] = [
  { key: "basic", label: "Basic Info", icon: FileText },
  { key: "classification", label: "Classification", icon: GraduationCap },
  { key: "people", label: "People", icon: Users },
  { key: "abstract", label: "Abstract", icon: AlignLeft },
  { key: "references", label: "References", icon: BookOpen },
  { key: "files", label: "Files", icon: Paperclip },
  { key: "review", label: "Review", icon: ClipboardCheck },
];

/**
 * Sidebar (desktop) / horizontal tabs (tablet) / compact progress stepper
 * (mobile) step navigation — spec §6 + §20. Completed steps show a check,
 * steps with hard validation errors show a red error count, and the current
 * step is highlighted. Errors are announced via aria-live so screen readers
 * get the count without polling.
 */
export default function ThesisStepNav({
  active,
  completed,
  errorCounts,
  onSelect,
}: {
  active: ThesisStepKey;
  completed: Set<ThesisStepKey>;
  errorCounts: Partial<Record<ThesisStepKey, number>>;
  onSelect: (step: ThesisStepKey) => void;
}) {
  const activeIndex = THESIS_STEPS.findIndex((s) => s.key === active);

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const next = THESIS_STEPS[(index + dir + THESIS_STEPS.length) % THESIS_STEPS.length];
    onSelect(next.key);
    document.getElementById(`thesis-step-${next.key}`)?.focus();
  }

  return (
    <>
      {/* Desktop vertical / tablet horizontal — same markup, CSS handles the switch */}
      <div
        role="tablist"
        aria-label="Thesis form steps"
        className="flex md:flex-col gap-1 overflow-x-auto md:overflow-y-auto border-b md:border-b-0 md:border-r border-divider p-3 md:w-56 md:shrink-0 bg-paper/30"
      >
        {THESIS_STEPS.map((step, i) => {
          const isActive = active === step.key;
          const isDone = completed.has(step.key);
          const errCount = errorCounts[step.key] ?? 0;
          return (
            <button
              key={step.key}
              type="button"
              id={`thesis-step-${step.key}`}
              role="tab"
              aria-selected={isActive}
              aria-controls={`thesis-panel-${step.key}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onSelect(step.key)}
              onKeyDown={(e) => handleKeyDown(e, i)}
              className={`flex shrink-0 items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all cursor-pointer text-left ${
                isActive
                  ? "bg-brand/10 text-brand shadow-sm"
                  : "text-text-muted hover:bg-paper hover:text-text-heading"
              }`}
            >
              <step.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-brand" : "text-text-muted"}`} />
              <span className="flex-1 whitespace-nowrap">{step.label}</span>
              {errCount > 0 ? (
                <span
                  className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
                  aria-hidden="true"
                >
                  {errCount}
                </span>
              ) : isDone ? (
                <Check className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
              ) : null}
              <span className="sr-only" aria-live="polite">
                {errCount > 0 ? `, ${errCount} error${errCount === 1 ? "" : "s"}` : isDone ? ", complete" : ""}
                {isActive ? ", current step" : ""}
              </span>
            </button>
          );
        })}
      </div>

      {/* Mobile compact progress stepper */}
      <div className="flex items-center gap-1 border-b border-divider bg-paper/30 px-3 py-2 md:hidden" aria-hidden="true">
        {THESIS_STEPS.map((step, i) => (
          <div
            key={step.key}
            className={`h-1.5 flex-1 rounded-full ${i <= activeIndex ? "bg-brand" : "bg-divider"}`}
          />
        ))}
      </div>
    </>
  );
}
