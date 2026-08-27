// components/ui/dashboard/DashboardSearch.tsx
// Thin wrapper around the existing global SearchBar — no second search
// implementation. `id="dashboard-search"` is the target for the "Search
// library" quick action below it.
import { getTranslations } from "next-intl/server";
import SearchBar from "@/components/ui/search/SearchBar";

export default async function DashboardSearch() {
  const t = await getTranslations("dashboard");

  return (
    <div id="dashboard-search" className="scroll-mt-6">
      <SearchBar placeholder={t("searchPlaceholder")} buttonLabel={t("searchButton")} />
    </div>
  );
}
