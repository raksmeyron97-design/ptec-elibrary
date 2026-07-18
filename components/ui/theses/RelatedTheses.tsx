/* eslint-disable @typescript-eslint/no-explicit-any */
import { Link } from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";
import ThesisCard from "@/components/ui/theses/ThesisCard";

interface RelatedThesesProps {
  currentId: string;
  cohort?: string;
  academicYear?: string;
  department?: string;
}

const REASON_LABEL: Record<string, string> = {
  cohort: "Same Cohort",
  department: "Same Department",
  academic_year: "Same Year",
  popular: "Popular",
};

export default async function RelatedTheses({
  currentId,
  cohort,
  academicYear,
  department,
}: RelatedThesesProps) {
  const supabase = createServiceClient();
  const TARGET = 6;

  const seen = new Set<string>([currentId]);
  const collected: any[] = [];
  const reasons = new Map<string, string>();

  // Pull a batch matching an optional equality filter, de-duped, until we hit TARGET.
  async function pull(column?: string, value?: string) {
    if (collected.length >= TARGET || (column && !value)) return;
    try {
      let q = supabase
        .from("research_reports")
        .select("*")
        .eq("is_published", true)
        .neq("id", currentId)
        .order("view_count", { ascending: false })
        .limit(12);
      if (column && value) q = q.eq(column, value);

      const { data } = await q;
      for (const r of data ?? []) {
        if (collected.length >= TARGET) break;
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        collected.push(r);
        reasons.set(r.id, column ?? "popular");
      }
    } catch {
      /* unknown column or query error — skip this relatedness signal */
    }
  }

  // Relatedness, strongest signal first.
  await pull("cohort", cohort);
  await pull("department", department);
  await pull("academic_year", academicYear);
  await pull(); // fill remaining slots with most-viewed theses

  return (
    <section className="mt-16">
      {/* Section header */}
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="h-[3px] w-8 rounded-full bg-gradient-to-r from-brand to-accent" />
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-text-muted">
              Keep Reading
            </span>
          </div>
          <h2 className="font-khmer-serif text-[26px] font-bold text-text-heading sm:text-[28px]">
            Related Theses
          </h2>
          <p className="mt-1 text-[13px] text-text-muted">
            Other theses you may want to read
          </p>
        </div>
        <Link
          href="/theses"
          className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-divider bg-bg-surface px-4 py-2 text-[13px] font-semibold text-text-body shadow-sm transition-colors duration-150 hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
        >
          Browse all
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {collected.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-divider bg-bg-surface py-14 text-center">
          <GraduationCapIcon />
          <p className="text-[14px] text-text-muted">No related theses found yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {collected.map((report) => {
            const reason = reasons.get(report.id);
            const label = reason ? REASON_LABEL[reason] : undefined;
            return (
              <div key={report.id} className="relative">
                {label && (
                  <span className="pointer-events-none absolute left-3 top-3 z-30 rounded-full bg-brand/90 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-contrast shadow-sm backdrop-blur-sm">
                    {label}
                  </span>
                )}
                <ThesisCard report={report} />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function GraduationCapIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-text-muted/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}
