"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, Undo2, Inbox, Pencil } from "lucide-react";
import { restoreDuplicateGroup } from "@/app/actions/duplicates";
import { EmptyState, useToast } from "@/components/admin/kit";

export type UIDismissal = {
  fingerprint: string;
  dismissedLabel: string | null;
  note: string | null;
  /** `title: null` means the record has since been deleted. The row is kept —
   *  "one of these books is gone" is the honest answer to why the group has
   *  not come back, and it is the reviewer's cue to restore and re-check. */
  books: { id: string; title: string | null }[];
};

/**
 * Groups somebody has judged NOT to be duplicates, and the way back.
 *
 * Restore is deliberately not behind a confirm dialog: it is the undo, it
 * destroys nothing, and its only effect is to make a group visible again.
 * Putting a confirmation in front of the safe direction is how the unsafe one
 * starts to feel equally routine.
 */
export default function DismissedGroups({
  dismissals,
  unavailable,
}: {
  dismissals: UIDismissal[];
  unavailable: boolean;
}) {
  const t = useTranslations("adminDuplicates");
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (unavailable) {
    return (
      <EmptyState
        icon={<AlertTriangle className="h-6 w-6 text-warning" />}
        title={t("dismissals.unavailableTitle")}
        description={t("dismissals.unavailable")}
      />
    );
  }

  if (dismissals.length === 0) {
    return (
      <EmptyState
        icon={<Inbox className="h-6 w-6" />}
        title={t("dismissals.emptyTitle")}
        description={t("dismissals.emptyDescription")}
      />
    );
  }

  const restore = (fingerprint: string) => {
    setBusy(fingerprint);
    startTransition(async () => {
      const result = await restoreDuplicateGroup({ fingerprint });
      if (result.success) {
        toast.success(t("dismissals.restored"));
        router.refresh();
      } else {
        toast.error(result.error || t("toasts.failed"));
      }
      setBusy(null);
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm leading-6 text-text-body">{t("dismissals.lead")}</p>

      <ul className="space-y-3">
        {dismissals.map((entry) => {
          const working = pending && busy === entry.fingerprint;
          return (
            <li
              key={entry.fingerprint}
              className="rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-[0.11em] text-text-muted">
                    {t("records", { count: entry.books.length })}
                    {entry.dismissedLabel ? ` · ${t("dismissals.on", { date: entry.dismissedLabel })}` : ""}
                  </p>

                  <ul className="mt-2 space-y-1.5">
                    {entry.books.map((book) => (
                      <li key={book.id} className="flex flex-wrap items-center gap-2 text-[13px] leading-5">
                        {book.title ? (
                          <>
                            <span dir="auto" className="min-w-0 break-words font-semibold text-text-body">
                              {book.title}
                            </span>
                            <Link
                              href={`/admin/edit/${book.id}`}
                              className="focus-field inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold text-text-muted transition hover:text-text-heading"
                            >
                              <Pencil className="h-3 w-3" aria-hidden="true" />
                              {t("edit")}
                            </Link>
                          </>
                        ) : (
                          <span className="italic text-text-muted">{t("dismissals.recordGone")}</span>
                        )}
                      </li>
                    ))}
                  </ul>

                  {entry.note && (
                    <p
                      dir="auto"
                      className="mt-2 break-words rounded-lg border border-divider bg-paper px-3 py-2 text-[12.5px] leading-5 text-text-body"
                    >
                      {entry.note}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => restore(entry.fingerprint)}
                  disabled={pending}
                  className="focus-field inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-divider bg-bg-surface px-3 py-2 text-[12.5px] font-semibold text-text-body transition hover:bg-paper disabled:opacity-50"
                >
                  <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {working ? t("dismissals.restoring") : t("dismissals.restore")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
