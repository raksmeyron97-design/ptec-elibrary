import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";
import { getKeywords, getDepartment } from "@/lib/theses/report-fields";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Shows the author's other published theses in this repository. Skipped
 * entirely when this is their only work — there's nothing "more" to show,
 * and an empty section would just be clutter.
 */
export default async function AuthorCard({
  currentId,
  authorNames,
}: {
  currentId: string;
  authorNames: string;
}) {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("research_reports")
    .select("*")
    .eq("is_published", true)
    .eq("author_names", authorNames)
    .neq("id", currentId)
    .order("created_at", { ascending: false })
    .limit(6);

  const otherWorks = data ?? [];
  if (otherWorks.length === 0) return null;

  const departments = new Set<string>();
  const interestCounts: Record<string, number> = {};
  for (const w of otherWorks) {
    const dept = getDepartment(w);
    if (dept) departments.add(dept);
    for (const kw of getKeywords(w)) {
      interestCounts[kw] = (interestCounts[kw] ?? 0) + 1;
    }
  }
  const interests = Object.entries(interestCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([kw]) => kw);

  return (
    <section className="mt-16">
      <div className="mb-6 flex items-center gap-2">
        <span className="h-[3px] w-8 rounded-full bg-gradient-to-r from-brand to-accent" />
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-text-muted">
          More From This Author
        </span>
      </div>

      <div className="rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[18px] font-bold text-brand">
            {initials(authorNames)}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[16px] font-bold text-text-heading">{authorNames}</h3>
            <p className="mt-0.5 text-[13px] text-text-muted">
              {[...departments].join(" · ") || "PTEC"} · {otherWorks.length + 1} publication
              {otherWorks.length + 1 === 1 ? "" : "s"} in this repository
            </p>

            {interests.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {interests.map((kw) => (
                  <span
                    key={kw}
                    className="rounded-full border border-divider bg-bg-app px-2.5 py-0.5 text-[11px] font-medium text-text-muted"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <ul className="mt-5 grid gap-2 border-t border-divider pt-4 sm:grid-cols-2">
          {otherWorks.map((w) => (
            <li key={w.id}>
              <Link
                href={`/theses/${w.slug ?? w.id}`}
                className="group flex items-start gap-2.5 rounded-xl p-2 transition-colors duration-150 hover:bg-bg-app focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
              >
                <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-brand/50" />
                <span className="min-w-0 line-clamp-2 text-[13.5px] font-medium text-text-body transition-colors group-hover:text-brand">
                  {w.title}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
