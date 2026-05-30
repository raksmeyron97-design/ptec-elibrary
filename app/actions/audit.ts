import { createServiceClient } from "@/lib/supabase/server";

export async function logAdminAction(
  adminId: string,
  action: string,
  targetTable: string,
  targetId?: string,
  metadata?: any
) {
  try {
    const supabase = createServiceClient();
    await supabase.from("admin_audit_log").insert({
      admin_id: adminId,
      action,
      target_table: targetTable,
      target_id: targetId,
      metadata,
    });
  } catch (error) {
    console.error("[logAdminAction] Error:", error);
  }
}
