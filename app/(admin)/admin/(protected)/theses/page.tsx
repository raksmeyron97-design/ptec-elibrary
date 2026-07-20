import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/admin/kit";
import Pagination from "@/components/ui/core/Pagination";
import ThesisStats from "@/components/admin/theses/ThesisStats";
import ThesisToolbar from "@/components/admin/theses/ThesisToolbar";
import ThesisFilters from "@/components/admin/theses/ThesisFilters";
import ThesesListClient from "@/components/admin/theses/ThesesListClient";
import ThesisErrorState from "@/components/admin/theses/states/ThesisErrorState";
import { getTheses, getThesesSummary, getThesisFilterOptions } from "@/lib/admin/theses";

const PAGE_SIZE = 20;

type SP = {
  q?: string;
  status?: string;
  program?: string;
  cohort?: string;
  academicYear?: string;
  fileStatus?: string;
  metadataQuality?: string;
  sort?: string;
  page?: string;
};

export default async function AdminThesesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const [t, thesesResult, summary, filterOptions] = await Promise.all([
    getTranslations("adminTheses"),
    getTheses({
      q: sp.q,
      status: sp.status,
      program: sp.program,
      cohort: sp.cohort,
      academicYear: sp.academicYear,
      fileStatus: sp.fileStatus,
      metadataQuality: sp.metadataQuality,
      sort: sp.sort,
      page,
      pageSize: PAGE_SIZE,
    }),
    getThesesSummary(),
    getThesisFilterOptions(),
  ]);

  const totalPages = Math.max(1, Math.ceil(thesesResult.total / PAGE_SIZE));
  const hasActiveFilters = Boolean(
    sp.q || sp.status || sp.program || sp.cohort || sp.academicYear || sp.fileStatus || sp.metadataQuality,
  );

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <PageHeader title={t("title")} description={t("description")} className="mb-0" />

      <ThesisStats summary={summary} />

      <ThesisToolbar totalItems={thesesResult.total} />

      <ThesisFilters
        value={{
          status: sp.status ?? "",
          program: sp.program ?? "",
          cohort: sp.cohort ?? "",
          academicYear: sp.academicYear ?? "",
          fileStatus: sp.fileStatus ?? "",
          metadataQuality: sp.metadataQuality ?? "",
          sort: sp.sort ?? "newest",
        }}
        programs={filterOptions.programs}
        cohorts={filterOptions.cohorts}
        academicYears={filterOptions.academicYears}
        hasActiveFilters={hasActiveFilters}
      />

      {thesesResult.error ? (
        <ThesisErrorState />
      ) : (
        <ThesesListClient
          rows={thesesResult.rows}
          programs={filterOptions.programs}
          hasAnyThesesAtAll={summary.total > 0}
        />
      )}

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        totalItems={thesesResult.total}
        pageSize={PAGE_SIZE}
        searchParams={sp as Record<string, string | undefined>}
        basePath="/admin/theses"
      />
    </div>
  );
}
