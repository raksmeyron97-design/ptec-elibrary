import { getTranslations } from "next-intl/server";
import { Settings2 } from "lucide-react";
import ThesisForm from "@/components/admin/theses/form/ThesisForm";
import { BTN_SECONDARY } from "@/components/admin/kit/form";
import { getOrgIdentity } from "@/lib/system-settings/config";

export default async function CreateThesisPage() {
  const t = await getTranslations("adminThesisForm");
  /*
    Breadcrumb, heading, tabs, context sidebar and action bar all come from
    FormShell inside ThesisForm — the sidebar previews the form's own live
    state, so it cannot be assembled here. The route stays a data loader.
  */
  return (
    <ThesisForm
      institution={(await getOrgIdentity()).institutionName}
      pageTitle={t("newTitle")}
      pageDescription={t("createSubtitle")}
      headerActions={
        /*
          Opens in a new tab on purpose. This form autosaves a recovery draft and
          guards `beforeunload`, but a client-side <Link> navigation triggers
          neither — following it in place would drop whatever the author had
          typed so far.
        */
        <a
          href="/admin/theses/manage-cohorts"
          target="_blank"
          rel="noopener noreferrer"
          className={BTN_SECONDARY}
        >
          <Settings2 className="h-4 w-4" aria-hidden="true" />
          {t("classification.manageCohorts")}
          <span className="sr-only"> — {t("opensInNewTab")}</span>
        </a>
      }
    />
  );
}
