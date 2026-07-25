import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { adminGetPathDetail } from "@/app/actions/learning-paths";
import PathBuilderForm from "../../_components/PathBuilderForm";

export default async function EditPathPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [path, t] = await Promise.all([adminGetPathDetail(id), getTranslations("adminPaths")]);
  if (!path) notFound();

  return (
    <div className="mx-auto max-w-[960px] p-6 md:p-10">
      <h1 className="mb-6 text-[22px] font-bold text-text-heading">{t("builder.editTitle")}</h1>
      <PathBuilderForm initial={path} pathId={id} />
    </div>
  );
}
