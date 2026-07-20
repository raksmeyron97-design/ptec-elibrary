/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

export interface AnnouncementTemplateRow {
  id: string;
  name: string;
  type: string;
  priority: string;
  titleEn: string;
  titleKm: string | null;
  summaryEn: string | null;
  summaryKm: string | null;
  bodyEn: string | null;
  bodyKm: string | null;
  ctaLabelEn: string | null;
  ctaLabelKm: string | null;
  ctaUrl: string | null;
  defaultChannels: { in_app: boolean; banner: boolean; push: boolean };
  isArchived: boolean;
  createdAt: string;
}

function mapRow(r: any): AnnouncementTemplateRow {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    priority: r.priority,
    titleEn: r.title_en,
    titleKm: r.title_km,
    summaryEn: r.summary_en,
    summaryKm: r.summary_km,
    bodyEn: r.body_en,
    bodyKm: r.body_km,
    ctaLabelEn: r.cta_label_en,
    ctaLabelKm: r.cta_label_km,
    ctaUrl: r.cta_url,
    defaultChannels: r.default_channels ?? { in_app: true, banner: false, push: false },
    isArchived: r.is_archived,
    createdAt: r.created_at,
  };
}

export async function listAnnouncementTemplates(includeArchived = false): Promise<AnnouncementTemplateRow[]> {
  const db = createServiceClient();
  let query = db.from("announcement_templates").select("*").order("created_at", { ascending: false });
  if (!includeArchived) query = query.eq("is_archived", false);
  const { data } = await query;
  return ((data ?? []) as any[]).map(mapRow);
}

export async function getAnnouncementTemplate(id: string): Promise<AnnouncementTemplateRow | null> {
  const db = createServiceClient();
  const { data } = await db.from("announcement_templates").select("*").eq("id", id).maybeSingle();
  return data ? mapRow(data) : null;
}
