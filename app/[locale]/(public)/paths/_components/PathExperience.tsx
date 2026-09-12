"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  Check, ChevronDown, GraduationCap, BookOpen, ScrollText, Library, ExternalLink,
  Clock, PlayCircle, ChevronUp, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle, Circle,
  ChevronsDownUp, ChevronsUpDown,
} from "lucide-react";
import type { LearningPathDetail, StepResourceType } from "@/app/actions/learning-paths";
import { enrollInPath, setStepComplete } from "@/app/actions/learning-paths";
import { progressPercent } from "@/lib/learning-paths/format";
import { LangText } from "@/components/ui/core/LangText";
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

/** Anchor id for a module, so `#module-3` in a shared link lands open on it. */
function moduleAnchor(index: number): string {
  return `module-${index + 1}`;
}

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

  // A shared `#module-N` link opens that module too. Read once on mount —
  // the hash is not available during the server render, and it must not
  // override the "current step" default on an ordinary visit.
  useEffect(() => {
    const m = /^#module-(\d+)$/.exec(window.location.hash);
    if (!m) return;
    const index = Number(m[1]) - 1;
    const mod = path.modules[index];
    if (!mod) return;
    // Deferred a frame: the browser is the external system here (its hash),
    // and opening + scrolling after paint keeps the first render untouched.
    const frame = requestAnimationFrame(() => {
      setOpenModules((prev) => new Set(prev).add(mod.id));
      requestAnimationFrame(() => document.getElementById(moduleAnchor(index))?.scrollIntoView({ block: "start" }));
    });
    return () => cancelAnimationFrame(frame);
  }, [path.modules]);

  const toggleModule = useCallback((id: string) => {
    setOpenModules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allOpen = openModules.size >= path.modules.length;
  const toggleAll = useCallback(() => {
    setOpenModules(allOpen ? new Set() : new Set(path.modules.map((m) => m.id)));
  }, [allOpen, path.modules]);

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
  const progressText = t("progressComplete", { completed: completedCount, total: flatSteps.length });
  // The docked phone action names the step it will open, so "Continue" is a
  // promise about somewhere specific rather than a verb.
  const dockLabel =
    isComplete
      ? t("cardReview")
      : completedCount > 0 && currentStep?.resource_title
        ? t("continueWith", { step: currentStep.resource_title })
        : startLabel;

  return (
    <div>
      <p aria-live="polite" className="sr-only">{announce}</p>

      {/* ── Sticky progress card ──
          Stacks on a phone (label row, then a full-width action) and sits in
          one row from sm. The bar is a real progressbar for assistive tech;
          before, it existed only visually. Prev / next appear once there is
          progress to navigate — at 0% they were two 36px targets that did
          nothing, beside the one control that mattered. */}
      {flatSteps.length > 0 && (
        <div className="sticky top-2 z-20 mb-6 rounded-2xl border border-divider bg-bg-surface/95 p-3.5 shadow-sm backdrop-blur sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center justify-between gap-3 text-[12.5px] font-semibold tabular-nums text-text-body">
                <span>{progressText}</span>
                <span>{pct}%</span>
              </div>
              <div
                role="progressbar"
                aria-valuenow={completedCount}
                aria-valuemin={0}
                aria-valuemax={flatSteps.length}
                aria-valuetext={progressText}
                aria-label={t("yourProgress")}
                className="h-2 w-full overflow-hidden rounded-full bg-paper"
              >
                <div
                  className={`h-full rounded-full transition-all duration-300 ${isComplete ? "bg-emerald-500" : "bg-brand"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {!isLoggedIn && (
                <p className="mt-1.5 text-[12.5px] leading-snug text-text-body">{t("progressSignInHint")}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {completedCount > 0 && !isComplete && (
                <>
                  <button
                    type="button"
                    onClick={() => gotoRelative(-1)}
                    aria-label={t("prevStep")}
                    className="flex h-11 w-11 items-center justify-center rounded-lg border border-divider text-text-body transition hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => gotoRelative(1)}
                    aria-label={t("nextStep")}
                    className="flex h-11 w-11 items-center justify-center rounded-lg border border-divider text-text-body transition hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </>
              )}
              {!isComplete && (
                <button
                  type="button"
                  onClick={handleStart}
                  className="btn-brand-gradient inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg px-4 text-[13.5px] font-bold text-white sm:flex-none"
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
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold text-text-heading">{t("curriculumHeading")}</h2>
        {path.modules.length > 1 && (
          <button
            type="button"
            onClick={toggleAll}
            aria-expanded={allOpen}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold text-text-body transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            {allOpen ? <ChevronsDownUp className="h-4 w-4" aria-hidden="true" /> : <ChevronsUpDown className="h-4 w-4" aria-hidden="true" />}
            {allOpen ? t("collapseAll") : t("expandAll")}
          </button>
        )}
      </div>
      <div className="space-y-3">
        {path.modules.map((mod, mi) => {
          const isOpen = openModules.has(mod.id);
          const moduleTitle = (locale === "km" && mod.title_km) || mod.title;
          const moduleDesc = (locale === "km" && mod.description_km) || mod.description;
          const modDone = mod.steps.filter((s) => completed.has(s.id)).length;
          const panelId = `module-panel-${mod.id}`;
          const modMinutes = mod.steps.reduce((sum, s) => sum + (s.est_minutes ?? 0), 0);
          const modDuration = formatDuration(modMinutes, t);

          return (
            <section key={mod.id} id={moduleAnchor(mi)} className="scroll-mt-24 overflow-hidden rounded-2xl border border-divider bg-bg-surface">
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
                    <span className="paths-eyebrow block text-[11px] font-bold text-text-body">
                      {t("moduleLabel", { index: mi + 1 })}
                      {modDuration && <span className="font-semibold text-text-muted"> · {t("steps", { count: mod.steps.length })} · {modDuration}</span>}
                    </span>
                    {/* Wraps to two lines rather than truncating: the words
                        that distinguish "Part 1: Grade 1 Early Reading…" from
                        its neighbours are at the END. */}
                    <span className="line-clamp-2 text-[15px] font-bold leading-snug text-text-heading">
                      <LangText text={moduleTitle} locale={locale} />
                    </span>
                  </span>
                  <span className="shrink-0 text-[12.5px] font-semibold text-text-body tabular-nums">
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
                  {moduleDesc && (
                    <LangText as="p" text={moduleDesc} locale={locale} className="mb-3 mt-3 text-[13px] leading-relaxed text-text-body" />
                  )}
                  <ol className="space-y-2.5">
                    {mod.steps.map((step) => {
                      const Icon = RESOURCE_ICON[step.resource_type];
                      const isDone = completed.has(step.id);
                      const isCurrent = currentStep?.id === step.id;
                      const stepTitle = step.resource_title ?? "—";
                      const instruction = (locale === "km" && step.instruction_km) || step.instruction;
                      const duration = formatDuration(step.est_minutes, t);
                      const isExternal = step.resource_type === "external";
                      const titleClass = `text-[14.5px] font-semibold leading-snug ${isDone ? "text-text-muted line-through" : "text-text-heading"}`;

                      /* The whole row is the link (stretched `after:` pseudo on
                         the title anchor), and the completion toggle is lifted
                         above it with z-10 — so a 90px row is a 90px target,
                         not the 20px title line it used to be. The toggle's
                         visible circle stays 24px inside a 44px hit area. */
                      return (
                        <li
                          key={step.id}
                          ref={(el) => { if (el) stepRefs.current.set(step.id, el); }}
                          className={`relative flex items-start gap-2 rounded-xl border p-3 pl-2 transition sm:p-3.5 sm:pl-2.5 ${
                            isCurrent
                              ? "border-brand/50 bg-brand/[0.04] ring-1 ring-brand/20"
                              : "border-divider bg-paper/50"
                          } ${step.url && !step.missing ? "hover:border-brand/40" : ""}`}
                        >
                          <button
                            type="button"
                            onClick={() => toggleStep(step.id)}
                            aria-pressed={isDone}
                            aria-label={isDone ? t("markNotDone", { title: stepTitle }) : t("markDone", { title: stepTitle })}
                            className="relative z-10 -my-1.5 grid h-11 w-11 shrink-0 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                          >
                            <span
                              aria-hidden="true"
                              className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors ${
                                isDone
                                  ? "border-emerald-500 bg-emerald-500 text-white"
                                  : "border-divider bg-bg-surface text-transparent hover:border-brand/50"
                              }`}
                            >
                              <Check className="h-3.5 w-3.5" strokeWidth={3} />
                            </span>
                          </button>

                          <div className="min-w-0 flex-1 pt-1">
                            {/* Meta. "Required" is the default for every step, so
                                only the exception is badged — a badge on 4 of 4
                                rows, at 9.5px and 2:1 contrast, said nothing
                                and was the least readable text on the site. */}
                            <div className="paths-eyebrow flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold text-text-body">
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
                              {!step.is_required && (
                                <span className="rounded bg-paper px-1.5 py-0.5 text-[11px] font-bold text-text-body">{t("optionalLabel")}</span>
                              )}
                              {isCurrent && (
                                <span className="inline-flex items-center gap-1 rounded bg-brand px-1.5 py-0.5 text-[11px] font-bold text-white">
                                  <Circle className="h-2 w-2 fill-current" aria-hidden="true" />
                                  {t("nextStep")}
                                </span>
                              )}
                            </div>

                            {step.missing ? (
                              <p className="mt-0.5 inline-flex flex-wrap items-center gap-1.5 text-[14px] font-semibold text-text-muted">
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
                                <LangText text={stepTitle} locale={locale} className={isDone ? "line-through" : ""} />
                                <span className="text-[11px] font-normal text-amber-600">({t("unavailableResource")})</span>
                              </p>
                            ) : step.url ? (
                              <h4 className="mt-0.5">
                                <Link
                                  href={step.url}
                                  target={isExternal ? "_blank" : undefined}
                                  rel={isExternal ? "noopener noreferrer" : undefined}
                                  className={`${titleClass} inline-flex items-center gap-1 hover:text-brand focus-visible:outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-focus-ring`}
                                >
                                  <LangText text={stepTitle} locale={locale} />
                                  {isExternal && <ExternalLink className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-label={t("opensInNewTab")} />}
                                </Link>
                              </h4>
                            ) : (
                              <p className={`mt-0.5 ${titleClass}`}>
                                <LangText text={stepTitle} locale={locale} />
                              </p>
                            )}

                            {instruction && (
                              <LangText as="p" text={instruction} locale={locale} className="mt-1 text-[13px] leading-relaxed text-text-body" />
                            )}
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
            <p className="mt-0.5 text-[13px] text-text-body">{t("loginPromptBody")}</p>
          </div>
          <a
            href={`/auth/login?callbackUrl=/paths/${path.slug}`}
            className="btn-brand-gradient inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-bold text-white"
          >
            <GraduationCap className="h-4 w-4" aria-hidden="true" />
            {t("signIn")}
          </a>
        </div>
      )}

      {/* ── Docked phone action ──
          The one control a teacher arriving from a shared link needs, always
          reachable: without it the first action sat ~1,900px down a 375px
          screen. Sits above the bottom tab bar (64px + the safe-area inset);
          the assistant FAB steps aside on this route (AskWidget) so two
          floating controls never share the corner. The spacer keeps the last
          content from hiding behind it. `md:hidden` because from md the sticky
          progress card's own action is on screen. */}
      {flatSteps.length > 0 && (
        <>
          <div aria-hidden="true" className="h-20 md:hidden" />
          <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-40 border-t border-divider bg-bg-surface/95 px-4 py-2.5 backdrop-blur md:hidden">
            <button
              type="button"
              onClick={handleStart}
              className="btn-brand-gradient flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-bold text-white"
            >
              <PlayCircle className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{dockLabel}</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
