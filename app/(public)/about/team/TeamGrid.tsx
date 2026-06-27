"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  Mail, Phone, GraduationCap, Briefcase,
  UserCircle, X, ChevronRight, Users,
} from "lucide-react";

export type Member = {
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
};

export type Section = {
  id: string;
  name_km: string;
  name_en: string;
  description_km: string | null;
  description_en: string | null;
  display_order: number;
};

type Group = { section: Section | null; members: Member[] };

type Palette = {
  gradient: string;
  ring: string;
  badgeBg: string;
  badgeText: string;
  accent: string;
  iconBg: string;
  iconText: string;
};

// Palettes derived exclusively from PTEC's blue and gold brand scales
const PALETTES: Palette[] = [
  // Navy → lighter navy  (blue-700 → blue-600)
  {
    gradient: "linear-gradient(135deg,#1E3A8A 0%,#2A47A6 100%)",
    ring: "#1E3A8A", badgeBg: "#EEF2FB", badgeText: "#1E3A8A",
    accent: "#1E3A8A", iconBg: "#EEF2FB", iconText: "#1E3A8A",
  },
  // Gold  (gold-500 → gold-600)
  {
    gradient: "linear-gradient(135deg,#DDB022 0%,#BE9412 100%)",
    ring: "#BE9412", badgeBg: "#FDF8E7", badgeText: "#806211",
    accent: "#BE9412", iconBg: "#FDF8E7", iconText: "#806211",
  },
  // Deep navy  (blue-900 → blue-700)
  {
    gradient: "linear-gradient(135deg,#122251 0%,#1E3A8A 100%)",
    ring: "#182E6E", badgeBg: "#EEF2FB", badgeText: "#182E6E",
    accent: "#182E6E", iconBg: "#EEF2FB", iconText: "#182E6E",
  },
  // Gold warm  (gold-700 → gold-500)
  {
    gradient: "linear-gradient(135deg,#806211 0%,#DDB022 100%)",
    ring: "#BE9412", badgeBg: "#FAEFC4", badgeText: "#5A4410",
    accent: "#BE9412", iconBg: "#FAEFC4", iconText: "#806211",
  },
  // Mid navy  (blue-600 → blue-400)
  {
    gradient: "linear-gradient(135deg,#2A47A6 0%,#5B7FD6 100%)",
    ring: "#2A47A6", badgeBg: "#EEF2FB", badgeText: "#2A47A6",
    accent: "#2A47A6", iconBg: "#EEF2FB", iconText: "#2A47A6",
  },
  // Navy + gold dual-tone  (brand → accent)
  {
    gradient: "linear-gradient(135deg,#1E3A8A 0%,#DDB022 100%)",
    ring: "#DDB022", badgeBg: "#FDF8E7", badgeText: "#806211",
    accent: "#DDB022", iconBg: "#FDF8E7", iconText: "#BE9412",
  },
];

