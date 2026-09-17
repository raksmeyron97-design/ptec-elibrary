"use server";

// Library Committee — admin mutations.
//
// The committee is a RELATIONSHIP layer over `team_members`, and every action
// here is written to keep it that way:
//
//   • Nothing in this file writes to `team_members` or `team_sections`. A
//     committee edit can change a seat; it can never change a person.
//   • `removeCommitteeMember` deletes a `committee_members` row and nothing
//     else. Removing someone from the committee leaves the person, their
//     portrait, their profile page and their staff record exactly where they
//     were — the migration's FK direction makes that structural, and
//     lib/committee/schema.test.ts fails if a delete against `team_members`
//     ever appears here.
//   • Every referenced id is re-resolved against the database before it is
//     written. A client can send any uuid it likes.
//
// Authorization: the registry, twice — the page declares its route policy and
// each mutation declares its action policy, which `requireAction` enforces on
// the server whatever the browser chose to render.

import { createServiceClient } from "@/lib/supabase/server";
import { requireAction } from "@/lib/admin/route-guard";
import { logAdminAction } from "@/app/actions/audit";
import { changedRow } from "@/lib/db/changed-row";
import { revalidateLocalizedPath as revalidatePath } from "@/lib/cache/revalidate";
import {
  COMMITTEE_LAYOUT_VARIANTS,
  type CommitteeLayoutVariant,
} from "@/lib/committee/public";

// ── Types ──────────────────────────────────────────────────────────────

export type CommitteeSectionRow = {
  id: string;
  name_km: string;
  name_en: string;
  description_km: string | null;
  description_en: string | null;
  display_order: number;
  layout_variant: CommitteeLayoutVariant;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/** A seat, joined to the canonical person for display. The person's fields are
 *  READ here and never written back. */
export type CommitteeMemberRow = {
  id: string;
  team_member_id: string;
  committee_section_id: string | null;
  role_km: string | null;
  role_en: string | null;
  responsibility_km: string | null;
  responsibility_en: string | null;
  display_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  person: {
    id: string;
    name_km: string;
    name_en: string;
    position_km: string | null;
    position_en: string | null;
    photo_url: string | null;
    photo_alt: string | null;
    slug: string | null;
    is_published: boolean;
  } | null;
};

/** A person the admin can put on the committee, with whether they already are. */
export type CommitteeCandidate = {
  id: string;
  name_km: string;
  name_en: string;
  position_km: string | null;
  position_en: string | null;
  photo_url: string | null;
  photo_alt: string | null;
  is_published: boolean;
  onCommittee: boolean;
};

export type ActionResult = { success: true } | { error: string };

// ── Validation ─────────────────────────────────────────────────────────

const TEXT_MAX = 200;
const DESCRIPTION_MAX = 500;
const RESPONSIBILITY_MAX = 400;

function str(data: FormData, key: string, max = TEXT_MAX): string | null {
  const value = (data.get(key) as string | null)?.trim() ?? "";
  return value ? value.slice(0, max) : null;
}

function order(data: FormData, key = "display_order"): number {
  const raw = Number(data.get(key) ?? 0);
  if (!Number.isFinite(raw) || raw < 0) throw new Error("Display order must be a non-negative number.");
  return Math.floor(raw);
}

function layoutVariant(data: FormData): CommitteeLayoutVariant {
  const raw = (data.get("layout_variant") as string | null)?.trim() ?? "grid";
  if (!(COMMITTEE_LAYOUT_VARIANTS as readonly string[]).includes(raw)) {
    throw new Error("Unknown section layout.");
  }
  return raw as CommitteeLayoutVariant;
}

/** The referenced person must exist. Never trust a client-supplied id. */
async function requireTeamMember(id: string | null): Promise<string> {
  if (!id) throw new Error("Choose a team member first.");
  const supabase = createServiceClient();
  const { data } = await supabase.from("team_members").select("id").eq("id", id).maybeSingle();
  if (!data) throw new Error("That team member no longer exists.");
  return id;
}

/** The referenced section must exist. Null is valid — an unsectioned seat. */
async function validateSectionId(id: string | null): Promise<string | null> {
  if (!id) return null;
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("committee_sections")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!data) throw new Error("That committee section no longer exists.");
  return id;
}

function toResult(err: unknown): ActionResult {
  if (err instanceof Error) {
    // The unique index on team_member_id is the authoritative refusal; the
    // client-side check in front of it can always be racing a second editor.
    if (/duplicate key|committee_members_team_member_key/i.test(err.message)) {
      return { error: "That person already holds a seat on the committee." };
    }
    return { error: err.message };
  }
  return { error: "Something went wrong." };
}

function revalidateCommittee() {
  revalidatePath("/admin/team");
  revalidatePath("/admin/team/committee");
  revalidatePath("/admin/team/committee/sections");
  revalidatePath("/about/committee");
}

// ── Seats ──────────────────────────────────────────────────────────────

