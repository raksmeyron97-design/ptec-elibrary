import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getThesisPrograms, getThesisFaculties, getThesisCohorts, getThesisAcademicYears } from "@/app/actions/theses";
import { PageHeader } from "@/components/admin/kit";
import ManageCohortsClient from "./_components/ManageCohortsClient";

export default async function ManageCohortsPage() {
  const [programRes, facultyRes, cohortRes, yearRes] = await Promise.all([
    getThesisPrograms(),
    getThesisFaculties(),
    getThesisCohorts(),
    getThesisAcademicYears(),
  ]);

  const programs = programRes.data ?? [];
  const faculties = facultyRes.data ?? [];
  const cohorts = cohortRes.data ?? [];
  const years = yearRes.data ?? [];

  const t = await getTranslations("adminThesisForm.cohorts");
  const tf = await getTranslations("adminThesisForm");

  return (
    <div className="w-full space-y-6">
      {/*
        Back goes to the theses list, not to the Create form. This page is
        reached from Create, from Edit and from the section nav, so a hardcoded
        return to Create sent two of those three journeys somewhere the user
        had never been — and, from Edit, away from unsaved work.
      */}
      <PageHeader
        breadcrumb={
          <Link
            href="/admin/theses"
            className="inline-flex items-center gap-1.5 text-sm text-text-muted transition hover:text-brand"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {tf("backToTheses")}
          </Link>
        }
        title={t("pageTitle")}
        description={t("pageDescription")}
      />

      <ManageCohortsClient
        initialPrograms={programs}
        initialFaculties={faculties}
        initialCohorts={cohorts}
        initialYears={years}
      />
    </div>
  );
}
