import type { Metadata } from "next";
import Link from "next/link";
import {
  UserCircle, Users, LayoutGrid, Languages, CalendarClock,
  Phone, Mail, BookOpen, MessageCircle, ChevronRight,
} from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";
import { SITE_URL, PTEC_LIBRARY_NAME } from "@/lib/seo/site";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { PTEC } from "@/lib/ptec";
import {
  PUBLIC_MEMBER_SELECT, LEGACY_MEMBER_SELECT, fromLegacyRow,
  type LegacyTeamMemberRow, type PublicTeamMember, type PublicTeamSection,
} from "@/lib/team/public";
import TeamGrid from "./TeamGrid";

// Published team data is public and changes rarely; admin actions call
// revalidatePath("/about/team") on every change, so a long window is safe.
export const revalidate = 600;

const PAGE_TITLE = "Library Team | PTEC Digital Library";
const PAGE_DESCRIPTION =
  "Meet the PTEC Library team supporting students, teachers, digital resources, " +
  "library services, and academic research at Phnom Penh Teacher Education College.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/about/team` },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: `${SITE_URL}/about/team`,
    type: "website",
    siteName: PTEC_LIBRARY_NAME,
    images: [{ url: `${SITE_URL}/og-image.png` }],
  },
  twitter: {
    card: "summary_large_image",
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
  },
};

/**
 * Reads published members from the privacy-enforcing `team_members_public`
 * view (migration 0070). Until that migration is applied the view does not
 * exist, so fall back to the legacy view with the pre-0070 column list.
 */
async function getPublicTeamData(): Promise<{
  members: PublicTeamMember[];
  sections: PublicTeamSection[];
}> {
  const supabase = createServiceClient();

  const [{ data: membersNew, error: membersError }, sectionsResult] = await Promise.all([
    supabase
      .from("team_members_public")
      .select(PUBLIC_MEMBER_SELECT)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("team_sections")
      .select("id,name_km,name_en,description_km,description_en,display_order,is_active")
      .order("display_order", { ascending: true }),
  ]);

  let members: PublicTeamMember[];
  if (membersError) {
    // Pre-0070 fallback: view (42P01) or columns (42703) missing.
    const { data: legacy } = await supabase
      .from("team_members_with_email")
      .select(LEGACY_MEMBER_SELECT)
      .eq("is_published", true)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });
    members = ((legacy ?? []) as unknown as LegacyTeamMemberRow[]).map(fromLegacyRow);
  } else {
    members = (membersNew ?? []) as unknown as PublicTeamMember[];
  }

  let sections: PublicTeamSection[];
  if (sectionsResult.error) {
    // Pre-0070: no is_active column yet.
    const { data: legacySections } = await supabase
      .from("team_sections")
      .select("id,name_km,name_en,description_km,description_en,display_order")
      .order("display_order", { ascending: true });
    sections = (legacySections ?? []) as PublicTeamSection[];
  } else {
    sections = (sectionsResult.data ?? [])
      .filter((s) => s.is_active !== false)
      .map((s) => ({
        id: s.id,
        name_km: s.name_km,
        name_en: s.name_en,
        description_km: s.description_km,
        description_en: s.description_en,
        display_order: s.display_order,
      }));
  }

  return { members, sections };
}

