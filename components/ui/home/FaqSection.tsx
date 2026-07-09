// components/ui/home/FaqSection.tsx
// Six questions the front desk actually gets, phrased the way users ask them.
// Native <details>/<summary> — zero JS, free keyboard support. FAQPage JSON-LD
// is generated from the same translation strings so the schema always mirrors
// the visible text (a Google structured-data requirement).
import { Link } from "@/i18n/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import JsonLd from "@/components/seo/JsonLd";

type FaqItem = {
  q: string;
  a: string;
  /** Optional deep link shown after the answer. */
  href?: string;
};

export default async function FaqSection() {
  const [t, locale] = await Promise.all([getTranslations("home"), getLocale()]);
  const latinEyebrow = locale === "en" ? "uppercase tracking-[0.2em]" : "tracking-normal";

  const items: FaqItem[] = [
    { q: t("faqQ1"), a: t("faqA1"), href: "/policy" },
    { q: t("faqQ2"), a: t("faqA2"), href: "/offline-books" },
    { q: t("faqQ3"), a: t("faqA3"), href: "/auth/signup" },
    { q: t("faqQ4"), a: t("faqA4"), href: "/catalogs" },
    { q: t("faqQ5"), a: t("faqA5") },
    { q: t("faqQ6"), a: t("faqA6"), href: "/contact" },
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

  // Two independent columns (3 + 3) so open/close never reflows the other side.
  const columns = [items.slice(0, 3), items.slice(3)];

  return (
    <section className="border-b border-divider/60 bg-paper" aria-labelledby="faq-title">
      <JsonLd data={faqSchema} />
      <div className="mx-auto max-w-[1400px] px-4 py-12 sm:py-14 md:px-12 md:py-16">
        {/* ── Header ── */}
        <div className="mb-8">
          <div className="mb-2 flex items-center gap-3">
            <span className="h-[3px] w-7 rounded-full bg-gradient-to-r from-accent to-brand" aria-hidden />
            <span className={`text-[11px] font-bold text-accent-text ${latinEyebrow}`}>
              {t("faqEyebrow")}
            </span>
          </div>
          <h2
            id="faq-title"
            className="font-khmer-serif font-bold leading-tight tracking-tight text-text-heading"
            style={{ fontSize: "clamp(22px, 2.4vw, 32px)" }}
          >
            {t("faqTitle")}
          </h2>
        </div>

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
                      <Link
                        href={item.href}
                        className="mt-2.5 inline-flex items-center gap-1.5 text-[13px] font-bold text-brand transition-colors hover:text-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 rounded-sm"
                      >
                        {t("faqLearnMore")}
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M5 12h14M13 6l6 6-6 6" />
                        </svg>
                      </Link>
                    )}
                  </div>
                </details>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
