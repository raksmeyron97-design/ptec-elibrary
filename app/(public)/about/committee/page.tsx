import type { Metadata } from "next";
import { Users } from "lucide-react";
import { SITE_URL } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "គណៈកម្មការបណ្ណាល័យ — PTEC e-Library",
  description:
    "Library Committee at Phnom Penh Teacher Education College. Member profiles coming soon.",
  alternates: { canonical: `${SITE_URL}/about/committee` },
  openGraph: {
    title: "Library Committee — PTEC Library",
    url: `${SITE_URL}/about/committee`,
    type: "website",
  },
};

/**
 * Data shape for a committee member — fill this array once the
 * member list is confirmed and the page will render automatically.
 */
type CommitteeMember = {
  id: string;
  name_km: string;
  name_en: string;
  role_km: string | null;     // committee role (chair, secretary, etc.)
  role_en: string | null;
  responsibility_km: string | null;
  responsibility_en: string | null;
  photo_url: string | null;
};

// TODO: Replace with real data from Supabase or a static list when confirmed
const MEMBERS: CommitteeMember[] = [];

export default function LibraryCommitteePage() {
  return (
    <div className="min-h-screen bg-paper">
      {/* ── Hero ─────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        style={{ background: "linear-gradient(135deg,#1E3A8A 0%,#2A47A6 100%)" }}
      >
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: "radial-gradient(circle,white 1px,transparent 1px)",
            backgroundSize: "24px 24px",
          }}
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-3xl px-6 py-16 md:py-22 text-center">
          <p
            className="mb-3 text-sm font-semibold uppercase tracking-[0.2em]"
            style={{ color: "#DDB022" }}
          >
            គណៈកម្មការ · Committee
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight">
            Library Committee
            <span className="font-kh ml-3 text-2xl md:text-3xl text-white/75" lang="km">
              គណៈកម្មការបណ្ណាល័យ
            </span>
          </h1>
          <p className="mt-4 text-sm text-white/65 max-w-sm mx-auto">
            The oversight committee of the PTEC Library — members and responsibilities coming soon.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 md:px-8 pb-20 mt-12">

        {MEMBERS.length === 0 ? (
          /* ── Coming-soon placeholder ─────────────────────── */
          <div
            role="status"
            aria-live="polite"
            className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-divider py-28 text-center px-6"
          >
            <div
              className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl"
              style={{ background: "linear-gradient(135deg,#EEF2FB,#D9E2F7)" }}
              aria-hidden="true"
            >
              <Users className="h-10 w-10" style={{ color: "#2A47A6" }} />
            </div>
            <p className="text-lg font-bold text-text-heading">
              <span className="font-kh" lang="km">មកដល់ឆាប់ៗ</span>
              {" "}· Coming Soon
            </p>
            <p className="mt-2 text-sm text-text-muted max-w-xs leading-relaxed">
              Committee member profiles will be published here once confirmed.
              Each entry will include name, role, and area of responsibility.
            </p>

            {/* Preview of what the cards will look like */}
            <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-2xl opacity-30 pointer-events-none select-none" aria-hidden="true">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-divider bg-bg-surface overflow-hidden"
                >
                  <div
                    className="h-16 w-full"
                    style={{ background: "linear-gradient(135deg,#1E3A8A,#2A47A6)" }}
                  />
                  <div className="flex flex-col items-center -mt-8 pb-5 px-5 pt-0">
                    <div className="h-16 w-16 rounded-full bg-divider border-4 border-bg-surface" />
                    <div className="mt-3 h-3 w-24 rounded bg-divider" />
                    <div className="mt-2 h-2.5 w-16 rounded bg-divider" />
                    <div className="mt-3 h-2 w-20 rounded bg-divider" />
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-6 text-xs text-text-muted">
              Expected fields: <span className="font-mono">name_km, name_en, role_km, role_en, responsibility, photo</span>
            </p>
          </div>
        ) : (
          /* ── Member grid (populated once data is available) ── */
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {MEMBERS.map((member) => (
              <CommitteeCard key={member.id} member={member} />
            ))}
          </div>
        )}

        {/* Decorative divider */}
        <div className="flex items-center justify-center gap-3 mt-16" aria-hidden="true">
          <div className="h-px w-16 bg-gradient-to-r from-transparent to-blue-700/40" />
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: "#DDB022" }} />
          <div className="h-px w-16 bg-gradient-to-l from-transparent to-blue-700/40" />
        </div>

      </div>
    </div>
  );
}

function CommitteeCard({ member }: { member: CommitteeMember }) {
  const initials = member.name_en
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <article className="group flex flex-col rounded-2xl bg-bg-surface overflow-hidden border border-divider transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl">
      {/* Gradient header */}
      <div
        className="relative h-[72px] shrink-0"
        style={{ background: "linear-gradient(135deg,#1E3A8A 0%,#2A47A6 100%)" }}
        aria-hidden="true"
      >
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: "radial-gradient(circle,white 1px,transparent 1px)",
            backgroundSize: "16px 16px",
          }}
        />
        {/* Avatar */}
        <div className="absolute -bottom-9 left-1/2 -translate-x-1/2">
          <div
            className="relative h-[72px] w-[72px] rounded-full overflow-hidden"
            style={{ boxShadow: "0 0 0 3px var(--ptec-bg-surface),0 0 0 5px #1E3A8A" }}
          >
            {member.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={member.photo_url}
                alt={`Photo of ${member.name_en}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center text-white font-bold text-lg"
                style={{ background: "linear-gradient(135deg,#1E3A8A,#2A47A6)" }}
              >
                {initials}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Card body */}
      <div className="flex flex-col flex-1 pt-11 pb-5 px-5 text-center">
        <h3 className="font-kh text-base font-bold text-text-heading leading-snug" lang="km">
          {member.name_km}
        </h3>
        <p className="text-xs text-text-muted mt-0.5">{member.name_en}</p>

        {(member.role_km || member.role_en) && (
          <span
            className="mx-auto mt-2 inline-block rounded-full px-3 py-0.5 text-[11px] font-semibold"
            style={{ background: "#EEF2FB", color: "#1E3A8A" }}
          >
            {member.role_km || member.role_en}
          </span>
        )}

        {(member.responsibility_km || member.responsibility_en) && (
          <p className="font-kh mt-3 text-xs leading-relaxed text-text-muted line-clamp-2" lang="km">
            {member.responsibility_km || member.responsibility_en}
          </p>
        )}
      </div>
    </article>
  );
}
