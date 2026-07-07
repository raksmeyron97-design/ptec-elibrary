import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getTeamSections, getAllProfiles } from "../actions";
import TeamForm from "../TeamForm";

export default async function NewTeamMemberPage() {
  await requireAdmin();
  const [sections, profiles] = await Promise.all([
    getTeamSections(),
    getAllProfiles(),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link
        href="/admin/team"
        className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-text-muted transition hover:text-text-body"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to team
      </Link>
      <TeamForm sections={sections} profiles={profiles} />
    </div>
  );
}
