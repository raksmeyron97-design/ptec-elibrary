"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ConfirmDialog, useToast } from "@/components/admin/kit";
import { useCan } from "@/components/admin/access/AdminCapabilities";
import { ignoreResolvedElsewhere } from "@/app/actions/retired-urls";

/**
 * Ignore every pending row whose path already resolves another way. The
 * server recomputes the set — this button sends no list — and the dialog
 * states the count the page saw.
 */
export default function IgnoreResolvedButton({ count }: { count: number }) {
  const t = useTranslations("adminRetiredUrls");
  const toast = useToast();
  const router = useRouter();
  const allowed = useCan("books.retiredUrls.resolve");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  if (!allowed) return null;

  function confirm() {
    startTransition(async () => {
      const result = await ignoreResolvedElsewhere();
      setOpen(false);
      if (result.success) {
        toast.success(t("toast.ignoredMany", { count: result.count ?? 0 }));
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
        disabled={pending}
        className="focus-field inline-flex items-center rounded-lg border border-divider bg-bg-surface px-3 py-1.5 text-sm font-semibold text-text-body transition hover:bg-paper disabled:opacity-50"
      >
        {t("actions.ignoreResolved")}
      </button>
      <ConfirmDialog
        open={open}
        tone="brand"
        title={t("ignoreResolvedDialog.title")}
        description={t("ignoreResolvedDialog.body", { count })}
        confirmLabel={t("ignoreResolvedDialog.confirm")}
        busy={pending}
        onCancel={() => setOpen(false)}
        onConfirm={confirm}
      />
    </>
  );
}
