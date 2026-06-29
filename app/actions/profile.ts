"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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

      const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
      const s3Client = new S3Client({
        region: "auto",
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID!,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        },
      });

      const key = `avatars/${user.id}-${Date.now()}-${avatarFile.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
      const buffer = Buffer.from(await avatarFile.arrayBuffer());

      await s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.R2_PUBLIC_BUCKET_NAME,
          Key: key,
          Body: buffer,
          ContentType: avatarFile.type,
        })
      );

      avatarUrl = `${(process.env.NEXT_PUBLIC_R2_COVERS_URL ?? "").replace(/\/$/, "")}/${key}`;
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
