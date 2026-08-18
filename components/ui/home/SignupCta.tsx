// components/ui/home/SignupCta.tsx
// Section 8 — the page's one closing call to action.
//
// It is no longer a signup banner. Three conversion moments competed on this
// page (the hero CTAs, a mid-page "sign in free" strip, and this one), and this
// one was a sign-in wall on a library that needs no account to read. The
// primary action is now BROWSE; signing in is offered underneath as an optional
// benefit, and only to visitors who are not already signed in.
//
// It also no longer carries statistics. The list it used to show ("114 digital
// resources / 112 e-books / 1 theses / 1 publications") was the page's second
// stats block, six sections away from the first, labelling the same figures
// differently and leading with counts of one. There is now exactly one
// statistics surface on the homepage: <HeroStatStrip>.
//
// The banner is always rendered on the server (so it is in the prerendered HTML
// and visible to crawlers); only the sign-in offer is hidden after hydration,
// via <SignedOutOnly>, which costs no cookie read and keeps this page static.
import { Link } from "@/i18n/navigation";
import NextLink from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import SignedOutOnly from "./SignedOutOnly";

export default async function SignupCta({ surfaceClass = "" }: { surfaceClass?: string }) {
  const [t, locale] = await Promise.all([getTranslations("home"), getLocale()]);

  const latinEyebrow = locale === "en" ? "uppercase tracking-[0.22em]" : "tracking-normal";

  return (
    <section className={`hero-ink relative overflow-hidden ${surfaceClass}`} aria-labelledby="closing-cta-title">
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
          id="closing-cta-title"
          className={`mx-auto max-w-3xl font-bold text-white drop-shadow-[0_2px_20px_rgba(0,0,0,0.55)] ${
            locale === "km"
              ? "font-khmer-serif leading-[1.4] tracking-normal"
              : "font-serif leading-[1.1] tracking-[-0.02em]"
          }`}
          style={{ fontSize: "clamp(26px, 3.6vw, 48px)" }}
        >
          {t("ctaHeadingPublic")}
        </h2>

        {/* Subtitle — deliberately makes NO numeric claim. The one figure the
            page states lives in the hero stat strip, labelled; restating it
            here under a second wording ("educational resources") was half of
            the homepage's apparent inconsistency. */}
        <p className="mx-auto mt-5 max-w-xl text-[15px] leading-[1.75] text-blue-100/75 sm:text-[16px]">
          {t("ctaBodyNoCount")}
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

        {/* The only place signing in is mentioned on this page, and it is
            framed as an addition rather than a gate: everything above works
            without an account. Hidden after hydration for users who already
            have one — a display rule, not access control. */}
        <SignedOutOnly>
          <div className="mt-10 border-t border-white/12 pt-7">
            <p className="mx-auto max-w-xl text-[13.5px] leading-relaxed text-blue-100/70">
              {t("ctaSignInBenefit")}
            </p>
            {/* Auth routes are outside the locale scheme, so this is a plain
                next/link — the localized one would prefix it with /km. */}
            <NextLink
              href="/auth/signup"
              className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-[13.5px] font-bold text-gold-300 underline-offset-4 transition-colors hover:text-gold-200 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
            >
              {t("ctaSignInLink")}
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </NextLink>
          </div>
        </SignedOutOnly>

      </div>

      {/* Bottom gold hairline */}
      <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-400/60 to-transparent" aria-hidden />
    </section>
  );
}
