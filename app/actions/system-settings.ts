"use server";

// Server Actions for the System Settings platform (/admin/system-settings).
//
// Workflow: Draft → Validate → Publish (→ history) → Rollback.
// Every mutation:
//   • re-authorizes with requirePermission("settings", "write") — the UI
//     hiding a button is never the enforcement layer,
//   • validates + normalizes the document server-side (schemas.ts),
//   • writes an admin_audit_log entry,
//   • on publish/rollback only: bumps the immutable version history and
//     invalidates the public site-config cache. Saving a draft NEVER touches
//     the public site.

import { requirePermission, isAdminAuthError } from "@/lib/auth/requireAdmin";
import { logAdminAction } from "@/app/actions/audit";
import { revalidateSiteConfig } from "@/lib/cache/revalidate";
import {
  diffPaths,
  isSettingSection,
  validateSectionDoc,
} from "@/lib/system-settings/schemas";
import { DEFAULT_SECTION_DOCS } from "@/lib/system-settings/defaults";
import type { FieldError } from "@/lib/system-settings/types";

export type SettingsActionResult =
  | {
      ok: true;
      publishedVersion?: number;
      /** Set when the write succeeded but the public caches could NOT be
       *  purged. The UI must surface this instead of a clean success toast:
       *  the new version IS live in the database, yet visitors keep seeing the
       *  previous values until the ISR window lapses. */
      cacheWarning?: string;
    }
  | { ok: false; error: string; fieldErrors?: FieldError[] };

const MIGRATION_HINT =
  "Settings storage is not ready — apply migration 0098_system_settings.sql first.";

