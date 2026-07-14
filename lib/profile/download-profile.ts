import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import {
  computeDownloadProfileStatus,
  type DownloadProfileRow,
  type DownloadProfileStatus,
} from "@/lib/profile/download-profile-shared";

const PROFILE_COLUMNS =
  "full_name, gender, phone, institution_name, institution_type, faculty_department, professional_role, country, province_city, student_staff_id, download_purpose, download_purpose_other, responsible_use_accepted_at, download_privacy_consent_at, download_profile_updated_at";

/** Fetch the reader's raw Download Access Profile row (for prefill). */
export async function getDownloadProfileRow(
  userId: string,
  client?: SupabaseClient,
): Promise<Partial<DownloadProfileRow> | null> {
  const supabase = client ?? createServiceClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  // Pre-0093 databases (missing columns) degrade to "incomplete" rather than
  // throwing — the reader is simply prompted to complete their profile.
  if (error) return null;
  return (data as Partial<DownloadProfileRow>) ?? null;
}

/**
 * Server-side completeness check. Single source of truth used by the
 * permission engine, download route and status endpoint.
 */
export async function getDownloadProfileStatus(
  userId: string,
  client?: SupabaseClient,
): Promise<DownloadProfileStatus> {
  const row = await getDownloadProfileRow(userId, client);
  return computeDownloadProfileStatus(row);
}
