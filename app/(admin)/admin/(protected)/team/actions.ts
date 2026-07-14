"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { logAdminAction } from "@/app/actions/audit";
import { isAllowedTeamPhotoUrl } from "@/lib/team/photo";
import { revalidateLocalizedPath as revalidatePath } from "@/lib/cache/revalidate";

// ── Types ──────────────────────────────────────────────────────────────

export type TeamSection = {
  id: string;
  name_km: string;
  name_en: string;
  description_km: string | null;
  description_en: string | null;
  display_order: number;
  /** Post-0070; undefined until the migration is applied. */
  is_active?: boolean;
};

export type TeamMemberRow = {
  id: string;
  user_id: string | null;
  section_id: string | null;
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
  display_order: number;
  is_published: boolean;
  created_at: string;
  updated_at?: string;
  // Post-0070 fields; undefined until the migration is applied.
  photo_alt?: string | null;
  short_bio_km?: string | null;
  short_bio_en?: string | null;
  responsibilities_km?: string[];
  responsibilities_en?: string[];
  languages?: string[];
  working_hours?: string | null;
  is_featured?: boolean;
  show_phone_publicly?: boolean;
  show_email_publicly?: boolean;
  // Joined fields from the view
  user_email?: string | null;
  user_full_name?: string | null;
  section_name_km?: string | null;
  section_name_en?: string | null;
};

export type ProfileOption = {
  id: string;
  email: string;
  full_name: string | null;
};

export type ActionResult = { success: true } | { error: string };

// ── Fetchers ───────────────────────────────────────────────────────────

export async function getTeamSections(): Promise<TeamSection[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("team_sections")
    .select("*")
    .order("display_order", { ascending: true });
  return (data ?? []) as TeamSection[];
}

export async function getAllProfiles(): Promise<ProfileOption[]> {
  await requireAdmin();
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .order("full_name", { ascending: true });
  return (data ?? []).map((p) => ({
    id: p.id,
    email: p.email ?? "",
    full_name: p.full_name ?? null,
  }));
}

// ── Validation & payload ───────────────────────────────────────────────

const TEXT_MAX = 200;
const BIO_MAX = 4000;
const SHORT_BIO_MAX = 300;
const LIST_MAX_ITEMS = 12;

function str(data: FormData, key: string, max = TEXT_MAX): string | null {
  const value = (data.get(key) as string | null)?.trim() ?? "";
  if (!value) return null;
  return value.slice(0, max);
}

/** Newline-separated textarea → trimmed string array. */
function list(data: FormData, key: string): string[] {
  const raw = (data.get(key) as string | null) ?? "";
  return raw
    .split("\n")
    .map((line) => line.trim().slice(0, TEXT_MAX))
    .filter(Boolean)
    .slice(0, LIST_MAX_ITEMS);
}

async function validateSectionId(sectionId: string | null): Promise<string | null> {
  if (!sectionId) return null;
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("team_sections")
    .select("id")
    .eq("id", sectionId)
    .maybeSingle();
  if (!data) throw new Error("Selected section no longer exists.");
  return sectionId;
}

/** Fields that exist only after migration 0070. */
const POST_0070_FIELDS = [
  "photo_alt", "short_bio_km", "short_bio_en",
  "responsibilities_km", "responsibilities_en", "languages",
  "working_hours", "is_featured", "show_phone_publicly", "show_email_publicly",
] as const;

