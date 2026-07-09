import type { Metadata } from "next";
import { SITE_URL } from "@/lib/seo/site";
import { localeAlternates } from "@/lib/seo/alternates";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const alternates = localeAlternates("/about/our-journey", locale);
  return {
    title: "ដំណើររបស់យើង — PTEC e-Library",
    description:
      "The journey of the PTEC Library — from founding in 2017 to becoming a growing center of knowledge and research.",
    alternates,
    openGraph: {
      title: "Our Journey — PTEC Library",
      url: alternates.canonical,
      type: "website",
    },
  };
}

// Seed data — add more entries here as history expands
const TIMELINE: { year: string; km: string; en: string }[] = [
  {
    year: "2017",
    km: "បង្កើតបណ្ណាល័យ",
    en: "The PTEC Library was established as part of the Department of Educational Research and Library, one of 7 departments at Phnom Penh Teacher Education College.",
  },
  {
    year: "2025",
    km: "PTEC Library Press បោះពុម្ពលើស ៣០ ចំណងជើង",
    en: "PTEC Library Press has published over 30 instructor titles, 4 educational research bulletins, and expanded its digital distribution significantly.",
  },
];

function SectionHeading({ km, en }: { km: string; en: string }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="h-8 w-1.5 shrink-0 rounded-full"
        style={{ background: "linear-gradient(135deg,#1E3A8A 0%,#3A5FC4 100%)" }}
        aria-hidden="true"
      />
      <div>
        <h2 className="font-kh text-xl font-bold text-text-heading leading-snug" lang="km">
          {km}
        </h2>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#2A47A6" }}>
          {en}
        </p>
      </div>
    </div>
  );
}

