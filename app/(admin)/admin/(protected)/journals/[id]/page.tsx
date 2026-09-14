import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";

import { getJournalForAdmin } from "@/app/actions/journals";
import { PageHeader } from "@/components/admin/kit";
import { requireRouteAccess } from "@/lib/admin/route-guard";
import JournalForm from "../_components/JournalForm";
import IssuesEditor from "../_components/IssuesEditor";

export default async function EditJournalPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRouteAccess("journals.edit");
  const { id } = await params;
  const [t, detail] = await Promise.all([getTranslations("adminJournals"), getJournalForAdmin(id)]);
  if (!detail) notFound();

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
        title={detail.journal.title}
        description={t("editJournal")}
      />
      <JournalForm initial={detail.journal} />
      <IssuesEditor volumes={detail.volumes} issues={detail.issues} />
    </div>
  );
}