async function buildPayload(data: FormData) {
  const name_km = str(data, "name_km");
  const name_en = str(data, "name_en");
  if (!name_km) throw new Error("Khmer name is required.");
  if (!name_en) throw new Error("Latin name is required.");

  const displayOrder = Number(data.get("display_order") ?? 0);
  if (!Number.isFinite(displayOrder) || displayOrder < 0) {
    throw new Error("Display order must be a non-negative number.");
  }

  const photo_url = str(data, "photo_url", 600);
  if (photo_url && !isAllowedTeamPhotoUrl(photo_url)) {
    throw new Error("Photo URL must come from library storage.");
  }

  const section_id = await validateSectionId(str(data, "section_id", 64));

  return {
    user_id:          str(data, "user_id", 64),
    section_id,
    name_km,
    name_en,
    position_km:      str(data, "position_km"),
    position_en:      str(data, "position_en"),
    education:        str(data, "education"),
    years_experience: str(data, "years_experience", 60),
    phone:            str(data, "phone", 40),
    bio_km:           str(data, "bio_km", BIO_MAX),
    bio_en:           str(data, "bio_en", BIO_MAX),
    photo_url,
    display_order:    Math.floor(displayOrder),
    is_published:     data.get("is_published") === "true",
    // Post-0070 fields (stripped automatically if the migration isn't applied)
    photo_alt:            str(data, "photo_alt"),
    short_bio_km:         str(data, "short_bio_km", SHORT_BIO_MAX),
    short_bio_en:         str(data, "short_bio_en", SHORT_BIO_MAX),
    responsibilities_km:  list(data, "responsibilities_km"),
    responsibilities_en:  list(data, "responsibilities_en"),
    languages:            list(data, "languages"),
    working_hours:        str(data, "working_hours", 120),
    is_featured:          data.get("is_featured") === "true",
    show_phone_publicly:  data.get("show_phone_publicly") === "true",
    show_email_publicly:  data.get("show_email_publicly") === "true",
  };
}

/**
 * Writes with the full payload; if the DB predates migration 0070
 * (PGRST204 = unknown column on write), retries with the legacy field set.
 */
async function writeMember(
  payload: Awaited<ReturnType<typeof buildPayload>>,
  write: (body: Record<string, unknown>) => Promise<{ error: { code?: string; message: string } | null }>
) {
  const { error } = await write(payload);
  if (!error) return;
  if (error.code === "PGRST204") {
    const legacy: Record<string, unknown> = { ...payload };
    for (const field of POST_0070_FIELDS) delete legacy[field];
    const retry = await write(legacy);
    if (retry.error) throw new Error(retry.error.message);
    return;
  }
  throw new Error(error.message);
}

function revalidateTeam() {
  revalidatePath("/admin/team");
  revalidatePath("/admin/team/sections");
  revalidatePath("/about/team");
}

function toResult(err: unknown): ActionResult {
  return { error: err instanceof Error ? err.message : "Something went wrong." };
}

// ── Member CRUD ────────────────────────────────────────────────────────

