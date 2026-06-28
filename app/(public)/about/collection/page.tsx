import type { Metadata } from "next";
import { SITE_URL } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "បណ្ដុំឯកសារបណ្ណាល័យ — PTEC e-Library",
  description:
    "Library collection at Phnom Penh Teacher Education College — 2,766 titles, 45,085 copies across 6 languages, classified by Dewey Decimal Classification.",
  alternates: { canonical: `${SITE_URL}/about/collection` },
  openGraph: {
    title: "Library Collection — PTEC Library",
    url: `${SITE_URL}/about/collection`,
    type: "website",
  },
};

const DDC_ROWS: { class: string; km: string; en: string; titles: number }[] = [
  { class: "000", km: "ចំណេះដឹងទូទៅ ព័ត៌មានវិទ្យា និងការងារទូទៅ", en: "General Knowledge, IT & General Work", titles: 111 },
  { class: "100", km: "ទស្សនវិជ្ជា និងចិត្តវិទ្យា", en: "Philosophy & Psychology", titles: 215 },
  { class: "200", km: "សាសនា", en: "Religion", titles: 50 },
  { class: "300", km: "វិទ្យាសាស្រ្តសង្គម", en: "Social Sciences", titles: 839 },
  { class: "400", km: "ភាសា", en: "Language", titles: 166 },
  { class: "500", km: "វិទ្យាសាស្រ្ត", en: "Science", titles: 472 },
  { class: "600", km: "បច្ចេកវិទ្យា (វិទ្យាសាស្រ្តអនុវត្តន៍)", en: "Technology (Applied Sciences)", titles: 229 },
  { class: "700", km: "សិល្បៈ (វិចិត្រសិល្បៈ និងការតែងលម្អ)", en: "Arts, Fine Arts & Decoration", titles: 73 },
  { class: "800", km: "អក្សរសាស្រ្ត និងវោហា", en: "Literature & Rhetoric", titles: 138 },
  { class: "800*", km: "ប្រលោមលោក រឿងនិទាន ឆាករូបភាព", en: "Novels, Stories & Cartoons", titles: 186 },
  { class: "900", km: "ភូមិវិទ្យា និងប្រវត្តិវិទ្យា", en: "Geography & History", titles: 170 },
  { class: "TXT", km: "សៀវភៅសិក្សាគោល", en: "Textbooks (G1–G12)", titles: 117 },
];

const TOTAL_TITLES = 2766;

const STAT_CARDS = [
  {
    km: "ចំណងជើងសរុប",
    en: "Total Titles",
    value: "2,766",
    gradient: "linear-gradient(135deg,#1E3A8A 0%,#2A47A6 100%)",
  },
  {
    km: "ក្បាលសៀវភៅ (មិនមែនសៀវភៅសិក្សាគោល)",
    en: "Non-Textbook Copies",
    value: "22,067",
    gradient: "linear-gradient(135deg,#2A47A6 0%,#3A5FC4 100%)",
  },
  {
    km: "ក្បាលសៀវភៅសិក្សាគោល ថ្នាក់ទី១–១២",
    en: "Textbook Copies (G1–G12)",
    value: "23,018",
    gradient: "linear-gradient(135deg,#DDB022 0%,#BE9412 100%)",
  },
  {
    km: "សរុបក្បាល",
    en: "Total Copies",
    value: "45,085",
    gradient: "linear-gradient(135deg,#122251 0%,#1E3A8A 100%)",
  },
];

const LANGUAGES = [
  { km: "ខ្មែរ", en: "Khmer" },
  { km: "អង់គ្លេស", en: "English" },
  { km: "ជប៉ុន", en: "Japanese" },
  { km: "កូរ៉េ", en: "Korean" },
  { km: "ចិន", en: "Chinese" },
  { km: "ថៃ", en: "Thai" },
];

