import type { Metadata } from "next";
import { SITE_URL } from "@/lib/seo/site";
import { localeAlternates } from "@/lib/seo/alternates";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const alternates = localeAlternates("/about/timings", locale);
  return {
    title: "ម៉ោងបម្រើសេវាកម្ម — PTEC e-Library",
    description:
      "Library opening hours at Phnom Penh Teacher Education College. The online e-Library is available 24/7.",
    alternates,
    openGraph: {
      title: "Library Timings — PTEC Library",
      url: alternates.canonical,
      type: "website",
    },
  };
}

const SCHEDULE = [
  {
    day_km: "ច័ន្ទ – សុក្រ",
    day_en: "Mon – Fri",
    hours: "7:00 – 17:00",
    closed: false,
    highlight: false,
  },
  {
    day_km: "ថ្ងៃសៅរ៍",
    day_en: "Saturday",
    hours: "8:00 – 16:00",
    closed: false,
    highlight: false,
    // NOTE: source data listed "8.00-4.00"; assumed 08:00–16:00 (4 PM). Confirm with library admin.
  },
  {
    day_km: "ថ្ងៃអាទិត្យ",
    day_en: "Sunday",
    hours: "បិទ",
    hours_en: "Closed",
    closed: true,
    highlight: false,
  },
  {
    day_km: "ថ្ងៃបុណ្យ / ឈប់សម្រាក",
    day_en: "Holidays",
    hours: "បិទ",
    hours_en: "Closed",
    closed: true,
    highlight: false,
  },
  {
    day_km: "រដូវប្រឡង",
    day_en: "Exam Period",
    hours: "7:00 – 19:00",
    closed: false,
    highlight: true,
  },
  {
    day_km: "បណ្ណាល័យអេឡិចត្រូនិក",
    day_en: "E-Library Online",
    hours: "២៤ម៉ោង",
    hours_en: "24/7",
    closed: false,
    highlight: true,
    online: true,
  },
];

export default function LibraryTimingsPage() {
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
        <div className="relative mx-auto max-w-3xl px-6 py-16 md:py-22 text-center">
          <p
            className="mb-3 text-sm font-semibold uppercase tracking-[0.2em]"
            style={{ color: "#DDB022" }}
          >
            ម៉ោងបម្រើសេវាកម្ម · Library Hours
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight">
            Library Timings
            <span className="font-kh ml-3 text-2xl md:text-3xl text-white/75" lang="km">
              ម៉ោងបម្រើ
            </span>
          </h1>
          <p className="mt-4 text-sm text-white/65 max-w-sm mx-auto">
            Physical library opening hours — the online e-Library is always open.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-2xl px-4 md:px-8 pb-20 mt-12">

        {/* 24/7 callout */}
        <div
          className="mb-8 flex items-center gap-4 rounded-2xl p-5 text-white relative overflow-hidden"
          style={{ background: "linear-gradient(135deg,#DDB022 0%,#BE9412 100%)" }}
        >
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20"
            aria-hidden="true"
          >
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <div>
            <p className="font-bold text-white text-base">E-Library Online — 24 / 7</p>
            <p className="font-kh text-white/80 text-sm mt-0.5" lang="km">
              បណ្ណាល័យអនឡាញអាចប្រើប្រាស់បាន ២៤ ម៉ោង ៧ ថ្ងៃ ក្នុងមួយសប្តាហ៍
            </p>
          </div>
        </div>

        {/* Schedule table */}
        <div className="rounded-2xl border border-divider bg-bg-surface overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-divider">
            <h2 className="text-base font-bold text-text-heading">
              ម៉ោងបម្រើ <span className="font-kh" lang="km">· </span>Opening Hours
            </h2>
          </div>
          <table className="w-full" role="table">
            <thead>
              <tr className="bg-paper">
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-text-muted"
                >
                  ថ្ងៃ · Day
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-text-muted"
                >
                  ម៉ោង · Hours
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {SCHEDULE.map((row, idx) => (
                <tr
                  key={idx}
                  className={
                    row.online
                      ? "bg-gold-50 dark:bg-gold-800/10"
                      : row.highlight
                      ? "bg-blue-50 dark:bg-blue-900/20"
                      : ""
                  }
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {row.online && (
                        <span
                          className="h-2 w-2 rounded-full bg-green-500 shrink-0"
                          title="Always available"
                          aria-label="Always online"
                        />
                      )}
                      <span>
                        <span className="font-kh font-semibold text-text-heading text-sm" lang="km">
                          {row.day_km}
                        </span>
                        <span className="ml-2 text-xs text-text-muted">{row.day_en}</span>
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {row.closed ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-semibold bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400">
                        <span className="font-kh" lang="km">{row.hours}</span>
                        {row.hours_en && <span className="opacity-70">· {row.hours_en}</span>}
                      </span>
                    ) : row.online ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-bold"
                        style={{ background: "#FDF8E7", color: "#806211" }}>
                        <span className="font-kh" lang="km">{row.hours}</span>
                        {row.hours_en && <span>· {row.hours_en}</span>}
                      </span>
                    ) : (
                      <span
                        className="text-sm font-semibold text-text-heading"
                      >
                        {row.hours}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Decorative divider */}
        <div className="flex items-center justify-center gap-3 mt-14" aria-hidden="true">
          <div className="h-px w-16 bg-gradient-to-r from-transparent to-blue-700/40" />
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: "#DDB022" }} />
          <div className="h-px w-16 bg-gradient-to-l from-transparent to-blue-700/40" />
        </div>
      </div>
    </div>
  );
}
