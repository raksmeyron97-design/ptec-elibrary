"use client";

// Settings overview: configuration health at a glance — per-section publish
// state, pending drafts, missing translations, upcoming closures — with a
// jump-link from every warning to the section that fixes it.

import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  FileClock,
  History,
} from "lucide-react";
import type {
  SettingSection,
  SettingsWorkspaceData,
} from "@/lib/system-settings/types";
import { upcomingClosures } from "@/lib/system-settings/hours";

const SECTION_LABELS: Record<SettingSection, string> = {
  organization: "Organization",
  contact: "Contact Information",
  hours: "Library Hours",
  links: "Social & External Links",
  seo: "SEO & Sharing",
};

export function sectionLabel(section: SettingSection): string {
  return SECTION_LABELS[section];
}

type Warning = { section: SettingSection; message: string };

/** Pure health checks over the PUBLISHED documents (what visitors see). */
export function computeWarnings(data: SettingsWorkspaceData): Warning[] {
  const warnings: Warning[] = [];
  const { organization, contact, hours, links, seo } = {
    organization: data.sections.organization.published,
    contact: data.sections.contact.published,
    hours: data.sections.hours.published,
    links: data.sections.links.published,
    seo: data.sections.seo.published,
  };

  if (!organization.name.km) {
    warnings.push({ section: "organization", message: "Khmer institution name is missing." });
  }
  if (!contact.address.km) {
    warnings.push({ section: "contact", message: "Khmer address is missing." });
  }
  if (!seo.siteDescription.km) {
    warnings.push({
      section: "seo",
      message: "Khmer site description is empty — English is shown to Khmer visitors.",
    });
  }
  if (!links.mapEmbed) {
    warnings.push({ section: "links", message: "No Google Maps embed URL — footer and contact maps are hidden." });
  }
  if (!links.youtube) {
    warnings.push({ section: "links", message: "YouTube link is empty — the footer YouTube icon is hidden." });
  }
  const openDays = Object.values(hours.weekly).filter((d) => d.length > 0).length;
  if (openDays === 0) {
    warnings.push({ section: "hours", message: "No opening hours configured — the library shows as always closed." });
  }
  return warnings;
}

export default function OverviewPanel({
  data,
  onNavigate,
}: {
  data: SettingsWorkspaceData;
  onNavigate: (section: SettingSection | "versions") => void;
}) {
  const warnings = computeWarnings(data);
  const sections = Object.values(data.sections);
  const draftsPending = sections.filter((s) => s.draft !== null);
  const lastPublished = sections
    .filter((s) => s.publishedAt)
    .sort((a, b) => (b.publishedAt! < a.publishedAt! ? -1 : 1))[0];
  const closures = upcomingClosures(new Date(), data.sections.hours.published.closures);

  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString("en-GB", {
          day: "numeric", month: "short", year: "numeric",
          hour: "2-digit", minute: "2-digit", timeZone: "Asia/Phnom_Penh",
        })
      : "—";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-text-heading">Overview</h2>
        <p className="mt-1 text-sm text-slate-500">
          Health of the published site configuration. Draft changes never affect the public
          site until they are published.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-divider bg-bg-surface p-4">
          <div className="flex items-center gap-2 text-slate-500">
            <FileClock className="h-4 w-4" aria-hidden="true" />
            <p className="text-xs font-semibold uppercase tracking-wide">Pending drafts</p>
          </div>
          <p className="mt-2 text-2xl font-bold text-text-heading">{draftsPending.length}</p>
          {draftsPending.length > 0 && (
            <p className="mt-1 truncate text-xs text-slate-500">
              {draftsPending.map((s) => SECTION_LABELS[s.section]).join(", ")}
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-divider bg-bg-surface p-4">
          <div className="flex items-center gap-2 text-slate-500">
            <History className="h-4 w-4" aria-hidden="true" />
            <p className="text-xs font-semibold uppercase tracking-wide">Last published</p>
          </div>
          <p className="mt-2 text-sm font-bold text-text-heading">
            {lastPublished ? SECTION_LABELS[lastPublished.section] : "—"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {fmt(lastPublished?.publishedAt ?? null)}
            {lastPublished?.publishedBy &&
              ` · ${data.actorNames[lastPublished.publishedBy] ?? "Unknown"}`}
          </p>
        </div>
        <div className="rounded-2xl border border-divider bg-bg-surface p-4">
          <div className="flex items-center gap-2 text-slate-500">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <p className="text-xs font-semibold uppercase tracking-wide">Warnings</p>
          </div>
          <p className="mt-2 text-2xl font-bold text-text-heading">{warnings.length}</p>
        </div>
        <div className="rounded-2xl border border-divider bg-bg-surface p-4">
          <div className="flex items-center gap-2 text-slate-500">
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            <p className="text-xs font-semibold uppercase tracking-wide">Upcoming closures</p>
          </div>
          <p className="mt-2 text-2xl font-bold text-text-heading">{closures.length}</p>
          {closures[0] && (
            <p className="mt-1 truncate text-xs text-slate-500">
              Next: {closures[0].from}
              {closures[0].to !== closures[0].from && ` → ${closures[0].to}`}
            </p>
          )}
        </div>
      </div>

      {/* Warnings list */}
      <div className="rounded-2xl border border-divider bg-bg-surface">
        <div className="border-b border-divider px-5 py-3">
          <h3 className="text-sm font-bold text-text-heading">Configuration health</h3>
        </div>
        {warnings.length === 0 ? (
          <div className="flex items-center gap-2 px-5 py-4 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Everything looks complete — no warnings.
          </div>
        ) : (
          <ul className="divide-y divide-divider">
            {warnings.map((w, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onNavigate(w.section)}
                  className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <span className="flex items-center gap-2.5">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
                    {w.message}
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand">
                    {SECTION_LABELS[w.section]}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Per-section state */}
      <div className="rounded-2xl border border-divider bg-bg-surface">
        <div className="border-b border-divider px-5 py-3">
          <h3 className="text-sm font-bold text-text-heading">Sections</h3>
        </div>
        <ul className="divide-y divide-divider">
          {sections.map((s) => (
            <li key={s.section}>
              <button
                type="button"
                onClick={() => onNavigate(s.section)}
                className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-heading">
                    {SECTION_LABELS[s.section]}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {s.publishedVersion > 0
                      ? `Version ${s.publishedVersion} · published ${fmt(s.publishedAt)}${
                          s.publishedBy ? ` by ${data.actorNames[s.publishedBy] ?? "Unknown"}` : ""
                        }`
                      : "Serving code defaults (never published)"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {s.draft !== null && (
                    <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
                      Draft pending
                    </span>
                  )}
                  <ArrowRight className="h-4 w-4 text-slate-300" aria-hidden="true" />
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
