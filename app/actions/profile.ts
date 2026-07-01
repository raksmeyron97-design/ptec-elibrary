"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { zimaUpload } from "@/lib/zima";

export async function updateProfile(formData: FormData) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { error: "Not authenticated" };
    }

    const fullName = formData.get("full_name") as string;
    if (fullName && fullName.length > 100) {
      return { error: "Name must be 100 characters or fewer" };
    }
    const avatarFile = formData.get("avatar") as File | null;
    let avatarUrl = undefined;

    if (avatarFile && avatarFile.size > 0) {
      const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
      if (!ALLOWED_MIME.includes(avatarFile.type)) {
        return { error: "Avatar must be a JPEG, PNG, or WebP image" };
      }
      if (avatarFile.size > 5 * 1024 * 1024) {
        return { error: "Avatar image must be less than 5MB" };
      }

      avatarUrl = await zimaUpload(avatarFile, "avatars");
    }

    const updates: { full_name?: string; avatar_url?: string } = {};
    if (fullName !== null && fullName !== undefined) updates.full_name = fullName;
    if (avatarUrl) updates.avatar_url = avatarUrl;

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", user.id);

      if (updateError) {
        console.error("Profile update error:", updateError);
        return { error: "Failed to update profile" };
      }
    }

    revalidatePath("/dashboard", "layout");
    revalidatePath("/admin", "layout");
    return { success: true };
  } catch (err) {
    console.error("Error updating profile:", err);
    return { error: "An unexpected error occurred" };
  }
}
