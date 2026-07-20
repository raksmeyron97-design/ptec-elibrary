/**
 * Pure validation for the Announcement Composer. No server-only import — used
 * by both the server actions (authoritative) and the client composer (inline,
 * next-to-the-control feedback). Never trust the client-side pass alone.
 */

import { LIMITS, type AnnouncementType, type Priority, type AudienceType, TARGETABLE_ROLES } from "./shared";
import { checkDestinationUrl } from "./url-safety";

export interface LocaleContent {
  title: string;
  summary: string;
  body: string;
  ctaLabel: string;
}

export interface AnnouncementInput {
  internalName: string;
  type: AnnouncementType;
  priority: Priority;
  imageUrl: string | null;
  content: { en: LocaleContent; km: LocaleContent };
  ctaUrl: string | null;
  channels: { inApp: boolean; banner: boolean; push: boolean };
  push: { title: string; body: string; url: string; ttlSeconds: number | null };
  audience: { type: AudienceType; roles: string[]; userIds: string[] };
  pinned: boolean;
  dismissible: boolean;
  schedule: { mode: "draft" | "now" | "schedule"; scheduledAt: string | null; expiresAt: string | null };
}

export type FieldErrors = Record<string, string>;

/** Content step: English is required (matches existing posts/theses convention
 *  of English-as-baseline); Khmer is encouraged but never force-required, so a
 *  draft can always be saved while translation is in progress. */
export function validateContentStep(input: AnnouncementInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!input.internalName.trim()) errors.internalName = "Internal name is required.";
  else if (input.internalName.length > LIMITS.internalName) errors.internalName = `Internal name must be ${LIMITS.internalName} characters or fewer.`;

  if (!input.content.en.title.trim()) errors["content.en.title"] = "English title is required.";
  else if (input.content.en.title.length > LIMITS.title) errors["content.en.title"] = `Title must be ${LIMITS.title} characters or fewer.`;

  if (input.content.en.summary.length > LIMITS.summary) errors["content.en.summary"] = `Summary must be ${LIMITS.summary} characters or fewer.`;
  if (input.content.km.title.length > LIMITS.title) errors["content.km.title"] = `Title must be ${LIMITS.title} characters or fewer.`;
  if (input.content.km.summary.length > LIMITS.summary) errors["content.km.summary"] = `Summary must be ${LIMITS.summary} characters or fewer.`;

  if (input.ctaUrl && input.ctaUrl.trim()) {
    const check = checkDestinationUrl(input.ctaUrl);
    if (!check.ok) errors.ctaUrl = ctaUrlErrorMessage(check.reason);
    if ((input.content.en.ctaLabel.trim() || input.content.km.ctaLabel.trim()) === "" ) {
      errors["content.en.ctaLabel"] = "A call-to-action label is required when a link is set.";
    }
  }
  if ((input.content.en.ctaLabel.trim() || input.content.km.ctaLabel.trim()) && !input.ctaUrl?.trim()) {
    errors.ctaUrl = "A destination link is required when a call-to-action label is set.";
  }

  return errors;
}

function ctaUrlErrorMessage(reason: string): string {
  switch (reason) {
    case "unsafe_scheme": return "Link must use https:// (or be a relative internal path).";
    case "protocol_relative": return "Protocol-relative links are not allowed.";
    case "not_allowlisted": return "This external domain is not on the approved list.";
    case "unparseable": return "This does not look like a valid URL.";
    default: return "Enter a valid destination link.";
  }
}

export function validateChannelsStep(input: AnnouncementInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!input.channels.inApp && !input.channels.banner && !input.channels.push) {
    errors.channels = "Select at least one delivery channel.";
  }
  if (input.channels.push) {
    const title = input.push.title.trim() || input.content.en.title.trim();
    const body = input.push.body.trim() || input.content.en.summary.trim();
    if (!title) errors["push.title"] = "Push title is required (falls back to the English title if left blank, but one must exist).";
    else if (title.length > LIMITS.pushTitle) errors["push.title"] = `Push title should be ${LIMITS.pushTitle} characters or fewer to avoid truncation.`;
    if (!body) errors["push.body"] = "Push message is required (falls back to the English summary if left blank, but one must exist).";
    else if (body.length > LIMITS.pushBody) errors["push.body"] = `Push message should be ${LIMITS.pushBody} characters or fewer to avoid truncation.`;

    const effectiveUrl = input.push.url.trim() || input.ctaUrl?.trim() || "/";
    const check = checkDestinationUrl(effectiveUrl);
    if (!check.ok) errors["push.url"] = ctaUrlErrorMessage(check.reason);

    if (input.push.ttlSeconds != null && (input.push.ttlSeconds < 0 || input.push.ttlSeconds > 2_419_200)) {
      errors["push.ttlSeconds"] = "Time-to-live must be between 0 and 28 days (in seconds).";
    }
  }
  return errors;
}

export function validateAudienceStep(input: AnnouncementInput): FieldErrors {
  const errors: FieldErrors = {};
  if (input.audience.type === "role") {
    const invalid = input.audience.roles.filter((r) => !(TARGETABLE_ROLES as readonly string[]).includes(r));
    if (input.audience.roles.length === 0) errors["audience.roles"] = "Select at least one role.";
    else if (invalid.length > 0) errors["audience.roles"] = "Unknown role selected.";
  }
  if (input.audience.type === "individual" && input.audience.userIds.length === 0) {
    errors["audience.userIds"] = "Select at least one user.";
  }
  return errors;
}

export function validateScheduleStep(input: AnnouncementInput, now: number = Date.now()): FieldErrors {
  const errors: FieldErrors = {};
  if (input.schedule.mode === "schedule") {
    if (!input.schedule.scheduledAt) {
      errors["schedule.scheduledAt"] = "Choose a date and time to publish.";
    } else {
      const t = new Date(input.schedule.scheduledAt).getTime();
      if (Number.isNaN(t)) errors["schedule.scheduledAt"] = "Invalid date/time.";
      else if (t <= now) errors["schedule.scheduledAt"] = "Scheduled time must be in the future.";
    }
  }
  if (input.schedule.expiresAt) {
    const exp = new Date(input.schedule.expiresAt).getTime();
    if (Number.isNaN(exp)) {
      errors["schedule.expiresAt"] = "Invalid expiration date/time.";
    } else {
      const publishAt = input.schedule.mode === "schedule" && input.schedule.scheduledAt
        ? new Date(input.schedule.scheduledAt).getTime()
        : now;
      if (exp <= publishAt) errors["schedule.expiresAt"] = "Expiration must be after the publish time.";
    }
  }
  return errors;
}

/** Full validation across every step — the authoritative server-side gate. */
export function validateAnnouncement(input: AnnouncementInput, now: number = Date.now()): FieldErrors {
  return {
    ...validateContentStep(input),
    ...validateChannelsStep(input),
    ...validateAudienceStep(input),
    ...validateScheduleStep(input, now),
  };
}

export function firstValidationError(errors: FieldErrors): string | null {
  const values = Object.values(errors);
  return values.length > 0 ? values[0] : null;
}

/** True when the announcement is ready for a real broadcast review (used to
 *  gate the "Publish and send" button, distinct from "can save as draft"). */
export function isReadyToPublish(input: AnnouncementInput, now: number = Date.now()): boolean {
  return Object.keys(validateAnnouncement(input, now)).length === 0;
}
