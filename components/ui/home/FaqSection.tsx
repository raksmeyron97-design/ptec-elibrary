// components/ui/home/FaqSection.tsx
// Six questions the front desk actually gets, phrased the way users ask them.
// The accordion is native <details name="home-faq">: one answer open at a
// time (the shared `name`), every answer in the HTML whether open or not, and
// it works with JavaScript off. Its height animates through
// ::details-content where the browser supports it (globals.css, Phase 2).
// FAQPage JSON-LD is generated from the same translation strings so the schema
// always mirrors the visible text (a Google structured-data requirement).
//
// The left column carries the header, a "Contact librarian" link and — for
// signed-out visitors only — the sign-up card that used to be its own band.
import { Link } from "@/i18n/navigation";
import NextLink from "next/link";
import { isLocaleScoped } from "@/lib/routing/locale-scope";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { HomeSection, SectionHeader } from "./HomeSection";
import SignedOutOnly from "./SignedOutOnly";

type FaqItem = {
  q: string;
  a: string;
  /** Optional deep link shown after the answer. */
  href?: string;
};

type HomeTranslate = Awaited<ReturnType<typeof getTranslations<"home">>>;

/** The six questions, from the translation strings — the one list both the
 *  visible accordion and the FAQPage node read, so they cannot disagree. */
function faqItems(t: HomeTranslate): FaqItem[] {
  return [
    { q: t("faqQ1"), a: t("faqA1"), href: "/policy" },
    { q: t("faqQ2"), a: t("faqA2"), href: "/offline-books" },
    { q: t("faqQ3"), a: t("faqA3"), href: "/auth/signup" },
    { q: t("faqQ4"), a: t("faqA4"), href: "/catalogs" },
    { q: t("faqQ5"), a: t("faqA5") },
    { q: t("faqQ6"), a: t("faqA6"), href: "/contact" },
  ];
}

/**
 * The homepage's FAQPage node (kept, D10 — none is added elsewhere). The
 * homepage puts it in its ONE JSON-LD block (SEO Phase 4) rather than this
 * section rendering a block of its own.
 */
export async function homeFaqNode(locale: string) {
  const t = await getTranslations({ locale, namespace: "home" });
  return {
    "@type": "FAQPage",
    mainEntity: faqItems(t).map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

export default async function FaqSection() {
  const t = await getTranslations("home");
  const items = faqItems(t);

  return (
    <HomeSection id="faq" surface="paper" labelledBy="faq-title">
      <div className="grid gap-10 lg:grid-cols-[4fr_8fr] lg:gap-12">
        <div className="min-w-0">
          <SectionHeader id="faq-title" eyebrow={t("faqEyebrow")} title={t("faqTitle")} />
          <Link
            href="/contact"
            className="-mt-4 inline-flex min-h-[40px] items-center gap-1.5 rounded-sm text-[14px] font-semibold text-brand transition-colors hover:text-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
          >
            {t("libraryNowContact")}
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>

          {/* Sign-up — signed-out visitors only. A display rule, not access
              control: the card is public and in the prerendered HTML, and
              <SignedOutOnly> hides it after hydration for a signed-in reader
              (a server auth read would make the homepage dynamic). /auth is
              outside the locale scheme, so these are plain next/link. */}
          <SignedOutOnly>
            <div className="mt-6 rounded-xl border border-border bg-bg-surface p-5 shadow-sm">
              <h3 className="font-record text-[18px] font-bold leading-snug text-text-heading">{t("howStep3Title")}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-muted">{t("howStep3Body")}</p>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                <NextLink
                  href="/auth/signup"
                  className="inline-flex min-h-[44px] items-center rounded-lg bg-brand px-5 text-[14px] font-semibold text-brand-contrast transition-colors hover:bg-brand-hover"
                >
                  {t("howStep3Link")}
                </NextLink>
                <NextLink
                  href="/auth/login"
                  className="inline-flex min-h-[44px] items-center rounded-lg px-2 text-[14px] font-semibold text-brand transition-colors hover:text-brand-hover hover:underline"
                >
                  {t("popularSignIn")}
                </NextLink>
              </div>
            </div>
          </SignedOutOnly>
        </div>

        {/* ── The accordion ──
            One shared `name` makes the group exclusive: opening one answer
            closes the open one, natively, with or without JavaScript. */}
        <div className="divide-y divide-border self-start rounded-xl border border-border bg-bg-surface shadow-sm">
          {items.map((item, i) => (
            <details key={item.q} name="home-faq" open={i === 0} className="group">
              <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4 text-[15.5px] font-semibold text-text-heading transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring/50 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1">{item.q}</span>
                <Plus
                  className="h-5 w-5 shrink-0 text-text-muted transition-transform duration-200 group-open:rotate-45 group-open:text-brand motion-reduce:transition-none"
                  aria-hidden
                />
              </summary>
              <div className="px-5 pb-5">
                <p className="text-[14px] leading-relaxed text-text-body">{item.a}</p>
                {item.href && (() => {
                  // /auth is OUTSIDE the locale scheme, and Link from
                  // @/i18n/navigation prefixes the active locale — so the
                  // "Do I need an account?" answer pointed Khmer readers at
                  // /km/auth/signup, which 404s. Invisible in English,
                  // because the default locale is unprefixed. Route
                  // unscoped hrefs through plain next/link instead;
                  // isLocaleScoped() is the shared rule, unit-tested in
                  // lib/routing/locale-scope.test.ts.
                  const Anchor = isLocaleScoped(item.href) ? Link : NextLink;
                  return (
                    <Anchor
                      href={item.href}
                      className="mt-2.5 inline-flex items-center gap-1.5 rounded-sm text-[13px] font-bold text-brand transition-colors hover:text-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
                    >
                      {t("faqLearnMore")}
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </Anchor>
                  );
                })()}
              </div>
            </details>
          ))}
        </div>
      </div>
    </HomeSection>
  );
}
