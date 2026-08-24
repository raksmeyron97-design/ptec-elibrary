"use client";

import { useTranslations } from "next-intl";
import { Check, FileText, GraduationCap, Users, AlignLeft, BookOpen, Paperclip, ClipboardCheck, type LucideIcon } from "lucide-react";

export type ThesisStepKey = "basic" | "classification" | "people" | "abstract" | "references" | "files" | "review";

/** How a step's badge should read. See STEP_STATE_NOTE below. */
export type ThesisStepState = "complete" | "attention" | "todo" | "optional";

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
 * (mobile) step navigation.
 *
 * STEP_STATE_NOTE — this used to show a red count badge ("2", "3") on every
 * step with outstanding publish errors, which meant a brand-new Create form
 * opened with red numbers on four of its seven steps. The number was also
 * telling the author something they could not use: nobody needs to know a step
 * has three problems rather than two before they have opened it. Four states
 * now, and the badge says only what to do next:
 *
 *   complete   green check   filled in, nothing outstanding
 *   attention  red dot       required, incomplete, and publishing is blocked on it
 *   todo       amber dot     required and still empty, but nothing is blocked yet
 *   optional   grey dash     optional and empty — deliberately quiet
 *
 * `todo` is the state that keeps a fresh form calm. The distinction is not
 * cosmetic: red is a claim that something is wrong, and on an untouched draft
 * nothing is — a draft has only ever needed a title. It turns red when the
 * author asks to publish, which is when the rule actually applies.
 */
export default function ThesisStepNav({
  active,
  states,
  onSelect,
}: {
  active: ThesisStepKey;
  states: Record<ThesisStepKey, ThesisStepState>;
  onSelect: (step: ThesisStepKey) => void;
}) {
  const t = useTranslations("adminThesisForm.steps");
  const activeIndex = THESIS_STEPS.findIndex((s) => s.key === active);
  const completedCount = THESIS_STEPS.filter((s) => states[s.key] === "complete").length;
  const blockingCount = THESIS_STEPS.filter((s) => states[s.key] === "attention").length;

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
      <div className="md:w-56 md:shrink-0 md:border-r border-divider bg-paper/30">
        {/*
          Progress header. Seven steps with no counter left the author with no
          idea how much form was left below the fold; "Step 3 of 7" is cheap and
          answers it. The bar tracks *completed* steps rather than position,
          because how far you have scrolled is not how much you have done.
        */}
        <div className="hidden border-b border-divider px-4 pb-3 pt-4 md:block">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-text-heading">
              {t("progressStep", { current: activeIndex + 1, total: THESIS_STEPS.length })}
            </p>
            <p className="text-xs tabular-nums text-text-muted">
              {t("progressDone", { done: completedCount, total: THESIS_STEPS.length })}
            </p>
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-divider"
            role="progressbar"
            aria-valuenow={completedCount}
            aria-valuemin={0}
            aria-valuemax={THESIS_STEPS.length}
            aria-label={t("progressAria")}
          >
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-300"
              style={{ width: `${(completedCount / THESIS_STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Desktop vertical / tablet horizontal — same markup, CSS handles the switch */}
        <div
          role="tablist"
          aria-label={t("navAria")}
          className="flex gap-1 overflow-x-auto border-b border-divider p-3 md:flex-col md:overflow-y-auto md:border-b-0"
        >
          {THESIS_STEPS.map((step, i) => {
            const isActive = active === step.key;
            const state = states[step.key];
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
                className={`focus-field flex shrink-0 cursor-pointer items-center gap-3 rounded-lg px-4 py-3 text-left text-sm font-medium transition-all ${
                  isActive
                    ? "bg-brand/10 text-brand shadow-sm"
                    : "text-text-muted hover:bg-paper hover:text-text-heading"
                }`}
              >
                <step.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-brand" : "text-text-muted"}`} />
                <span className="flex-1 whitespace-nowrap">{t(step.key)}</span>
                <StepBadge state={state} />
                {/*
                  Static description of this step, read as part of the button's
                  accessible name. It is deliberately NOT a live region: one
                  aria-live per step meant seven regions all re-announcing on
                  every keystroke, because the states recompute as the author
                  types. The single live region below reports changes.
                */}
                <span className="sr-only">
                  {state === "complete"
                    ? t("srComplete")
                    : state === "attention"
                      ? t("srBlocking")
                      : state === "todo"
                        ? t("srTodo")
                        : t("srOptional")}
                  {isActive ? t("srCurrent") : ""}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/*
        One live region for the whole nav. Screen readers hear the count when it
        changes, instead of seven separate steps competing to announce.
      */}
      <p aria-live="polite" className="sr-only">
        {blockingCount > 0 ? t("srBlockingCount", { count: blockingCount }) : ""}
      </p>

      {/* Mobile compact progress stepper */}
      <div className="flex items-center gap-2 border-b border-divider bg-paper/30 px-3 py-2 md:hidden">
        <span className="shrink-0 text-xs font-semibold tabular-nums text-text-muted">
          {t("progressStep", { current: activeIndex + 1, total: THESIS_STEPS.length })}
        </span>
        <span className="flex flex-1 items-center gap-1" aria-hidden="true">
          {THESIS_STEPS.map((step, i) => (
            <span
              key={step.key}
              className={`h-1.5 flex-1 rounded-full ${i <= activeIndex ? "bg-brand" : "bg-divider"}`}
            />
          ))}
        </span>
      </div>
    </>
  );
}

function StepBadge({ state }: { state: ThesisStepState }) {
  if (state === "complete") {
    return <Check className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />;
  }
  if (state === "attention") {
    return <span className="h-2 w-2 shrink-0 rounded-full bg-danger" aria-hidden="true" />;
  }
  if (state === "todo") {
    return <span className="h-2 w-2 shrink-0 rounded-full bg-warning" aria-hidden="true" />;
  }
  // Optional and empty: present, so the row does not reflow when it fills in,
  // but quiet enough not to read as an outstanding task.
  return <span className="h-px w-2.5 shrink-0 rounded-full bg-text-muted/40" aria-hidden="true" />;
}