const SPECIAL_COLLECTIONS: { km: string; en: string }[] = [
  { km: "ការស្រាវជ្រាវប្រតិបត្តិ", en: "Action Research" },
  { km: "របាយការណ៍បញ្ចប់ការសិក្សារបស់គរុនិស្សិត", en: "Student-Teacher Graduation Reports" },
  { km: "សារណាបទ និងនិក្ខេបបទ", en: "Theses & Dissertations" },
  { km: "ទស្សនាវដ្ដី អត្ថបទស្រាវជ្រាវ", en: "Journals & Research Articles" },
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

export default function LibraryCollectionPage() {
  return (
    <div className="min-h-screen bg-paper">
      {/* ── Hero ─────────────────────────────────────────── */}
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
        <div className="relative mx-auto max-w-4xl px-6 py-16 md:py-22 text-center">
          <p
            className="mb-3 text-sm font-semibold uppercase tracking-[0.2em]"
            style={{ color: "#DDB022" }}
          >
            បណ្ដុំឯកសារ · Collection
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight">
            Library Collection
            <span className="font-kh ml-3 text-2xl md:text-3xl text-white/75" lang="km">
              បណ្ដុំឯកសារ
            </span>
          </h1>
          <p className="mt-4 text-sm text-white/65 max-w-md mx-auto">
            {TOTAL_TITLES.toLocaleString()} titles · 45,085 copies · 6 languages ·
            Classified by Dewey Decimal Classification (DDC)
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 md:px-8 pb-20 mt-12 space-y-14">

        {/* Stat cards */}
        <section aria-label="Collection statistics">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {STAT_CARDS.map((s) => (
              <div
                key={s.en}
                className="relative overflow-hidden rounded-2xl p-5 text-white"
                style={{ background: s.gradient }}
              >
                <div
                  className="absolute inset-0 opacity-[0.07]"
                  style={{
                    backgroundImage: "radial-gradient(circle,white 1px,transparent 1px)",
                    backgroundSize: "16px 16px",
                  }}
                  aria-hidden="true"
                />
                <p className="relative text-2xl md:text-3xl font-bold">{s.value}</p>
                <p className="relative font-kh mt-1 text-white/80 text-xs leading-snug" lang="km">
                  {s.km}
                </p>
                <p className="relative text-white/50 text-[10px] mt-0.5">{s.en}</p>
              </div>
            ))}
          </div>
        </section>

        {/* DDC table */}
        <section aria-labelledby="ddc-heading">
          <SectionHeading km="ចំណាត់ថ្នាក់តាម DDC" en="Dewey Decimal Classification (DDC)" />
          <div className="mt-6 rounded-2xl border border-divider bg-bg-surface overflow-hidden shadow-sm">
            <table className="w-full" role="table">
              <thead>
                <tr className="bg-paper">
                  <th scope="col" className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-text-muted w-16">
                    DDC
                  </th>
                  <th scope="col" className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                    ប្រភេទ · Category
                  </th>
                  <th scope="col" className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-text-muted w-24">
                    ចំណងជើង
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider">
                {DDC_ROWS.map((row) => (
                  <tr
                    key={row.class}
                    className={
                      row.class === "TXT"
                        ? "bg-gold-50/60 dark:bg-gold-800/10"
                        : "hover:bg-paper transition-colors"
                    }
                  >
                    <td className="px-5 py-3.5">
                      <span
                        className="inline-block rounded-md px-2 py-0.5 text-xs font-bold text-white"
                        style={{
                          background:
                            row.class === "TXT"
                              ? "linear-gradient(135deg,#DDB022,#BE9412)"
                              : "linear-gradient(135deg,#1E3A8A,#2A47A6)",
                        }}
                      >
                        {row.class}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="font-kh font-medium text-text-heading text-sm" lang="km">
                        {row.km}
                      </p>
                      <p className="text-xs text-text-muted mt-0.5">{row.en}</p>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="text-sm font-semibold text-text-heading">
                        {row.titles.toLocaleString()}
                      </span>
                    </td>
                  </tr>
                ))}

                {/* Total row */}
                <tr style={{ background: "linear-gradient(90deg,#EEF2FB,#EEF2FB)" }}>
                  <td className="px-5 py-4" />
                  <td className="px-5 py-4">
                    <span className="font-kh font-bold text-text-heading text-sm" lang="km">
                      សរុប
                    </span>
                    <span className="ml-2 text-xs font-semibold text-text-muted">Total</span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <span className="text-base font-bold" style={{ color: "#1E3A8A" }}>
                      {TOTAL_TITLES.toLocaleString()}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Languages */}
        <section aria-labelledby="languages-heading">
          <SectionHeading km="ភាសា" en="Languages Available" />
          <div className="mt-6 flex flex-wrap gap-3">
            {LANGUAGES.map((lang) => (
              <div
                key={lang.en}
                className="flex items-center gap-2 rounded-full border border-divider bg-bg-surface px-4 py-2"
              >
                <span className="font-kh text-sm font-semibold text-text-heading" lang="km">
                  {lang.km}
                </span>
                <span className="text-text-muted text-xs">· {lang.en}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Special collections */}
        <section aria-labelledby="special-heading">
          <SectionHeading km="ការប្រមូលពិសេស" en="Special Collections" />
          <div className="mt-6 grid sm:grid-cols-2 gap-4">
            {SPECIAL_COLLECTIONS.map((col, idx) => (
              <div
                key={idx}
                className="flex gap-4 rounded-2xl border border-divider bg-bg-surface p-5"
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white text-xs font-bold"
                  style={{
                    background:
                      idx % 2 === 0
                        ? "linear-gradient(135deg,#1E3A8A,#2A47A6)"
                        : "linear-gradient(135deg,#DDB022,#BE9412)",
                  }}
                  aria-hidden="true"
                >
                  {idx + 1}
                </div>
                <div>
                  <p className="font-kh font-semibold text-text-heading text-sm" lang="km">
                    {col.km}
                  </p>
                  <p className="mt-0.5 text-xs text-text-muted">{col.en}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Classification note */}
        <section aria-labelledby="classification-heading">
          <SectionHeading km="ប្រព័ន្ធចំណាត់ថ្នាក់" en="Classification System" />
          <div className="mt-4 rounded-2xl border border-divider bg-bg-surface p-5 md:p-6 flex items-start gap-4">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white font-bold text-xs"
              style={{ background: "linear-gradient(135deg,#1E3A8A,#2A47A6)" }}
              aria-hidden="true"
            >
              DDC
            </div>
            <div>
              <p className="font-semibold text-text-heading text-sm">
                Dewey Decimal Classification (DDC)
              </p>
              <p className="mt-1 text-xs text-text-muted leading-relaxed">
                All physical books are classified using the Dewey Decimal Classification system
                (ranges 000–900) with a separate grouping for school textbooks (G1–G12).
                This system enables consistent browsing and retrieval across all subjects.
              </p>
            </div>
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
