import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/admin/kit";
import { requireRouteAccess } from "@/lib/admin/route-guard";
import JournalForm from "../_components/JournalForm";

export default async function NewJournalPage() {
  await requireRouteAccess("journals.create");
  const t = await getTranslations("adminJournals");
  return (
    <div className="w-full space-y-6">
      <PageHeader
        breadcrumb={
          <Link
            href="/admin/journals"
            className="focus-field inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-text-muted transition-colors hover:text-brand"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("backToList")}
          </Link>
        }
        title={t("newJournal")}
        description={t("subtitle")}
      />
      <JournalForm initial={null} />
    </div>
  );
}
