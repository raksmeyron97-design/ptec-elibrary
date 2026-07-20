import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { adminGetPaths } from "@/app/actions/learning-paths";
import { PageHeader } from "@/components/admin/kit";
import PathsListClient from "./PathsListClient";

export const dynamic = "force-dynamic";

export default async function AdminPathsPage() {
  const [t, paths] = await Promise.all([getTranslations("adminPaths"), adminGetPaths()]);

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Link
            href="/admin/paths/create"
            className="btn-brand-gradient inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> {t("newPath")}
          </Link>
        }
      />
      <PathsListClient paths={paths} />
    </div>
  );
}
