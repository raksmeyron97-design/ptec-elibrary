import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getResearchCohorts, getResearchAcademicYears } from "@/app/actions/research";
import ManageCohortsClient from "./ManageCohortsClient";

export default async function ManageCohortsPage() {
  const [cohortRes, yearRes] = await Promise.all([
    getResearchCohorts(),
    getResearchAcademicYears(),
  ]);

  const cohorts = cohortRes.data ?? [];
  const years = yearRes.data ?? [];

  return (
    <div className="mx-auto max-w-[900px] space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/admin/research-reports/create"
          className="p-2 hover:bg-black/5 rounded-full transition-colors text-text-muted hover:text-text-heading"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-text-heading">Manage Cohorts &amp; Academic Years</h1>
          <p className="text-text-muted text-sm mt-1">
            Add, edit, or remove cohorts and their academic year options. Changes appear immediately in upload forms.
          </p>
        </div>
      </div>

      <ManageCohortsClient initialCohorts={cohorts} initialYears={years} />
    </div>
  );
}
