"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidateLocalizedPath as revalidatePath } from "@/lib/cache/revalidate";
import { zimaUpload } from "@/lib/zima";
import { optimizeImage, AVATAR_OPTS } from "@/lib/image-optimize";
import { ADMIN_PANEL_ROLES } from "@/lib/types/roles";
import type { AppRole } from "@/lib/types/roles";
import { logSecurityEvent } from "@/lib/security-log";

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

      // Optimize avatar before upload (resize + convert to WebP)
      const bytes = await avatarFile.arrayBuffer();
      const optimized = await optimizeImage(bytes, avatarFile.name, avatarFile.type, AVATAR_OPTS);
      const optimizedFile = new File([optimized.buffer], optimized.filename, {
        type: optimized.contentType,
      });

      avatarUrl = await zimaUpload(optimizedFile, "avatars");
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

/**
 * Permanently delete the current user's account and all associated data.
 *
 * Deletion happens via auth.admin.deleteUser — every user-owned table
 * (profiles, notes, annotations, reading progress, saved books, lists,
 * reviews, push subscriptions, …) references auth.users/profiles with
 * ON DELETE CASCADE, so a single delete removes everything.
 *
 * Admin-panel roles cannot self-delete: their profile is referenced by
 * admin_audit_log (RESTRICT), and removing staff must stay a deliberate
 * super-admin action.
 */
export async function deleteAccount(confirmation: string) {
  try {
    const authClient = await createClient();
    const { data: { user }, error: userError } = await authClient.auth.getUser();

    if (userError || !user) {
      return { error: "Not authenticated" };
    }

    if (confirmation !== "DELETE") {
      return { error: "Please type DELETE to confirm." };
    }

    const supabase = createServiceClient();

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_super_admin")
      .eq("id", user.id)
      .maybeSingle();

    const role = (profile?.role ?? "reader") as AppRole;
    if (ADMIN_PANEL_ROLES.includes(role) || profile?.is_super_admin) {
      logSecurityEvent({
        type: "suspicious_input",
        where: "deleteAccount",
        userId: user.id,
        detail: "admin-panel role attempted self-serve account deletion",
      });
      return {
        error:
          "Staff accounts cannot be deleted here. Please ask a super admin to remove your account.",
      };
    }

    // Books this user reviewed — their average rating must be recomputed
    // after the cascade removes the reviews.
    const { data: reviewed } = await supabase
      .from("reviews")
      .select("book_id")
      .eq("user_id", user.id);
    const reviewedBookIds = [...new Set((reviewed ?? []).map((r) => r.book_id))];

    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error("[deleteAccount] deleteUser failed:", deleteError.message);
      return { error: "Failed to delete account. Please try again or contact the library." };
    }

    for (const bookId of reviewedBookIds) {
      const { data: remaining } = await supabase
        .from("reviews")
        .select("rating")
        .eq("book_id", bookId);
      const avg =
        remaining && remaining.length > 0
          ? Math.round((remaining.reduce((s, r) => s + r.rating, 0) / remaining.length) * 10) / 10
          : null;
      await supabase.from("books").update({ rating: avg }).eq("id", bookId);
    }

    // Clear the now-orphaned session cookies.
    await authClient.auth.signOut();

    revalidatePath("/", "layout");
    return { success: true };
  } catch (err) {
    console.error("[deleteAccount] Error:", err);
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
      return { error: "Password must be at least 8 characters" };
    }

    if (password !== confirmPassword) {
      return { error: "Passwords do not match" };
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: password
    });

    if (updateError) {
      return { error: updateError.message };
    }

    return { success: true };
  } catch (err) {
    console.error("Error updating password:", err);
    return { error: "An unexpected error occurred" };
  }
}
