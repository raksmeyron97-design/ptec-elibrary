import { getTranslations } from "next-intl/server";
import PathBuilderForm from "../_components/PathBuilderForm";

export default async function CreatePathPage() {
  const t = await getTranslations("adminPaths");
  return (
    <div className="mx-auto max-w-[960px] p-6 md:p-10">
      <h1 className="mb-6 text-[22px] font-bold text-text-heading">{t("builder.newTitle")}</h1>
      <PathBuilderForm initial={null} pathId={null} />
    </div>
  );
}
