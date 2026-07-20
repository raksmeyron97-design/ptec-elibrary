"use server";

import { requirePermission } from "@/lib/auth/requireAdmin";
import { revalidateLocalizedPath as revalidatePath } from "@/lib/cache/revalidate";
import { rateLimit } from "@/lib/rate-limit";
import { normalizePriority, normalizeType } from "@/lib/admin/announcements/shared";
import { checkDestinationUrl } from "@/lib/admin/announcements/url-safety";
import { logAdminAction } from "@/app/actions/audit";

export interface TemplateInput {
  name: string;
  type: string;
  priority: string;
  titleEn: string;
  titleKm: string;
  summaryEn: string;
  summaryKm: string;
  bodyEn: string;
  bodyKm: string;
  ctaLabelEn: string;
  ctaLabelKm: string;
  ctaUrl: string;
  defaultChannels: { inApp: boolean; banner: boolean; push: boolean };
}

async function enforceRateLimit(userId: string) {
  const { success } = await rateLimit(`announcement-template-mutate:${userId}`, 20, 60_000);
  if (!success) throw new Error("Too many changes — please wait a moment and try again.");
}

function toRow(input: TemplateInput) {
  const ctaUrl = input.ctaUrl.trim();
  return {
    name: input.name.trim(),
    type: normalizeType(input.type),
    priority: normalizePriority(input.priority),
    title_en: input.titleEn.trim(),
    title_km: input.titleKm.trim() || null,
    summary_en: input.summaryEn.trim() || null,
    summary_km: input.summaryKm.trim() || null,
    body_en: input.bodyEn.trim() || null,
    body_km: input.bodyKm.trim() || null,
    cta_label_en: input.ctaLabelEn.trim() || null,
    cta_label_km: input.ctaLabelKm.trim() || null,
    cta_url: ctaUrl && checkDestinationUrl(ctaUrl).ok ? ctaUrl : null,
    default_channels: { in_app: input.defaultChannels.inApp, banner: input.defaultChannels.banner, push: input.defaultChannels.push },
  };
}

export async function createAnnouncementTemplate(input: TemplateInput): Promise<{ id: string }> {
  const { supabase, user } = await requirePermission("announcements", "write");
  await enforceRateLimit(user.id);
  if (!input.name.trim()) throw new Error("Template name is required.");
  if (!input.titleEn.trim()) throw new Error("English title is required.");

  const { data, error } = await supabase
    .from("announcement_templates")
    .insert({ ...toRow(input), created_by: user.id })
    .select("id")
    .single();
  if (error) throw new Error(`Could not create template: ${error.message}`);

  await logAdminAction(user.id, "announcement.template_create", "announcement_templates", data.id, { name: input.name });
  revalidatePath("/admin/announcements/templates");
  return { id: data.id };
}

export async function updateAnnouncementTemplate(id: string, input: TemplateInput): Promise<{ success: true }> {
  const { supabase, user } = await requirePermission("announcements", "write");
  await enforceRateLimit(user.id);
  if (!input.name.trim()) throw new Error("Template name is required.");
  if (!input.titleEn.trim()) throw new Error("English title is required.");

  const { error } = await supabase.from("announcement_templates").update(toRow(input)).eq("id", id);
  if (error) throw new Error(`Update failed: ${error.message}`);

  await logAdminAction(user.id, "announcement.template_update", "announcement_templates", id, { name: input.name });
  revalidatePath("/admin/announcements/templates");
  return { success: true };
}

export async function archiveAnnouncementTemplate(id: string): Promise<{ success: true }> {
  const { supabase, user } = await requirePermission("announcements", "write");
  await enforceRateLimit(user.id);
  const { error } = await supabase.from("announcement_templates").update({ is_archived: true }).eq("id", id);
  if (error) throw new Error(`Archive failed: ${error.message}`);
  await logAdminAction(user.id, "announcement.template_archive", "announcement_templates", id, {});
  revalidatePath("/admin/announcements/templates");
  return { success: true };
}

export async function duplicateAnnouncementTemplate(id: string): Promise<{ id: string }> {
  const { supabase, user } = await requirePermission("announcements", "write");
  await enforceRateLimit(user.id);

  const { data: source, error } = await supabase.from("announcement_templates").select("*").eq("id", id).single();
  if (error || !source) throw new Error("Template not found.");

  const { data: copy, error: insertError } = await supabase
    .from("announcement_templates")
    .insert({
      name: `${source.name} (Copy)`,
      type: source.type,
      priority: source.priority,
      title_en: source.title_en,
      title_km: source.title_km,
      summary_en: source.summary_en,
      summary_km: source.summary_km,
      body_en: source.body_en,
      body_km: source.body_km,
      cta_label_en: source.cta_label_en,
      cta_label_km: source.cta_label_km,
      cta_url: source.cta_url,
      default_channels: source.default_channels,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (insertError) throw new Error(`Duplicate failed: ${insertError.message}`);

  await logAdminAction(user.id, "announcement.template_duplicate", "announcement_templates", copy.id, { sourceId: id });
  revalidatePath("/admin/announcements/templates");
  return { id: copy.id };
}