function failure(e: unknown): SettingsActionResult {
  if (isAdminAuthError(e)) {
    return { ok: false, error: "You are not authorized to manage system settings." };
  }
  console.error("[system-settings] action failed:", e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

/** Table-missing errors (migration 0098 pending) get a precise message. */
function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "PGRST205";
}

/**
 * Purge the public caches after a successful publish/rollback. Never throws:
 * the database write has already committed, so turning a cache-purge failure
 * into a thrown action would report "something went wrong" for a change that
 * actually went live. Instead it returns a warning the UI shows verbatim.
 */
function invalidatePublicCaches(): string | undefined {
  try {
    revalidateSiteConfig();
    return undefined;
  } catch (e) {
    console.error("[system-settings] cache invalidation failed after publish:", e);
    return (
      "The new version is saved and live in the database, but the public page " +
      "cache could not be refreshed. Visitors may keep seeing the previous " +
      "values for up to an hour. Re-publish, or redeploy, to force a refresh."
    );
  }
}

/**
 * Record a publish/rollback that was REFUSED. Successful publishes are already
 * audited; a refusal is the more interesting security event (a stale editor
 * overwriting a colleague, an invalid document, a version that no longer
 * validates) and used to leave no trace at all. Failures here are swallowed —
 * an audit-log outage must never turn a clean refusal into a 500.
 */
async function auditFailedAttempt(
  userId: string,
  action: "settings.publish_failed" | "settings.rollback_failed",
  section: string,
  reason: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  try {
    await logAdminAction(userId, action, "site_settings", section, { reason, ...extra });
  } catch (e) {
    console.error("[system-settings] failed-attempt audit write failed:", e);
  }
}

// ── Save draft ───────────────────────────────────────────────────────────────

export async function saveSettingsDraft(
  section: string,
  doc: unknown,
): Promise<SettingsActionResult> {
  try {
    const { supabase, userId } = await requirePermission("settings", "write");
    if (!isSettingSection(section)) return { ok: false, error: "Unknown settings section." };

    const parsed = validateSectionDoc(section, doc);
    if (!parsed.ok) {
      return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: parsed.errors };
    }

    // UPDATE first, INSERT only when the row is genuinely missing — an upsert
    // would overwrite the LIVE `published` column on conflict. The migration
    // seeds every section, so the INSERT path only covers sections added later.
    const now = new Date().toISOString();
    const { data: updated, error } = await supabase
      .from("site_settings")
      .update({
        draft: parsed.value,
        draft_saved_at: now,
        draft_saved_by: userId,
        updated_at: now,
      })
      .eq("section", section)
      .select("section");
    if (error) {
      if (isMissingTable(error)) return { ok: false, error: MIGRATION_HINT };
      throw new Error(error.message);
    }
    if (!updated?.length) {
      const { error: insertError } = await supabase.from("site_settings").insert({
        section,
        draft: parsed.value,
        draft_saved_at: now,
        draft_saved_by: userId,
        published: DEFAULT_SECTION_DOCS[section],
      });
      if (insertError) throw new Error(insertError.message);
    }

    await logAdminAction(userId, "settings.draft_saved", "site_settings", section);
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

// ── Discard draft ────────────────────────────────────────────────────────────

export async function discardSettingsDraft(section: string): Promise<SettingsActionResult> {
  try {
    const { supabase, userId } = await requirePermission("settings", "write");
    if (!isSettingSection(section)) return { ok: false, error: "Unknown settings section." };

    const { error } = await supabase
      .from("site_settings")
      .update({
        draft: null,
        draft_saved_at: null,
        draft_saved_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq("section", section);
    if (error) {
      if (isMissingTable(error)) return { ok: false, error: MIGRATION_HINT };
      throw new Error(error.message);
    }

    await logAdminAction(userId, "settings.draft_discarded", "site_settings", section);
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

// ── Publish ──────────────────────────────────────────────────────────────────

export async function publishSettingsSection(
  section: string,
  options: { expectedVersion: number; comment?: string },
): Promise<SettingsActionResult> {
  try {
    const { supabase, userId } = await requirePermission("settings", "write");
    if (!isSettingSection(section)) return { ok: false, error: "Unknown settings section." };

    const comment = (options.comment ?? "").trim().slice(0, 500) || null;

    const { data: row, error: readError } = await supabase
      .from("site_settings")
      .select("draft, published, published_version")
      .eq("section", section)
      .maybeSingle();
    if (readError) {
      if (isMissingTable(readError)) return { ok: false, error: MIGRATION_HINT };
      throw new Error(readError.message);
    }
    if (!row) {
      await auditFailedAttempt(userId, "settings.publish_failed", section, "section_not_initialized");
      return { ok: false, error: "This section has not been initialized yet." };
    }
    if (!row.draft) {
      await auditFailedAttempt(userId, "settings.publish_failed", section, "no_draft");
      return { ok: false, error: "There is no draft to publish." };
    }
    if (row.published_version !== options.expectedVersion) {
      await auditFailedAttempt(userId, "settings.publish_failed", section, "version_conflict", {
        expectedVersion: options.expectedVersion,
        actualVersion: row.published_version,
      });
      return {
        ok: false,
        error: "Someone else published this section while you were editing. Reload and review before publishing.",
      };
    }

    // Never trust the stored draft blindly — re-validate at publish time.
    const parsed = validateSectionDoc(section, row.draft);
    if (!parsed.ok) {
      await auditFailedAttempt(userId, "settings.publish_failed", section, "validation_failed", {
        fields: parsed.errors.map((e) => e.path),
      });
      return { ok: false, error: "The draft has validation problems.", fieldErrors: parsed.errors };
    }

    const changedFields = diffPaths(row.published, parsed.value);
    if (changedFields.length === 0) {
      // Nothing to publish — clear the redundant draft instead.
      await discardSettingsDraft(section);
      return { ok: false, error: "The draft is identical to the published version — nothing to publish." };
    }

    const newVersion = row.published_version + 1;

    // Optimistic-concurrency guard: the UPDATE only applies if the version is
    // still the one this editor saw. A concurrent publish makes it a no-op.
    const { data: updated, error: updateError } = await supabase
      .from("site_settings")
      .update({
        published: parsed.value,
        published_version: newVersion,
        published_at: new Date().toISOString(),
        published_by: userId,
        draft: null,
        draft_saved_at: null,
        draft_saved_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq("section", section)
      .eq("published_version", options.expectedVersion)
      .select("published_version");
    if (updateError) throw new Error(updateError.message);
    if (!updated?.length) {
      await auditFailedAttempt(userId, "settings.publish_failed", section, "version_conflict_on_write", {
        expectedVersion: options.expectedVersion,
      });
      return {
        ok: false,
        error: "Someone else published this section while you were editing. Reload and review before publishing.",
      };
    }

    // History row. unique(section, version) makes double-inserts impossible.
    const { error: versionError } = await supabase.from("site_setting_versions").insert({
      section,
      version: newVersion,
      snapshot: parsed.value,
      action: "publish",
      changed_fields: changedFields,
      comment,
      published_by: userId,
    });
    if (versionError) {
      // The publish itself succeeded; a missing history row is worth surfacing
      // loudly in logs but must not roll the site back.
      console.error("[system-settings] version history insert failed:", versionError);
    }

    await logAdminAction(userId, "settings.published", "site_settings", section, {
      version: newVersion,
      changedFields,
      comment,
    });
    const cacheWarning = invalidatePublicCaches();
    return { ok: true, publishedVersion: newVersion, cacheWarning };
  } catch (e) {
    return failure(e);
  }
}

// ── Rollback ─────────────────────────────────────────────────────────────────

export async function rollbackSettingsSection(
  section: string,
  toVersion: number,
): Promise<SettingsActionResult> {
  try {
    const { supabase, userId } = await requirePermission("settings", "write");
    if (!isSettingSection(section)) return { ok: false, error: "Unknown settings section." };
    if (!Number.isInteger(toVersion) || toVersion < 1) {
      return { ok: false, error: "Invalid version." };
    }

    const [{ data: row, error: readError }, { data: target, error: targetError }] =
      await Promise.all([
        supabase
          .from("site_settings")
          .select("published, published_version")
          .eq("section", section)
          .maybeSingle(),
        supabase
          .from("site_setting_versions")
          .select("snapshot, version")
          .eq("section", section)
          .eq("version", toVersion)
          .maybeSingle(),
      ]);
    if (readError) {
      if (isMissingTable(readError)) return { ok: false, error: MIGRATION_HINT };
      throw new Error(readError.message);
    }
    if (targetError) throw new Error(targetError.message);
    if (!row) {
      await auditFailedAttempt(userId, "settings.rollback_failed", section, "section_not_initialized");
      return { ok: false, error: "This section has not been initialized yet." };
    }
    if (!target) {
      await auditFailedAttempt(userId, "settings.rollback_failed", section, "version_not_found", { toVersion });
      return { ok: false, error: `Version ${toVersion} was not found.` };
    }
    if (toVersion === row.published_version) {
      return { ok: false, error: `Version ${toVersion} is already the published version.` };
    }

    // Historical snapshots must still satisfy today's schema to go live.
    const parsed = validateSectionDoc(section, target.snapshot);
    if (!parsed.ok) {
      await auditFailedAttempt(userId, "settings.rollback_failed", section, "snapshot_no_longer_valid", {
        toVersion,
        fields: parsed.errors.map((e) => e.path),
      });
      return {
        ok: false,
        error: "That version no longer matches the current settings format and cannot be restored.",
        fieldErrors: parsed.errors,
      };
    }

    const changedFields = diffPaths(row.published, parsed.value);
    const newVersion = row.published_version + 1;

    const { data: updated, error: updateError } = await supabase
      .from("site_settings")
      .update({
        published: parsed.value,
        published_version: newVersion,
        published_at: new Date().toISOString(),
        published_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq("section", section)
      .eq("published_version", row.published_version)
      .select("published_version");
    if (updateError) throw new Error(updateError.message);
    if (!updated?.length) {
      await auditFailedAttempt(userId, "settings.rollback_failed", section, "version_conflict_on_write", { toVersion });
      return { ok: false, error: "The section changed while rolling back. Reload and try again." };
    }

    const { error: versionError } = await supabase.from("site_setting_versions").insert({
      section,
      version: newVersion,
      snapshot: parsed.value,
      action: "rollback",
      restored_from: toVersion,
      changed_fields: changedFields,
      comment: `Rolled back to version ${toVersion}`,
      published_by: userId,
    });
    if (versionError) {
      console.error("[system-settings] rollback history insert failed:", versionError);
    }

    await logAdminAction(userId, "settings.rolled_back", "site_settings", section, {
      version: newVersion,
      restoredFrom: toVersion,
      changedFields,
    });
    const cacheWarning = invalidatePublicCaches();
    return { ok: true, publishedVersion: newVersion, cacheWarning };
  } catch (e) {
    return failure(e);
  }
}