function seatPayload(data: FormData) {
  return {
    role_km: str(data, "role_km"),
    role_en: str(data, "role_en"),
    responsibility_km: str(data, "responsibility_km", RESPONSIBILITY_MAX),
    responsibility_en: str(data, "responsibility_en", RESPONSIBILITY_MAX),
    display_order: order(data),
    is_published: data.get("is_published") === "true",
  };
}

export async function addCommitteeMember(data: FormData): Promise<ActionResult> {
  try {
    const { userId } = await requireAction("team.committee.manage");
    const teamMemberId = await requireTeamMember(str(data, "team_member_id", 64));
    const sectionId = await validateSectionId(str(data, "committee_section_id", 64));
    const supabase = createServiceClient();

    const { error } = await supabase.from("committee_members").insert({
      team_member_id: teamMemberId,
      committee_section_id: sectionId,
      ...seatPayload(data),
    });
    if (error) throw new Error(error.message);

    await logAdminAction(userId, "committee_member.create", "committee_members", undefined, {
      team_member_id: teamMemberId,
      committee_section_id: sectionId,
    });
    revalidateCommittee();
    return { success: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function updateCommitteeMember(id: string, data: FormData): Promise<ActionResult> {
  try {
    const { userId } = await requireAction("team.committee.manage");
    const sectionId = await validateSectionId(str(data, "committee_section_id", 64));
    const supabase = createServiceClient();

    // `.select()` so a seat that was removed by someone else is reported as
    // gone rather than as saved — PostgREST answers a predicate that matched
    // nothing exactly like a successful update.
    const result = changedRow(
      await supabase
        .from("committee_members")
        .update({ committee_section_id: sectionId, ...seatPayload(data) })
        .eq("id", id)
        .select("id"),
    );
    if (!result.ok) {
      throw new Error(
        result.reason === "error" ? result.message : "That committee seat no longer exists.",
      );
    }

    await logAdminAction(userId, "committee_member.update", "committee_members", id, {
      committee_section_id: sectionId,
    });
    revalidateCommittee();
    return { success: true };
  } catch (err) {
    return toResult(err);
  }
}

/**
 * Removes the SEAT. The person keeps their team record, their portrait, their
 * profile page and their place in /about/team — this deletes one row in
 * `committee_members` and touches nothing else, which is the whole point of
 * modelling committee membership as a relationship.
 */
export async function removeCommitteeMember(id: string): Promise<ActionResult> {
  try {
    const { userId } = await requireAction("team.committee.manage");
    const supabase = createServiceClient();

    const result = changedRow(
      await supabase.from("committee_members").delete().eq("id", id).select("id,team_member_id"),
    );
    if (!result.ok && result.reason === "error") throw new Error(result.message);

    await logAdminAction(userId, "committee_member.remove", "committee_members", id, {
      // The person is untouched; the audit row says so explicitly, because
      // "removed from committee" and "deleted person" must never be confused
      // when someone reads this log six months later.
      team_member_deleted: false,
    });
    revalidateCommittee();
    return { success: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function toggleCommitteeMemberPublished(
  id: string,
  isPublished: boolean,
): Promise<ActionResult> {
  try {
    const { userId } = await requireAction("team.committee.manage");
    const supabase = createServiceClient();

    const result = changedRow(
      await supabase
        .from("committee_members")
        .update({ is_published: isPublished })
        .eq("id", id)
        .select("id"),
    );
    if (!result.ok) {
      throw new Error(
        result.reason === "error" ? result.message : "That committee seat no longer exists.",
      );
    }

    await logAdminAction(
      userId,
      isPublished ? "committee_member.publish" : "committee_member.unpublish",
      "committee_members",
      id,
    );
    revalidateCommittee();
    return { success: true };
  } catch (err) {
    return toResult(err);
  }
}

/**
 * Moves a seat one place within its own section.
 *
 * Neighbours are resolved on the SERVER from the stored order, so a stale page
 * cannot swap two rows that are no longer adjacent, and the direction is the
 * only thing the client gets to choose.
 */
export async function reorderCommitteeMember(
  id: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  try {
    const { userId } = await requireAction("team.committee.manage");
    const supabase = createServiceClient();

    const { data: seat } = await supabase
      .from("committee_members")
      .select("id, committee_section_id, display_order")
      .eq("id", id)
      .maybeSingle();
    if (!seat) throw new Error("That committee seat no longer exists.");

    let siblingsQuery = supabase
      .from("committee_members")
      .select("id, display_order")
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });
    siblingsQuery = seat.committee_section_id
      ? siblingsQuery.eq("committee_section_id", seat.committee_section_id)
      : siblingsQuery.is("committee_section_id", null);

    const { data: siblings } = await siblingsQuery;
    if (!siblings) throw new Error("Could not read the current order.");

    const index = siblings.findIndex((s) => s.id === id);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    // Already at the end: nothing to do, and nothing to report as an error.
    if (index === -1 || swapIndex < 0 || swapIndex >= siblings.length) return { success: true };

    const a = siblings[index];
    const b = siblings[swapIndex];
    // Equal stored orders (the common case — every new seat starts at its
    // section's tail) would make a straight swap a no-op, so the pair is
    // renumbered by POSITION rather than by value.
    await supabase.from("committee_members").update({ display_order: swapIndex }).eq("id", a.id);
    await supabase.from("committee_members").update({ display_order: index }).eq("id", b.id);

    await logAdminAction(userId, "committee_member.reorder", "committee_members", id, {
      direction,
    });
    revalidateCommittee();
    return { success: true };
  } catch (err) {
    return toResult(err);
  }
}

// ── Sections ───────────────────────────────────────────────────────────

function sectionPayload(data: FormData) {
  const name_km = str(data, "name_km");
  const name_en = str(data, "name_en");
  if (!name_km || !name_en) throw new Error("Both Khmer and English section names are required.");
  return {
    name_km,
    name_en,
    description_km: str(data, "description_km", DESCRIPTION_MAX),
    description_en: str(data, "description_en", DESCRIPTION_MAX),
    layout_variant: layoutVariant(data),
  };
}

export async function createCommitteeSection(data: FormData): Promise<ActionResult> {
  try {
    const { userId } = await requireAction("team.committee.sections");
    const supabase = createServiceClient();
    const payload = sectionPayload(data);

    const { data: last } = await supabase
      .from("committee_sections")
      .select("display_order")
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error } = await supabase
      .from("committee_sections")
      .insert({ ...payload, display_order: (last?.display_order ?? 0) + 1 });
    if (error) throw new Error(error.message);

    await logAdminAction(userId, "committee_section.create", "committee_sections", undefined, {
      name_en: payload.name_en,
    });
    revalidateCommittee();
    return { success: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function updateCommitteeSection(id: string, data: FormData): Promise<ActionResult> {
  try {
    const { userId } = await requireAction("team.committee.sections");
    const supabase = createServiceClient();
    const payload = sectionPayload(data);

    const result = changedRow(
      await supabase.from("committee_sections").update(payload).eq("id", id).select("id"),
    );
    if (!result.ok) {
      throw new Error(
        result.reason === "error" ? result.message : "That committee section no longer exists.",
      );
    }

    await logAdminAction(userId, "committee_section.update", "committee_sections", id);
    revalidateCommittee();
    return { success: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function toggleCommitteeSectionActive(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  try {
    const { userId } = await requireAction("team.committee.sections");
    const supabase = createServiceClient();

    const result = changedRow(
      await supabase
        .from("committee_sections")
        .update({ is_active: isActive })
        .eq("id", id)
        .select("id"),
    );
    if (!result.ok) {
      throw new Error(
        result.reason === "error" ? result.message : "That committee section no longer exists.",
      );
    }

    await logAdminAction(
      userId,
      isActive ? "committee_section.activate" : "committee_section.deactivate",
      "committee_sections",
      id,
    );
    revalidateCommittee();
    return { success: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function reorderCommitteeSection(
  id: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  try {
    const { userId } = await requireAction("team.committee.sections");
    const supabase = createServiceClient();

    const { data: sections } = await supabase
      .from("committee_sections")
      .select("id, display_order")
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (!sections) throw new Error("Could not read the current order.");

    const index = sections.findIndex((s) => s.id === id);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || swapIndex < 0 || swapIndex >= sections.length) return { success: true };

    await supabase
      .from("committee_sections")
      .update({ display_order: swapIndex })
      .eq("id", sections[index].id);
    await supabase
      .from("committee_sections")
      .update({ display_order: index })
      .eq("id", sections[swapIndex].id);

    await logAdminAction(userId, "committee_section.reorder", "committee_sections", id, {
      direction,
    });
    revalidateCommittee();
    return { success: true };
  } catch (err) {
    return toResult(err);
  }
}

/**
 * Deletes a section. Its seats are NOT deleted — the FK is ON DELETE SET NULL,
 * so they become unsectioned and keep their publish state. The count is
 * reported back through the audit row so the effect is visible afterwards.
 */
export async function deleteCommitteeSection(id: string): Promise<ActionResult> {
  try {
    const { userId } = await requireAction("team.committee.sections");
    const supabase = createServiceClient();

    const { count } = await supabase
      .from("committee_members")
      .select("id", { count: "exact", head: true })
      .eq("committee_section_id", id);

    const result = changedRow(
      await supabase.from("committee_sections").delete().eq("id", id).select("id"),
    );
    if (!result.ok && result.reason === "error") throw new Error(result.message);

    await logAdminAction(userId, "committee_section.delete", "committee_sections", id, {
      seats_unsectioned: count ?? 0,
    });
    revalidateCommittee();
    return { success: true };
  } catch (err) {
    return toResult(err);
  }
}
