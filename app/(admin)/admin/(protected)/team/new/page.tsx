import { getTeamSections, getAllProfiles } from "../actions";
import TeamForm from "../_components/TeamForm";
import { requireRouteAccess } from "@/lib/admin/route-guard";

export default async function NewTeamMemberPage() {
  await requireRouteAccess("team.create");

  const [sections, profiles] = await Promise.all([
    getTeamSections(),
    getAllProfiles(),
  ]);

  /*
    The breadcrumb, heading and card come from FormShell, which TeamForm renders
    — its sticky aside is a live preview of the form's own state, so it cannot be
    passed down from here. The route stays a data loader.
  */
  return (
    <TeamForm
      sections={sections}
      profiles={profiles}
      pageTitle="Add new team member"
      pageDescription="Create a public profile for a library staff member."
    />
  );
}
