"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import { getThesisPrograms, getThesisFaculties, type ThesisProgram, type ThesisFaculty } from "@/app/actions/theses";

export type FacetOption = { value: string; label: string; count: number };

interface Props {
  currentQ: string;
  currentProgram: string;
  currentFaculty: string;
  currentCohort: string;
  currentYear: string;
  currentAuthor: string;
  currentAdvisor: string;
  currentKeyword: string;
  cohorts: FacetOption[];
  years: string[];
  authors: FacetOption[];
  advisors: FacetOption[];
  keywords: FacetOption[];
}

const fieldFocusClass =
  "focus:outline-none focus:ring-2 focus:ring-focus-ring/30 focus:border-brand";

const selectClass = `h-10 w-full rounded-xl border border-divider bg-bg-surface px-3 text-[13.5px] text-text-body outline-none transition-colors appearance-none cursor-pointer ${fieldFocusClass}`;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

export default function AdvancedSearchModal({
  currentQ,
  currentProgram,
  currentFaculty,
  currentCohort,
  currentYear,
  currentAuthor,
  currentAdvisor,
  currentKeyword,
  cohorts,
  years,
  authors,
  advisors,
  keywords,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const [q, setQ] = useState(currentQ);
  const [program, setProgram] = useState(currentProgram);
  const [faculty, setFaculty] = useState(currentFaculty);
  const [cohort, setCohort] = useState(currentCohort);
  const [year, setYear] = useState(currentYear);
  const [author, setAuthor] = useState(currentAuthor);
  const [advisor, setAdvisor] = useState(currentAdvisor);
  const [keyword, setKeyword] = useState(currentKeyword);

  const [programs, setPrograms] = useState<ThesisProgram[]>([]);
  const [faculties, setFaculties] = useState<ThesisFaculty[]>([]);

  useEffect(() => {
    getThesisPrograms().then(({ data }) => setPrograms(data ?? []));
    getThesisFaculties().then(({ data }) => setFaculties(data ?? []));
  }, []);

  // Reset the draft form to the URL's current state each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setQ(currentQ);
    setProgram(currentProgram);
    setFaculty(currentFaculty);
    setCohort(currentCohort);
    setYear(currentYear);
    setAuthor(currentAuthor);
    setAdvisor(currentAdvisor);
    setKeyword(currentKeyword);
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);

    // Move focus into the dialog; give layout a tick to paint first.
    const focusTimer = window.setTimeout(() => firstFieldRef.current?.focus(), 0);
    const trigger = triggerRef.current;

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusTimer);
      trigger?.focus();
    };
  }, [open, currentQ, currentProgram, currentFaculty, currentCohort, currentYear, currentAuthor, currentAdvisor, currentKeyword]);

  const facultyOptions = faculties.filter((f) => f.program_code === program);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const params: Record<string, string> = {};
    if (q) params.q = q;
    if (program) params.program = program;
    if (faculty) params.faculty = faculty;
    if (cohort) params.cohort = cohort;
    if (year) params.year = year;
    if (author) params.author = author;
    if (advisor) params.advisor = advisor;
    if (keyword) params.keyword = keyword;

    const qs = new URLSearchParams(params).toString();
    setOpen(false);
    router.push(`/theses${qs ? `?${qs}` : ""}`);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex h-13 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-divider bg-bg-surface px-5 text-sm font-semibold text-text-body shadow-sm transition-colors duration-150 hover:border-brand/40 hover:bg-brand/5 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      >
        <SlidersHorizontal className="h-4 w-4" />
        Advanced Search
      </button>

      {open && (
        <div
          className="modal-backdrop-in fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
        >
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="modal-pop-in max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-bg-surface p-6 shadow-2xl sm:rounded-2xl"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 id={headingId} className="text-lg font-bold text-text-heading">
                Advanced Search
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-text-muted transition-colors duration-150 hover:bg-paper hover:text-text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <Field label="Keyword or Title">
                <input
                  ref={firstFieldRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search title, author, advisor..."
                  className={`h-10 w-full rounded-xl border border-divider bg-bg-surface px-3 text-[13.5px] text-text-body outline-none transition-colors ${fieldFocusClass}`}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Program">
                  <select
                    value={program}
                    onChange={(e) => {
                      setProgram(e.target.value);
                      setFaculty("");
                    }}
                    className={selectClass}
                  >
                    <option value="">All Programs</option>
                    {programs.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.name_en}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Faculty">
                  <select
                    value={faculty}
                    onChange={(e) => setFaculty(e.target.value)}
                    disabled={facultyOptions.length === 0}
                    className={`${selectClass} disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    <option value="">All Faculties</option>
                    {facultyOptions.map((f) => (
                      <option key={f.code} value={f.code}>
                        {f.name_en}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Cohort">
                  <select value={cohort} onChange={(e) => setCohort(e.target.value)} className={selectClass}>
                    <option value="">All Cohorts</option>
                    {cohorts.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label} ({c.count})
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Published Year">
                  <select value={year} onChange={(e) => setYear(e.target.value)} className={selectClass}>
                    <option value="">Any Year</option>
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Author">
                  <select value={author} onChange={(e) => setAuthor(e.target.value)} className={selectClass}>
                    <option value="">Any Author</option>
                    {authors.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label} ({a.count})
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Advisor">
                  <select value={advisor} onChange={(e) => setAdvisor(e.target.value)} className={selectClass}>
                    <option value="">Any Advisor</option>
                    {advisors.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label} ({a.count})
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Keyword Tag">
                <select value={keyword} onChange={(e) => setKeyword(e.target.value)} className={selectClass}>
                  <option value="">Any Keyword</option>
                  {keywords.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label} ({k.count})
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  setProgram("");
                  setFaculty("");
                  setCohort("");
                  setYear("");
                  setAuthor("");
                  setAdvisor("");
                  setKeyword("");
                }}
                className="cursor-pointer rounded-sm text-[13px] font-semibold text-text-muted transition-colors duration-150 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
              >
                Clear all
              </button>
              <button
                type="submit"
                className="ml-auto inline-flex cursor-pointer items-center justify-center rounded-xl bg-brand px-6 py-2.5 text-sm font-bold text-brand-contrast transition-all duration-150 hover:bg-brand-hover active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              >
                Search
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
