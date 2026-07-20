import { getTranslations } from "next-intl/server";
import ThesisForm from "@/components/admin/theses/form/ThesisForm";
import Link from "next/link";
import { ArrowLeft, Settings2 } from "lucide-react";

export default async function CreateThesisPage() {
  const t = await getTranslations("adminThesisForm");
  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/admin/theses"
          className="p-2 hover:bg-black/5 rounded-full transition-colors text-text-muted hover:text-text-heading"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <p className="text-text-muted text-sm">{t("createSubtitle")}</p>
        </div>
        <Link
          href="/admin/theses/manage-cohorts"
          target="_blank"
          className="inline-flex items-center gap-2 rounded-lg border border-divider bg-paper px-4 py-2 text-sm font-medium text-text-heading hover:bg-black/5 transition-colors shadow-sm"
        >
          <Settings2 className="w-4 h-4" />
          {t("classification.manageCohorts")}
        </Link>
      </div>

      <ThesisForm />
    </div>
  );
}
