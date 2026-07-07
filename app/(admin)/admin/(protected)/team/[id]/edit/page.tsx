import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import TeamForm from "../../TeamForm";
import { getTeamSections, getAllProfiles } from "../../actions";
import type { TeamMemberRow } from "../../actions";

export default async function EditTeamMemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const supabase = createServiceClient();

  const [{ data }, sections, profiles] = await Promise.all([
    supabase
      .from("team_members_with_email")
      .select("*")
      .eq("id", id)
      .single(),
    getTeamSections(),
    getAllProfiles(),
  ]);

  if (!data) notFound();

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link
        href="/admin/team"
        className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-text-muted transition hover:text-text-body"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to team
      </Link>
      <TeamForm
        initial={data as TeamMemberRow}
        sections={sections}
        profiles={profiles}
      />
    </div>
  );
}
