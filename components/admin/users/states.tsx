import { Users, SearchX } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/admin/kit";

export function UsersEmptyState() {
  const t = useTranslations("adminUsers.states");
  return (
    <EmptyState
      icon={<Users className="h-6 w-6" />}
      title={t("emptyTitle")}
      description={t("emptyBody")}
    />
  );
}

export function UsersNoResultsState() {
  const t = useTranslations("adminUsers.states");
  return (
    <EmptyState
      icon={<SearchX className="h-6 w-6" />}
      title={t("noResultsTitle")}
      description={t("noResultsBody")}
    />
  );
}
