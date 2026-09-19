import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { UserX } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/admin/kit";

/** A profile id that resolves to no account. Distinct from a 403 (the panel's
 *  forbidden.tsx) and from a 500 (../error.tsx): this one is a fact about the
 *  URL, and the only useful exit is the directory. */
export default async function UserProfileNotFound() {
  const t = await getTranslations("adminUsers.profile");
  return (
    <div className="w-full">
      <PageHeader title={t("notFoundTitle")} />
      <EmptyState
        icon={<UserX className="h-6 w-6" />}
        title={t("notFoundTitle")}
        description={t("notFoundBody")}
        action={
          <Link
            href="/admin/users"
            className="focus-field inline-flex items-center rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
          >
            {t("backToDirectory")}
          </Link>
        }
      />
    </div>
  );
}
