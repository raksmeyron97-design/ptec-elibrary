// components/ui/home/HowToUse.tsx
// 3-step orientation for first-time student-teachers. Numbered because the
// sequence is real information; copy names actual capabilities (offline PWA
// reading, progress tracking) and frames the account as benefit, not gate.
import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";

const STEP_ICON_PATHS = {
  1: (
    // search
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  2: (
    // open book
    <>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </>
  ),
  3: (
    // user-check
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="m16 11 2 2 4-4" />
    </>
  ),
} as const;

function StepIcon({ step }: { step: 1 | 2 | 3 }) {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {STEP_ICON_PATHS[step]}
    </svg>
  );
}

export default async function HowToUse() {
  const [t, locale] = await Promise.all([getTranslations("home"), getLocale()]);
  const latinEyebrow = locale === "en" ? "uppercase tracking-[0.2em]" : "tracking-normal";

  const steps = [
    { n: 1 as const, title: t("howStep1Title"), body: t("howStep1Body"), href: "/search", link: t("howStep1Link") },
    { n: 2 as const, title: t("howStep2Title"), body: t("howStep2Body"), href: "/books", link: t("howStep2Link") },
    { n: 3 as const, title: t("howStep3Title"), body: t("howStep3Body"), href: "/auth/signup", link: t("howStep3Link") },
  ];

  return (
    <section className="border-b border-divider/60 bg-bg-surface" aria-labelledby="how-to-use-title">
      <div className="mx-auto max-w-[1400px] px-4 py-12 sm:py-14 md:px-12 md:py-16">
        {/* ── Header ── */}
        <div className="mb-8">
          <div className="mb-2 flex items-center gap-3">
            <span className="h-[3px] w-7 rounded-full bg-gradient-to-r from-accent to-brand" aria-hidden />
            <span className={`text-[11px] font-bold text-accent-text ${latinEyebrow}`}>
              {t("howToEyebrow")}
            </span>
          </div>
          <h2
            id="how-to-use-title"
            className="font-khmer-serif font-bold leading-tight tracking-tight text-text-heading"
            style={{ fontSize: "clamp(22px, 2.4vw, 32px)" }}
          >
            {t("howToTitle")}
          </h2>
        </div>

        {/* ── Steps ── */}
        <ol className="grid gap-4 md:grid-cols-3 md:gap-6">
          {steps.map((step) => (
            <li key={step.n} className="relative flex gap-4 rounded-2xl border border-divider bg-paper p-5 sm:p-6">
              {/* Ordinal + icon column */}
              <div className="flex shrink-0 flex-col items-center gap-2">
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-brand-contrast"
                  aria-hidden
                >
                  <StepIcon step={step.n} />
                </span>
                <span className="font-serif text-[13px] font-bold text-brand/40 tabular-nums" aria-hidden>
                  {step.n}
                </span>
              </div>

              <div className="min-w-0">
                <h3 className="font-khmer-serif text-[16px] font-bold leading-snug text-text-heading">
                  {step.title}
                </h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-body">
                  {step.body}
                </p>
                <Link
                  href={step.href}
                  className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-bold text-brand transition-colors hover:text-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 rounded-sm"
                >
                  {step.link}
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </Link>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
