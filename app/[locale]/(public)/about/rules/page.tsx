import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  Ban,
  BookMarked,
  ChevronDown,
  CircleAlert,
  CreditCard,
  Gavel,
  Globe2,
  Heart,
  Info,
  MessageCircleQuestion,
  Repeat2,
  Smartphone,
  Sparkles,
  Trash2,
  Utensils,
  Volume2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { localeAlternates } from "@/lib/seo/alternates";
import { SITE_URL } from "@/lib/seo/site";
import { getOrgIdentity, getSiteConfig } from "@/lib/system-settings/config";
import { toAboutLocale, formatDate, localized } from "@/lib/about/format";
import {
  ABOUT_CONTENT_REVIEWED_AT,
  BORROWING_ALLOWANCES,
  CONDUCT_RULES,
  PENALTIES,
  RULES_POLICY_VERSION,
  RULE_CATEGORIES,
} from "@/lib/about/content";
import AboutPageShell from "@/components/about/AboutPageShell";
import RulesAudienceTabs from "@/components/about/RulesAudienceTabs";
import PrintPageAction from "@/components/about/PrintPageAction";
import { AboutLinkAction, AboutExternalAction } from "@/components/about/actions";
import {
  AboutSection,
  ContentLastUpdated,
  InformationCard,
  NoticePanel,
} from "@/components/about/primitives";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about.rules" });
  const org = await getOrgIdentity();
  const alternates = localeAlternates("/about/rules", locale);
  // The document <title> gets the brand from the site's titleTemplate
  // ("%s · PTEC Library"), so `title` must NOT repeat it. An Open Graph title
  // travels alone into a social card, so that one is branded explicitly.
  const title = t("metaTitle");
  const description = t("metaDescription");
  const socialTitle = `${title} · ${org.siteName}`;

  return {
    title,
    description,
    alternates,
    openGraph: {
      title: socialTitle,
      description,
      url: alternates.canonical,
      type: "website",
      siteName: org.siteName,
      locale: locale === "km" ? "km_KH" : "en_US",
      images: [{ url: `${SITE_URL}/og-default.png` }],
    },
    twitter: { card: "summary_large_image", title: socialTitle, description },
  };
}

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  info: Info,
  card: CreditCard,
  swap: Repeat2,
  alert: CircleAlert,
  gavel: Gavel,
  heart: Heart,
  globe: Globe2,
};

const CONDUCT_ICONS: Record<string, LucideIcon> = {
  phone: Smartphone,
  quiet: Volume2,
  "no-smoking": Ban,
  "no-food": Utensils,
  "no-litter": Trash2,
  "book-care": BookMarked,
  card: CreditCard,
};