export async function createTeamMember(data: FormData): Promise<ActionResult> {
  try {
    const { userId } = await requireAdmin();
    const supabase = createServiceClient();
    const payload = await buildPayload(data);

    await writeMember(payload, async (body) => {
      const { error } = await supabase.from("team_members").insert(body);
      return { error };
    });

    await logAdminAction(userId, "team_member.create", "team_members", undefined, {
      name_en: payload.name_en,
    });
    revalidateTeam();
    return { success: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function updateTeamMember(id: string, data: FormData): Promise<ActionResult> {
  try {
    const { userId } = await requireAdmin();
    const supabase = createServiceClient();
    const payload = await buildPayload(data);

    await writeMember(payload, async (body) => {
      const { error } = await supabase.from("team_members").update(body).eq("id", id);
      return { error };
    });

    await logAdminAction(userId, "team_member.update", "team_members", id, {
      name_en: payload.name_en,
    });
    revalidateTeam();
    return { success: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function duplicateTeamMember(id: string): Promise<ActionResult> {
  try {
    const { userId } = await requireAdmin();
    const supabase = createServiceClient();

    const { data: original, error } = await supabase
      .from("team_members")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !original) throw new Error("Member not found.");

    const copy = { ...(original as Record<string, unknown>) };
    // Never copy identity, timestamps, or the linked user account.
    delete copy.id;
    delete copy.created_at;
    delete copy.updated_at;
    delete copy.user_id;

    const { error: insertError } = await supabase.from("team_members").insert({
      ...copy,
      name_en: `${original.name_en} (copy)`,
      is_published: false, // duplicates always start as drafts
    });
    if (insertError) throw new Error(insertError.message);

    await logAdminAction(userId, "team_member.duplicate", "team_members", id);
    revalidateTeam();
    return { success: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function deleteTeamMember(id: string): Promise<ActionResult> {
  try {
    const { userId } = await requireAdmin();
    const supabase = createServiceClient();

    const { error } = await supabase.from("team_members").delete().eq("id", id);
    if (error) throw new Error(error.message);

    await logAdminAction(userId, "team_member.delete", "team_members", id);
    revalidateTeam();
    return { success: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function toggleTeamMemberPublished(id: string, isPublished: boolean): Promise<ActionResult> {
  try {
    const { userId } = await requireAdmin();
    const supabase = createServiceClient();

    const { error } = await supabase
      .from("team_members")
      .update({ is_published: isPublished })
      .eq("id", id);
    if (error) throw new Error(error.message);

    await logAdminAction(
      userId,
      isPublished ? "team_member.publish" : "team_member.unpublish",
      "team_members",
      id
    );
    revalidateTeam();
    return { success: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function reorderTeamMember(id: string, direction: "up" | "down") {
  await requireAdmin();
  const supabase = createServiceClient();

  const { data: members } = await supabase
    .from("team_members")
    .select("id, display_order")
    .order("display_order", { ascending: true });

  if (!members) return;

  const idx = members.findIndex((m) => m.id === id);
  if (idx === -1) return;

  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= members.length) return;

  const a = members[idx];
  const b = members[swapIdx];

  await supabase.from("team_members").update({ display_order: b.display_order }).eq("id", a.id);
  await supabase.from("team_members").update({ display_order: a.display_order }).eq("id", b.id);

  revalidateTeam();
}

// ── Bulk member actions ────────────────────────────────────────────────

const BULK_MAX = 100;

function assertIds(ids: string[]) {
  if (ids.length === 0) throw new Error("No members selected.");
  if (ids.length > BULK_MAX) throw new Error(`Too many members selected (max ${BULK_MAX}).`);
}

export async function bulkSetPublished(ids: string[], isPublished: boolean): Promise<ActionResult> {
  try {
    const { userId } = await requireAdmin();
    assertIds(ids);
    const supabase = createServiceClient();

    const { error } = await supabase
      .from("team_members")
      .update({ is_published: isPublished })
      .in("id", ids);
    if (error) throw new Error(error.message);

    await logAdminAction(
      userId,
      isPublished ? "team_member.bulk_publish" : "team_member.bulk_unpublish",
      "team_members",
      undefined,
      { count: ids.length }
    );
    revalidateTeam();
    return { success: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function bulkMoveToSection(ids: string[], sectionId: string | null): Promise<ActionResult> {
  try {
    const { userId } = await requireAdmin();
    assertIds(ids);
    await validateSectionId(sectionId);
    const supabase = createServiceClient();

    const { error } = await supabase
      .from("team_members")
      .update({ section_id: sectionId })
      .in("id", ids);
    if (error) throw new Error(error.message);

    await logAdminAction(userId, "team_member.bulk_move_section", "team_members", undefined, {
      count: ids.length,
      section_id: sectionId,
    });
    revalidateTeam();
    return { success: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function bulkDeleteMembers(ids: string[]): Promise<ActionResult> {
  try {
    const { userId } = await requireAdmin();
    assertIds(ids);
    const supabase = createServiceClient();

    const { error } = await supabase.from("team_members").delete().in("id", ids);
    if (error) throw new Error(error.message);

    await logAdminAction(userId, "team_member.bulk_delete", "team_members", undefined, {
      count: ids.length,
    });
    revalidateTeam();
    return { success: true };
  } catch (err) {
    return toResult(err);
  }
}

// ── Section CRUD ───────────────────────────────────────────────────────

function sectionPayload(data: FormData) {
  const name_km = str(data, "name_km");
  const name_en = str(data, "name_en");
  if (!name_km || !name_en) throw new Error("Both Khmer and English section names are required.");
  return {
    name_km,
    name_en,
    description_km: str(data, "description_km", 500),
    description_en: str(data, "description_en", 500),
  };
}

export async function createTeamSection(data: FormData): Promise<ActionResult> {
  try {
    const { userId } = await requireAdmin();
    const supabase = createServiceClient();
    const payload = sectionPayload(data);

    // Auto-append to the end of the list
    const { data: last } = await supabase
      .from("team_sections")
      .select("display_order")
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error } = await supabase.from("team_sections").insert({
      ...payload,
      display_order: (last?.display_order ?? 0) + 1,
    });
    if (error) throw new Error(error.message);

    await logAdminAction(userId, "team_section.create", "team_sections", undefined, {
      name_en: payload.name_en,
    });
    revalidateTeam();
    return { success: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function updateTeamSection(id: string, data: FormData): Promise<ActionResult> {
  try {
    const { userId } = await requireAdmin();
    const supabase = createServiceClient();
    const payload = sectionPayload(data);

    const { error } = await supabase.from("team_sections").update(payload).eq("id", id);
    if (error) throw new Error(error.message);

    await logAdminAction(userId, "team_section.update", "team_sections", id);
    revalidateTeam();
    return { success: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function toggleSectionActive(id: string, isActive: boolean): Promise<ActionResult> {
  try {
    const { userId } = await requireAdmin();
    const supabase = createServiceClient();

    const { error } = await supabase
      .from("team_sections")
      .update({ is_active: isActive })
      .eq("id", id);
    if (error) {
      if (error.code === "PGRST204") {
        return { error: "Section visibility requires database migration 0070." };
      }
      throw new Error(error.message);
    }

    await logAdminAction(
      userId,
      isActive ? "team_section.activate" : "team_section.deactivate",
      "team_sections",
      id
    );
    revalidateTeam();
    return { success: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function reorderTeamSection(id: string, direction: "up" | "down") {
  await requireAdmin();
  const supabase = createServiceClient();

  const { data: sections } = await supabase
    .from("team_sections")
    .select("id, display_order")
    .order("display_order", { ascending: true });

  if (!sections) return;

  const idx = sections.findIndex((s) => s.id === id);
  if (idx === -1) return;

  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= sections.length) return;

  const a = sections[idx];
  const b = sections[swapIdx];

  await supabase.from("team_sections").update({ display_order: b.display_order }).eq("id", a.id);
  await supabase.from("team_sections").update({ display_order: a.display_order }).eq("id", b.id);

  revalidateTeam();
}

/**
 * Deletes a section. If it still has members, the caller must say what to do
 * with them first: move them to another section (`moveMembersTo` = section id)
 * or unlink them (`moveMembersTo` = null with `confirmUnlink` = true).
 */
export async function deleteTeamSection(
  id: string,
  options?: { moveMembersTo?: string | null; confirmUnlink?: boolean }
): Promise<ActionResult> {
  try {
    const { userId } = await requireAdmin();
    const supabase = createServiceClient();

    const { count } = await supabase
      .from("team_members")
      .select("id", { count: "exact", head: true })
      .eq("section_id", id);
    const memberCount = count ?? 0;

    if (memberCount > 0) {
      const target = options?.moveMembersTo ?? null;
      if (target) {
        if (target === id) throw new Error("Cannot move members into the section being deleted.");
        await validateSectionId(target);
        const { error } = await supabase
          .from("team_members")
          .update({ section_id: target })
          .eq("section_id", id);
        if (error) throw new Error(error.message);
      } else if (options?.confirmUnlink) {
        const { error } = await supabase
          .from("team_members")
          .update({ section_id: null })
          .eq("section_id", id);
        if (error) throw new Error(error.message);
      } else {
        return {
          error: `This section still has ${memberCount} member${memberCount === 1 ? "" : "s"}. Move or unlink them first.`,
        };
      }
    }

    const { error } = await supabase.from("team_sections").delete().eq("id", id);
    if (error) throw new Error(error.message);

    await logAdminAction(userId, "team_section.delete", "team_sections", id, {
      members_affected: memberCount,
      moved_to: options?.moveMembersTo ?? null,
    });
    revalidateTeam();
    return { success: true };
  } catch (err) {
    return toResult(err);
  }
}
