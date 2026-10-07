"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/admin/kit";
import { useCan } from "@/components/admin/access/AdminCapabilities";
import { generateClassificationDrafts } from "@/app/actions/book-classification";

/** Read titles into private drafts. A draft changes nothing public. */
export default function GenerateClassificationDrafts({ pending: undrafted }: { pending: number }) {
  const t = useTranslations("adminDataQuality.classification");
  const toast = useToast();
  const router = useRouter();
  const allowed = useCan("books.classification.review");
  const [busy, startTransition] = useTransition();
  if (!allowed) return null;

  function run() {
    startTransition(async () => {
      const result = await generateClassificationDrafts();
      if (result.success) {
        toast.success(t("toast.drafted", { count: result.count ?? 0, remaining: result.remaining ?? 0 }));
        router.refresh();
      } else {
        toast.error(t(`errors.${result.code}`));
      }
    });
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className="focus-field inline-flex items-center rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-contrast transition hover:bg-brand-hover disabled:opacity-50"
    >
      {busy ? t("actions.generating") : t("actions.generate", { count: undrafted })}
    </button>
  );
}
