"use client";

import Image from "next/image";
import {
  Mail, Phone, GraduationCap, Briefcase, Star, ChevronRight,
} from "lucide-react";
import {
  cardSummary, photoAltText, type PublicTeamMember,
} from "@/lib/team/public";

export type Palette = {
  gradient: string;
  ring: string;
  badgeBg: string;
  badgeText: string;
  accent: string;
  iconBg: string;
  iconText: string;
};

// Restricted to PTEC's navy + gold brand scales so the page never reads as
// multicoloured — sections alternate between three brand treatments.
export const PALETTES: Palette[] = [
  {
    gradient: "linear-gradient(135deg,#1E3A8A 0%,#2A47A6 100%)",
    ring: "#1E3A8A", badgeBg: "#EEF2FB", badgeText: "#1E3A8A",
    accent: "#1E3A8A", iconBg: "#EEF2FB", iconText: "#1E3A8A",
  },
  {
    gradient: "linear-gradient(135deg,#DDB022 0%,#BE9412 100%)",
    ring: "#BE9412", badgeBg: "#FDF8E7", badgeText: "#806211",
    accent: "#BE9412", iconBg: "#FDF8E7", iconText: "#806211",
  },
  {
    gradient: "linear-gradient(135deg,#122251 0%,#1E3A8A 100%)",
    ring: "#182E6E", badgeBg: "#EEF2FB", badgeText: "#182E6E",
    accent: "#182E6E", iconBg: "#EEF2FB", iconText: "#182E6E",
  },
];

export function paletteFor(index: number): Palette {
  return PALETTES[index % PALETTES.length];
}

/**
 * One staff card. Used on the public /about/team grid and, in `preview`
 * mode, inside the admin form's live preview panel (non-interactive).
 */
export default function MemberCard({
  member,
  palette,
  onOpen,
  preview = false,
}: {
  member: PublicTeamMember;
  palette: Palette;
  /** Opens the full-profile dialog; receives the button that triggered it. */
  onOpen?: (trigger: HTMLElement) => void;
  preview?: boolean;
}) {
  const displayPosition = member.position_km || member.position_en;
  const summary = cardSummary(member);

  return (
    <article
      className={`group relative flex flex-col overflow-hidden rounded-2xl border border-divider bg-bg-surface transition-all duration-300 ${
        preview ? "" : "hover:-translate-y-1.5 hover:shadow-xl"
      }`}
    >
      {/* Colored header zone */}
      <div className="relative h-[88px] shrink-0" style={{ background: palette.gradient }} aria-hidden="true">
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: "radial-gradient(circle,white 1px,transparent 1px)",
            backgroundSize: "18px 18px",
          }}
        />
        {member.is_featured && (
          <span
            className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ color: "#806211" }}
            aria-hidden="true"
          >
            <Star className="h-3 w-3 fill-current" />
            <span className="font-kh normal-case" lang="km">បុគ្គលិកសំខាន់</span>
          </span>
        )}

        {/* Avatar overlapping the bottom edge */}
        <div className="absolute -bottom-10 left-1/2 -translate-x-1/2">
          <div
            className="relative h-20 w-20 overflow-hidden rounded-full"
            style={{ boxShadow: `0 0 0 3px var(--ptec-bg-surface),0 0 0 5px ${palette.ring}` }}
          >
            {member.photo_url ? (
              <Image
                src={member.photo_url}
                alt={photoAltText(member)}
                fill
                sizes="80px"
                className="object-cover"
                loading={preview ? "eager" : "lazy"}
                unoptimized={preview}
              />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center"
                style={{ background: palette.gradient }}
              >
                <span className="select-none text-2xl font-bold text-white">
                  {(member.name_en || "?").charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Card body */}
      <div className="flex flex-1 flex-col px-5 pb-5 pt-12 text-center">
        <h3 className="font-kh text-base font-bold leading-snug text-text-heading" lang="km">
          {member.name_km || "—"}
          {member.name_en && <span className="font-sans"> · {member.name_en}</span>}
        </h3>

        {displayPosition && (
          <span
            className="mx-auto mt-2 inline-block rounded-full px-3 py-0.5 text-[11px] font-semibold"
            style={{ background: palette.badgeBg, color: palette.badgeText }}
          >
            {displayPosition}
          </span>
        )}

        {(member.section_name_km || member.section_name_en) && (
          <p className="mt-1.5 text-[11px] text-text-muted">
            <span className="font-kh" lang="km">{member.section_name_km}</span>
            {member.section_name_km && member.section_name_en && " · "}
            {member.section_name_en}
          </p>
        )}

        {(member.education || member.years_experience) && (
          <div className="mt-4 space-y-1.5 text-left">
            {member.education && (
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <GraduationCap className="h-3.5 w-3.5 shrink-0" style={{ color: palette.accent }} aria-hidden="true" />
                <span className="truncate">{member.education}</span>
              </div>
            )}
            {member.years_experience && (
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <Briefcase className="h-3.5 w-3.5 shrink-0" style={{ color: palette.accent }} aria-hidden="true" />
                <span>{member.years_experience}</span>
              </div>
            )}
          </div>
        )}

        {summary && (
          <p
            className={`mt-3 flex-1 text-left text-xs leading-relaxed text-text-body line-clamp-2 ${summary.lang === "km" ? "font-kh" : ""}`}
            lang={summary.lang}
          >
            {summary.text}
          </p>
        )}

        <div className="mt-auto space-y-2 border-t border-divider pt-4">
          {member.email && (
            <a
              href={preview ? undefined : `mailto:${member.email}`}
              className="flex items-center gap-2 rounded text-xs text-text-muted transition-colors hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
              style={{ "--tw-ring-color": palette.ring } as React.CSSProperties}
              aria-label={`Email ${member.name_en} at ${member.email}`}
              tabIndex={preview ? -1 : undefined}
            >
              <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{member.email}</span>
            </a>
          )}
          {member.phone && (
            <a
              href={preview ? undefined : `tel:${member.phone.replace(/\s/g, "")}`}
              className="flex items-center gap-2 rounded text-xs text-text-muted transition-colors hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
              style={{ "--tw-ring-color": palette.ring } as React.CSSProperties}
              aria-label={`Call ${member.name_en} at ${member.phone}`}
              tabIndex={preview ? -1 : undefined}
            >
              <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{member.phone}</span>
            </a>
          )}

          <button
            type="button"
            disabled={preview}
            onClick={(e) => onOpen?.(e.currentTarget)}
            className="mt-2 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-default"
            style={{ background: palette.gradient, "--tw-ring-color": palette.ring } as React.CSSProperties}
          >
            <span className="font-kh" lang="km">មើលប្រវត្តិរូប</span>
            <span aria-hidden="true">·</span>
            View Profile
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
}
