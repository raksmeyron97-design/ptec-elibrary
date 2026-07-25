import { getTranslations, getFormatter } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ShieldCheck, ChevronRight, CalendarClock, Tag, Languages } from "lucide-react";
import { POLICY_VERSION, POLICY_EFFECTIVE_DATE } from "@/lib/privacy/policy";
import PrivacyHeroActions from "./PrivacyHeroActions";

/**
 * Compact hero: breadcrumb, shield mark, title, plain-language description,
 * last-updated date + version + language state, and the action buttons.
 * Server-rendered apart from the small PrivacyHeroActions client island.
 */
export default async function PrivacyHero({ km }: { km: boolean }) {
  const [t, format] = await Promise.all([
    getTranslations("privacy"),
    getFormatter(),
  ]);
  const headingFont = km ? "font-khmer-serif" : "";

  const updated = format.dateTime(new Date(POLICY_EFFECTIVE_DATE), {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <header
      id="privacy-hero"
      className="relative overflow-hidden print:bg-white print:text-black"
      style={{ background: "linear-gradient(135deg,#1E3A8A 0%,#0B1530 100%)" }}
    >
      <div
        className="absolute inset-0 opacity-[0.06] print:hidden"
        style={{
          backgroundImage: "radial-gradient(circle,white 1px,transparent 1px)",
          backgroundSize: "24px 24px",
        }}
        aria-hidden="true"
      />
      <div className="relative mx-auto max-w-[1200px] px-4 py-10 sm:px-6 md:px-8 md:py-14">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="print:hidden">
          <ol className="flex flex-wrap items-center gap-1.5 text-[13px] text-white/70">
            <li>
              <Link
                href="/"
                className="rounded transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                {t("breadcrumb.home")}
              </Link>
            </li>
            <li aria-hidden="true">
              <ChevronRight className="h-3.5 w-3.5" />
            </li>
            <li aria-current="page" className="font-medium text-white/90">
              {t("breadcrumb.current")}
            </li>
          </ol>
        </nav>

        <div className="mt-6 flex items-start gap-4">
          <span
            className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/20 sm:flex print:hidden"
            aria-hidden="true"
          >
            <ShieldCheck className="h-7 w-7" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p
              className="text-[12px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: "#DDB022" }}
            >
              {t("hero.eyebrow")}
            </p>
            <h1
              className={`mt-1.5 text-[28px] font-bold leading-tight text-white sm:text-[34px] print:text-black ${headingFont}`}
            >
              {t("hero.title")}
            </h1>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-white/80 print:text-black">
              {t("hero.description")}
            </p>
          </div>
        </div>

        {/* Meta row */}
        <dl className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-white/75 print:text-black">
          <div className="flex items-center gap-1.5">
            <CalendarClock className="h-4 w-4 text-white/50 print:hidden" aria-hidden="true" />
            <dt className="font-medium">{t("hero.lastUpdatedLabel")}:</dt>
            <dd>
              <time dateTime={POLICY_EFFECTIVE_DATE}>{updated}</time>
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <Tag className="h-4 w-4 text-white/50 print:hidden" aria-hidden="true" />
            <dt className="font-medium">{t("hero.versionLabel")}:</dt>
            <dd>{POLICY_VERSION}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <Languages className="h-4 w-4 text-white/50 print:hidden" aria-hidden="true" />
            <dd>{t("hero.languageNote")}</dd>
          </div>
        </dl>

        <PrivacyHeroActions
          labels={{
            manage: t("actions.manage"),
            contact: t("actions.contact"),
            print: t("actions.print"),
          }}
        />
      </div>
    </header>
  );
}
