// components/ui/home/SignupCta.tsx
// Bottom-of-homepage signup banner.
//
// It is shown to logged-out visitors only, but that is a *presentation* rule,
// not a data-access one: everything in it is public marketing copy plus public
// stats. It used to enforce the rule with a server-side supabase.auth.getUser()
// — a cookie read that, even behind Suspense, made the whole homepage dynamic.
// The banner is now always rendered (so it is in the prerendered HTML and
// visible to crawlers) and hidden after hydration for signed-in users by
// <SignedOutOnly>.
import { Link } from "@/i18n/navigation";
import { getHomeStats } from "@/lib/home-stats";
import { getTranslations, getLocale } from "next-intl/server";

export default async function SignupCta() {
  const [t, locale, stats] = await Promise.all([
    getTranslations("home"),
    getLocale(),
    getHomeStats(),
  ]);

  const latinEyebrow = locale === "en" ? "uppercase tracking-[0.22em]" : "tracking-normal";
  const resourceCount = stats.resources ?? 0;

  return (
    <section className="hero-ink relative overflow-hidden">
      {/* Aurora animated gradient */}
      <div className="aurora absolute inset-0" aria-hidden />

      {/* Dot grid texture */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* Center radial glow behind text */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[560px] w-[900px] rounded-full opacity-25"
        style={{ background: "radial-gradient(ellipse, rgba(37,99,235,0.55) 0%, transparent 68%)" }}
      />

      {/* Decorative open-book SVG — left edge */}
      <div aria-hidden className="pointer-events-none absolute -left-10 top-1/2 -translate-y-1/2 opacity-[0.045]">
        <svg width="340" height="340" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
        </svg>
      </div>

      {/* Decorative open-book SVG — right edge */}
      <div aria-hidden className="pointer-events-none absolute -right-10 top-1/2 -translate-y-1/2 opacity-[0.045] rotate-12">
        <svg width="340" height="340" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
        </svg>
      </div>

      {/* Top gold hairline */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-400/50 to-transparent" aria-hidden />

      <div className="relative mx-auto max-w-[1400px] px-4 py-16 sm:py-20 md:px-12 md:py-28 text-center">

        {/* Eyebrow pill badge with pulsing dot */}
        <div className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-gold-400/30 bg-gold-400/[0.09] px-4 py-1.5 backdrop-blur-sm">
          <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-400 opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-gold-400" />
          </span>
          <span className={`text-[11px] font-bold text-gold-400 ${latinEyebrow}`}>
            {t("ctaEyebrow")}
          </span>
        </div>

        {/* Heading */}
        <h2
          className={`mx-auto max-w-3xl font-bold text-white drop-shadow-[0_2px_20px_rgba(0,0,0,0.55)] ${
            locale === "km"
              ? "font-khmer-serif leading-[1.4] tracking-normal"
              : "font-serif leading-[1.1] tracking-[-0.02em]"
          }`}
          style={{ fontSize: "clamp(26px, 3.6vw, 48px)" }}
        >
          {t("ctaHeading")}
        </h2>

        {/* Subtitle */}
        <p className="mx-auto mt-5 max-w-xl text-[15px] leading-[1.75] text-blue-100/75 sm:text-[16px]">
          {t("ctaBody")}
        </p>

        {/* CTA buttons */}
        <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
          {/* Primary — gold gradient with glow */}
          <Link
            href="/books"
            className="group inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-b from-gold-400 to-gold-500 px-7 py-3.5 text-[15px] font-bold text-blue-950 shadow-[0_0_0_1px_rgba(228,187,48,0.35),0_8px_28px_-4px_rgba(228,187,48,0.4)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_rgba(228,187,48,0.55),0_14px_36px_-4px_rgba(228,187,48,0.55)] active:translate-y-0 sm:w-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400 cursor-pointer"
          >
            {t("ctaBrowse")}
            <svg
              className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5"
              viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>

          {/* Secondary — glassmorphism */}
          <Link
            href="/catalogs"
            className="group inline-flex w-full items-center justify-center gap-2.5 rounded-xl border border-white/20 bg-white/[0.07] px-7 py-3.5 text-[15px] font-semibold text-white backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-white/35 hover:bg-white/[0.13] active:translate-y-0 sm:w-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50 cursor-pointer"
          >
            {t("ctaPhysical")}
            <svg
              className="h-4 w-4 opacity-60 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:opacity-100"
              viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>

        {/* Micro-stats strip — resource count comes from live stats, not a
            hardcoded claim that can drift from reality. */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {[
            { value: `${resourceCount}+`, label: t("ctaStatResources") },
            { value: t("ctaStatFree"), label: t("ctaStatOpenAccess") },
            { value: "EN / ខ្មែរ", label: t("ctaStatBilingual") },
          ].map(({ value, label }, i) => (
            <div key={label} className="flex items-center gap-2">
              {i > 0 && <span className="hidden h-3 w-px bg-white/15 sm:block" aria-hidden />}
              <span className="text-[14px] font-bold text-white">{value}</span>
              <span className="text-[12px] text-blue-200/50">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom gold hairline */}
      <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-400/60 to-transparent" aria-hidden />
    </section>
  );
}
