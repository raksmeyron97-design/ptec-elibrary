import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AdminProfileClient from "@/components/admin/AdminProfileClient";
import type { Metadata } from "next";
import type { TeamMemberData, TeamSectionData } from "@/components/admin/AdminProfileClient";

export const metadata: Metadata = {
  title: "My Profile — Admin",
};

export default async function AdminProfilePage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/admin/login");

  const supabaseService = createServiceClient();

  const [{ data: profile }, { data: teamMemberRaw }, { data: sectionsRaw }] =
    await Promise.all([
      supabaseService
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", user.id)
        .single(),
      supabaseService
        .from("team_members")
        .select("id, name_km, name_en, position_km, position_en, section_id, education, years_experience, phone, bio_km, bio_en, photo_url")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabaseService
        .from("team_sections")
        .select("id, name_km, name_en")
        .order("display_order", { ascending: true }),
    ]);

  const teamMember: TeamMemberData | null = teamMemberRaw
    ? {
        id:               teamMemberRaw.id,
        name_km:          teamMemberRaw.name_km,
        name_en:          teamMemberRaw.name_en,
        position_km:      teamMemberRaw.position_km ?? null,
        position_en:      teamMemberRaw.position_en ?? null,
        section_id:       teamMemberRaw.section_id ?? null,
        education:        teamMemberRaw.education ?? null,
        years_experience: teamMemberRaw.years_experience ?? null,
        phone:            teamMemberRaw.phone ?? null,
        bio_km:           teamMemberRaw.bio_km ?? null,
        bio_en:           teamMemberRaw.bio_en ?? null,
        photo_url:        teamMemberRaw.photo_url ?? null,
      }
    : null;

  const sections: TeamSectionData[] = (sectionsRaw ?? []).map((s) => ({
    id:      s.id,
    name_km: s.name_km,
    name_en: s.name_en,
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-heading">My Profile</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage your personal information, password, and team profile.</p>
      </div>
      <AdminProfileClient
        user={{
          id: user.id,
          email: user.email ?? "",
          full_name: profile?.full_name ?? null,
          avatar_url: profile?.avatar_url ?? null,
        }}
        teamMember={teamMember}
        sections={sections}
      />
    </div>
  );
}
