import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SITE_URL } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What personal data the PTEC e-Library collects, how it is stored and protected, and how you can delete your account and data.",
  alternates: { canonical: `${SITE_URL}/privacy` },
  openGraph: {
    title: "Privacy Policy | PTEC Library",
    description:
      "What personal data the PTEC e-Library collects, how it is protected, and how to delete your account.",
    url: `${SITE_URL}/privacy`,
    type: "website",
  },
};

export default async function PrivacyPage() {
  const t = await getTranslations("privacy");

  const sections: { heading: string; paragraphs: string[] }[] = [
    { heading: t("collectTitle"), paragraphs: [t("collectAccount"), t("collectActivity"), t("collectContact"), t("collectTechnical")] },
    { heading: t("notTitle"), paragraphs: [t("notBody")] },
    { heading: t("storageTitle"), paragraphs: [t("storageBody")] },
    { heading: t("visibilityTitle"), paragraphs: [t("visibilityPrivate"), t("visibilityPublic")] },
    { heading: t("retentionTitle"), paragraphs: [t("retentionBody")] },
  ];

  return (
    <section className="bg-paper px-6 py-10 md:px-12">
      <div className="mx-auto max-w-[900px] rounded-lg border border-divider bg-bg-surface p-8 shadow-sm">
        <h1 className="text-3xl font-bold text-text-heading">{t("title")}</h1>
        <p className="mt-2 text-sm text-text-muted">{t("updated")}</p>
        <p className="mt-4 leading-8 text-text-body">{t("intro")}</p>

        {sections.map(({ heading, paragraphs }) => (
          <div key={heading} className="mt-8">
            <h2 className="text-xl font-semibold text-text-heading">{heading}</h2>
            {paragraphs.map((p) => (
              <p key={p} className="mt-3 leading-8 text-text-body">
                {p}
              </p>
            ))}
          </div>
        ))}

        <div className="mt-8">
          <h2 className="text-xl font-semibold text-text-heading">{t("choicesTitle")}</h2>
          <p className="mt-3 leading-8 text-text-body">
            {t("choicesBody")}{" "}
            <Link href="/dashboard/settings" className="text-brand underline underline-offset-4 hover:opacity-80">
              {t("choicesSettingsLink")}
            </Link>
            .
          </p>
        </div>

        <div className="mt-8">
          <h2 className="text-xl font-semibold text-text-heading">{t("contactTitle")}</h2>
          <p className="mt-3 leading-8 text-text-body">
            {t("contactBody")}{" "}
            <Link href="/contact" className="text-brand underline underline-offset-4 hover:opacity-80">
              {t("contactLink")}
            </Link>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
