import type { Metadata } from "next";
import { SITE_URL } from "@/lib/seo/site";
import { localeAlternates } from "@/lib/seo/alternates";
import { openGraphBase } from "@/lib/seo/open-graph";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const alternates = localeAlternates("/about", locale);
  return {
    title: "អំពីបណ្ណាល័យ — PTEC e-Library",
    description:
      "The Library of Phnom Penh Teacher Education College — knowledge, research, and innovation for 21st-century teacher education.",
    alternates,
    openGraph: {
      ...(await openGraphBase(locale)),
      title: "About — PTEC Library",
      description: "Mission, vision, and values of the PTEC Library.",
      url: alternates.canonical,
      type: "website",
    },
  };
}

const CORE_VALUES = [
  { km: "គុណភាព", en: "Quality" },
  { km: "ចំណេះដឹង", en: "Knowledge" },
  { km: "សុចរិតភាព", en: "Integrity" },
  { km: "កិច្ចសហការ", en: "Collaboration" },
  { km: "នវានុវត្តន៍", en: "Innovation" },
  { km: "បរិយាបន្ន", en: "Inclusion" },
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
        <h2
          className="font-kh text-xl font-bold text-text-heading leading-snug"
          lang="km"
        >
          {km}
        </h2>
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: "#2A47A6" }}
        >
          {en}
        </p>
      </div>
    </div>
  );
}

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-paper">
      {/* ── Hero ──────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        style={{ background: "linear-gradient(135deg,#1E3A8A 0%,#0B1530 100%)" }}
      >
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: "radial-gradient(circle,white 1px,transparent 1px)",
            backgroundSize: "24px 24px",
          }}
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-4xl px-6 py-20 md:py-28 text-center">
          <p
            className="mb-3 text-sm font-semibold uppercase tracking-[0.2em]"
            style={{ color: "#DDB022" }}
          >
            អំពីបណ្ណាល័យ · About the Library
          </p>

          <h1
            className="font-kh text-2xl md:text-4xl font-bold text-white leading-snug"
            lang="km"
          >
            បណ្ណាល័យវិទ្យាស្ថានគរុកោសល្យរាជធានីភ្នំពេញ
          </h1>
          <p className="mt-2 text-base md:text-lg text-white/60 font-medium">
            Library, Phnom Penh Teacher Education College
          </p>

          <div className="mx-auto mt-6 max-w-2xl">
            <p
              className="font-kh text-base md:text-lg text-white/85 leading-[1.85]"
              lang="km"
            >
              ប្រភពចំណេះដឹង និងការស្រាវជ្រាវ សម្រាប់ឧត្តមភាពគរុកោសល្យសតវត្សទី២១
            </p>
            <p className="mt-1 text-sm text-white/45 italic">
              The Heart of Learning and Research for Excellence in 21st Century Teacher Education
            </p>
          </div>
        </div>
      </section>

      {/* ── Page body ─────────────────────────────────────────── */}
      <div className="mx-auto max-w-5xl px-4 md:px-8 pb-20 space-y-16 mt-14">

        {/* Introduction */}
        <section aria-labelledby="intro-heading">
          <SectionHeading km="ការណែនាំ" en="Introduction" />
          <div className="mt-6 rounded-2xl border border-divider bg-bg-surface p-6 md:p-8">
            <p
              className="font-kh text-text-body leading-[1.9] text-[15px]"
              lang="km"
            >
              ដេប៉ាតឺម៉ង់ស្រាវជ្រាវអប់រំ និងបណ្ណាល័យ ជាដេប៉ាតឺម៉ង់មួយក្នុងចំណោមដេប៉ាតឺម៉ង់ទាំង៧របស់វិទ្យាស្ថានគរុកោសល្យរាជធានីភ្នំពេញ។
              ដេប៉ាតឺម៉ង់ស្រាវជ្រាវអប់រំ និងបណ្ណាល័យចំណុះឱ្យមហាវិទ្យាល័យស្រាវជ្រាវគរុកោសល្យ។
              ដេប៉ាតឺម៉ង់នេះជាសេនាធិការអប់រំស្នូលគាំទ្រការស្រាវជ្រាវអប់រំ និងសេវាបណ្ណាល័យកណ្ដាលដល់បុគ្គលិកអប់រំ
              គរុនិស្សិតសិក្សាស្រាវជ្រាវគ្រប់ទម្រង់។ ដើម្បីឱ្យសមស្របទៅតាមលក្ខខណ្ឌកំណត់នៃស្តង់ដាសាលាគរុកោសល្យគំរូ
              ដេប៉ាតឺម៉ង់បានបង្កើតឱ្យមានការបោះពុម្ពផ្សាយនិងគាំទ្រលើជំនាញរៀបចំឯកសារ ការបោះពុម្ពព្រឹត្តិបត្រស្រាវជ្រាវអប់រំ
              ដែលមានឈ្មោះថា «PTEC Library Press»។ រហូតដល់ឆ្នាំ២០២៥នេះ PTEC Library Press
              បានបោះពុម្ពស្នាដៃគ្រូឧទ្ទេសបានជាង៣០ចំណងជើង ឯកសារព្រឹត្តិបត្រអប់រំ ចំនួន៤ចំណងជើង
              និងផ្សព្វផ្សាយឯកសារឌីជីថលជាលក្ខណៈទូនិម្មិតបានជាច្រើនបន្ថែមទៀត។ PTEC Library Press
              នឹងព្យាយាមផ្សព្វផ្សាយឯកសារអប់រំ និងឯកសារទូទៅឱ្យកាន់តែសម្បូរបែបនិងទូលំទូលាយ
              សម្រាប់អ្នកអាន អ្នកស្រាវជ្រាវ គរុនិស្សិត និងសាធារណជនឱ្យបានកាន់តែប្រសើរឡើង៕
            </p>
          </div>
        </section>

        {/* Mission */}
        <section aria-labelledby="mission-heading">
          <SectionHeading km="បេសកកម្ម" en="Mission" />
          <div className="mt-6 grid md:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-divider bg-bg-surface p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-0.5 w-6 rounded-full" style={{ backgroundColor: "#1E3A8A" }} />
                <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">ខ្មែរ</span>
              </div>
              <blockquote
                className="font-kh text-text-body leading-[1.9] text-[15px] space-y-3"
                lang="km"
              >
                <p>
                  បណ្ណាល័យវិទ្យាស្ថានគរុកោសល្យរាជធានីភ្នំពេញ ប្តេជ្ញាផ្តល់ធនធានព័ត៌មាន
                  សេវាកម្មបណ្ណាល័យ និងបរិយាកាសសិក្សាប្រកបដោយគុណភាព ដើម្បីគាំទ្រការបង្រៀន
                  និងរៀន ការស្រាវជ្រាវ និងនវានុវត្តន៍ សំដៅអភិវឌ្ឍគ្រូបង្រៀន
                  និងអ្នកអប់រំប្រកបដោយសមត្ថភាព សីលធម៌ និងភាពជាអ្នកដឹកនាំក្នុងសតវត្សទី២១។
                </p>
                <p className="font-bold text-text-heading border-l-2 pl-3" style={{ borderColor: "#1E3A8A" }}>
                  «ផ្តល់ប្រភពចំណេះដឹង សេវាកម្មព័ត៌មាន និងការគាំទ្រការស្រាវជ្រាវ
                  ដើម្បីជំរុញឧត្តមភាពគរុកោសល្យក្នុងសតវត្សទី២១»
                </p>
              </blockquote>
            </div>
            <div className="rounded-2xl border border-divider bg-bg-surface p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-0.5 w-6 rounded-full" style={{ backgroundColor: "#DDB022" }} />
                <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">English</span>
              </div>
              <p className="text-text-body leading-relaxed text-sm">
                The Library of Phnom Penh Teacher Education College is committed to providing
                quality information resources, library services, and learning spaces that support
                teaching, learning, research, and innovation, with the goal of developing
                competent, ethical, and innovative educators and educational leaders for the
                21st century.
              </p>
            </div>
          </div>
        </section>

        {/* Vision */}
        <section aria-labelledby="vision-heading">
          <SectionHeading km="វិស័យ" en="Vision" />
          <div className="mt-6 grid md:grid-cols-2 gap-6">
            <blockquote
              className="rounded-2xl border border-divider bg-bg-surface p-6 border-l-4"
              style={{ borderLeftColor: "#1E3A8A" }}
              lang="km"
            >
              <p className="font-kh text-text-body leading-[1.9] text-[15px]">
                «ក្លាយជាបណ្ណាល័យគរុកោសល្យឈានមុខគេ ដែលជាមជ្ឈមណ្ឌលចំណេះដឹង ការស្រាវជ្រាវ
                និងនវានុវត្តន៍ សម្រាប់ការបណ្តុះបណ្តាលគ្រូបង្រៀនប្រកបដោយឧត្តមភាពក្នុងសតវត្សទី២១»
              </p>
            </blockquote>
            <blockquote
              className="rounded-2xl border border-divider bg-bg-surface p-6 border-l-4"
              style={{ borderLeftColor: "#DDB022" }}
            >
              <p className="text-text-body leading-relaxed text-sm">
                To become a leading teacher education library and a center of knowledge, research,
                and innovation that advances excellence in teaching, learning, and educational
                development in the 21st century.
              </p>
            </blockquote>
          </div>
        </section>

        {/* Core Values */}
        <section aria-labelledby="values-heading">
          <SectionHeading km="គុណតម្លៃស្នូល" en="Core Values" />
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-4">
            {CORE_VALUES.map((v, i) => (
              <div
                key={v.en}
                className="flex flex-col items-center rounded-2xl border border-divider bg-bg-surface p-5 text-center transition-all duration-200 hover:-translate-y-1 hover:shadow-md cursor-default"
              >
                <div
                  className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl text-white text-sm font-bold shrink-0"
                  style={{
                    background:
                      i % 2 === 0
                        ? "linear-gradient(135deg,#1E3A8A 0%,#2A47A6 100%)"
                        : "linear-gradient(135deg,#DDB022 0%,#BE9412 100%)",
                  }}
                  aria-hidden="true"
                >
                  {i + 1}
                </div>
                <p className="font-kh text-base font-bold text-text-heading" lang="km">
                  {v.km}
                </p>
                <p className="mt-1 text-xs text-text-muted">{v.en}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Services */}
        <section aria-labelledby="services-heading">
          <SectionHeading km="សេវាកម្ម" en="Services" />
          <div className="mt-6 rounded-2xl border border-divider bg-bg-surface p-6 md:p-8">
            <p
              className="font-kh text-text-body leading-[1.9] text-[15px]"
              lang="km"
            >
              បណ្ណាល័យវិទ្យាស្ថានគរុកោសល្យរាជធានីភ្នំពេញ ផ្តល់សេវាកម្មខ្ចី-សងឯកសារ ការអាន
              និងសិក្សា សេវាព័ត៌មាន និងឯកសារយោង សេវាគាំទ្រការស្រាវជ្រាវ បណ្ណាល័យឌីជីថល
              បណ្តុះបណ្តាលជំនាញព័ត៌មាន និងបន្ទប់ប្រជុំ ដើម្បីគាំទ្រការបង្រៀន ការរៀនសូត្រ
              ការស្រាវជ្រាវ និងការអភិវឌ្ឍវិជ្ជាជីវៈរបស់គ្រូបង្រៀន និងអ្នកអប់រំក្នុងសតវត្សទី២១។
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
