/* eslint-disable @typescript-eslint/no-explicit-any */
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { ArrowRight, GraduationCap } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";

interface RelatedThesesProps {
  currentId: string;
  cohort?: string;
  academicYear?: string;
  department?: string;
  /**
   * "section" (default) is the full-width shelf of cards. "rail" is the
   * compact list the Modernist record page puts in its right column: title,
   * one meta line, a hairline between rows and nothing else. Both run the
   * same relatedness query — only the presentation differs — so the two never
   * disagree about what "related" means.
   */
  variant?: "section" | "rail";
  /** Rail heading. Ignored by the section variant, which has its own header. */
  railHeading?: string;
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
  variant = "section",
  railHeading = "Related · same faculty",
}: RelatedThesesProps) {
  const supabase = createServiceClient();
  // The rail shows three; the shelf shows six. Fetching only what is rendered
  // keeps the rail from paying for three rows it will throw away.
  const TARGET = variant === "rail" ? 3 : 6;

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

  if (variant === "rail") {
    if (collected.length === 0) return null;
    return (
      <section>
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted mb-1">{railHeading}</h2>
        <ul className="flex flex-col">
          {collected.map((report) => (
            <li key={report.id}>
              <Link
                href={`/theses/${report.slug ?? report.id}`}
                className="block border-t border-divider py-3 transition-colors duration-150 hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring/50"
              >
                <span className="block font-khmer-serif text-[14px] font-semibold leading-[1.5] text-text-heading">
                  {report.title}
                </span>
                <span className="mt-1 block text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.06em] text-text-muted">
                  {[report.author_names, report.cohort && `Cohort ${report.cohort}`]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section aria-labelledby="related-theses-heading" className="mt-14">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id="related-theses-heading"
            className="text-[22px] font-bold tracking-[-0.01em] text-text-heading sm:text-[24px]"
          >
            Related theses
          </h2>
          <p className="mt-1 text-[13.5px] text-text-muted">
            Other research from the same cohort, faculty and year.
          </p>
        </div>
        <Link
          href="/theses"
          className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-brand transition-colors duration-150 hover:bg-bg-app focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
        >
          Browse all theses
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      {collected.length === 0 ? (
        // Not a broken-looking void: an empty related shelf is normal for a
        // young collection, so it says so and offers the next useful move.
        <div className="rounded-2xl border border-dashed border-divider px-5 py-8 text-center">
          <p className="text-[14px] text-text-muted">
            No related theses are available yet — the collection is still growing.
          </p>
          <Link
            href="/theses"
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg text-[13.5px] font-semibold text-brand underline decoration-brand/30 underline-offset-4 transition-colors hover:decoration-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
          >
            Explore all theses
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        // Three across, and only three: this is a suggestion strip at the foot
        // of a record, not a second listing page. The old six-column grid of
        // full <ThesisCard>s put six covers, six bookmark buttons and six
        // download controls below the references.
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collected.slice(0, 3).map((report) => {
            const reason = reasons.get(report.id);
            const label = reason ? REASON_LABEL[reason] : undefined;
            return (
              <li key={report.id}>
                <Link
                  href={`/theses/${report.slug ?? report.id}`}
                  className="group flex h-full gap-4 rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm transition-colors duration-150 hover:border-brand/30 hover:bg-bg-app focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
                >
                  <span className="relative block h-[92px] w-[68px] shrink-0 overflow-hidden rounded-lg border border-divider bg-paper">
                    {report.cover_url ? (
                      <Image
                        src={report.cover_url}
                        alt=""
                        fill
                        loading="lazy"
                        sizes="68px"
                        className="object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-text-muted">
                        <GraduationCap className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
                      </span>
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    {label && (
                      <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-text-muted">
                        {label}
                      </span>
                    )}
                    <span className="mt-1 line-clamp-3 font-khmer-serif text-[14.5px] font-semibold leading-[1.5] text-text-heading transition-colors group-hover:text-brand">
                      {report.title}
                    </span>
                    <span className="mt-auto pt-2 truncate text-[12px] text-text-muted">
                      {[report.author_names, report.academic_year].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
