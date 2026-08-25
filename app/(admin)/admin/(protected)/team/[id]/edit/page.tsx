import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import TeamForm from "../../_components/TeamForm";
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

  const member = data as TeamMemberRow;

  /*
    Breadcrumb, heading and card come from FormShell inside TeamForm — its
    sticky aside previews the form's own live state, so it cannot be passed
    from here. The route stays a data loader.

    The member is named in the heading: the page used to open with an sr-only
    "Edit team member" and nothing visible, so an admin arriving from the list
    had no confirmation of which record they had opened.
  */
  return (
    <TeamForm
      initial={member}
      sections={sections}
      profiles={profiles}
      pageTitle={member.name_en?.trim() || member.name_km?.trim() || "Edit team member"}
      pageDescription="Update this staff profile."
    />
  );
}
