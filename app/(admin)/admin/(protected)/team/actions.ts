"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────────

export type TeamSection = {
  id: string;
  name_km: string;
  name_en: string;
  description_km: string | null;
  description_en: string | null;
  display_order: number;
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

// ── Fetchers ───────────────────────────────────────────────────────────

export async function getTeamSections(): Promise<TeamSection[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("team_sections")
    .select("id, name_km, name_en, description_km, description_en, display_order")
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

// ── CRUD ───────────────────────────────────────────────────────────────

function buildPayload(data: FormData) {
  const userId   = (data.get("user_id") as string)?.trim() || null;
  const sectionId = (data.get("section_id") as string)?.trim() || null;

  return {
    user_id:          userId,
    section_id:       sectionId,
    name_km:          (data.get("name_km") as string)?.trim() ?? "",
    name_en:          (data.get("name_en") as string)?.trim() ?? "",
    position_km:      (data.get("position_km") as string)?.trim() || null,
    position_en:      (data.get("position_en") as string)?.trim() || null,
    education:        (data.get("education") as string)?.trim() || null,
    years_experience: (data.get("years_experience") as string)?.trim() || null,
    phone:            (data.get("phone") as string)?.trim() || null,
    bio_km:           (data.get("bio_km") as string)?.trim() || null,
    bio_en:           (data.get("bio_en") as string)?.trim() || null,
    photo_url:        (data.get("photo_url") as string)?.trim() || null,
    display_order:    Number(data.get("display_order") ?? 0),
    is_published:     data.get("is_published") === "true",
  };
}

export async function createTeamMember(data: FormData) {
  await requireAdmin();
  const supabase = createServiceClient();

  const { error } = await supabase.from("team_members").insert(buildPayload(data));
  if (error) throw new Error(error.message);

  revalidatePath("/admin/team");
  revalidatePath("/about/team");
  redirect("/admin/team");
}

export async function updateTeamMember(id: string, data: FormData) {
  await requireAdmin();
  const supabase = createServiceClient();

  const { error } = await supabase
    .from("team_members")
    .update(buildPayload(data))
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/admin/team");
  revalidatePath("/about/team");
  redirect("/admin/team");
}

export async function deleteTeamMember(id: string) {
  await requireAdmin();
  const supabase = createServiceClient();

  const { error } = await supabase.from("team_members").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/team");
  revalidatePath("/about/team");
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

  revalidatePath("/admin/team");
  revalidatePath("/about/team");
}

// ── Section CRUD ───────────────────────────────────────────────────────

export async function createTeamSection(data: FormData) {
  await requireAdmin();
  const supabase = createServiceClient();

  const { error } = await supabase.from("team_sections").insert({
    name_km:       (data.get("name_km") as string)?.trim() ?? "",
    name_en:       (data.get("name_en") as string)?.trim() ?? "",
    description_km: (data.get("description_km") as string)?.trim() || null,
    description_en: (data.get("description_en") as string)?.trim() || null,
    display_order: Number(data.get("display_order") ?? 99),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/admin/team");
}

export async function deleteTeamSection(id: string) {
  await requireAdmin();
  const supabase = createServiceClient();
  const { error } = await supabase.from("team_sections").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/team");
}