export default function TeamGrid({ groups }: { groups: Group[] }) {
  const [selected, setSelected] = useState<{ member: Member; palette: Palette } | null>(null);

  useEffect(() => {
    if (!selected) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected]);

  useEffect(() => {
    document.body.style.overflow = selected ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [selected]);

  const close = useCallback(() => setSelected(null), []);

  return (
    <>
      <div className="space-y-16">
        {groups.map(({ section, members }, idx) => {
          const palette = PALETTES[idx % PALETTES.length];
          return (
            <section key={section?.id ?? "unsectioned"}>
              <SectionHeader section={section} palette={palette} count={members.length} />
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {members.map((member) => (
                  <TeamCard
                    key={member.id}
                    member={member}
                    palette={palette}
                    onOpen={() => setSelected({ member, palette })}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {selected && (
        <MemberModal member={selected.member} palette={selected.palette} onClose={close} />
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   Section header
───────────────────────────────────────────────────────────── */
function SectionHeader({
  section, palette, count,
}: {
  section: Section | null;
  palette: Palette;
  count: number;
}) {
  return (
    <div className="mb-8">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-start gap-3.5">
          <div
            className="mt-1 h-9 w-1.5 shrink-0 rounded-full"
            style={{ background: palette.gradient }}
          />
          <div>
            {section ? (
              <>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <h2 className="font-kh text-xl font-bold text-text-heading leading-tight">
                    {section.name_km}
                  </h2>
                  <span className="text-sm font-semibold" style={{ color: palette.accent }}>
                    {section.name_en}
                  </span>
                </div>
                {section.description_en && (
                  <p className="mt-1 text-sm text-text-muted max-w-md">
                    {section.description_en}
                  </p>
                )}
              </>
            ) : (
              <h2 className="text-lg font-bold text-text-heading">Other Members</h2>
            )}
          </div>
        </div>

        <span
          className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
          style={{ background: palette.badgeBg, color: palette.badgeText }}
        >
          <Users className="h-3 w-3" />
          {count} {count === 1 ? "member" : "members"}
        </span>
      </div>
      <div className="h-px bg-divider" />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Card
───────────────────────────────────────────────────────────── */
function TeamCard({
  member, palette, onOpen,
}: {
  member: Member;
  palette: Palette;
  onOpen: () => void;
}) {
  return (
    <article
      className="group flex flex-col rounded-2xl bg-bg-surface overflow-hidden border border-divider cursor-pointer transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl"
      onClick={onOpen}
    >
      {/* Colored header zone with dot-pattern */}
      <div className="relative h-[88px] shrink-0" style={{ background: palette.gradient }}>
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: "radial-gradient(circle,white 1px,transparent 1px)",
            backgroundSize: "18px 18px",
          }}
        />

        {/* Avatar overlapping the bottom edge */}
        <div className="absolute -bottom-10 left-1/2 -translate-x-1/2">
          <div
            className="relative h-20 w-20 rounded-full overflow-hidden"
            style={{
              boxShadow: `0 0 0 3px var(--ptec-bg-surface),0 0 0 5px ${palette.ring}`,
            }}
          >
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
                style={{ background: palette.gradient }}
              >
                <span className="text-2xl font-bold text-white select-none">
                  {member.name_en.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Card body */}
      <div className="flex flex-col flex-1 pt-12 pb-5 px-5 text-center">
        <h3 className="font-kh text-base font-bold text-text-heading leading-snug">
          {member.name_km}
        </h3>
        <p className="mt-0.5 text-xs text-text-muted">{member.name_en}</p>

        {(member.position_km || member.position_en) && (
          <span
            className="mx-auto mt-2 inline-block rounded-full px-3 py-0.5 text-[11px] font-semibold"
            style={{ background: palette.badgeBg, color: palette.badgeText }}
          >
            {member.position_km || member.position_en}
          </span>
        )}

        {(member.education || member.years_experience) && (
          <div className="mt-4 space-y-1.5 text-left">
            {member.education && (
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <GraduationCap className="h-3.5 w-3.5 shrink-0" style={{ color: palette.accent }} />
                <span className="truncate">{member.education}</span>
              </div>
            )}
            {member.years_experience && (
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <Briefcase className="h-3.5 w-3.5 shrink-0" style={{ color: palette.accent }} />
                <span>{member.years_experience}</span>
              </div>
            )}
          </div>
        )}

        {(member.bio_km || member.bio_en) && (
          <p className="font-kh mt-3 flex-1 text-xs leading-relaxed text-text-body line-clamp-2 text-left">
            {member.bio_km || member.bio_en}
          </p>
        )}

        <div className="mt-auto pt-4 border-t border-divider space-y-2">
          {member.user_email && (
            <a
              href={`mailto:${member.user_email}`}
              className="flex items-center gap-2 text-xs text-text-muted transition-colors hover:text-brand cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            >
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{member.user_email}</span>
            </a>
          )}
          {member.phone && (
            <a
              href={`tel:${member.phone.replace(/\s/g, "")}`}
              className="flex items-center gap-2 text-xs text-text-muted transition-colors hover:text-brand cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            >
              <Phone className="h-3.5 w-3.5 shrink-0" />
              <span>{member.phone}</span>
            </a>
          )}

          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpen(); }}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white cursor-pointer transition-opacity hover:opacity-90"
            style={{ background: palette.gradient }}
          >
            <span className="font-kh">រៀបរៀងបន្ថែម</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </article>
  );
}

/* ─────────────────────────────────────────────────────────────
   Modal
───────────────────────────────────────────────────────────── */
function MemberModal({
  member, palette, onClose,
}: {
  member: Member;
  palette: Palette;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-lg max-h-[95vh] sm:max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-full bg-black/20 p-1.5 text-white transition hover:bg-black/40 cursor-pointer"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Gradient header */}
        <div
          className="relative flex flex-col items-center px-6 pb-8 pt-12 text-center"
          style={{ background: palette.gradient }}
        >
          <div
            className="absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage: "radial-gradient(circle,white 1px,transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          />

          <div
            className="relative z-10 mb-4 h-28 w-28 overflow-hidden rounded-full"
            style={{ boxShadow: "0 0 0 4px rgba(255,255,255,0.25),0 8px 24px rgba(0,0,0,0.3)" }}
          >
            {member.photo_url ? (
              <Image
                src={member.photo_url}
                alt={member.name_en}
                fill
                sizes="112px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-white/10">
                <UserCircle className="h-16 w-16 text-white/60" />
              </div>
            )}
          </div>

          <h2 className="relative z-10 font-kh text-2xl font-bold text-white leading-snug">
            {member.name_km}
          </h2>
          <p className="relative z-10 mt-1 text-sm text-white/75">{member.name_en}</p>

          {(member.position_km || member.position_en) && (
            <span className="relative z-10 mt-3 inline-block rounded-full bg-white/20 px-4 py-1 text-sm font-semibold text-white backdrop-blur-sm">
              {member.position_km || member.position_en}
            </span>
          )}

          {member.section_name_km && (
            <span className="relative z-10 mt-2 inline-block rounded-full bg-white/10 px-3 py-0.5 text-xs font-semibold text-white/90 backdrop-blur-sm">
              <span className="font-kh">{member.section_name_km}</span>
              {member.section_name_en && (
                <span className="ml-1 opacity-80">· {member.section_name_en}</span>
              )}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="px-6 py-6 space-y-5">

          {(member.education || member.years_experience) && (
            <div className="grid grid-cols-2 gap-3">
              {member.education && (
                <div className="rounded-xl border border-divider bg-paper p-3.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div
                      className="flex h-6 w-6 items-center justify-center rounded-lg shrink-0"
                      style={{ background: palette.iconBg }}
                    >
                      <GraduationCap className="h-3.5 w-3.5" style={{ color: palette.iconText }} />
                    </div>
                    <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">
                      Education
                    </span>
                  </div>
                  <p className="text-sm font-medium text-text-heading leading-snug">
                    {member.education}
                  </p>
                </div>
              )}
              {member.years_experience && (
                <div className="rounded-xl border border-divider bg-paper p-3.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div
                      className="flex h-6 w-6 items-center justify-center rounded-lg shrink-0"
                      style={{ background: palette.iconBg }}
                    >
                      <Briefcase className="h-3.5 w-3.5" style={{ color: palette.iconText }} />
                    </div>
                    <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">
                      Experience
                    </span>
                  </div>
                  <p className="text-sm font-medium text-text-heading">
                    {member.years_experience}
                  </p>
                </div>
              )}
            </div>
          )}

          {(member.bio_km || member.bio_en) && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                ប្រវត្តិសង្ខេប · Biography
              </p>
              {member.bio_km && (
                <p className="font-kh text-sm leading-relaxed text-text-body mb-2">
                  {member.bio_km}
                </p>
              )}
              {member.bio_en && member.bio_en !== member.bio_km && (
                <p className="text-sm leading-relaxed text-text-muted">{member.bio_en}</p>
              )}
            </div>
          )}

          {(member.user_email || member.phone) && (
            <div className="rounded-xl border border-divider bg-paper p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                ទំនាក់ទំនង · Contact
              </p>
              {member.user_email && (
                <a
                  href={`mailto:${member.user_email}`}
                  className="flex items-center gap-3 text-sm text-text-body transition-colors hover:text-brand cursor-pointer"
                >
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={{ background: palette.iconBg }}
                  >
                    <Mail className="h-4 w-4" style={{ color: palette.iconText }} />
                  </div>
                  <span>{member.user_email}</span>
                </a>
              )}
              {member.phone && (
                <a
                  href={`tel:${member.phone.replace(/\s/g, "")}`}
                  className="flex items-center gap-3 text-sm text-text-body transition-colors hover:text-brand cursor-pointer"
                >
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={{ background: palette.iconBg }}
                  >
                    <Phone className="h-4 w-4" style={{ color: palette.iconText }} />
                  </div>
                  <span>{member.phone}</span>
                </a>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
