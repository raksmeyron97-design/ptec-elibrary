import { getTranslations } from "next-intl/server";
import ThesisForm from "@/components/admin/theses/form/ThesisForm";
import Link from "next/link";
import { ArrowLeft, Settings2 } from "lucide-react";
import { PageHeader } from "@/components/admin/kit";
import { getOrgIdentity } from "@/lib/system-settings/config";

export default async function CreateThesisPage() {
  const t = await getTranslations("adminThesisForm");
  return (
    <div className="mx-auto max-w-5xl">
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
        actions={
          /*
            Opens in a new tab on purpose. This form autosaves a recovery draft
            and guards `beforeunload`, but a client-side <Link> navigation
            triggers neither — following it in place would drop whatever the
            author had typed so far.
          */
          <a
            href="/admin/theses/manage-cohorts"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-divider bg-bg-surface px-4 text-sm font-semibold text-text-body transition hover:border-brand/50 hover:text-brand"
          >
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            {t("classification.manageCohorts")}
            <span className="sr-only"> — {t("opensInNewTab")}</span>
          </a>
        }
      />

      <ThesisForm institution={(await getOrgIdentity()).institutionName} />
    </div>
  );
}
