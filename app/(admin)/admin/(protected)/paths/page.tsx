import Link from "next/link";
import { GraduationCap, Plus } from "lucide-react";
import { adminGetPaths } from "@/app/actions/learning-paths";
import PathsListClient from "./PathsListClient";

export const dynamic = "force-dynamic";

export default async function AdminPathsPage() {
  const paths = await adminGetPaths();

  return (
    <div className="p-6 md:p-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <GraduationCap className="h-6 w-6 text-brand" />
            <h1 className="text-[22px] font-bold text-text-heading">Learning Paths</h1>
          </div>
          <p className="mt-1 text-[13px] text-text-muted">
            Curated reading paths for PTEC trainees — ordered sequences of books, theses, and other resources.
          </p>
        </div>
        <Link
          href="/admin/paths/create"
          className="btn-brand-gradient inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" /> New path
        </Link>
      </div>

      <PathsListClient paths={paths} />
    </div>
  );
}
