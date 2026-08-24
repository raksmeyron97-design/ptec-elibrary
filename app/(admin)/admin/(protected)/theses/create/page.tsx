import { getTranslations } from "next-intl/server";
import ThesisForm from "@/components/admin/theses/form/ThesisForm";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/admin/kit";
import { getOrgIdentity } from "@/lib/system-settings/config";

export default async function CreateThesisPage() {
  const t = await getTranslations("adminThesisForm");
  return (
    <div className="mx-auto max-w-5xl">
      {/*
        No "Manage Cohorts & Years" action here any more. Taxonomy administration
        is not a step in uploading a thesis; putting it in the header gave the
        page two unrelated primary journeys and put a link *away* from unsaved
        work next to the title. It lives at /admin/theses/manage-cohorts, which
        is reachable from the theses list.

        The Classification step keeps its own in-place manager dialog. That one
        is different in kind: it is reached only when the author discovers the
        cohort they need does not exist yet, it opens over the form instead of
        navigating, and it returns them to the field they were filling in.
      */}
      <PageHeader
        breadcrumb={
          <Link
            href="/admin/theses"
            className="inline-flex items-center gap-1.5 text-sm text-text-muted transition hover:text-brand"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("backToTheses")}
          </Link>
        }
        title={t("newTitle")}
        description={t("createSubtitle")}
      />

      <ThesisForm institution={(await getOrgIdentity()).institutionName} />
    </div>
  );
}
