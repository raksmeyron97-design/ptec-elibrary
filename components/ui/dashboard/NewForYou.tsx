// components/ui/dashboard/NewForYou.tsx
// New titles matching the reader's subscriptions. Renders nothing when there
// are none — it is news, not a fixture.
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Bell, ChevronRight } from "lucide-react";
import CoverThumb from "@/components/ui/dashboard/CoverThumb";
import type { NewContentAlert } from "@/app/actions/subscriptions";
import { CARD, CardHeader } from "@/components/ui/dashboard/primitives";

const COVERS = process.env.NEXT_PUBLIC_R2_COVERS_URL ?? "";

function coverUrl(raw: string | null): string | null {
  if (!raw) return null;
  return raw.startsWith("http") ? raw : `${COVERS}/${raw}`;
}

export default function NewForYou({ alerts }: { alerts: NewContentAlert[] }) {
  const t = useTranslations("dashboard");
  if (alerts.length === 0) return null;

  return (
    <section aria-labelledby="new-for-you-heading" className={CARD}>
      <CardHeader id="new-for-you-heading" title={t("newForYou")} meta={t("basedOnSubscriptions")} icon={Bell} />
      <ul className="scroll-row flex gap-3 overflow-x-auto px-5 pb-5">
        {alerts.map((alert) => (
          <li key={alert.book_id} className="w-[240px] shrink-0">
            <Link
              href={alert.url ?? `/books/${alert.slug}`}
              className="focus-field group flex h-full items-center gap-3 rounded-xl border border-divider bg-bg-surface p-2.5 pr-3 transition-colors hover:border-brand/30"
            >
              <CoverThumb coverUrl={coverUrl(alert.cover_url)} title={alert.title} seed={alert.slug} />
              <span className="min-w-0 flex-1" dir="auto">
                <span className="block truncate text-[11px] font-semibold text-brand">{alert.matched_label}</span>
                <span className="block truncate text-[13px] font-semibold text-text-heading group-hover:text-brand">{alert.title}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-text-muted rtl:rotate-180" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
