import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCap, Layers, ChevronRight } from "lucide-react";
import { getPublishedPaths } from "@/app/actions/learning-paths";
import { SITE_URL, PTEC_LIBRARY_NAME } from "@/lib/seo/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Teacher Learning Paths",
  description:
    "Curated reading paths for PTEC trainees and in-service teachers — ordered sequences of books, theses, and resources organised around real teacher-training topics.",
  alternates: { canonical: `${SITE_URL}/paths` },
  openGraph: {
    title: "Teacher Learning Paths",
    description: "Curated, ordered curricula built from the PTEC library's own collection.",
    url: `${SITE_URL}/paths`,
    siteName: PTEC_LIBRARY_NAME,
  },
};

export default async function LearningPathsPage() {
  const paths = await getPublishedPaths();

  return (
    <div className="min-h-screen bg-bg-body">
      <div className="mx-auto max-w-[1100px] px-4 py-8 md:px-10 md:py-12">
        <div className="mb-8">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand/8 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-brand">
            <GraduationCap className="h-3.5 w-3.5" />
            Teacher Learning Paths
          </span>
          <h1 className="mt-3 font-khmer-serif text-[clamp(24px,4vw,36px)] font-bold leading-[1.2] text-text-heading">
            Learn with purpose, not just search
          </h1>
          <p className="mt-2 max-w-[65ch] text-[15px] text-text-muted">
            Curated, ordered reading paths built from the library&apos;s own collection — designed around
            real PTEC teacher-training topics, from foundational pedagogy to classroom action research.
          </p>
        </div>

        {paths.length === 0 ? (
          <div className="rounded-2xl border border-divider bg-bg-surface py-16 text-center">
            <GraduationCap className="mx-auto mb-3 h-10 w-10 text-text-muted/40" />
            <p className="text-[14px] font-semibold text-text-muted">No learning paths published yet</p>
            <p className="mt-1 text-[12.5px] text-text-muted">Check back soon — librarians are curating these now.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {paths.map((p) => (
              <Link
                key={p.id}
                href={`/paths/${p.slug}`}
                className="group flex flex-col rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm transition-all hover:border-brand/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {p.audience && (
                      <span className="mb-1.5 inline-block rounded-full bg-paper px-2.5 py-0.5 text-[11px] font-semibold text-text-muted">
                        {p.audience}
                      </span>
                    )}
                    <h2 className="text-[17px] font-bold leading-snug text-text-heading">{p.title}</h2>
                  </div>
                  <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-text-muted/50 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                </div>
                {p.description && (
                  <p className="mt-2 line-clamp-2 text-[13.5px] text-text-muted">{p.description}</p>
                )}
                <div className="mt-4 flex items-center gap-1.5 text-[12px] font-semibold text-text-muted">
                  <Layers className="h-3.5 w-3.5" />
                  {p.stepCount} {p.stepCount === 1 ? "step" : "steps"}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
