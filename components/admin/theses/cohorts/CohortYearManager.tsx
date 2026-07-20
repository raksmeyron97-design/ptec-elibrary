"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { X, Loader2 } from "lucide-react";
import {
  getThesisPrograms,
  getThesisFaculties,
  getThesisCohorts,
  getThesisAcademicYears,
  type ThesisProgram,
  type ThesisFaculty,
  type ThesisCohort,
  type ThesisAcademicYear,
} from "@/app/actions/theses";
import ManageCohortsClient from "@/app/(admin)/admin/(protected)/theses/manage-cohorts/ManageCohortsClient";

type Lookups = {
  programs: ThesisProgram[];
  faculties: ThesisFaculty[];
  cohorts: ThesisCohort[];
  years: ThesisAcademicYear[];
};

/**
 * Modal wrapper around the existing ManageCohortsClient (spec §18 — "open
 * modal instead of leaving page, if possible"). Deliberately does NOT
 * reimplement any of that component's CRUD logic: ManageCohortsClient
 * already takes its 4 lookup lists as plain props and manages all its own
 * state, so it drops into a dialog unmodified — the only new code here is
 * the fetch-on-open + modal chrome.
 *
 * ManageCohortsClient calls `router.refresh()` after every mutation, which
 * re-runs server components but NOT the `useEffect` fetch inside
 * ProgramCohortFields (a separate, already-mounted client component in the
 * Classification step). So the caller must remount ProgramCohortFields
 * itself on close (e.g. via a `key` bump) to see new cohorts/years — see
 * ClassificationStep.tsx.
 */
export default function CohortYearManager({ onClose }: { onClose: () => void }) {
  const t = useTranslations("adminThesisForm.cohortManager");
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [error, setError] = useState<string | null>(null);
  const headingId = "cohort-year-manager-heading";
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [programRes, facultyRes, cohortRes, yearRes] = await Promise.all([
        getThesisPrograms(),
        getThesisFaculties(),
        getThesisCohorts(),
        getThesisAcademicYears(),
      ]);
      if (cancelled) return;
      if (programRes.error || facultyRes.error || cohortRes.error || yearRes.error) {
        setError(programRes.error ?? facultyRes.error ?? cohortRes.error ?? yearRes.error ?? t("loadFailed"));
        return;
      }
      setLookups({
        programs: programRes.data ?? [],
        faculties: facultyRes.data ?? [],
        cohorts: cohortRes.data ?? [],
        years: yearRes.data ?? [],
      });
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 0);
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab") return;
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), a[href]",
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusTimer);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-bg-surface shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-divider px-5 py-3">
          <h2 id={headingId} className="text-sm font-bold text-text-heading">{t("heading")}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition hover:bg-paper hover:text-text-heading"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
          ) : !lookups ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("loading")}
            </div>
          ) : (
            <ManageCohortsClient
              initialPrograms={lookups.programs}
              initialFaculties={lookups.faculties}
              initialCohorts={lookups.cohorts}
              initialYears={lookups.years}
            />
          )}
        </div>
      </div>
    </div>
  );
}
