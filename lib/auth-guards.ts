import "server-only";

import { createClient } from "@/lib/supabase/server";
export {
  requireAdmin,
  requireStaff,
  requireLibrarian,
  requireSuperAdmin,
  requirePermission,
} from "@/lib/auth/requireAdmin";

export async function requireUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Not authenticated");
  return { supabase, user };
}
