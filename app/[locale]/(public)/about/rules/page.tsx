import type { Metadata } from "next";
import { SITE_URL } from "@/lib/seo/site";
import { localeAlternates } from "@/lib/seo/alternates";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const alternates = localeAlternates("/about/rules", locale);
  return {
    title: "បទបញ្ជាបណ្ណាល័យ — PTEC e-Library",
    description:
      "Library rules and regulations at Phnom Penh Teacher Education College — membership, borrowing, conduct, and online access.",
    alternates,
    openGraph: {
      title: "Library Rules — PTEC Library",
      url: alternates.canonical,
      type: "website",
    },
  };
}

function SectionHeading({
  km,
  en,
  id,
}: {
  km: string;
  en: string;
  id?: string;
}) {
  return (
    <div className="flex items-start gap-3" id={id}>
      <div
        className="mt-1 h-7 w-1.5 shrink-0 rounded-full"
        style={{ background: "linear-gradient(135deg,#1E3A8A 0%,#3A5FC4 100%)" }}
        aria-hidden="true"
      />
      <div>
        <h2 className="font-kh text-lg font-bold text-text-heading leading-snug" lang="km">
          {km}
        </h2>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#2A47A6" }}>
          {en}
        </p>
      </div>
    </div>
  );
}

function RuleCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-2xl border border-divider bg-bg-surface p-5 md:p-6">
      {children}
    </div>
  );
}

const CONDUCT_RULES: { km: string; en: string }[] = [
  { km: "ត្រូវបិទសម្លេងទូរស័ព្ទ និងរក្សាភាពស្ងៀមស្ងាត់", en: "Switch phones to silent and maintain quiet" },
  { km: "ហាមជក់បារី ពិសារអាហារ ភេសជ្ជៈ នៅក្នុងបណ្ណាល័យ", en: "No smoking, eating, or drinking inside the library" },
  { km: "ហាមចោលក្រដាស ឬសម្រាមផ្សេងៗ នៅក្នុងបណ្ណាល័យ និងបរិវេណបណ្ណាល័យ", en: "No littering inside the library or on library premises" },
  { km: "ហាមខាកស្ដោះនៅក្នុងបណ្ណាល័យ", en: "No spitting inside the library" },
];

