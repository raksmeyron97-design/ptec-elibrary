import { getTranslations, getFormatter } from "next-intl/server";
import { POLICY_VERSIONS } from "@/lib/privacy/policy";

// next-intl forbids "." in message keys, so a version summary is stored under a
// dot-free key: "2.0" -> "v2_0".
const summaryKey = (version: string) => `v${version.replace(/\./g, "_")}`;

/**
 * Version history, newest first. Version numbers and ISO dates come from the
 * single source in lib/privacy/policy.ts; the change summary for each version
 * is `privacy.versions.<version>` in the message catalogue. Dates are
 * formatted with the viewer's locale, never hardcoded.
 */
export default async function PolicyVersionHistory({ km }: { km: boolean }) {
  const [t, format] = await Promise.all([
    getTranslations("privacy.versions"),
    getFormatter(),
  ]);
  const headingFont = km ? "font-khmer-serif" : "";

  return (
    <ol className="mt-6 space-y-4">
      {POLICY_VERSIONS.map(({ version, date }, i) => (
        <li
          key={version}
          className="rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${
                i === 0
                  ? "bg-brand/10 text-brand"
                  : "bg-bg-app text-text-muted"
              }`}
            >
              {t("versionLabel")} {version}
            </span>
            <span className="text-[13px] text-text-muted">
              {t("effectiveLabel")}:{" "}
              <time dateTime={date}>
                {format.dateTime(new Date(date), {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </time>
            </span>
          </div>
          <p className={`mt-2 text-[14px] leading-relaxed text-text-body ${headingFont}`}>
            {t(summaryKey(version))}
          </p>
        </li>
      ))}
    </ol>
  );
}
