import type { Metadata } from "next";
import { getMessages, getTranslations } from "next-intl/server";
import { BookOpenCheck, Scale } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { localeAlternates } from "@/lib/seo/alternates";
import { openGraphBase } from "@/lib/seo/open-graph";
import { breadcrumbSchema } from "@/lib/seo/schema";
import JsonLd from "@/components/seo/JsonLd";
import { ABOUT_CONTENT_REVIEWED_AT, RULES_POLICY_VERSION } from "@/lib/about/content";
import { LIFECYCLE_STEPS, POLICY_SECTIONS } from "@/lib/policy/borrow";
import { readingTime } from "@/lib/policy/reading-time";
import PolicyHero from "@/components/policy/PolicyHero";
import PolicyLayout from "@/components/policy/PolicyLayout";
import PolicySection from "@/components/policy/PolicySection";
import Stepper from "@/components/policy/Stepper";
import PolicyHeroActions from "./PolicyHeroActions";
import PolicyKeyNumbers from "./PolicyKeyNumbers";
import PolicyAllowances from "./PolicyAllowances";
import PolicyFaq from "./PolicyFaq";

/**
 * /policy — Borrow & Return.
 *
 * This is the READER'S view of the borrowing regulations. The regulations
 * themselves live at /about/rules, and every figure, penalty and renewal rule
 * on this page is read from the same source those are (lib/about/content.ts,
 * via lib/policy/borrow.ts). The two pages therefore cannot disagree about how
 * long a loan runs or what a lost book costs, and neither one holds a
 * paraphrase of the other.
 *
 * Nothing here states a rule. The only copy this page owns is framing: section
 * headings, the FAQ's questions, and the column labels on the allowance table.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const tMeta = await getTranslations({ locale, namespace: "policy.meta" });
  const alternates = localeAlternates("/policy", locale);
  return {
    title: tMeta("title"),
    description: tMeta("description"),
    alternates,
    openGraph: {
      ...(await openGraphBase(locale)),
      title: tMeta("ogTitle"),
      description: tMeta("ogDescription"),
      url: alternates.canonical,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: tMeta("ogTitle"),
      description: tMeta("ogDescription"),
    },
  };
}

export default async function PolicyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const km = locale === "km";
  // See the note on /privacy: a plain binding is what makes these keys
  // checkable by lib/i18n-keys.test.ts.
  const t = await getTranslations("policy");
  const messages = await getMessages();

  const tocItems = POLICY_SECTIONS.map((id) => ({
    id,
    label: t(`sections.${id}.title`),
  }));

  const { minutes } = readingTime((messages as { policy?: unknown }).policy);

  const breadcrumb = breadcrumbSchema(
    [{ name: t("breadcrumb.home"), path: "/" }, { name: t("breadcrumb.current") }],
    { locale },
  );

  // The lifecycle copy carries the figures the regulations supply, so each
  // step's text is filled from the same numbers the key-number cards print.
  const steps = LIFECYCLE_STEPS.map(({ id, icon, vars }) => ({
    id,
    icon,
    title: t(`lifecycle.${id}.title`),
    body: t(`lifecycle.${id}.body`, vars),
  }));

  return (
    <>
      <JsonLd data={breadcrumb} />

      <PolicyHero
        id="policy-hero"
        Icon={Scale}
        km={km}
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        description={t("hero.description")}
        breadcrumb={{ home: t("breadcrumb.home"), current: t("breadcrumb.current") }}
        // The borrowing rules are reviewed as one document with the rest of the
        // About content, so this page reports THAT review date and version
        // rather than minting a second, unrelated one that would drift.
        isoDate={ABOUT_CONTENT_REVIEWED_AT}
        version={RULES_POLICY_VERSION}
        metaLabels={{
          updated: t("hero.lastUpdatedLabel"),
          version: t("hero.versionLabel"),
          readingTime: t("hero.readingTime", { minutes }),
        }}
        note={t("hero.languageNote")}
        actions={
          <PolicyHeroActions
            labels={{
              fullRules: t("actions.fullRules"),
              contact: t("actions.contact"),
              print: t("actions.print"),
            }}
          />
        }
      />

      <PolicyLayout
        items={tocItems}
        km={km}
        labels={{
          tocTitle: t("toc.title"),
          tocMobile: t("toc.mobileLabel"),
          backToTop: t("toc.backToTop"),
        }}
      >
        {/* No measure here: PolicySection applies it to its own prose, so a
            table, a stat grid or a stepper passed as `children` keeps the full
            width of the content column. */}
        <div className="space-y-14">
          <PolicySection namespace="policy" id="summary" km={km}>
            <PolicyKeyNumbers km={km} />
          </PolicySection>

          <PolicySection namespace="policy" id="lifecycle" km={km}>
            <Stepper items={steps} label={t("lifecycle.label")} km={km} />
          </PolicySection>

          <div className="cv-auto space-y-14">
            <PolicySection namespace="policy" id="borrowing" km={km}>
              <PolicyAllowances locale={locale} />
            </PolicySection>

            <PolicySection namespace="policy" id="returning" km={km} />

            <PolicySection namespace="policy" id="digital" km={km} />

            <PolicySection namespace="policy" id="faq" km={km}>
              <PolicyFaq locale={locale} />
            </PolicySection>

            <PolicySection namespace="policy" id="help" km={km}>
              {/* The signpost to the authoritative document. It is a full card
                  rather than an inline link because "this page is the short
                  version" is a statement a reader needs to meet, not find. */}
              <div className="mt-6 rounded-2xl border border-divider bg-bg-app/60 p-5 sm:p-6">
                <h3
                  className={`policy-wrap text-[16px] font-semibold text-text-heading ${km ? "font-khmer-serif" : ""}`}
                >
                  {t("fullRules.title")}
                </h3>
                <p className="policy-copy mt-2 text-[14px] text-text-body">
                  {t("fullRules.body")}
                </p>
                <Link
                  href="/about/rules"
                  className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-[14px] font-semibold text-brand-contrast transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-app"
                >
                  <BookOpenCheck className="h-[18px] w-[18px]" aria-hidden="true" />
                  {t("fullRules.cta")}
                </Link>
              </div>
            </PolicySection>
          </div>
        </div>
      </PolicyLayout>
    </>
  );
}
