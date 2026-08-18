// components/ui/home/FaqSection.tsx
// Five questions the front desk actually gets, phrased the way users ask them
// and ORDERED for a stranger rather than for a PTEC student: is it free, do I
// need an account, is it in my language — the three facts that decide whether
// someone can use the library at all — then the two operational ones.
//
// Those first three are also on screen in the hero now (<HeroTrustPoints>);
// keeping them here as well is deliberate, because this is the copy Google
// lifts into a rich result for "free library Cambodia"-shaped queries, and the
// FAQPage schema below must mirror visible text to be eligible.
//
// Trimmed from six: "How do I submit my thesis or research?" was the only
// question aimed at people who already belong to the institution, and its
// answer was "contact the library" — which is now the standing link under the
// grid, so the route survives and the accordion is one item shorter.
// Native <details>/<summary> — zero JS, free keyboard support. FAQPage JSON-LD
// is generated from the same translation strings so the schema always mirrors
// the visible text (a Google structured-data requirement).
import { Link } from "@/i18n/navigation";
import NextLink from "next/link";
import { ArrowRight } from "lucide-react";
import { isLocaleScoped } from "@/lib/routing/locale-scope";
import { getTranslations, getLocale } from "next-intl/server";
import JsonLd from "@/components/seo/JsonLd";
import SectionHeader, { SECTION_SHELL } from "./SectionHeader";

type FaqItem = {
  q: string;
  a: string;
  /** Optional deep link shown after the answer. */
  href?: string;
};

/**
 * "Learn more", pointed at whichever route the answer needs.
 *
 * The component is chosen from the href, not hard-coded: `/auth/signup` is
 * outside the locale scheme, and the locale-aware Link rendered it as
 * `/km/auth/signup` — a 404 that only Khmer readers ever saw, because English
 * is unprefixed. Deciding here means a future FAQ entry cannot reintroduce it.
 */
function FaqLink({ href, children }: { href: string; children: React.ReactNode }) {
  const className =
    "mt-1 inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-bold text-brand transition-colors hover:text-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 rounded-sm";
  return isLocaleScoped(href) ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <NextLink href={href} className={className}>
      {children}
    </NextLink>
  );
}

export default async function FaqSection({ surfaceClass }: { surfaceClass: string }) {
  const [t, locale] = await Promise.all([getTranslations("home"), getLocale()]);

  // Order is the argument: access first, logistics second.
  const items: FaqItem[] = [
    { q: t("faqQ1"), a: t("faqA1"), href: "/policy" },          // is it free
    { q: t("faqQ3"), a: t("faqA3"), href: "/auth/signup" },     // do I need an account
    { q: t("faqQ5"), a: t("faqA5") },                           // is it in Khmer
    { q: t("faqQ2"), a: t("faqA2"), href: "/offline-books" },   // can I read offline
    { q: t("faqQ4"), a: t("faqA4"), href: "/catalogs" },        // borrowing on campus
  ];

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  // Two independent columns (3 + 2) so open/close never reflows the other side.
  const columns = [items.slice(0, 3), items.slice(3)];

  return (
    <section className={surfaceClass} aria-labelledby="faq-title">
      <JsonLd data={faqSchema} />
      <div className={SECTION_SHELL}>
        <SectionHeader
          id="faq-title"
          eyebrow={t("faqEyebrow")}
          title={t("faqTitle")}
          locale={locale}
          accent="accent"
        />

        {/* ── Accordions ── */}
        <div className="grid gap-x-8 gap-y-3 md:grid-cols-2 md:items-start">
          {columns.map((col, ci) => (
            <div key={col[0]?.q ?? ci} className="flex flex-col gap-3">
              {col.map((item, i) => (
                <details
                  key={item.q}
                  // First item open so the disclosure pattern is self-evident
                  open={ci === 0 && i === 0}
                  className="group rounded-xl border border-divider bg-bg-surface open:border-brand/30 open:shadow-sm"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[14.5px] font-bold text-text-heading transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 rounded-xl [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <svg
                      className="h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 group-open:rotate-180"
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}
                      strokeLinecap="round" strokeLinejoin="round" aria-hidden
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </summary>
                  <div className="px-5 pb-4">
                    <p className="text-[13.5px] leading-relaxed text-text-body">{item.a}</p>
                    {item.href && (
                      <FaqLink href={item.href}>
                        {t("faqLearnMore")}
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M5 12h14M13 6l6 6-6 6" />
                        </svg>
                      </FaqLink>
                    )}
                  </div>
                </details>
              ))}
            </div>
          ))}
        </div>

        {/* The standing route for everything not on this list — including
            "how do I submit my thesis", which used to be the sixth accordion
            and whose answer was always "ask the library". */}
        <p className="mt-6 text-[13.5px] text-text-muted">
          {t("faqMoreQuestions")}{" "}
          <Link
            href="/contact"
            className="inline-flex min-h-[44px] items-center gap-1.5 align-middle font-bold text-brand transition-colors hover:text-brand-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand rounded-sm"
          >
            {t("faqContactLink")}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </p>
      </div>
    </section>
  );
}
