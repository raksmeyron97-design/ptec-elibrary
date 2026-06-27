import { getTeamSections, getAllProfiles } from "../actions";
import TeamForm from "../TeamForm";

export default async function NewTeamMemberPage() {
  const [sections, profiles] = await Promise.all([
    getTeamSections(),
    getAllProfiles(),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <TeamForm sections={sections} profiles={profiles} />
    </div>
  );
}