export default async function TeamPage() {
  const { members, sections } = await getPublicTeamData();
  const sectionsWithMembers = sections.filter((s) =>
    members.some((m) => m.section_id === s.id)
  );

  // Structured data — safe public fields only (no contact details).
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "AboutPage",
      name: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      url: `${SITE_URL}/about/team`,
      inLanguage: ["en", "km"],
      about: {
        "@type": "Organization",
        name: PTEC_LIBRARY_NAME,
        url: SITE_URL,
        parentOrganization: {
          "@type": "CollegeOrUniversity",
          name: PTEC.name.en,
          sameAs: [...PTEC.sameAs],
        },
        employee: members.map((m) => ({
          "@type": "Person",
          name: m.name_en,
          ...(m.position_en ? { jobTitle: m.position_en } : {}),
          worksFor: { "@type": "Organization", name: PTEC_LIBRARY_NAME },
        })),
      },
    },
    breadcrumbSchema([
      { name: "Home", path: "/home" },
      { name: "Library Team" },
    ]),
  ];

  const stats = [
    { icon: Users, value: String(members.length), label: "Staff Members", labelKm: "បុគ្គលិក", color: "#1E3A8A" },
    { icon: LayoutGrid, value: String(sectionsWithMembers.length), label: "Service Areas", labelKm: "ផ្នែកសេវាកម្ម", color: "#BE9412" },
    { icon: Languages, value: "2", label: "Languages Supported", labelKm: "ភាសា", color: "#1E3A8A" },
    { icon: CalendarClock, value: "6", label: "Days Open / Week", labelKm: "ថ្ងៃបើកក្នុងសប្តាហ៍", color: "#BE9412" },
  ];

  return (
    <div className="min-h-screen bg-paper px-4 py-14 md:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mx-auto max-w-6xl">
        {/* Breadcrumbs */}
        <nav aria-label="Breadcrumb" className="mb-8">
          <ol className="flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
            <li>
              <Link href="/home" className="transition-colors hover:text-brand">Home</Link>
            </li>
            <li aria-hidden="true"><ChevronRight className="h-3 w-3" /></li>
            <li aria-current="page" className="font-semibold text-text-body">Library Team</li>
          </ol>
        </nav>

        {/* ── Hero ─────────────────────────────────────────────── */}
        <header className="mb-12 text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em]" style={{ color: "#2A47A6" }}>
            <span lang="km">ក្រុមការងារ</span> · Our People
          </p>

          <h1 className="text-4xl font-bold leading-tight md:text-5xl">
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg,#1E3A8A 0%,#3A5FC4 100%)" }}
            >
              Library
            </span>{" "}
            <span style={{ color: "#DDB022" }}>Team</span>
            <span className="font-kh ml-3 text-3xl md:text-4xl" style={{ color: "#3A5FC4" }} lang="km">
              ក្រុមការងារបណ្ណាល័យ
            </span>
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-base text-text-body">
            Meet the people supporting library services, digital resources, research access,
            and student learning at the{" "}
            <strong style={{ color: "#1E3A8A" }}>PTEC Digital Library</strong>.
          </p>

          {/* Stats */}
          {members.length > 0 && (
            <dl className="mx-auto mt-8 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
              {stats.map(({ icon: Icon, value, label, labelKm, color }) => (
                <div
                  key={label}
                  className="rounded-2xl border border-divider bg-bg-surface px-3 py-4 text-center shadow-sm"
                >
                  <Icon className="mx-auto mb-1.5 h-5 w-5" style={{ color }} aria-hidden="true" />
                  <dd className="text-2xl font-bold leading-tight" style={{ color }}>{value}</dd>
                  <dt className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                    {label}
                    <span className="font-kh block text-[10px] font-normal normal-case" lang="km">{labelKm}</span>
                  </dt>
                </div>
              ))}
            </dl>
          )}

          {/* Decorative divider */}
          <div className="mx-auto mt-8 flex items-center justify-center gap-3" aria-hidden="true">
            <div className="h-px w-16 bg-gradient-to-r from-transparent to-blue-700/40" />
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: "#DDB022" }} />
            <div className="h-px w-16 bg-gradient-to-l from-transparent to-blue-700/40" />
          </div>
        </header>

        {/* ── Mission ──────────────────────────────────────────── */}
        <section
          aria-labelledby="team-mission-heading"
          className="mx-auto mb-14 max-w-3xl rounded-2xl border border-divider bg-bg-surface px-6 py-6 text-center shadow-sm md:px-10"
        >
          <h2
            id="team-mission-heading"
            className="text-xs font-semibold uppercase tracking-[0.2em]"
            style={{ color: "#BE9412" }}
          >
            <span className="font-kh normal-case tracking-normal" lang="km">បេសកកម្មរបស់យើង</span> · Our Mission
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-text-body md:text-base">
            The PTEC Library team supports students, teachers, and researchers by managing
            library resources, maintaining digital access, organizing collections, and helping
            users find reliable academic information.
          </p>
          <p className="font-kh mt-2 text-sm leading-relaxed text-text-muted" lang="km">
            ក្រុមការងារបណ្ណាល័យ PTEC គាំទ្រនិស្សិត គ្រូបង្រៀន និងអ្នកស្រាវជ្រាវ តាមរយៈការគ្រប់គ្រងធនធានបណ្ណាល័យ
            ការថែរក្សាការចូលប្រើប្រាស់ឌីជីថល ការរៀបចំបណ្ណសម្រាំង និងជួយអ្នកប្រើប្រាស់ស្វែងរកព័ត៌មានសិក្សាដែលអាចទុកចិត្តបាន។
          </p>
        </section>

        {/* ── Directory ────────────────────────────────────────── */}
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
          <TeamGrid members={members} sections={sectionsWithMembers} />
        )}

        {/* ── Contact CTA ──────────────────────────────────────── */}
        <section
          aria-labelledby="team-contact-heading"
          className="relative mt-20 overflow-hidden rounded-3xl px-6 py-12 text-center md:px-12"
          style={{ background: "linear-gradient(135deg,#122251 0%,#1E3A8A 60%,#2A47A6 100%)" }}
        >
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage: "radial-gradient(circle,white 1px,transparent 1px)",
              backgroundSize: "22px 22px",
            }}
            aria-hidden="true"
          />
          <div className="relative">
            <h2 id="team-contact-heading" className="text-2xl font-bold text-white md:text-3xl">
              Need help from the library team?
            </h2>
            <p className="font-kh mt-1.5 text-base text-white/80" lang="km">
              ត្រូវការជំនួយពីក្រុមការងារបណ្ណាល័យ?
            </p>
            <p className="mx-auto mt-3 max-w-xl text-sm text-white/70">
              Our staff can help you find books and theses, access digital resources, and
              support your research — visit the library or reach us through official channels.
            </p>

            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <a
                href={PTEC.phoneLibraryTel}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-blue-950 transition hover:bg-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-950"
              >
                <Phone className="h-4 w-4" aria-hidden="true" />
                Contact Library Team
              </a>
              <Link
                href="/about/timings"
                className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <BookOpen className="h-4 w-4" aria-hidden="true" />
                Visit Library Services
              </Link>
              <a
                href={PTEC.links.telegram}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                Ask for Digital Support
              </a>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-1.5 text-xs text-white/60">
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-3 w-3" aria-hidden="true" />
                Library desk: {PTEC.phoneLibrary}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3 w-3" aria-hidden="true" />
                {PTEC.email}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="h-3 w-3" aria-hidden="true" />
                {PTEC.hours.en}
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
