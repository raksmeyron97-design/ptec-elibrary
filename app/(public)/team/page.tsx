import type { Metadata } from "next";
import Image from "next/image";
import { Mail, Phone, GraduationCap, Briefcase, UserCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "ក្រុមការងារបណ្ណាល័យ — PTEC e-Library",
  description: "Meet the dedicated library staff at Phnom Penh Teacher Education College (PTEC).",
  alternates: { canonical: `${SITE_URL}/team` },
  openGraph: {
    title: "Library Team — PTEC e-Library",
    description: "Meet the dedicated library staff at PTEC.",
    url: `${SITE_URL}/team`,
    type: "website",
  },
};

type Member = {
  id: string;
  name_km: string;
  name_en: string;
  position_km: string | null;
  position_en: string | null;
  education: string | null;
  years_experience: string | null;
  phone: string | null;
  bio_km: string | null;
  bio_en: string | null;
  photo_url: string | null;
  user_email: string | null;
  section_id: string | null;
  section_name_km: string | null;
  section_name_en: string | null;
  section_order: number | null;
};

type Section = {
  id: string;
  name_km: string;
  name_en: string;
  description_km: string | null;
  description_en: string | null;
  display_order: number;
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

  // Group members by section; unsectioned go last under "Other"
  type Group = { section: Section | null; members: Member[] };
  const grouped: Group[] = sections.map((s) => ({
    section: s,
    members: members.filter((m) => m.section_id === s.id),
  })).filter((g) => g.members.length > 0);

  const unsectioned = members.filter((m) => !m.section_id);
  if (unsectioned.length > 0) {
    grouped.push({ section: null, members: unsectioned });
  }

  return (
    <div className="min-h-screen bg-paper px-4 py-14 md:px-8">
      <div className="mx-auto max-w-6xl">

        {/* ── Page Header ─────────────────────────────────────── */}
        <div className="mb-14 text-center">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-brand">
            ក្រុមការងារ · Our People
          </p>
          <h1 className="text-4xl font-bold text-text-heading md:text-5xl">
            Library Team
            <span className="font-kh ml-3 text-3xl text-text-muted md:text-4xl">
              ក្រុមការងារបណ្ណាល័យ
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-text-body">
            Meet the dedicated staff of the{" "}
            <strong className="text-text-heading">PTEC e-Library</strong>
            {" "}— committed to supporting learning, research, and knowledge for
            every student and educator.
          </p>
          <div className="mx-auto mt-6 flex items-center justify-center gap-3">
            <div className="h-px w-16 bg-gradient-to-r from-transparent to-brand/40" />
            <div className="h-2 w-2 rounded-full bg-brand" />
            <div className="h-px w-16 bg-gradient-to-l from-transparent to-brand/40" />
          </div>
        </div>

        {/* ── No members ──────────────────────────────────────── */}
        {members.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-divider py-24 text-center">
            <UserCircle className="mx-auto mb-4 h-16 w-16 text-text-muted/30" />
            <p className="text-lg font-semibold text-text-body">Coming soon</p>
            <p className="mt-1 text-sm text-text-muted">Team profiles will appear here shortly.</p>
          </div>
        )}

        {/* ── Sections ────────────────────────────────────────── */}
        <div className="space-y-14">
          {grouped.map(({ section, members: sMembers }) => (
            <section key={section?.id ?? "unsectioned"}>

              {/* Section heading */}
              <div className="mb-8 flex items-center gap-4">
                <div className="h-px flex-1 bg-divider" />
                <div className="text-center">
                  {section ? (
                    <>
                      <h2 className="font-kh text-xl font-bold text-text-heading">
                        {section.name_km}
                      </h2>
                      <p className="text-sm font-semibold text-brand">
                        {section.name_en}
                      </p>
                      {section.description_en && (
                        <p className="mt-1 text-xs text-text-muted max-w-sm">
                          {section.description_en}
                        </p>
                      )}
                    </>
                  ) : (
                    <h2 className="text-lg font-bold text-text-heading">Other</h2>
                  )}
                </div>
                <div className="h-px flex-1 bg-divider" />
              </div>

              {/* Cards grid */}
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {sMembers.map((member) => (
                  <TeamCard key={member.id} member={member} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function TeamCard({ member }: { member: Member }) {
  const email = member.user_email;

  return (
    <article className="group flex flex-col rounded-2xl border border-divider bg-bg-surface shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-1 overflow-hidden">

      {/* Accent bar */}
      <div className="h-1.5 w-full bg-gradient-to-r from-brand via-blue-500 to-indigo-600" />

      <div className="flex flex-col flex-1 p-6">

        {/* Avatar + names */}
        <div className="flex items-start gap-4 mb-5">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-divider shadow-sm">
            {member.photo_url ? (
              <Image
                src={member.photo_url}
                alt={member.name_en}
                fill
                sizes="80px"
                className="object-cover"
              />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center"
                style={{ background: "linear-gradient(135deg, #1E3A8A 0%, #4f46e5 100%)" }}
              >
                <span className="text-2xl font-bold text-white select-none">
                  {member.name_en.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="font-kh text-base font-bold text-text-heading leading-snug">
              {member.name_km}
            </h3>
            <p className="mt-0.5 text-sm text-text-muted truncate">{member.name_en}</p>
            {(member.position_en || member.position_km) && (
              <span className="mt-2 inline-block rounded-full bg-brand/10 px-2.5 py-0.5 text-[11px] font-semibold text-brand">
                {member.position_km || member.position_en}
              </span>
            )}
          </div>
        </div>

        {/* Education */}
        {member.education && (
          <div className="mb-3 flex items-center gap-2 text-sm text-text-muted">
            <GraduationCap className="h-3.5 w-3.5 shrink-0 text-brand/60" />
            <span className="truncate">{member.education}</span>
          </div>
        )}

        {/* Experience */}
        {member.years_experience && (
          <div className="mb-3 flex items-center gap-2 text-sm text-text-muted">
            <Briefcase className="h-3.5 w-3.5 shrink-0 text-brand/60" />
            <span>{member.years_experience}</span>
          </div>
        )}

        {/* Bio */}
        {(member.bio_km || member.bio_en) && (
          <p className="mb-5 flex-1 font-kh text-sm leading-relaxed text-text-body line-clamp-3">
            {member.bio_km || member.bio_en}
          </p>
        )}

        {/* Contact: email from user account, phone from field */}
        {(email || member.phone) && (
          <div className="mt-auto border-t border-divider pt-4 space-y-2">
            {email && (
              <a
                href={`mailto:${email}`}
                className="flex items-center gap-2 text-xs text-text-muted transition hover:text-brand cursor-pointer"
              >
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{email}</span>
              </a>
            )}
            {member.phone && (
              <a
                href={`tel:${member.phone.replace(/\s/g, "")}`}
                className="flex items-center gap-2 text-xs text-text-muted transition hover:text-brand cursor-pointer"
              >
                <Phone className="h-3.5 w-3.5 shrink-0" />
                <span>{member.phone}</span>
              </a>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
