import { getTranslations } from "next-intl/server";
import PathBuilderForm from "../_components/PathBuilderForm";
import { requireRouteAccess } from "@/lib/admin/route-guard";

export default async function CreatePathPage() {
  await requireRouteAccess("paths.create");

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