export default function OurJourneyPage() {
  return (
    <div className="min-h-screen bg-paper">
      {/* ── Hero ──────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        style={{ background: "linear-gradient(135deg,#1E3A8A 0%,#2A47A6 100%)" }}
      >
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: "radial-gradient(circle,white 1px,transparent 1px)",
            backgroundSize: "24px 24px",
          }}
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-4xl px-6 py-18 md:py-24 text-center">
          <p
            className="mb-3 text-sm font-semibold uppercase tracking-[0.2em]"
            style={{ color: "#DDB022" }}
          >
            ដំណើររបស់យើង · Our Journey
          </p>
          <h1 className="text-3xl md:text-5xl font-bold text-white leading-tight">
            Our Journey
            <span className="font-kh ml-3 text-2xl md:text-4xl text-white/75" lang="km">
              ដំណើររបស់បណ្ណាល័យ
            </span>
          </h1>
          <p className="mt-4 text-base text-white/70 max-w-xl mx-auto">
            From a founding vision in 2017 to a growing center of knowledge, research,
            and digital learning for educators across Cambodia.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-4 md:px-8 pb-20 space-y-16 mt-14">

        {/* Founding story */}
        <section aria-labelledby="founding-heading">
          <SectionHeading km="ប្រវត្តិនៃការបង្កើត" en="Founding Story" />
          <div className="mt-6 rounded-2xl border border-divider bg-bg-surface p-6 md:p-8 space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold text-white"
              style={{ background: "linear-gradient(135deg,#1E3A8A,#2A47A6)" }}>
              <span aria-hidden="true">🏛</span> 2017
            </div>
            <p className="font-kh text-text-body leading-[1.9] text-[15px]" lang="km">
              ដើម្បីឱ្យសមស្របទៅតាមលក្ខខណ្ឌកំណត់នៃស្តង់ដាសាលាគរុកោសល្យគំរូ
              ដេប៉ាតឺម៉ង់បានបង្កើតឱ្យមានការបោះពុម្ពផ្សាយនិងគាំទ្រលើជំនាញរៀបចំឯកសារ
              ការបោះពុម្ពព្រឹត្តិបត្រស្រាវជ្រាវអប់រំ ដែលមានឈ្មោះថា «PTEC Library Press»។
            </p>
          </div>
        </section>

        {/* Key achievements */}
        <section aria-labelledby="achievements-heading">
          <SectionHeading km="សមិទ្ធិផលសំខាន់ៗ" en="Key Achievements" />
          <div className="mt-6 grid sm:grid-cols-2 gap-4">
            {[
              {
                km: "ការបោះពុម្ពសៀវភៅសិក្សាគោលតាមមុខវិជ្ជារបស់គ្រូឧទ្ទេស",
                en: "Publication of subject-based instructional textbooks by college instructors",
              },
              {
                km: "ការបោះពុម្ពព្រឹត្តិបត្រស្រាវជ្រាវអប់រំបានចំនួន ៦ ភាគ",
                en: "Publication of 6 volumes of the educational research bulletin",
              },
            ].map((item, i) => (
              <div
                key={i}
                className="flex gap-4 rounded-2xl border border-divider bg-bg-surface p-5"
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white text-sm font-bold"
                  style={{ background: "linear-gradient(135deg,#DDB022,#BE9412)" }}
                  aria-hidden="true"
                >
                  {i + 1}
                </div>
                <div>
                  <p className="font-kh font-semibold text-text-heading text-sm leading-snug" lang="km">
                    {item.km}
                  </p>
                  <p className="mt-1 text-xs text-text-muted leading-relaxed">{item.en}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Timeline */}
        <section aria-labelledby="timeline-heading">
          <SectionHeading km="បន្ទាត់ពេលវេលា" en="Timeline" />
          <p className="mt-2 ml-5 text-xs text-text-muted">
            More milestones will be added as the library&apos;s history grows.
          </p>

          <ol className="mt-8 relative ml-4 border-l-2 border-divider space-y-10">
            {TIMELINE.map((entry, idx) => (
              <li key={entry.year} className="relative pl-8">
                {/* Dot */}
                <div
                  className="absolute -left-[11px] top-0.5 h-5 w-5 rounded-full border-2 border-bg-surface flex items-center justify-center"
                  style={{
                    background:
                      idx === 0
                        ? "linear-gradient(135deg,#1E3A8A,#2A47A6)"
                        : "linear-gradient(135deg,#DDB022,#BE9412)",
                  }}
                  aria-hidden="true"
                />

                <div className="rounded-2xl border border-divider bg-bg-surface p-5">
                  <span
                    className="inline-block rounded-full px-3 py-0.5 text-xs font-bold text-white mb-3"
                    style={{
                      background:
                        idx === 0
                          ? "linear-gradient(135deg,#1E3A8A,#2A47A6)"
                          : "linear-gradient(135deg,#DDB022,#BE9412)",
                    }}
                  >
                    {entry.year}
                  </span>
                  <p className="font-kh font-bold text-text-heading text-base leading-snug" lang="km">
                    {entry.km}
                  </p>
                  <p className="mt-2 text-sm text-text-muted leading-relaxed">{entry.en}</p>
                </div>
              </li>
            ))}

            {/* Placeholder for future entries */}
            <li className="relative pl-8">
              <div
                className="absolute -left-[11px] top-0.5 h-5 w-5 rounded-full border-2 border-dashed border-divider bg-paper"
                aria-hidden="true"
              />
              <div className="rounded-2xl border-2 border-dashed border-divider p-5 text-center">
                <p className="text-sm text-text-muted italic">
                  More milestones coming soon · <span className="font-kh" lang="km">ព្រឹត្តិការណ៍បន្ថែមទៀត</span>
                </p>
              </div>
            </li>
          </ol>
        </section>

        {/* Future goals */}
        <section aria-labelledby="future-heading">
          <SectionHeading km="គោលដៅអនាគត" en="Future Goals" />
          <div
            className="mt-6 rounded-2xl p-6 md:p-8 text-white relative overflow-hidden"
            style={{ background: "linear-gradient(135deg,#1E3A8A 0%,#2A47A6 100%)" }}
          >
            <div
              className="absolute inset-0 opacity-[0.07]"
              style={{
                backgroundImage: "radial-gradient(circle,white 1px,transparent 1px)",
                backgroundSize: "20px 20px",
              }}
              aria-hidden="true"
            />
            <p className="relative font-kh text-white/95 leading-[1.9] text-[15px]" lang="km">
              ជាបណ្ណាល័យអនឡាញពេញលេញ
            </p>
            <p className="relative mt-2 text-sm text-white/65 italic">
              To become a fully online library — accessible to every student and educator, anytime and anywhere.
            </p>
          </div>
        </section>

        {/* Decorative divider */}
        <div className="flex items-center justify-center gap-3" aria-hidden="true">
          <div className="h-px w-16 bg-gradient-to-r from-transparent to-blue-700/40" />
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: "#DDB022" }} />
          <div className="h-px w-16 bg-gradient-to-l from-transparent to-blue-700/40" />
        </div>

      </div>
    </div>
  );
}
