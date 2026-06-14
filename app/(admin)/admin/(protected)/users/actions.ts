"use server";

// app/admin/users/actions.ts
import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createClient as createAnonClient } from "@supabase/supabase-js";

// Verify admin password using the service role key so the call bypasses
// any CAPTCHA protection configured on the Supabase project.
// Uses a stateless client — does NOT affect the current session.
async function verifyPassword(email: string, password: string): Promise<void> {
  const verifyClient = createAnonClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { error } = await verifyClient.auth.signInWithPassword({ email, password });
  if (error) {
    // Map Supabase error to a user-friendly message
    const msg = error.message.toLowerCase();
    if (msg.includes("invalid login") || msg.includes("invalid credentials") || msg.includes("invalid email or password")) {
      throw new Error("Incorrect password. Promotion cancelled.");
    }
    throw new Error(`Password verification failed: ${error.message}`);
  }
}

export async function toggleUserRole(
  targetUserId: string,
  currentRole: "reader" | "admin",
  password?: string
) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Safety: can't change your own role
  if (user.id === targetUserId) throw new Error("You cannot change your own role");

  const supabase = createServiceClient();

  // Verify caller is admin
  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role, is_super_admin")
    .eq("id", user.id)
    .single();

  if (callerProfile?.role !== "admin") throw new Error("Forbidden");

  // Protect super admins: only a super admin may change another super admin's
  // role. Without this, a regular admin could demote (lock out) the super admin.
  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("is_super_admin")
    .eq("id", targetUserId)
    .single();
  if (targetProfile?.is_super_admin && !callerProfile.is_super_admin) {
    throw new Error("Only a super admin can change a super admin's role.");
  }

  const newRole = currentRole === "admin" ? "reader" : "admin";
  const isPromotion = newRole === "admin";

  // Password required for promote — unless caller is super admin
  if (isPromotion && !callerProfile.is_super_admin) {
    if (!password) throw new Error("Password is required to promote a user.");

    const email = user.email;
    if (!email) throw new Error("Could not verify identity: no email found.");

    await verifyPassword(email, password); // throws on wrong password or CAPTCHA failure
  }

  const { error } = await supabase
    .from("profiles")
    .update({ role: newRole })
    .eq("id", targetUserId);

  if (error) throw new Error(`Role update failed: ${error.message}`);

  revalidatePath("/admin/users");
}
