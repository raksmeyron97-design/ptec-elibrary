"use server";

import { createClient } from "@/lib/supabase/server";
import { put } from "@vercel/blob";
import { revalidatePath } from "next/cache";

export async function updateProfile(formData: FormData) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { error: "Not authenticated" };
    }

    const fullName = formData.get("full_name") as string;
    const avatarFile = formData.get("avatar") as File | null;
    let avatarUrl = undefined;

    if (avatarFile && avatarFile.size > 0) {
      if (avatarFile.size > 5 * 1024 * 1024) {
        return { error: "Avatar image must be less than 5MB" };
      }
      
      const blob = await put(`avatars/${user.id}-${Date.now()}-${avatarFile.name}`, avatarFile, {
        access: "public",
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      avatarUrl = blob.url;
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
    return { success: true };
  } catch (err) {
    console.error("Error updating profile:", err);
    return { error: "An unexpected error occurred" };
  }
}

export async function updatePassword(formData: FormData) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { error: "Not authenticated" };
    }

    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (!password || password.length < 8) {
      return { error: "Password must be at least 8 characters long" };
    }

    if (password !== confirmPassword) {
      return { error: "Passwords do not match" };
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: password,
    });

    if (updateError) {
      console.error("Password update error:", updateError);
      return { error: updateError.message };
    }

    return { success: true };
  } catch (err) {
    console.error("Error updating password:", err);
    return { error: "An unexpected error occurred" };
  }
}
