import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { adminGetPathDetail } from "@/app/actions/learning-paths";
import PathBuilderForm from "../../_components/PathBuilderForm";
import { FormShell } from "@/components/admin/kit/form";

export default async function EditPathPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [path, t] = await Promise.all([adminGetPathDetail(id), getTranslations("adminPaths")]);
  if (!path) notFound();

  return (
    <FormShell
      backHref="/admin/paths"
      backLabel={t("builder.backToPaths")}
      /* Named, so an editor arriving from the list knows which path they opened. */
      title={path.title?.trim() || t("builder.editTitle")}
      description={t("builder.editSubtitle")}
    >
      <PathBuilderForm initial={path} pathId={id} />
    </FormShell>
  );
}
