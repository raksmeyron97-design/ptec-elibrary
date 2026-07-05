// components/ui/home/PartnerStrip.tsx
// One quiet row of partner logos — grayscale at rest, full color on hover
// (the Springer/IEEE treatment: partners are context, not content). Renders
// nothing until real logos exist in lib/home-partners.ts.
import Image from "next/image";
import { getTranslations, getLocale } from "next-intl/server";
import { HOME_PARTNERS } from "@/lib/home-partners";

export default async function PartnerStrip() {
  if (HOME_PARTNERS.length === 0) return null;

  const [t, locale] = await Promise.all([getTranslations("home"), getLocale()]);
  const latinEyebrow = locale === "en" ? "uppercase tracking-[0.2em]" : "tracking-normal";

  return (
    <section className="border-b border-divider/60 bg-paper" aria-labelledby="partners-title">
      <div className="mx-auto max-w-[1400px] px-4 py-10 sm:py-12 md:px-12">
        <h2
          id="partners-title"
          className={`mb-7 text-center text-[11px] font-bold text-text-muted ${latinEyebrow}`}
        >
          {t("partnersEyebrow")}
        </h2>

        <ul className="flex flex-wrap items-center justify-center gap-x-12 gap-y-8">
          {HOME_PARTNERS.map((partner) => {
            const logo = (
              <Image
                src={partner.logo}
                alt={partner.name}
                width={140}
                height={40}
                className="h-9 w-auto opacity-60 grayscale transition-all duration-200 hover:opacity-100 hover:grayscale-0 sm:h-10"
              />
            );
            return (
              <li key={partner.name}>
                {partner.url ? (
                  <a
                    href={partner.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 rounded-sm inline-block"
                  >
                    {logo}
                    <span className="sr-only">{partner.name} ({t("partnersOpensNewTab")})</span>
                  </a>
                ) : (
                  logo
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
