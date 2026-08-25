import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { adminGetPathDetail } from "@/app/actions/learning-paths";
import PathBuilderForm from "../../_components/PathBuilderForm";

export default async function EditPathPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [path, t] = await Promise.all([adminGetPathDetail(id), getTranslations("adminPaths")]);
  if (!path) notFound();

  return (
    <PathBuilderForm
      initial={path}
      pathId={id}
      /* Named, so an editor arriving from the list knows which path they opened. */
      pageTitle={path.title?.trim() || t("builder.editTitle")}
      pageDescription={t("builder.editSubtitle")}
    />
  );
}