export default async function LibraryRulesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  setRequestLocale(rawLocale);
  const locale = toAboutLocale(rawLocale);

  const t = await getTranslations("about");
  const tr = await getTranslations("about.rules");
  const cfg = await getSiteConfig();

  const reviewedDate = formatDate(ABOUT_CONTENT_REVIEWED_AT, locale);
  const students = BORROWING_ALLOWANCES.find((a) => a.audience === "students");
  const staff = BORROWING_ALLOWANCES.find((a) => a.audience === "staff");

  return (
    <AboutPageShell
      page="rules"
      locale={locale}
      hero={{
        category: tr("category"),
        title: tr("title"),
        secondaryTitle: locale === "km" ? "Library Rules" : "បទបញ្ជាបណ្ណាល័យ",
        secondaryLang: locale === "km" ? "en" : "km",
        intro: tr("intro"),
        action: (
          <AboutExternalAction
            href={cfg.phoneLibraryTel}
            icon={MessageCircleQuestion}
            variant="onDark"
          >
            {t("actions.askLibrarian")}
          </AboutExternalAction>
        ),
      }}
      footer={
        <section
          aria-labelledby="rules-official-heading"
          className="mt-14 rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm sm:p-6"
        >
          <h2 id="rules-official-heading" className="text-lg font-semibold text-text-heading">
            {tr("official.heading")}
          </h2>
          <p className="about-copy about-measure mt-2 text-sm text-text-body">
            {tr("official.body")}
          </p>

          <ContentLastUpdated
            reviewedLabel={reviewedDate ? t("meta.reviewed", { date: reviewedDate }) : null}
            versionLabel={t("meta.policyVersion", { version: RULES_POLICY_VERSION })}
            className="mt-5"
          />

          <div className="mt-6 border-t border-divider pt-5">
            <p className="text-sm font-medium text-text-heading">{tr("official.questions")}</p>
            <p className="about-copy mt-1 text-sm text-text-muted">{tr("official.questionsBody")}</p>
            <div className="mt-4 flex flex-wrap gap-3" data-about-print="hide">
              <AboutExternalAction
                href={cfg.phoneLibraryTel}
                icon={MessageCircleQuestion}
                variant="primary"
              >
                {t("actions.callLibrary")}
              </AboutExternalAction>
              <AboutLinkAction href="/contact">{t("actions.contactLibrary")}</AboutLinkAction>
              {/* No "download the PDF" action: the library has not supplied an
                  official policy document, and linking a generated file would
                  present it as the authoritative text. Print instead. */}
              <PrintPageAction label={t("meta.print")} hint={t("meta.printHint")} />
            </div>
          </div>
        </section>
      }
    >
      {/* ── Quick reference ──────────────────────────────────────────────
          Directly below the hero: the three questions people actually
          arrive with, answered before any prose. */}
      <AboutSection id="quick-reference" title={tr("quick.heading")}>
        <div className="grid gap-4 sm:grid-cols-3">
          <InformationCard className="flex h-full flex-col border-surface-brand-line bg-surface-brand-soft">
            <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
              {tr("quick.maxItems")}
            </p>
            <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-text-heading">
              {tr("quick.maxItemsValue", { count: students?.maxItems ?? 5 })}
            </p>
          </InformationCard>

          <InformationCard className="flex h-full flex-col">
            <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
              {tr("quick.forStudents")}
            </p>
            <dl className="mt-2 space-y-1.5">
              {students?.loanDays.map((loan) => (
                <div key={loan.key} className="flex items-baseline justify-between gap-3">
                  <dt className="about-wrap text-sm text-text-body">
                    {loan.key === "khmer" ? tr("quick.khmerBooks") : tr("quick.englishBooks")}
                  </dt>
                  <dd className="shrink-0 text-base font-semibold tabular-nums text-text-heading">
                    {tr("quick.days", { count: loan.days })}
                  </dd>
                </div>
              ))}
            </dl>
          </InformationCard>

          <InformationCard className="flex h-full flex-col">
            <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
              {tr("quick.forStaff")}
            </p>
            <dl className="mt-2 space-y-1.5">
              {staff?.loanDays.map((loan) => (
                <div key={loan.key} className="flex items-baseline justify-between gap-3">
                  <dt className="about-wrap text-sm text-text-body">{tr("quick.allBooks")}</dt>
                  <dd className="shrink-0 text-base font-semibold tabular-nums text-text-heading">
                    {tr("quick.days", { count: loan.days })}
                  </dd>
                </div>
              ))}
            </dl>
          </InformationCard>
        </div>
      </AboutSection>

      {/* ── Audience selector ──────────────────────────────────────────── */}
      <AboutSection id="audience" title={tr("audience.heading")} description={tr("audience.intro")}>
        <RulesAudienceTabs
          categories={RULE_CATEGORIES}
          allowances={BORROWING_ALLOWANCES}
          locale={locale}
        />
      </AboutSection>

      {/* ── Full rule text ───────────────────────────────────────────────
          Native <details>/<summary>: keyboard-operable, findable by the
          browser's own find-in-page, and zero JavaScript. `open` by default
          so the authoritative text is server-rendered, indexable and
          present in a printed copy even if scripting never runs. */}
      <AboutSection
        id="categories"
        title={tr("categories.heading")}
        description={tr("categories.intro")}
      >
        <div className="space-y-3">
          {RULE_CATEGORIES.map((category) => {
            const Icon = CATEGORY_ICONS[category.icon] ?? Info;
            const title = localized(category.title, locale);
            const summary = localized(category.summary, locale);
            if (!title) return null;

            return (
              <details
                key={category.id}
                id={`rule-${category.id}`}
                open
                className="group scroll-mt-24 overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm"
              >
                <summary className="flex cursor-pointer list-none items-start gap-3 p-5 [--focus-ring-offset:-2px] [&::-webkit-details-marker]:hidden">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10"
                    aria-hidden="true"
                  >
                    <Icon className="h-4.5 w-4.5 text-brand" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      lang={title.lang}
                      className="about-wrap block font-semibold text-text-heading"
                    >
                      {title.text}
                    </span>
                    {/* The summary states the actual point of the section —
                        never a bare "Read more". */}
                    {summary && (
                      <span
                        lang={summary.lang}
                        className="about-copy about-wrap mt-1 block text-sm text-text-muted"
                      >
                        {summary.text}
                      </span>
                    )}
                  </span>
                  <ChevronDown
                    className="mt-1 h-4 w-4 shrink-0 text-text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none"
                    aria-hidden="true"
                  />
                </summary>

                <div className="border-t border-divider px-5 pb-5 pt-4">
                  <ul className="space-y-3">
                    {category.clauses.map((clause) => {
                      const text = localized(clause, locale);
                      if (!text) return null;
                      return (
                        // Keyed by the Khmer original, which is the clause's
                        // stable identity — an array index would shift every
                        // following clause if one were ever inserted.
                        <li key={clause.km || clause.en} className="flex gap-3">
                          <span
                            className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand/50"
                            aria-hidden="true"
                          />
                          <p
                            lang={text.lang}
                            className="about-copy about-measure text-[15px] text-text-body"
                          >
                            {text.text}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </details>
            );
          })}
        </div>
      </AboutSection>

      {/* ── Conduct grid ─────────────────────────────────────────────────
          Icons support the text; every tile states its rule in words, and
          "do" vs "not permitted" is a visible label, not a colour. */}
      <AboutSection id="conduct" title={tr("conduct.heading")} description={tr("conduct.intro")}>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CONDUCT_RULES.map((rule) => {
            const Icon = CONDUCT_ICONS[rule.icon] ?? Info;
            const text = localized(rule.text, locale);
            if (!text) return null;
            return (
              <li
                key={rule.id}
                className="flex items-start gap-3 rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm"
              >
                {/* Ordinary conduct rules are NEUTRAL. "No food or drink" is
                    house etiquette, not a hazard — tinting seven of these
                    amber made a page of good manners read as a page of
                    warnings, and left nothing louder for the actual
                    penalties further down. The do/don't distinction is
                    carried by the visible label below, so removing the
                    colour costs no meaning. */}
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-paper"
                  aria-hidden="true"
                >
                  <Icon className="h-4.5 w-4.5 text-text-muted" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                    {rule.kind === "dont" ? tr("conduct.dont") : tr("conduct.do")}
                  </span>
                  <span
                    lang={text.lang}
                    className="about-copy about-wrap mt-0.5 block text-sm font-medium text-text-heading"
                  >
                    {text.text}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </AboutSection>

      {/* ── Penalties ────────────────────────────────────────────────────
          Amber for ordinary policy consequences; red ONLY for deliberate
          destruction, theft and card misuse. Each row carries its severity
          as a text label so the distinction survives greyscale printing. */}
      <AboutSection
        id="penalties"
        title={tr("penalties.heading")}
        description={tr("penalties.intro")}
      >
        <ul className="space-y-3">
          {PENALTIES.map((penalty) => {
            const trigger = localized(penalty.trigger, locale);
            const consequence = localized(penalty.consequence, locale);
            if (!trigger || !consequence) return null;
            const prohibited = penalty.tone === "prohibited";
            return (
              <li key={penalty.id}>
                <NoticePanel
                  tone={prohibited ? "prohibited" : "caution"}
                  label={prohibited ? tr("penalties.prohibitedLabel") : tr("penalties.noticeLabel")}
                >
                  <p lang={trigger.lang} className="about-wrap font-semibold text-text-heading">
                    {trigger.text}
                  </p>
                  <p lang={consequence.lang} className="about-wrap mt-1">
                    {consequence.text}
                  </p>
                </NoticePanel>
              </li>
            );
          })}
        </ul>
      </AboutSection>

      {/* ── Online terms ─────────────────────────────────────────────── */}
      <AboutSection id="online" title={tr("online.heading")}>
        <NoticePanel tone="positive" label={tr("audience.online")}>
          <p>{tr("audience.onlineBody")}</p>
          <div className="mt-4 flex flex-wrap gap-3" data-about-print="hide">
            <AboutLinkAction href="/books" icon={Sparkles} variant="secondary">
              {t("actions.browseELibrary")}
            </AboutLinkAction>
          </div>
        </NoticePanel>
      </AboutSection>
    </AboutPageShell>
  );
}
