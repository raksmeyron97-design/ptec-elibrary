import Link from "next/link";
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
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-khmer-serif text-[28px] font-bold text-text-heading">
            Related Reports
          </h2>
          <p className="mt-1 text-[13px] text-text-muted">
            Other reports you may want to read
          </p>
        </div>
        <Link
          href="/research"
          className="shrink-0 text-[13px] font-semibold text-brand transition-colors hover:underline"
        >
          Browse all →
        </Link>
      </div>
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-5">
        {collected.map((report) => (
          <ResearchCard key={report.id} report={report} />
        ))}
      </div>
    </section>
  );
}
