import { Languages } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { needsLanguageNotice } from "@/lib/publications/integrity";

const LANGUAGE_NAMES: Record<string, { en: string; km: string }> = {
  en: { en: "English", km: "ភាសាអង់គ្លេស" },
  km: { en: "Khmer", km: "ភាសាខ្មែរ" },
};

/**
 * Tells a reader, in their own language, that the scholarship on this page is
 * not in it.
 *
 * The interface is bilingual; the content is not. Switching to ខ្មែរ
 * translated the chrome and left the abstract, headings and metadata in
 * English with no explanation, which reads as a broken translation rather
 * than an honestly monolingual record.
 *
 * Driven by the record's existing `language` column — the same value emitted
 * as citation_language — so no new field or migration is involved.
 */
export default async function ContentLanguageNotice({
  contentLanguage,
  locale,
}: {
  contentLanguage: string | null;
  locale: string;
}) {
  if (!needsLanguageNotice(contentLanguage, locale)) return null;

  const t = await getTranslations("publicationDetail");
  const code = (contentLanguage ?? "").trim().toLowerCase().slice(0, 2);
  const active = locale.toLowerCase().startsWith("km") ? "km" : "en";
  const languageName = LANGUAGE_NAMES[code]?.[active] ?? code.toUpperCase();

  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-2xl border border-info-line bg-info-soft px-4 py-3.5 text-[13.5px] leading-6 text-info-text"
    >
      <Languages className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>{t("contentLanguageNotice", { language: languageName })}</p>
    </div>
  );
}
