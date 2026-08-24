import { getTranslations } from "next-intl/server";
import { Settings2 } from "lucide-react";
import ThesisForm from "@/components/admin/theses/form/ThesisForm";
import { FormShell, BTN_SECONDARY } from "@/components/admin/kit/form";
import { getOrgIdentity } from "@/lib/system-settings/config";

export default async function CreateThesisPage() {
  const t = await getTranslations("adminThesisForm");
  return (
    <FormShell
      backHref="/admin/theses"
      backLabel={t("backToTheses")}
      title={t("newTitle")}
      description={t("createSubtitle")}
      headerActions={
        /*
          Back in the header, per the redesign — but still opening in a new tab.
          This form autosaves a recovery draft and guards `beforeunload`, and a
          client-side <Link> navigation triggers neither, so following it in
          place would drop whatever the author had typed so far.
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
    >
      <ThesisForm institution={(await getOrgIdentity()).institutionName} />
    </FormShell>
  );
}
