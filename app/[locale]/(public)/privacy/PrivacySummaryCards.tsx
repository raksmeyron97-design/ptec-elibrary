import { getTranslations } from "next-intl/server";
import { Database, ShieldOff, SlidersHorizontal, MessageSquare } from "lucide-react";

const CARDS = [
  { key: "collect", Icon: Database, tone: "brand" },
  { key: "notDo", Icon: ShieldOff, tone: "success" },
  { key: "controls", Icon: SlidersHorizontal, tone: "accent" },
  { key: "contact", Icon: MessageSquare, tone: "info" },
] as const;

const TONE_STYLES: Record<string, string> = {
  brand: "bg-brand/10 text-brand",
  success: "bg-success/10 text-success",
  accent: "bg-accent/15 text-accent-text",
  info: "bg-info/10 text-info",
};

/**
 * Four at-a-glance cards summarising the policy. Server-rendered — no
 * interactivity, so no client JS. `km` toggles the Khmer heading font.
 */
export default async function PrivacySummaryCards({ km }: { km: boolean }) {
  const t = await getTranslations("privacy.summary");
  const headingFont = km ? "font-khmer-serif" : "";

  return (
    <section aria-labelledby="privacy-summary-heading" className="mt-10">
      <h2 id="privacy-summary-heading" className={`sr-only ${headingFont}`}>
        {t("title")}
      </h2>
      <ul className="grid gap-4 sm:grid-cols-2">
        {CARDS.map(({ key, Icon, tone }) => (
          <li
            key={key}
            className="flex gap-4 rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm"
          >
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${TONE_STYLES[tone]}`}
              aria-hidden="true"
            >
              <Icon className="h-5 w-5" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <h3 className={`text-base font-semibold text-text-heading ${headingFont}`}>
                {t(`${key}.title`)}
              </h3>
              <p className="mt-1 text-[14px] leading-relaxed text-text-body">
                {t(`${key}.body`)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
