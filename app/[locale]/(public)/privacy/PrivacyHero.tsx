import { getTranslations } from "next-intl/server";
import { ShieldCheck } from "lucide-react";
import { POLICY_VERSION, POLICY_EFFECTIVE_DATE } from "@/lib/privacy/policy";
import PolicyHero from "@/components/policy/PolicyHero";
import PrivacyHeroActions from "./PrivacyHeroActions";

/**
 * The /privacy masthead: the shared PolicyHero, plus this page's own action
 * row. Everything structural (gradient, breadcrumb, meta bar, print
 * behaviour) lives in the shared component so the two trust documents cannot
 * drift apart visually.
 */
export default async function PrivacyHero({
  km,
  readingTime,
}: {
  km: boolean;
  /** Already formatted, e.g. "8 min read" — the page measures it, because it
   *  is the page that knows which catalogue was rendered. */
  readingTime: string;
}) {
  const t = await getTranslations("privacy");

  return (
    <PolicyHero
      id="privacy-hero"
      Icon={ShieldCheck}
      km={km}
      eyebrow={t("hero.eyebrow")}
      title={t("hero.title")}
      description={t("hero.description")}
      breadcrumb={{ home: t("breadcrumb.home"), current: t("breadcrumb.current") }}
      isoDate={POLICY_EFFECTIVE_DATE}
      version={POLICY_VERSION}
      metaLabels={{
        updated: t("hero.lastUpdatedLabel"),
        version: t("hero.versionLabel"),
        readingTime,
      }}
      note={t("hero.languageNote")}
      actions={
        <PrivacyHeroActions
          labels={{
            manage: t("actions.manage"),
            contact: t("actions.contact"),
            print: t("actions.print"),
          }}
        />
      }
    />
  );
}
