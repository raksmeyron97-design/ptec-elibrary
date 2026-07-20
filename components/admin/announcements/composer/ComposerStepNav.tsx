"use client";

import { useTranslations } from "next-intl";
import { Check, FileText, Radio, Users, CalendarClock, ClipboardCheck, type LucideIcon } from "lucide-react";

export type ComposerStepKey = "content" | "channels" | "audience" | "schedule" | "review";

export const COMPOSER_STEPS: { key: ComposerStepKey; icon: LucideIcon }[] = [
  { key: "content", icon: FileText },
  { key: "channels", icon: Radio },
  { key: "audience", icon: Users },
  { key: "schedule", icon: CalendarClock },
  { key: "review", icon: ClipboardCheck },
];

/** Accessible step tablist — desktop sidebar / tablet horizontal / mobile
 *  progress bar, adapted from the theses authoring wizard's ThesisStepNav. */
export default function ComposerStepNav({
  active,
  completed,
  errorCounts,
  onSelect,
}: {
  active: ComposerStepKey;
  completed: Set<ComposerStepKey>;
  errorCounts: Partial<Record<ComposerStepKey, number>>;
  onSelect: (step: ComposerStepKey) => void;
}) {
  const t = useTranslations("adminAnnouncements.composer.steps");
  const activeIndex = COMPOSER_STEPS.findIndex((s) => s.key === active);

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const next = COMPOSER_STEPS[(index + dir + COMPOSER_STEPS.length) % COMPOSER_STEPS.length];
    onSelect(next.key);
    document.getElementById(`composer-step-${next.key}`)?.focus();
  }

  return (
    <>
      <div
        role="tablist"
        aria-label={t("navAria")}
        className="flex gap-1 overflow-x-auto border-b border-divider bg-paper/30 p-3 md:w-56 md:shrink-0 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r"
      >
        {COMPOSER_STEPS.map((step, i) => {
          const isActive = active === step.key;
          const isDone = completed.has(step.key);
          const errCount = errorCounts[step.key] ?? 0;
          return (
            <button
              key={step.key}
              type="button"
              id={`composer-step-${step.key}`}
              role="tab"
              aria-selected={isActive}
              aria-controls={`composer-panel-${step.key}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onSelect(step.key)}
              onKeyDown={(e) => handleKeyDown(e, i)}
              className={`flex shrink-0 cursor-pointer items-center gap-3 rounded-lg px-4 py-3 text-left text-sm font-medium transition-all ${
                isActive ? "bg-brand/10 text-brand shadow-sm" : "text-text-muted hover:bg-paper hover:text-text-heading"
              }`}
            >
              <step.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-brand" : "text-text-muted"}`} />
              <span className="flex-1 whitespace-nowrap">{t(step.key)}</span>
              {errCount > 0 ? (
                <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white" aria-hidden="true">
                  {errCount}
                </span>
              ) : isDone ? (
                <Check className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
              ) : null}
              <span className="sr-only" aria-live="polite">
                {errCount > 0 ? t("srErrors", { count: errCount }) : isDone ? t("srComplete") : ""}
                {isActive ? t("srCurrent") : ""}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1 border-b border-divider bg-paper/30 px-3 py-2 md:hidden" aria-hidden="true">
        {COMPOSER_STEPS.map((step, i) => (
          <div key={step.key} className={`h-1.5 flex-1 rounded-full ${i <= activeIndex ? "bg-brand" : "bg-divider"}`} />
        ))}
      </div>
    </>
  );
}
