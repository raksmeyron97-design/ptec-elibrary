// components/ui/dashboard/UserRequests.tsx
// TERTIARY section — real rows from getMyBookRequests() (app/actions/book-requests.ts).
// No fabricated statuses, no new request workflow: this only renders what
// already exists (acquisition requests + thesis deposits, same table/queue).
import { Link } from "@/i18n/navigation";
import { FileQuestion } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/core/Badge";
import type { BookRequest, BookRequestStatus, BookRequestKind } from "@/app/actions/book-requests";

const STATUS_VARIANT: Record<BookRequestStatus, "warning" | "info" | "success" | "danger"> = {
  pending: "warning",
  approved: "info",
  added: "success",
  rejected: "danger",
};

export default async function UserRequests({
  requests, locale,
}: { requests: BookRequest[]; locale: string }) {
  const t = await getTranslations("dashboard");

  const KIND_LABEL: Record<BookRequestKind, string> = {
    acquisition: t("requestTypeAcquisition"),
    deposit: t("requestTypeDeposit"),
  };
  const STATUS_LABEL: Record<BookRequestStatus, string> = {
    pending: t("requestStatusPending"),
    approved: t("requestStatusApproved"),
    added: t("requestStatusAdded"),
    rejected: t("requestStatusRejected"),
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === "km" ? "km-KH" : "en-US", {
      year: "numeric", month: "short", day: "numeric",
    });

  return (
    <section aria-label={t("myRequests")}>
      <h2 className="mb-3 text-[15px] font-bold text-text-heading">{t("myRequests")}</h2>

      {requests.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-divider bg-bg-surface px-6 py-8 text-center">
          <FileQuestion className="mb-2.5 h-8 w-8 text-text-muted" aria-hidden="true" />
          <p className="text-[13px] font-semibold text-text-heading">{t("noRequestsTitle")}</p>
          <p className="mt-1 max-w-xs text-[12px] text-text-muted">{t("noRequestsDesc")}</p>
          <Link href="/books"
            className="focus-field mt-4 inline-flex h-9 items-center rounded-xl bg-brand px-4 text-[12.5px] font-semibold text-brand-contrast transition hover:bg-brand-hover">
            {t("requestABook")}
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-divider overflow-hidden rounded-2xl border border-divider bg-bg-surface">
          {requests.slice(0, 6).map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0" dir="auto">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{KIND_LABEL[r.kind]}</p>
                <p className="truncate text-[13px] font-medium text-text-heading">{r.title}</p>
                <p className="text-[11px] text-text-muted">{formatDate(r.created_at)}</p>
              </div>
              <Badge variant={STATUS_VARIANT[r.status]} className="shrink-0">
                {STATUS_LABEL[r.status]}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
