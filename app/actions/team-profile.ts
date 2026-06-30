"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth/requireAdmin";
import { revalidatePath } from "next/cache";

export async function updateOwnTeamMember(formData: FormData) {
  try {
    const { userId } = await requireStaff();
    const supabase = createServiceClient();

    const { data: member } = await supabase
      .from("team_members")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (!member) {
      return { error: "No Library Team profile is linked to your account. Ask an admin to link your account." };
    }

    const nameKm = (formData.get("name_km") as string)?.trim();
    const nameEn = (formData.get("name_en") as string)?.trim();
    if (!nameKm) return { error: "Khmer name is required." };
    if (!nameEn) return { error: "Latin name is required." };

    const { error } = await supabase
      .from("team_members")
      .update({
        name_km:          nameKm,
        name_en:          nameEn,
        position_km:      (formData.get("position_km") as string)?.trim() || null,
        position_en:      (formData.get("position_en") as string)?.trim() || null,
        section_id:       (formData.get("section_id") as string)?.trim() || null,
        education:        (formData.get("education") as string)?.trim() || null,
        years_experience: (formData.get("years_experience") as string)?.trim() || null,
        phone:            (formData.get("phone") as string)?.trim() || null,
        bio_km:           (formData.get("bio_km") as string)?.trim() || null,
        bio_en:           (formData.get("bio_en") as string)?.trim() || null,
        photo_url:        (formData.get("photo_url") as string)?.trim() || null,
      })
      .eq("id", member.id);

    if (error) return { error: "Failed to update team profile." };

    revalidatePath("/admin/profile");
    revalidatePath("/about/team");
    revalidatePath("/admin/team");
    return { success: true };
  } catch {
    return { error: "An unexpected error occurred." };
  }
}
