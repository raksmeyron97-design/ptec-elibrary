/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import { sanitizeHtml } from "@/lib/sanitize";
import { checkDestinationUrl } from "./url-safety";
import { normalizeAudienceType, normalizePriority, normalizeType } from "./shared";
import type { AnnouncementInput } from "./validation";

function safeUrlOrNull(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  const check = checkDestinationUrl(raw);
  return check.ok ? check.url : null;
}

/** Composer input → DB row columns (insert/update). Shared by the create/update
 *  server actions so the mapping can never drift between them. */
export function inputToRow(input: AnnouncementInput) {
  return {
    internal_name: input.internalName.trim(),
    type: normalizeType(input.type),
    priority: normalizePriority(input.priority),
    title_en: input.content.en.title.trim(),
    title_km: input.content.km.title.trim() || null,
    summary_en: input.content.en.summary.trim() || null,
    summary_km: input.content.km.summary.trim() || null,
    body_en: input.content.en.body.trim() ? sanitizeHtml(input.content.en.body) : null,
    body_km: input.content.km.body.trim() ? sanitizeHtml(input.content.km.body) : null,
    cta_label_en: input.content.en.ctaLabel.trim() || null,
    cta_label_km: input.content.km.ctaLabel.trim() || null,
    cta_url: safeUrlOrNull(input.ctaUrl),
    image_url: input.imageUrl?.trim() || null,
    channel_in_app: input.channels.inApp,
    channel_banner: input.channels.banner,
    channel_push: input.channels.push,
    push_title: input.push.title.trim() || null,
    push_body: input.push.body.trim() || null,
    push_url: safeUrlOrNull(input.push.url),
    push_ttl_seconds: input.push.ttlSeconds ?? null,
    audience_type: normalizeAudienceType(input.audience.type),
    audience_roles: input.audience.roles,
    audience_user_ids: input.audience.userIds,
    pinned: input.pinned,
    dismissible: input.dismissible,
    expires_at: input.schedule.expiresAt ? new Date(input.schedule.expiresAt).toISOString() : null,
  };
}

/** DB row → composer input, for the edit page and duplicate/re-validate flows. */
export function rowToInput(row: any): AnnouncementInput {
  return {
    internalName: row.internal_name ?? "",
    type: normalizeType(row.type),
    priority: normalizePriority(row.priority),
    imageUrl: row.image_url ?? null,
    content: {
      en: { title: row.title_en ?? "", summary: row.summary_en ?? "", body: row.body_en ?? "", ctaLabel: row.cta_label_en ?? "" },
      km: { title: row.title_km ?? "", summary: row.summary_km ?? "", body: row.body_km ?? "", ctaLabel: row.cta_label_km ?? "" },
    },
    ctaUrl: row.cta_url ?? null,
    channels: { inApp: row.channel_in_app, banner: row.channel_banner, push: row.channel_push },
    push: { title: row.push_title ?? "", body: row.push_body ?? "", url: row.push_url ?? "", ttlSeconds: row.push_ttl_seconds ?? null },
    audience: { type: normalizeAudienceType(row.audience_type), roles: row.audience_roles ?? [], userIds: row.audience_user_ids ?? [] },
    pinned: row.pinned,
    dismissible: row.dismissible,
    schedule: { mode: "now", scheduledAt: row.scheduled_at, expiresAt: row.expires_at },
  };
}

export function channelsSummary(row: any) {
  return { inApp: row.channel_in_app, banner: row.channel_banner, push: row.channel_push };
}
