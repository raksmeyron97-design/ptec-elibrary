import { getTranslations } from "next-intl/server";
import PathBuilderForm from "../_components/PathBuilderForm";
import { FormShell } from "@/components/admin/kit/form";

export default async function CreatePathPage() {
  const t = await getTranslations("adminPaths");
  return (
    <FormShell
      backHref="/admin/paths"
      backLabel={t("builder.backToPaths")}
      title={t("builder.newTitle")}
      description={t("builder.newSubtitle")}
    >
      <PathBuilderForm initial={null} pathId={null} />
    </FormShell>
  );
}
