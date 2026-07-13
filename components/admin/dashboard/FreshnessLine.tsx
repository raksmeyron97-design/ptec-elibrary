import { getTranslations, getLocale } from "next-intl/server";

/** "Live · updated 20:41" footer — data is queried per request (no cache),
 *  so freshness equals render time. `note` appends a short methodology
 *  reminder (e.g. internal-traffic exclusion). */
export default async function FreshnessLine({
  generatedAt,
  note,
}: {
  generatedAt: string;
  note?: string;
}) {
  const t = await getTranslations("adminDashboard.states");
  const locale = await getLocale();
  const time = new Intl.DateTimeFormat(locale === "km" ? "km-KH" : "en-US", {
    timeZone: "Asia/Phnom_Penh",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(generatedAt));

  return (
    <p className="text-end text-[11px] text-text-muted">
      {note && <span className="me-2">{note}</span>}
      <span className="me-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 align-middle" aria-hidden="true" />
      {t("freshness", { time })}
    </p>
  );
}
