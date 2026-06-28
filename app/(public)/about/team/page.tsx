import type { Metadata } from "next";
import { UserCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/seo/site";
import TeamGrid, { type Member, type Section } from "./TeamGrid";

export const metadata: Metadata = {
  title: "ក្រុមការងារបណ្ណាល័យ — PTEC e-Library",
  description: "Meet the dedicated library staff at Phnom Penh Teacher Education College (PTEC).",
  alternates: { canonical: `${SITE_URL}/about/team` },
  openGraph: {
    title: "Library Team — PTEC e-Library",
    description: "Meet the dedicated library staff at PTEC.",
    url: `${SITE_URL}/about/team`,
    type: "website",
  },
};

export default async function TeamPage() {
  const supabase = await createClient();

  const [{ data: membersRaw }, { data: sectionsRaw }] = await Promise.all([
    supabase
      .from("team_members_with_email")
      .select(
        "id,name_km,name_en,position_km,position_en,education,years_experience,phone,bio_km,bio_en,photo_url,user_email,section_id,section_name_km,section_name_en,section_order"
      )
      .eq("is_published", true)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("team_sections")
      .select("id,name_km,name_en,description_km,description_en,display_order")
      .order("display_order", { ascending: true }),
  ]);

  const members  = (membersRaw  ?? []) as Member[];
  const sections = (sectionsRaw ?? []) as Section[];

  // Group by section; unsectioned last
  const grouped = [
    ...sections
      .map((s) => ({ section: s, members: members.filter((m) => m.section_id === s.id) }))
      .filter((g) => g.members.length > 0),
    ...(members.filter((m) => !m.section_id).length > 0
      ? [{ section: null, members: members.filter((m) => !m.section_id) }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-paper px-4 py-14 md:px-8">
      <div className="mx-auto max-w-6xl">

        {/* Page header */}
        <div className="mb-14 text-center">

          {/* Label */}
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em]"
            style={{ color: "#2A47A6" }}>
            <span lang="km">ក្រុមការងារ</span> · Our People
          </p>

          {/* Heading — "Library" navy gradient, "Team" gold */}
          <h1 className="text-4xl font-bold md:text-5xl leading-tight">
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg,#1E3A8A 0%,#3A5FC4 100%)" }}
            >
              Library
            </span>
            {" "}
            <span style={{ color: "#DDB022" }}>Team</span>
            <span
              className="font-kh ml-3 text-3xl md:text-4xl"
              style={{ color: "#3A5FC4" }}
              lang="km"
            >
              ក្រុមការងារបណ្ណាល័យ
            </span>
          </h1>

          {/* Description */}
          <p className="mx-auto mt-4 max-w-2xl text-base text-text-body">
            Meet the dedicated staff of the{" "}
            <strong style={{ color: "#1E3A8A" }}>PTEC e-Library</strong>
            {" "}— committed to supporting learning, research, and knowledge for every student and educator.
          </p>

          {/* Stats row — navy for members, gold for departments */}
          {members.length > 0 && (
            <div className="mx-auto mt-6 flex items-center justify-center gap-8">
              <div className="text-center">
                <p className="text-3xl font-bold" style={{ color: "#1E3A8A" }}>
                  {members.length}
                </p>
                <p className="mt-0.5 text-xs font-semibold uppercase tracking-widest text-text-muted">
                  Staff Members
                </p>
              </div>
              <div className="h-10 w-px bg-divider" />
              <div className="text-center">
                <p className="text-3xl font-bold" style={{ color: "#BE9412" }}>
                  {sections.length}
                </p>
                <p className="mt-0.5 text-xs font-semibold uppercase tracking-widest text-text-muted">
                  Departments
                </p>
              </div>
            </div>
          )}

          {/* Decorative divider — gold dot flanked by brand lines */}
          <div className="mx-auto mt-6 flex items-center justify-center gap-3">
            <div className="h-px w-16 bg-gradient-to-r from-transparent to-blue-700/40" />
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: "#DDB022" }} />
            <div className="h-px w-16 bg-gradient-to-l from-transparent to-blue-700/40" />
          </div>

        </div>

        {members.length === 0 ? (
          <div
            role="status"
            className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-divider py-24 text-center"
          >
            <UserCircle className="mx-auto mb-4 h-16 w-16 text-text-muted/30" aria-hidden="true" />
            <p className="text-lg font-semibold text-text-body">Coming soon</p>
            <p className="mt-1 text-sm text-text-muted">Team profiles will appear here shortly.</p>
          </div>
        ) : (
          <TeamGrid groups={grouped} />
        )}
      </div>
    </div>
  );
}