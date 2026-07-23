// lib/system-settings/admin.ts
//
// Server-only read model for the /admin/system-settings workspace: every
// section's draft + published state, publication history, and the display
// names of the editors involved. Authorization is the CALLER's job (the page
// checks requirePermission("settings", "read"); mutations live in
// app/actions/system-settings.ts and re-check "write").

import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_SECTION_DOCS } from "./defaults";
import { validateSectionDoc } from "./schemas";
import {
  SETTING_SECTIONS,
  type SectionDocMap,
  type SectionState,
  type SettingSection,
  type SettingVersionRow,
  type SettingsWorkspaceData,
} from "./types";

type SettingsRow = {
  section: string;
  draft: unknown;
  draft_saved_at: string | null;
  draft_saved_by: string | null;
  published: unknown;
  published_version: number;
  published_at: string | null;
  published_by: string | null;
};

type VersionRow = {
  id: string;
  section: string;
  version: number;
  action: string;
  restored_from: number | null;
  changed_fields: string[] | null;
  comment: string | null;
  published_at: string;
  published_by: string | null;
};

/**
 * Bring a STORED document up to the current shape before it reaches the forms.
 *
 * Stored JSONB is whatever the schema looked like on the day it was written.
 * The `seo` document seeded by migration 0098, for example, has no
 * `verification` and no `indexingEnabled` — those fields were added later. The
 * workspace used to cast the raw row straight to the TypeScript type, so the
 * SEO form read `doc.verification.google` on an object with no `verification`
 * key and the whole page crashed with "Cannot read properties of undefined".
 *
 * The public site never had this problem: getSiteConfig() goes through
 * validateSectionDoc() + the mapper, which fill missing optional fields in.
 * This does the same for the admin read model, so the forms always receive a
 * complete document and every future added field is handled the same way.
 *
 * When a document cannot be validated at all (genuine corruption, or a draft
 * an older build wrote), the raw values are merged OVER the defaults — two
 * levels deep, because the nested groups (`verification`, `address`,
 * `siteDescription`, `name`) are exactly where partial documents bite. That
 * keeps the editor's work visible and fixable instead of silently discarding
 * it; the form's own validation then flags whatever is still wrong.
 */
function hydrateSectionDoc<S extends SettingSection>(
  section: S,
  stored: unknown,
): SectionDocMap[S] {
  const fallback = DEFAULT_SECTION_DOCS[section];
  if (stored === null || stored === undefined) return fallback;

  const parsed = validateSectionDoc(section, stored);
  if (parsed.ok) return parsed.value as SectionDocMap[S];

  console.error(
    `[system-settings] stored "${section}" document does not validate — ` +
      "merging it over the defaults so the form still renders",
    parsed.errors.slice(0, 3),
  );
  return mergeOverDefaults(fallback, stored) as SectionDocMap[S];
}

/** Two-level merge of an untrusted document over a known-complete default. */
function mergeOverDefaults(fallback: unknown, stored: unknown): unknown {
  if (!isPlainObject(fallback) || !isPlainObject(stored)) return fallback;
  const out: Record<string, unknown> = { ...fallback };
  for (const [key, value] of Object.entries(stored)) {
    if (value === undefined) continue;
    const base = fallback[key];
    out[key] =
      isPlainObject(base) && isPlainObject(value) ? { ...base, ...value } : value;
  }
  return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function defaultSectionState<S extends SettingSection>(section: S): SectionState<S> {
  return {
    section,
    draft: null,
    draftSavedAt: null,
    draftSavedBy: null,
    published: DEFAULT_SECTION_DOCS[section],
    publishedVersion: 0,
    publishedAt: null,
    publishedBy: null,
  };
}

export async function getSettingsWorkspace(canWrite: boolean): Promise<SettingsWorkspaceData> {
  const supabase = createServiceClient();

  const sections = Object.fromEntries(
    SETTING_SECTIONS.map((s) => [s, defaultSectionState(s)]),
  ) as SettingsWorkspaceData["sections"];

  let storageReady = true;
  const actorIds = new Set<string>();
  let versions: SettingVersionRow[] = [];

  const [{ data: rows, error: rowsError }, { data: versionRows, error: versionsError }] =
    await Promise.all([
      supabase
        .from("site_settings")
        .select(
          "section, draft, draft_saved_at, draft_saved_by, published, published_version, published_at, published_by",
        ),
      supabase
        .from("site_setting_versions")
        .select(
          "id, section, version, action, restored_from, changed_fields, comment, published_at, published_by",
        )
        .order("published_at", { ascending: false })
        .limit(100),
    ]);

  if (rowsError) {
    // PGRST205 = table missing → migration 0098 not applied yet. The
    // workspace renders read-only defaults with a setup notice.
    storageReady = false;
  } else {
    for (const row of (rows ?? []) as SettingsRow[]) {
      const section = row.section as SettingSection;
      if (!(SETTING_SECTIONS as readonly string[]).includes(section)) continue;
      sections[section] = {
        section,
        // `draft` stays null when there is no pending draft — hydrating it
        // would invent one and light up the "unsaved changes" state.
        draft: row.draft == null ? null : hydrateSectionDoc(section, row.draft),
        draftSavedAt: row.draft_saved_at,
        draftSavedBy: row.draft_saved_by,
        published: hydrateSectionDoc(section, row.published),
        publishedVersion: row.published_version,
        publishedAt: row.published_at,
        publishedBy: row.published_by,
      } as never;
      if (row.draft_saved_by) actorIds.add(row.draft_saved_by);
      if (row.published_by) actorIds.add(row.published_by);
    }
  }

  if (!versionsError && versionRows) {
    versions = (versionRows as VersionRow[]).map((v) => {
      if (v.published_by) actorIds.add(v.published_by);
      return {
        id: v.id,
        section: v.section as SettingSection,
        version: v.version,
        action: (v.action as SettingVersionRow["action"]) ?? "publish",
        restoredFrom: v.restored_from,
        changedFields: v.changed_fields ?? [],
        comment: v.comment,
        publishedAt: v.published_at,
        publishedBy: v.published_by,
      };
    });
  }

  const actorNames: Record<string, string> = {};
  if (actorIds.size > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", [...actorIds]);
    for (const p of (profiles ?? []) as { id: string; full_name: string | null; email: string | null }[]) {
      actorNames[p.id] = p.full_name || p.email || "Unknown";
    }
  }

  return { sections, storageReady, canWrite, versions, actorNames };
}
