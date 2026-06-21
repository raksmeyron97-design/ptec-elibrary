/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";
import ResearchCard from "@/components/ui/research/ResearchCard";

interface RelatedReportsProps {
  currentId: string;
  cohort?: string;
  academicYear?: string;
  department?: string;
}

export default async function RelatedReports({
  currentId,
  cohort,
  academicYear,
  department,
}: RelatedReportsProps) {
  const supabase = createServiceClient();
  const TARGET = 6;

  const seen = new Set<string>([currentId]);
  const collected: any[] = [];

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
      }
    } catch {
      /* unknown column or query error — skip this relatedness signal */
    }
  }

  // Relatedness, strongest signal first.
  await pull("cohort", cohort);
  await pull("department", department);
  await pull("academic_year", academicYear);
  await pull(); // fill remaining slots with most-viewed reports

  if (collected.length === 0) return null;

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
            Related Reports
          </h2>
          <p className="mt-1 text-[13px] text-text-muted">
            Other reports you may want to read
          </p>
        </div>
        <Link
          href="/research"
          className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-divider bg-bg-surface px-4 py-2 text-[13px] font-semibold text-text-body shadow-sm transition-colors hover:border-brand/40 hover:text-brand"
        >
          Browse all
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {collected.map((report) => (
          <ResearchCard key={report.id} report={report} />
        ))}
      </div>
    </section>
  );
}
