import { getTranslations } from "next-intl/server";
import { AlertTriangle, Ban } from "lucide-react";
import { POLICY_FAQ } from "@/lib/policy/borrow";
import { toAboutLocale, pickLocale, localized } from "@/lib/about/format";
import PolicyAccordion from "@/components/policy/PolicyAccordion";

/** The entries the accordion shows and the FAQPage node states — one list. */
async function policyFaqEntries(locale: string) {
  const t = await getTranslations({ locale, namespace: "policy.faq" });
  const aboutLocale = toAboutLocale(locale);
  // One pass: build and drop in the same step. An entry whose answer resolves
  // to nothing in either language is omitted rather than rendered as a
  // question with no answer — and it must not reach the JSON-LD either, where
  // an empty `acceptedAnswer` is an invalid FAQPage.
  return POLICY_FAQ.flatMap((entry) => {
    const answerText = pickLocale(entry.answer, aboutLocale);
    if (!answerText) return [];
    return [{
      ...entry,
      question: t(`${entry.questionKey}.q`),
      answerText,
      answer: localized(entry.answer, aboutLocale),
      triggerText: localized(entry.trigger, aboutLocale),
    }];
  });
}

/**
 * The policy page's FAQPage node, or null when no entry has an answer (an
 * empty mainEntity is invalid, not a no-op). The policy page puts it in its
 * ONE JSON-LD block (SEO Phase 4); this component renders none of its own.
 */
export async function policyFaqNode(locale: string) {
  const entries = await policyFaqEntries(locale);
  if (entries.length === 0) return null;
  return {
    "@type": "FAQPage",
    mainEntity: entries.map((e) => ({
      "@type": "Question",
      name: e.question,
      acceptedAnswer: { "@type": "Answer", text: e.answerText },
    })),
  };
}

/**
 * The edge cases — late, damaged, lost, misuse, suspension, theft — as an
 * accordion, with FAQPage JSON-LD built from the SAME strings that are drawn.
 *
 * THE ANSWER IS THE LIBRARY'S OWN WORDING, verbatim. Only the question is this
 * UI's to phrase. That split is what keeps this from becoming a second,
 * paraphrased statement of a penalty sitting a click away from the real one:
 * if the regulations change in lib/about/content.ts, this page changes with
 * them, and it cannot drift because it holds no copy of them.
 *
 * The schema mirrors the visible text exactly, which is Google's own
 * requirement for FAQPage — generating it from the same variables rather than
 * a second list is what guarantees that.
 *
 * Server component; only each disclosure row is a client island.
 */
export default async function PolicyFaq({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "policy.faq" });
  const km = locale === "km";

  const entries = await policyFaqEntries(locale);

  // Nothing to say and nothing to claim in structured data. A FAQPage node
  // with an empty mainEntity is an invalid-schema warning, not a no-op.
  if (entries.length === 0) return null;


  return (
    <div className="mt-6">
      <div className="space-y-3">
        {entries.map((entry) => {
          const Icon = entry.tone === "prohibited" ? Ban : AlertTriangle;
          const tone =
            entry.tone === "prohibited"
              ? "bg-danger-soft border-danger-line text-danger-text"
              : "bg-warning-soft border-warning-line text-warning-text";
          return (
            <PolicyAccordion key={entry.id} km={km} title={entry.question}>
              {entry.triggerText && (
                <p className={`mb-3 rounded-lg border px-3 py-2 text-[13px] ${tone}`}>
                  <span className="font-semibold">{t("conditionLabel")}: </span>
                  <span lang={entry.triggerText.lang}>{entry.triggerText.text}</span>
                  <Icon className="ml-1.5 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />
                </p>
              )}
              {entry.answer && (
                <p className="policy-copy text-[14.5px] text-text-body" lang={entry.answer.lang}>
                  {entry.answer.text}
                </p>
              )}
            </PolicyAccordion>
          );
        })}
      </div>
    </div>
  );
}
