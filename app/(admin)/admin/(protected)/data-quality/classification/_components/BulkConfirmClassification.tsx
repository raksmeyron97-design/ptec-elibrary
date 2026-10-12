"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ConfirmDialog, useToast } from "@/components/admin/kit";
import { useCan } from "@/components/admin/access/AdminCapabilities";
import { bulkConfirmClassification } from "@/app/actions/book-classification";

/** Confirm a set of IDENTICAL drafts. The dialog states the count; the server
 *  re-derives the set and refuses if it changed. */
export default function BulkConfirmClassification({ setKey, label, count }: { setKey: string; label: string; count: number }) {
  const t = useTranslations("adminDataQuality.classification");
  const toast = useToast();
  const router = useRouter();
  const allowed = useCan("books.classification.review");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  if (!allowed) return null;

  function confirm() {
    startTransition(async () => {
      const result = await bulkConfirmClassification({ key: setKey, expectedCount: count });
      setOpen(false);
      if (result.success) {
        toast.success(t("toast.bulkConfirmed", { count: result.count ?? 0 }));
        router.refresh();
      } else {
        toast.error(t(`errors.${result.code}`));
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-field inline-flex items-center rounded-lg border border-divider bg-bg-surface px-3 py-1.5 text-sm font-semibold text-text-body transition hover:bg-paper"
      >
        {t("actions.bulkConfirm", { count })}
      </button>
      <ConfirmDialog
        open={open}
        tone="brand"
        title={t("bulkDialog.title")}
        description={t("bulkDialog.body", { count, label })}
        confirmLabel={t("bulkDialog.confirm", { count })}
        busy={pending}
        onCancel={() => setOpen(false)}
        onConfirm={confirm}
      />
    </>
  );
}
