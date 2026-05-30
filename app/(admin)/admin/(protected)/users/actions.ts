"use server";

// app/admin/users/actions.ts
import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function toggleUserRole(
  targetUserId: string,
  currentRole: "reader" | "admin"
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
    .select("role")
    .eq("id", user.id)
    .single();
  if (callerProfile?.role !== "admin") throw new Error("Forbidden");

  const newRole = currentRole === "admin" ? "reader" : "admin";

  const { error } = await supabase
    .from("profiles")
    .update({ role: newRole })
    .eq("id", targetUserId);

  if (error) throw new Error(`Role update failed: ${error.message}`);

  revalidatePath("/admin/users");
}