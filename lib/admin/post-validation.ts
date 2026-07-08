/**
 * Pure validation rules for post create/edit (spec §25). No server/client
 * split needed — these run in the Server Action and can be re-run
 * client-side for inline feedback since they touch no I/O.
 */

import { CATEGORIES, STATUSES, type PostCategory, type PostStatus } from "@/lib/admin/posts-shared";

export type PostValidationInput = {
  title: string;
  slug: string;
  category: string;
  content: string;
  excerpt?: string | null;
  tags: string[];
  status: string;
  scheduledAt?: string | null;
};

export type PostValidationErrors = Partial<Record<keyof PostValidationInput, string>>;

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function validatePost(input: PostValidationInput): PostValidationErrors {
  const errors: PostValidationErrors = {};

  const title = input.title.trim();
  if (!title) errors.title = "Title is required";
  else if (title.length < 3) errors.title = "Title must be at least 3 characters";
  else if (title.length > 180) errors.title = "Title must be 180 characters or fewer";

  const slug = input.slug.trim();
  if (!slug) errors.slug = "Slug is required";
  else if (!SLUG_RE.test(slug)) errors.slug = "Slug must be lowercase letters, numbers, and hyphens only";

  if (!CATEGORIES.includes(input.category as PostCategory)) errors.category = "Choose a valid category";

  if (!input.content.trim()) errors.content = "Content is required";

  if (input.excerpt && input.excerpt.length > 160) {
    errors.excerpt = "Excerpt is longer than the recommended 160 characters";
  }

  const seen = new Set<string>();
  for (const tag of input.tags) {
    const key = tag.trim().toLowerCase();
    if (seen.has(key)) { errors.tags = "Duplicate tags aren't allowed"; break; }
    seen.add(key);
  }
  if (!errors.tags && input.tags.length > 10) errors.tags = "Maximum 10 tags";

  if (!STATUSES.includes(input.status as PostStatus)) errors.status = "Choose a valid status";

  if (input.status === "scheduled") {
    if (!input.scheduledAt) {
      errors.scheduledAt = "A publish date/time is required when scheduling";
    } else {
      const when = new Date(input.scheduledAt).getTime();
      if (Number.isNaN(when)) errors.scheduledAt = "Invalid date/time";
      else if (when <= Date.now()) errors.scheduledAt = "Scheduled time must be in the future";
    }
  }

  return errors;
}

export function firstValidationError(errors: PostValidationErrors): string | null {
  const values = Object.values(errors).filter(Boolean);
  return values.length ? (values[0] as string) : null;
}
