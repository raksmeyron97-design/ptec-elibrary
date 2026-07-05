// components/ui/home/Testimonials.tsx
// Three static quote cards — no carousel (comprehension and motion-sensitivity
// both test badly). Renders nothing until real quotes exist in
// lib/home-testimonials.ts. No Review/aggregateRating schema: self-serving
// testimonial markup violates Google's structured-data policy.
import { getTranslations, getLocale } from "next-intl/server";
import { HOME_TESTIMONIALS } from "@/lib/home-testimonials";

export default async function Testimonials() {
  if (HOME_TESTIMONIALS.length === 0) return null;

  const [t, locale] = await Promise.all([getTranslations("home"), getLocale()]);
  const latinEyebrow = locale === "en" ? "uppercase tracking-[0.2em]" : "tracking-normal";
  const lang = locale === "km" ? "km" : "en";

  return (
    <section className="border-b border-divider/60 bg-bg-surface" aria-labelledby="testimonials-title">
      <div className="mx-auto max-w-[1400px] px-4 py-12 sm:py-14 md:px-12 md:py-16">
        {/* ── Header ── */}
        <div className="mb-8">
          <div className="mb-2 flex items-center gap-3">
            <span className="h-[3px] w-7 rounded-full bg-gradient-to-r from-accent to-brand" aria-hidden />
            <span className={`text-[11px] font-bold text-accent-text ${latinEyebrow}`}>
              {t("testimonialsEyebrow")}
            </span>
          </div>
          <h2
            id="testimonials-title"
            className="font-khmer-serif font-bold leading-tight tracking-tight text-text-heading"
            style={{ fontSize: "clamp(22px, 2.4vw, 32px)" }}
          >
            {t("testimonialsTitle")}
          </h2>
        </div>

        {/* ── Quote cards ── */}
        <ul className="grid gap-4 sm:gap-5 lg:grid-cols-3">
          {HOME_TESTIMONIALS.slice(0, 3).map((item) => (
            <li key={item.name} className="flex">
              <figure className="flex flex-col justify-between gap-5 rounded-2xl border border-divider bg-paper p-6">
                <blockquote className="relative">
                  <span
                    aria-hidden
                    className="font-serif absolute -left-1 -top-3 text-[40px] leading-none text-gold-400/40"
                  >
                    &ldquo;
                  </span>
                  <p className="font-khmer-serif pl-5 text-[15px] leading-relaxed text-text-body">
                    {item.quote[lang]}
                  </p>
                </blockquote>
                <figcaption className="flex items-center gap-3 pl-5">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[12px] font-bold text-brand"
                    aria-hidden
                  >
                    {[...item.name][0] ?? ""}
                  </span>
                  <span>
                    <cite className="block text-[13.5px] font-bold not-italic text-text-heading">
                      {item.name}
                    </cite>
                    <span className="block text-[12px] text-text-muted">{item.role[lang]}</span>
                  </span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
