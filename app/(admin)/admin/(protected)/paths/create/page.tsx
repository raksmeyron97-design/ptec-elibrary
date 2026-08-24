import { getTranslations } from "next-intl/server";
import PathBuilderForm from "../_components/PathBuilderForm";

export default async function CreatePathPage() {
  const t = await getTranslations("adminPaths");
  /* FormShell lives inside PathBuilderForm — its context sidebar previews the
     form's own live state. The route stays a data loader. */
  return (
    <PathBuilderForm
      initial={null}
      pathId={null}
      pageTitle={t("builder.newTitle")}
      pageDescription={t("builder.newSubtitle")}
    />
  );
}
