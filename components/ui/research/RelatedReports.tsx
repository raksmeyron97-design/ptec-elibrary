import { createServiceClient } from "@/lib/supabase/server";
import ResearchCard from "@/components/ui/research/ResearchCard";

interface RelatedReportsProps {
  currentId: string;
  cohort?: string;
  academicYear?: string;
}

export default async function RelatedReports({
  currentId,
  cohort,
  academicYear,
}: RelatedReportsProps) {
  const supabase = createServiceClient();

  let query = supabase
    .from("research_reports")
    .select("*")
    .eq("is_published", true)
    .neq("id", currentId)
    .order("view_count", { ascending: false })
    .limit(6);

  if (cohort) {
    query = query.eq("cohort", cohort);
  }

  let { data } = await query;

  // Fallback to related by academic year if not enough from same cohort
  if (!data || data.length === 0) {
    let fallbackQuery = supabase
      .from("research_reports")
      .select("*")
      .eq("is_published", true)
      .neq("id", currentId)
      .order("view_count", { ascending: false })
      .limit(6);

    if (academicYear) {
      fallbackQuery = fallbackQuery.eq("academic_year", academicYear);
    }

    const { data: fallbackData } = await fallbackQuery;
    data = fallbackData;
  }

  if (!data || data.length === 0) return null;

  return (
    <section className="mt-16">
      <div className="mb-8 flex items-center justify-between">
        <h2 className="font-khmer-serif text-[28px] font-bold text-text-heading">
          Related Reports
        </h2>
      </div>
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-5">
        {data.map((report) => (
          <ResearchCard key={report.id} report={report} />
        ))}
      </div>
    </section>
  );
}
