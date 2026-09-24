// components/ui/dashboard/UserRequests.tsx
// Real rows from getMyBookRequests() (app/actions/book-requests.ts). No
// fabricated statuses, no new request workflow: this only renders what
// already exists (acquisition requests + thesis deposits, same table/queue).
//
// "Request a book" opens the homepage's request dialog — the same deep link
// the footer uses. Both copies of it here used to point at /books, which is a
// catalogue, not a form.
import { FileQuestion, Inbox } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/core/Badge";
import type { BookRequest, BookRequestStatus, BookRequestKind } from "@/app/actions/book-requests";
import { ArrowLink, CARD, CardHeader, EmptyState, REQUEST_A_BOOK_HREF } from "@/components/ui/dashboard/primitives";

const STATUS_VARIANT: Record<BookRequestStatus, "warning" | "info" | "success" | "danger"> = {
  pending: "warning",
  approved: "info",
  added: "success",
  rejected: "danger",
};

const SHOWN = 5;

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

  const dateFmt = new Intl.DateTimeFormat(locale === "km" ? "km-KH" : "en-US", {
    year: "numeric", month: "short", day: "numeric",
  });

  return (
    <section aria-labelledby="requests-heading" className={`${CARD} flex h-full flex-col`}>
      <CardHeader
        id="requests-heading"
        title={t("myRequests")}
        icon={Inbox}
        action={requests.length > 0 ? <ArrowLink href={REQUEST_A_BOOK_HREF}>{t("requestABook")}</ArrowLink> : undefined}
      />

      {requests.length === 0 ? (
        <EmptyState
          compact
          icon={FileQuestion}
          title={t("noRequestsTitle")}
          description={t("noRequestsDesc")}
          action={{ href: REQUEST_A_BOOK_HREF, label: t("requestABook") }}
        />
      ) : (
        <ul className="divide-y divide-divider border-t border-divider">
          {requests.slice(0, SHOWN).map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0" dir="auto">
                <p className="truncate text-[13.5px] font-semibold text-text-heading">{r.title}</p>
                <p className="mt-0.5 truncate text-[12px] text-text-muted">
                  {KIND_LABEL[r.kind]} · <time dateTime={r.created_at}>{dateFmt.format(new Date(r.created_at))}</time>
                </p>
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
