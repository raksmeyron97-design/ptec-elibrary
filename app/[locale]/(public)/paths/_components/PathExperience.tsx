"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  Check, ChevronDown, GraduationCap, BookOpen, ScrollText, Library, ExternalLink,
  Clock, PlayCircle, ChevronUp, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle, Circle,
} from "lucide-react";
import type { LearningPathDetail, StepResourceType } from "@/app/actions/learning-paths";
import { enrollInPath, setStepComplete } from "@/app/actions/learning-paths";
import { progressPercent } from "@/lib/learning-paths/format";
import { formatDuration } from "./format-duration";

const RESOURCE_ICON: Record<StepResourceType, typeof BookOpen> = {
  book: BookOpen,
  research: GraduationCap,
  catalog: Library,
  publication: ScrollText,
  external: ExternalLink,
};
const RESOURCE_TYPE_KEY: Record<StepResourceType, string> = {
  book: "typeEbook",
  research: "typeThesis",
  catalog: "typePhysical",
  publication: "typePublication",
  external: "typeLink",
};

type FlatStep = LearningPathDetail["modules"][number]["steps"][number] & { moduleId: string; globalIndex: number };

export default function PathExperience({
  path,
  initialCompletedStepIds,
  initialEnrolled,
  isLoggedIn,
}: {
  path: LearningPathDetail;
  initialCompletedStepIds: string[];
  initialEnrolled: boolean;
  isLoggedIn: boolean;
}) {
  const t = useTranslations("paths");
  const locale = useLocale();
  const [, startTransition] = useTransition();

  const [completed, setCompleted] = useState<Set<string>>(() => new Set(initialCompletedStepIds));
  const [enrolled, setEnrolled] = useState(initialEnrolled);
  const [announce, setAnnounce] = useState("");

  // Flatten steps in curriculum order for current/next/prev logic.
  const flatSteps = useMemo<FlatStep[]>(() => {
    let idx = 0;
    return path.modules.flatMap((m) => m.steps.map((s) => ({ ...s, moduleId: m.id, globalIndex: idx++ })));
  }, [path.modules]);

  const completedCount = flatSteps.filter((s) => completed.has(s.id)).length;
  const pct = progressPercent(completedCount, flatSteps.length);
  const isComplete = flatSteps.length > 0 && completedCount === flatSteps.length;

  // "Current" step = first uncompleted step in order.
  const currentStep = useMemo(() => flatSteps.find((s) => !completed.has(s.id)) ?? null, [flatSteps, completed]);

  // Accordion open-state: open the module holding the current step by default.
  const [openModules, setOpenModules] = useState<Set<string>>(() => {
    const done = new Set(initialCompletedStepIds);
    let currentModuleId: string | undefined;
    outer: for (const m of path.modules) {
      for (const s of m.steps) {
        if (!done.has(s.id)) { currentModuleId = m.id; break outer; }
      }
    }
    const target = currentModuleId ?? path.modules[0]?.id;
    return target ? new Set([target]) : new Set();
  });

  const toggleModule = useCallback((id: string) => {
    setOpenModules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const stepRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  const scrollToStep = useCallback((step: FlatStep) => {
    setOpenModules((prev) => new Set(prev).add(step.moduleId));
    // Wait a frame for the module to expand before scrolling.
    requestAnimationFrame(() => {
      const el = stepRefs.current.get(step.id);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  function requireAuth(): boolean {
    if (!isLoggedIn) {
      window.location.assign(`/auth/login?callbackUrl=/paths/${path.slug}`);
      return false;
    }
    return true;
  }

  function toggleStep(stepId: string) {
    if (!requireAuth()) return;
    const next = !completed.has(stepId);
    setCompleted((prev) => {
      const s = new Set(prev);
      if (next) s.add(stepId); else s.delete(stepId);
      return s;
    });
    if (!enrolled) setEnrolled(true);
    setAnnounce(next ? t("markComplete") : t("markIncomplete"));
    startTransition(async () => {
      const res = await setStepComplete(stepId, path.id, next);
      if ("error" in res) {
        // Roll back the optimistic toggle on failure.
        setCompleted((prev) => {
          const s = new Set(prev);
          if (next) s.delete(stepId); else s.add(stepId);
          return s;
        });
        setAnnounce("");
      }
    });
  }

  function handleStart() {
    if (!requireAuth()) return;
    if (!enrolled) {
      setEnrolled(true);
      startTransition(async () => { await enrollInPath(path.id); });
    }
    if (currentStep) scrollToStep(currentStep);
  }

  // Prev/next relative to the current step (falls back to first).
  const activeIndex = currentStep?.globalIndex ?? 0;
  const gotoRelative = (delta: number) => {
    const target = flatSteps[Math.min(flatSteps.length - 1, Math.max(0, activeIndex + delta))];
    if (target) scrollToStep(target);
  };

  const startLabel = isComplete ? t("cardReview") : completedCount > 0 ? t("resumeCta") : t("startLearning");

  return (
    <div>
      <p aria-live="polite" className="sr-only">{announce}</p>

      {/* ── Sticky progress bar ── */}
      {flatSteps.length > 0 && (
        <div className="sticky top-2 z-20 mb-6 rounded-2xl border border-divider bg-bg-surface/95 p-3.5 shadow-sm backdrop-blur sm:p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center justify-between text-[12px] font-semibold text-text-muted tabular-nums">
                <span>{t("progressComplete", { completed: completedCount, total: flatSteps.length })}</span>
                <span>{pct}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-paper">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${isComplete ? "bg-emerald-500" : "bg-brand"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => gotoRelative(-1)}
                aria-label={t("prevStep")}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-divider text-text-muted transition hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => gotoRelative(1)}
                aria-label={t("nextStep")}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-divider text-text-muted transition hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
              {!isComplete && (
                <button
                  type="button"
                  onClick={handleStart}
                  className="btn-brand-gradient inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-[13px] font-bold text-white"
                >
                  <PlayCircle className="h-4 w-4" aria-hidden="true" />
                  {startLabel}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Completion banner ── */}
      {isComplete && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800/40 dark:bg-emerald-900/10">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <div>
            <p className="text-[14px] font-bold text-emerald-800 dark:text-emerald-300">{t("completedTitle")}</p>
            <p className="mt-0.5 text-[13px] text-emerald-700/90 dark:text-emerald-400/80">{t("completedBody")}</p>
          </div>
        </div>
      )}

      {/* ── Curriculum accordion ── */}
      <h2 className="mb-3 text-[15px] font-bold text-text-heading">{t("curriculumHeading")}</h2>
      <div className="space-y-3">
        {path.modules.map((mod, mi) => {
          const isOpen = openModules.has(mod.id);
          const moduleTitle = (locale === "km" && mod.title_km) || mod.title;
          const moduleDesc = (locale === "km" && mod.description_km) || mod.description;
          const modDone = mod.steps.filter((s) => completed.has(s.id)).length;
          const panelId = `module-panel-${mod.id}`;

          return (
            <section key={mod.id} className="overflow-hidden rounded-2xl border border-divider bg-bg-surface">
              <h3>
                <button
                  type="button"
                  onClick={() => toggleModule(mod.id)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-paper/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring/50 sm:p-5"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[13px] font-bold text-brand tabular-nums">
                    {mi + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10.5px] font-bold uppercase tracking-wide text-text-muted">
                      {t("moduleLabel", { index: mi + 1 })}
                    </span>
                    <span className="block truncate text-[15px] font-bold text-text-heading">{moduleTitle}</span>
                  </span>
                  <span className="shrink-0 text-[12px] font-semibold text-text-muted tabular-nums">
                    {modDone}/{mod.steps.length}
                  </span>
                  {isOpen ? (
                    <ChevronUp className="h-4.5 w-4.5 shrink-0 text-text-muted" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="h-4.5 w-4.5 shrink-0 text-text-muted" aria-hidden="true" />
                  )}
                </button>
              </h3>

              {isOpen && (
                <div id={panelId} className="border-t border-divider px-4 pb-4 pt-1 sm:px-5">
                  {moduleDesc && <p className="mb-3 mt-3 text-[13px] leading-relaxed text-text-muted">{moduleDesc}</p>}
                  <ol className="space-y-2.5">
                    {mod.steps.map((step) => {
                      const Icon = RESOURCE_ICON[step.resource_type];
                      const isDone = completed.has(step.id);
                      const isCurrent = currentStep?.id === step.id;
                      const stepTitle = step.resource_title ?? "—";
                      const instruction = (locale === "km" && step.instruction_km) || step.instruction;
                      const duration = formatDuration(step.est_minutes, t);
                      const isExternal = step.resource_type === "external";

                      return (
                        <li
                          key={step.id}
                          ref={(el) => { if (el) stepRefs.current.set(step.id, el); }}
                          className={`flex items-start gap-3 rounded-xl border p-3.5 transition ${
                            isCurrent
                              ? "border-brand/50 bg-brand/[0.04] ring-1 ring-brand/20"
                              : "border-divider bg-paper/50"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => toggleStep(step.id)}
                            aria-pressed={isDone}
                            aria-label={isDone ? t("markIncomplete") : t("markComplete")}
                            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
                              isDone
                                ? "border-emerald-500 bg-emerald-500 text-white"
                                : "border-divider bg-bg-surface text-transparent hover:border-brand/50"
                            }`}
                          >
                            <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
                          </button>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                              <span className="inline-flex items-center gap-1">
                                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                                {t(RESOURCE_TYPE_KEY[step.resource_type])}
                              </span>
                              {duration && (
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="h-3 w-3" aria-hidden="true" />
                                  {duration}
                                </span>
                              )}
                              {step.is_required ? (
                                <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[9.5px] font-bold text-brand">{t("requiredLabel")}</span>
                              ) : (
                                <span className="rounded bg-paper px-1.5 py-0.5 text-[9.5px] font-bold text-text-muted">{t("optionalLabel")}</span>
                              )}
                              {isCurrent && (
                                <span className="inline-flex items-center gap-1 rounded bg-brand px-1.5 py-0.5 text-[9.5px] font-bold text-white">
                                  <Circle className="h-2 w-2 fill-current" aria-hidden="true" />
                                  {t("nextStep")}
                                </span>
                              )}
                            </div>

                            {step.missing ? (
                              <p className="mt-0.5 inline-flex items-center gap-1.5 text-[14px] font-semibold text-text-muted">
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
                                <span className={isDone ? "line-through" : ""}>{stepTitle}</span>
                                <span className="text-[11px] font-normal text-amber-600">({t("unavailableResource")})</span>
                              </p>
                            ) : step.url ? (
                              <Link
                                href={step.url}
                                target={isExternal ? "_blank" : undefined}
                                rel={isExternal ? "noopener noreferrer" : undefined}
                                className={`mt-0.5 inline-flex items-center gap-1 text-[14.5px] font-semibold leading-snug hover:text-brand hover:underline ${
                                  isDone ? "text-text-muted line-through" : "text-text-heading"
                                }`}
                              >
                                {stepTitle}
                                {isExternal && <ExternalLink className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-label={t("opensInNewTab")} />}
                              </Link>
                            ) : (
                              <p className={`mt-0.5 text-[14.5px] font-semibold leading-snug ${isDone ? "text-text-muted line-through" : "text-text-heading"}`}>
                                {stepTitle}
                              </p>
                            )}

                            {instruction && <p className="mt-1 text-[13px] leading-relaxed text-text-muted">{instruction}</p>}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}
            </section>
          );
        })}
      </div>

      {!isLoggedIn && flatSteps.length > 0 && (
        <div className="mt-6 flex flex-col items-start gap-3 rounded-2xl border border-brand/20 bg-brand/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[14px] font-bold text-text-heading">{t("loginPromptTitle")}</p>
            <p className="mt-0.5 text-[13px] text-text-muted">{t("loginPromptBody")}</p>
          </div>
          <a
            href={`/auth/login?callbackUrl=/paths/${path.slug}`}
            className="btn-brand-gradient inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-bold text-white"
          >
            <GraduationCap className="h-4 w-4" aria-hidden="true" />
            {t("signIn")}
          </a>
        </div>
      )}
    </div>
  );
}
