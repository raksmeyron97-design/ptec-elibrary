import { getTranslations } from "next-intl/server";
import { Server } from "lucide-react";

/** Named third-party processors and the role each one plays. Read from
 *  `privacy.processorList`, ordered as declared here. */
const PROCESSORS = [
  "supabase",
  "vercel",
  "storage",
  "google",
  "email",
  "turnstile",
] as const;

export default async function PrivacyProcessorList({ km }: { km: boolean }) {
  const t = await getTranslations("privacy.processorList");
  const font = km ? "font-khmer-serif" : "";

  return (
    <dl className="mt-4 grid gap-3 sm:grid-cols-2">
      {PROCESSORS.map((p) => (
        <div
          key={p}
          className="flex gap-3 rounded-xl border border-divider bg-bg-surface p-4 shadow-sm"
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand"
            aria-hidden="true"
          >
            <Server className="h-[16px] w-[16px]" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <dt className={`text-[14.5px] font-semibold text-text-heading ${font}`}>
              {t(`${p}.name`)}
            </dt>
            <dd className="mt-0.5 text-[13.5px] leading-relaxed text-text-body">
              {t(`${p}.role`)}
            </dd>
          </div>
        </div>
      ))}
    </dl>
  );
}
