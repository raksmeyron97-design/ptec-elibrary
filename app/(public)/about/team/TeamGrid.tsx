"use client";

import { useState, useEffect, useCallback, useMemo, useRef, useId } from "react";
import Image from "next/image";
import {
  Mail, Phone, GraduationCap, Briefcase, UserCircle, X, Users,
  Star, Languages, Clock, ListChecks,
} from "lucide-react";
import MemberCard, { paletteFor, type Palette } from "@/components/team/MemberCard";
import {
  groupBySection, featuredMembers, sectionCounts, photoAltText,
  type PublicTeamMember, type PublicTeamSection,
} from "@/lib/team/public";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export default function TeamGrid({
  members,
  sections,
}: {
  members: PublicTeamMember[];
  sections: PublicTeamSection[];
}) {
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<{ member: PublicTeamMember; palette: Palette } | null>(null);
  // The element that opened the modal, so focus can return to it on close.
  const triggerRef = useRef<HTMLElement | null>(null);

  const counts = useMemo(() => sectionCounts(members), [members]);
  const featured = useMemo(() => featuredMembers(members), [members]);

  const visibleMembers = useMemo(() => {
    if (filter === "all") return members;
    if (filter === "unsectioned") return members.filter((m) => !m.section_id);
    return members.filter((m) => m.section_id === filter);
  }, [members, filter]);

  const groups = useMemo(
    () => groupBySection(visibleMembers, sections),
    [visibleMembers, sections]
  );

  useEffect(() => {
    if (!selected) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected]);

  useEffect(() => {
    document.body.style.overflow = selected ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [selected]);

  const openMember = useCallback((member: PublicTeamMember, palette: Palette, trigger: HTMLElement) => {
    triggerRef.current = trigger;
    setSelected({ member, palette });
  }, []);

  const close = useCallback(() => {
    setSelected(null);
    triggerRef.current?.focus();
  }, []);

  const paletteForSection = useCallback(
    (sectionId: string | null) => {
      const idx = sectionId ? sections.findIndex((s) => s.id === sectionId) : sections.length;
      return paletteFor(Math.max(idx, 0));
    },
    [sections]
  );

  const hasUnsectioned = members.some((m) => !m.section_id);

  return (
    <>
      {/* ── Section filter ─────────────────────────────────────── */}
      {sections.length > 1 && (
        <div className="mb-10" role="group" aria-label="Filter team members by service area">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <FilterChip
              label="All"
              labelKm="ទាំងអស់"
              count={members.length}
              active={filter === "all"}
              onClick={() => setFilter("all")}
            />
            {sections.map((s) => (
              <FilterChip
                key={s.id}
                label={s.name_en}
                labelKm={s.name_km}
                count={counts[s.id] ?? 0}
                active={filter === s.id}
                onClick={() => setFilter(s.id)}
              />
            ))}
            {hasUnsectioned && (
              <FilterChip
                label="Other"
                labelKm="ផ្សេងទៀត"
                count={counts[""] ?? 0}
                active={filter === "unsectioned"}
                onClick={() => setFilter("unsectioned")}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Featured key contacts ──────────────────────────────── */}
      {filter === "all" && featured.length > 0 && (
        <section aria-labelledby="featured-heading" className="mb-14">
          <div className="mb-6 flex items-center gap-3">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: "#FDF8E7" }}
              aria-hidden="true"
            >
              <Star className="h-4 w-4 fill-current" style={{ color: "#BE9412" }} />
            </span>
            <div>
              <h2 id="featured-heading" className="text-lg font-bold leading-tight text-text-heading">
                Key Contacts
                <span className="font-kh ml-2 text-base font-semibold" style={{ color: "#BE9412" }} lang="km">
                  ទំនាក់ទំនងសំខាន់ៗ
                </span>
              </h2>
              <p className="text-xs text-text-muted">Main staff responsible for library services</p>
            </div>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((member) => {
              const palette = paletteForSection(member.section_id);
              return (
                <MemberCard
                  key={member.id}
                  member={member}
                  palette={palette}
                  onOpen={(trigger) => openMember(member, palette, trigger)}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* ── Grouped grid ───────────────────────────────────────── */}
      <div className="space-y-16" aria-live="polite">
        {groups.length === 0 ? (
          <p role="status" className="rounded-2xl border-2 border-dashed border-divider py-16 text-center text-sm text-text-muted">
            No team members in this service area yet.
          </p>
        ) : (
          groups.map(({ section, members: sectionMembers }) => {
            const palette = paletteForSection(section?.id ?? null);
            return (
              <section
                key={section?.id ?? "unsectioned"}
                aria-labelledby={section ? `section-heading-${section.id}` : "section-heading-other"}
              >
                <SectionHeader section={section} palette={palette} count={sectionMembers.length} />
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {sectionMembers.map((member) => (
                    <MemberCard
                      key={member.id}
                      member={member}
                      palette={palette}
                      onOpen={(trigger) => openMember(member, palette, trigger)}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>

      {selected && (
        <MemberModal member={selected.member} palette={selected.palette} onClose={close} />
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   Filter chip
───────────────────────────────────────────────────────────── */
function FilterChip({
  label, labelKm, count, active, onClick,
}: {
  label: string;
  labelKm?: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
        active
          ? "border-transparent text-white shadow-sm"
          : "border-divider bg-bg-surface text-text-body hover:border-blue-700/40 hover:text-brand"
      }`}
      style={
        active
          ? { background: "linear-gradient(135deg,#1E3A8A 0%,#2A47A6 100%)", "--tw-ring-color": "#1E3A8A" } as React.CSSProperties
          : ({ "--tw-ring-color": "#1E3A8A" } as React.CSSProperties)
      }
    >
      {labelKm && <span className="font-kh" lang="km">{labelKm}</span>}
      <span>{label}</span>
      <span
        className={`rounded-full px-1.5 py-px text-[10px] font-bold ${
          active ? "bg-white/20 text-white" : "bg-paper text-text-muted"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────
   Section header
───────────────────────────────────────────────────────────── */
function SectionHeader({
  section, palette, count,
}: {
  section: PublicTeamSection | null;
  palette: Palette;
  count: number;
}) {
  const headingId = section ? `section-heading-${section.id}` : "section-heading-other";
  return (
    <div className="mb-8">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div
            className="mt-1 h-9 w-1.5 shrink-0 rounded-full"
            style={{ background: palette.gradient }}
            aria-hidden="true"
          />
          <div>
            {section ? (
              <>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <h2
                    id={headingId}
                    className="font-kh text-xl font-bold leading-tight text-text-heading"
                    lang="km"
                  >
                    {section.name_km}
                  </h2>
                  <span className="text-sm font-semibold" style={{ color: palette.accent }}>
                    {section.name_en}
                  </span>
                </div>
                {section.description_en && (
                  <p className="mt-1 max-w-md text-sm text-text-muted">{section.description_en}</p>
                )}
              </>
            ) : (
              <h2 id={headingId} className="text-lg font-bold text-text-heading">
                Other Members
              </h2>
            )}
          </div>
        </div>

        <span
          className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
          style={{ background: palette.badgeBg, color: palette.badgeText }}
        >
          <Users className="h-3 w-3" aria-hidden="true" />
          {count} {count === 1 ? "member" : "members"}
        </span>
      </div>
      <div className="h-px bg-divider" />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Full-profile modal
───────────────────────────────────────────────────────────── */
function MemberModal({
  member, palette, onClose,
}: {
  member: PublicTeamMember;
  palette: Palette;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const responsibilities =
    member.responsibilities_km.length > 0 || member.responsibilities_en.length > 0
      ? { km: member.responsibilities_km, en: member.responsibilities_en }
      : null;

  // Move focus into the dialog on open and trap Tab/Shift+Tab inside it.
  // Restore-on-close focus is handled by the caller (TeamGrid).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const closeButton = dialog.querySelector<HTMLElement>("[data-close-button]");
    closeButton?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    dialog.addEventListener("keydown", handleKeyDown);
    return () => dialog.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    // z-[110]: must sit above the site navbar, which stacks at z-[100].
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center sm:p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-[95vh] w-full overflow-y-auto rounded-t-3xl bg-bg-surface shadow-2xl sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          type="button"
          data-close-button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 cursor-pointer rounded-full bg-black/20 p-1.5 text-white transition hover:bg-black/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label="Close profile dialog"
        >
          <X className="h-5 w-5" aria-hidden="true" />
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
            aria-hidden="true"
          />

          <div
            className="relative z-10 mb-4 h-28 w-28 overflow-hidden rounded-full"
            style={{ boxShadow: "0 0 0 4px rgba(255,255,255,0.25),0 8px 24px rgba(0,0,0,0.3)" }}
          >
            {member.photo_url ? (
              <Image
                src={member.photo_url}
                alt={photoAltText(member)}
                fill
                sizes="112px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-white/10">
                <UserCircle className="h-16 w-16 text-white/60" aria-hidden="true" />
              </div>
            )}
          </div>

          {member.is_featured && (
            <span className="relative z-10 mb-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: "#806211" }}>
              <Star className="h-3 w-3 fill-current" aria-hidden="true" />
              Key Contact
            </span>
          )}

          <h2 id={titleId} className="font-kh relative z-10 text-2xl font-bold leading-snug text-white" lang="km">
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
              <span className="font-kh" lang="km">{member.section_name_km}</span>
              {member.section_name_en && <span className="ml-1 opacity-80">· {member.section_name_en}</span>}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="space-y-5 px-6 py-6">
          {(member.education || member.years_experience) && (
            <div className="grid grid-cols-2 gap-3">
              {member.education && (
                <InfoTile
                  palette={palette}
                  icon={<GraduationCap className="h-3.5 w-3.5" style={{ color: palette.iconText }} />}
                  label="Education · កម្រិតសិក្សា"
                  value={member.education}
                />
              )}
              {member.years_experience && (
                <InfoTile
                  palette={palette}
                  icon={<Briefcase className="h-3.5 w-3.5" style={{ color: palette.iconText }} />}
                  label="Experience · បទពិសោធន៍"
                  value={member.years_experience}
                />
              )}
            </div>
          )}

          {responsibilities && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="font-kh normal-case" lang="km">ភារកិច្ចទទួលខុសត្រូវ</span> · Responsibilities
              </p>
              <ul className="space-y-1.5">
                {(responsibilities.km.length > 0 ? responsibilities.km : responsibilities.en).map(
                  (item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-text-body">
                      <span
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: palette.accent }}
                        aria-hidden="true"
                      />
                      <span className={responsibilities.km.length > 0 ? "font-kh" : ""} lang={responsibilities.km.length > 0 ? "km" : "en"}>
                        {item}
                      </span>
                    </li>
                  )
                )}
              </ul>
              {responsibilities.km.length > 0 && responsibilities.en.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-divider pt-2">
                  {responsibilities.en.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-text-muted">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-divider" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {(member.bio_km || member.bio_en) && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                <span className="font-kh normal-case" lang="km">ប្រវត្តិសង្ខេប</span> · Biography
              </p>
              {member.bio_km && (
                <p className="font-kh mb-2 text-sm leading-relaxed text-text-body" lang="km">
                  {member.bio_km}
                </p>
              )}
              {member.bio_en && member.bio_en !== member.bio_km && (
                <p className="text-sm leading-relaxed text-text-muted">{member.bio_en}</p>
              )}
            </div>
          )}

          {(member.languages.length > 0 || member.working_hours) && (
            <div className="grid grid-cols-2 gap-3">
              {member.languages.length > 0 && (
                <InfoTile
                  palette={palette}
                  icon={<Languages className="h-3.5 w-3.5" style={{ color: palette.iconText }} />}
                  label="Languages · ភាសា"
                  value={member.languages.join(", ")}
                />
              )}
              {member.working_hours && (
                <InfoTile
                  palette={palette}
                  icon={<Clock className="h-3.5 w-3.5" style={{ color: palette.iconText }} />}
                  label="Working Hours · ម៉ោងធ្វើការ"
                  value={member.working_hours}
                />
              )}
            </div>
          )}

          {(member.email || member.phone) && (
            <div className="space-y-3 rounded-xl border border-divider bg-paper p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                <span className="font-kh normal-case" lang="km">ទំនាក់ទំនង</span> · Contact
              </p>
              {member.email && (
                <a
                  href={`mailto:${member.email}`}
                  className="flex cursor-pointer items-center gap-3 rounded text-sm text-text-body transition-colors hover:text-brand focus:outline-none focus-visible:ring-2"
                  style={{ "--tw-ring-color": palette.ring } as React.CSSProperties}
                  aria-label={`Email ${member.name_en} at ${member.email}`}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={{ background: palette.iconBg }}
                    aria-hidden="true"
                  >
                    <Mail className="h-4 w-4" style={{ color: palette.iconText }} />
                  </span>
                  <span className="break-all">{member.email}</span>
                </a>
              )}
              {member.phone && (
                <a
                  href={`tel:${member.phone.replace(/\s/g, "")}`}
                  className="flex cursor-pointer items-center gap-3 rounded text-sm text-text-body transition-colors hover:text-brand focus:outline-none focus-visible:ring-2"
                  style={{ "--tw-ring-color": palette.ring } as React.CSSProperties}
                  aria-label={`Call ${member.name_en} at ${member.phone}`}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={{ background: palette.iconBg }}
                    aria-hidden="true"
                  >
                    <Phone className="h-4 w-4" style={{ color: palette.iconText }} />
                  </span>
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

function InfoTile({
  palette, icon, label, value,
}: {
  palette: Palette;
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-divider bg-paper p-3.5">
      <div className="mb-1.5 flex items-center gap-2">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
          style={{ background: palette.iconBg }}
          aria-hidden="true"
        >
          {icon}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          {label}
        </span>
      </div>
      <p className="text-sm font-medium leading-snug text-text-heading">{value}</p>
    </div>
  );
}