export default function LibraryRulesPage() {
  return (
    <div className="min-h-screen bg-paper">
      {/* ── Hero ─────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        style={{ background: "linear-gradient(135deg,#1E3A8A 0%,#122251 100%)" }}
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
            បទបញ្ជា · Regulations
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight">
            Library Rules
            <span className="font-kh ml-3 text-2xl md:text-3xl text-white/75" lang="km">
              បទបញ្ជាបណ្ណាល័យ
            </span>
          </h1>
          <p className="mt-4 text-sm text-white/65 max-w-sm mx-auto">
            Guidelines for members, borrowers, and visitors of the PTEC Library.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-4 md:px-8 pb-20 mt-12 space-y-10">

        {/* General rules */}
        <section aria-labelledby="general-rules">
          <SectionHeading km="បទបញ្ជាទូទៅ" en="General Rules" id="general-rules" />
          <RuleCard>
            <p className="font-kh text-text-body leading-[1.9] text-[15px]" lang="km">
              គរុសិស្ស គរុនិស្សិត គ្រូឧទ្ទេស និងបុគ្គលិកទាំងអស់ នៃវិទ្យាស្ថានគរុកោសល្យរាជធានីភ្នំពេញ
              ដែលមានបំណងចង់ប្រើប្រាស់ ឬខ្ចីសៀវភៅពីបណ្ណាល័យ ត្រូវសាកសួរព័ត៌មានពីបណ្ណារក្ស។
            </p>
          </RuleCard>
        </section>

        {/* Membership */}
        <section aria-labelledby="membership-rules">
          <SectionHeading km="លក្ខខណ្ឌក្លាយជាសមាជិក" en="Membership" id="membership-rules" />
          <RuleCard>
            <p className="font-kh text-text-body leading-[1.9] text-[15px]" lang="km">
              បុគ្គលិក លោកគ្រូ អ្នកគ្រូ គរុនិស្សិត ត្រូវមានប័ណ្ណសមាជិកបណ្ណាល័យ ឬកាត
              ដើម្បីចុះឈ្មោះបញ្ចូលក្នុងប្រព័ន្ធ PMB របស់បណ្ណាល័យ។
              មិនត្រូវផ្ដល់ប័ណ្ណនេះទៅឲ្យអ្នកដទៃប្រើប្រាស់ឡើយ។
            </p>
          </RuleCard>
        </section>

        {/* Borrowing */}
        <section aria-labelledby="borrowing-rules">
          <SectionHeading km="ច្បាប់ខ្ចី និងសងសៀវភៅ" en="Borrowing Rules" id="borrowing-rules" />
          <RuleCard>
            <p className="font-kh text-text-body text-[14px] mb-4" lang="km">
              កាតអាចខ្ចីសៀវភៅយកទៅប្រើប្រាស់បានតាមការកំណត់ដូចខាងក្រោម៖
            </p>
            <div className="space-y-4">
              {/* Student category */}
              <div className="rounded-xl border border-divider bg-paper p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-white text-xs font-bold shrink-0"
                    style={{ background: "linear-gradient(135deg,#1E3A8A,#2A47A6)" }}
                    aria-hidden="true"
                  >
                    ១
                  </div>
                  <p className="font-kh font-bold text-text-heading text-sm" lang="km">
                    គរុសិស្ស / គរុនិស្សិត — ខ្ចីម្ដងបាន ៥ ក្បាល
                  </p>
                </div>
                <ul className="space-y-2 ml-9" role="list">
                  <li className="flex items-start gap-2 text-[13px]">
                    <span
                      className="mt-0.5 h-1.5 w-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: "#1E3A8A" }}
                      aria-hidden="true"
                    />
                    <span>
                      <span className="font-kh text-text-body" lang="km">សៀវភៅជាភាសាខ្មែរ</span>
                      <span className="text-text-muted ml-1">· Khmer books:</span>
                      <span className="font-kh ml-1 font-semibold text-text-heading" lang="km">
                        ១៤ ថ្ងៃ (អាចខ្ចីបន្តបានតាមតម្រូវការ)
                      </span>
                    </span>
                  </li>
                  <li className="flex items-start gap-2 text-[13px]">
                    <span
                      className="mt-0.5 h-1.5 w-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: "#1E3A8A" }}
                      aria-hidden="true"
                    />
                    <span>
                      <span className="font-kh text-text-body" lang="km">សៀវភៅជាភាសាអង់គ្លេស</span>
                      <span className="text-text-muted ml-1">· English books:</span>
                      <span className="font-kh ml-1 font-semibold text-text-heading" lang="km">
                        ៧ ថ្ងៃ (អាចខ្ចីបន្តបានមួយដង)
                      </span>
                    </span>
                  </li>
                </ul>
              </div>

              {/* Staff/instructor category */}
              <div className="rounded-xl border border-divider bg-paper p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-white text-xs font-bold shrink-0"
                    style={{ background: "linear-gradient(135deg,#DDB022,#BE9412)" }}
                    aria-hidden="true"
                  >
                    ២
                  </div>
                  <p className="font-kh font-bold text-text-heading text-sm" lang="km">
                    គ្រូឧទ្ទេស និងបុគ្គលិក — ខ្ចីម្ដងបាន ៥ ក្បាល
                  </p>
                </div>
                <p className="font-kh text-text-muted text-[13px] ml-9" lang="km">
                  រយៈពេល ៣០ ថ្ងៃ ចាប់ពីថ្ងៃខ្ចី ដោយមិនគិតថ្ងៃឈប់សម្រាក និងថ្ងៃបុណ្យជាតិ
                </p>
              </div>
            </div>
          </RuleCard>
        </section>

        {/* Penalties */}
        <section aria-labelledby="penalty-rules">
          <SectionHeading km="ការផាកពិន័យ" en="Penalties" id="penalty-rules" />
          <RuleCard>
            <div className="space-y-3">
              {[
                "អ្នកខ្ចីត្រូវថែរក្សាសៀវភៅឲ្យបានល្អដូចសភាពដើម។",
                "ករណីខូចខាត ឬបាត់បង់ ត្រូវសងតម្លៃស្មើទ្វេរដងនៃតម្លៃសៀវភៅ ឬទិញសៀវភៅថ្មីសងមកវិញ។",
                "កម្រងឯកសារច្បាប់ វចនានុក្រម ទស្សនាវដ្ដី និងសៀវភៅប្រភេទខ្លះ មិនអនុញ្ញាតឲ្យខ្ចីយកចេញក្រៅឡើយ។",
                "បណ្ណារក្សមានសិទ្ធិឆែកឆេរអ្នកចេញចូលក្នុងបណ្ណាល័យ។",
                "អ្នកបន្លំ លួចលាក់ ហែកសន្លឹកសៀវភៅរបស់បណ្ណាល័យ ត្រូវទទួលទណ្ឌកម្មពីវិទ្យាស្ថានតាមប្រការ៨ នៃបទបញ្ជានេះ។",
                "អ្នកខ្ចីដែលពុំបានសងវិញតាមកាលកំណត់ ត្រូវបង់ប្រាក់ពិន័យតាមការកំណត់របស់បណ្ណាល័យ។",
                "ករណីមិនគោរពបទបញ្ជា អ្នកគ្រប់គ្រងបណ្ណាល័យមានសិទ្ធិផ្អាកការឲ្យខ្ចីសៀវភៅពី ១ ឆមាស ទៅ ១ ឆ្នាំសិក្សា។",
              ].map((rule, idx) => (
                <div key={idx} className="flex items-start gap-3 text-[14px]">
                  <span
                    className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white text-[10px] font-bold"
                    style={{ background: "linear-gradient(135deg,#1E3A8A,#2A47A6)" }}
                    aria-hidden="true"
                  >
                    {idx + 1}
                  </span>
                  <p className="font-kh text-text-body leading-[1.8]" lang="km">
                    {rule}
                  </p>
                </div>
              ))}
            </div>
          </RuleCard>
        </section>

        {/* Conduct */}
        <section aria-labelledby="conduct-rules">
          <SectionHeading km="បទបញ្ជាសុជីវធម៌" en="Code of Conduct" id="conduct-rules" />
          <RuleCard>
            <ul className="space-y-3" role="list">
              {CONDUCT_RULES.map((rule, idx) => (
                <li key={idx} className="flex items-start gap-3">
                  <span
                    className="mt-0.5 h-5 w-5 shrink-0 flex items-center justify-center rounded-full"
                    style={{ backgroundColor: "#EEF2FB" }}
                    aria-hidden="true"
                  >
                    <svg className="w-3 h-3" style={{ color: "#1E3A8A" }} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </span>
                  <span>
                    <span className="font-kh text-text-body text-[14px] leading-[1.8]" lang="km">
                      {rule.km}
                    </span>
                    <span className="ml-2 text-xs text-text-muted">· {rule.en}</span>
                  </span>
                </li>
              ))}
            </ul>
          </RuleCard>
        </section>

        {/* E-Library online access */}
        <section aria-labelledby="elibrary-rules">
          <SectionHeading km="លក្ខខណ្ឌប្រើ E-Library Online" en="E-Library Online Access" id="elibrary-rules" />
          <div
            className="mt-4 rounded-2xl p-5 flex items-center gap-4 text-white"
            style={{ background: "linear-gradient(135deg,#1E3A8A,#2A47A6)" }}
          >
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15"
              aria-hidden="true"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"/>
                <line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
            </div>
            <div>
              <p className="font-kh text-white text-[14px] leading-[1.8]" lang="km">
                ចូលទៅកាន់វេបសាយ៖ <strong>www.ptec.edu.kh</strong> (Library)
              </p>
              <p className="text-white/65 text-xs mt-0.5">
                Visit www.ptec.edu.kh and navigate to the Library section for online access.
              </p>
            </div>
          </div>
        </section>

        {/* Decorative divider */}
        <div className="flex items-center justify-center gap-3 mt-6" aria-hidden="true">
          <div className="h-px w-16 bg-gradient-to-r from-transparent to-blue-700/40" />
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: "#DDB022" }} />
          <div className="h-px w-16 bg-gradient-to-l from-transparent to-blue-700/40" />
        </div>

      </div>
    </div>
  );
}
