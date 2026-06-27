import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import TeamForm from "../../TeamForm";
import { getTeamSections, getAllProfiles } from "../../actions";
import type { TeamMemberRow } from "../../actions";

export default async function EditTeamMemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
    <div className="mx-auto max-w-3xl">
      <TeamForm
        initial={data as TeamMemberRow}
        sections={sections}
        profiles={profiles}
      />
    </div>
  );
}
