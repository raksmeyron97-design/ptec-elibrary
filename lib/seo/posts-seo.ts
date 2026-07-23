import { SITE_URL } from "@/lib/seo/site";
import { libraryNode, organizationNode } from "@/lib/seo/org-nodes";
import {
  resolveOrgIdentity,
  type OrgIdentity,
} from "@/lib/system-settings/org-identity";
import { localeAlternates } from "@/lib/seo/alternates";
import type { EventFields } from "@/lib/posts/event-status";

/** OG fallback for the News & Events hub when no featured cover is available. */
export const POSTS_FALLBACK_OG_IMAGE = `${SITE_URL}/og-default.png`;

/** Canonical URL of the listing (locale-aware, page-aware). */
export function postsListingUrl(locale: string, page = 1): string {
  const path = page > 1 ? `/posts?page=${page}` : "/posts";
  return localeAlternates(path, locale).canonical;
}

function postCanonical(slug: string, locale: string): string {
  return localeAlternates(`/posts/${slug}`, locale).canonical;
}

/**
 * CollectionPage + ItemList for the clean (unfiltered) News & Events listing.
 * Only emitted when the URL equals the page's canonical (no filter/search/sort),
 * so the schema URL and the visible content agree.
 */
export function postsCollectionJsonLd({
  locale,
  page,
  pageSize,
  total,
  name,
  description,
  items,
  org: orgArg,
}: {
  locale: string;
  page: number;
  pageSize: number;
  total: number;
  name: string;
  description: string;
  items: { slug: string; title: string }[];
  /** Resolved published identity — `await getOrgIdentity()`. */
  org?: OrgIdentity;
}): Record<string, unknown> {
  const org = resolveOrgIdentity(orgArg);
  const url = postsListingUrl(locale, page);
  const offset = (Math.max(1, page) - 1) * pageSize;

  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${url}#collection`,
    name,
    description,
    url,
    isAccessibleForFree: true,
    inLanguage: locale === "km" ? "km" : "en",
    provider: libraryNode(org),
    publisher: { "@type": "Organization", name: org.siteName, url: org.url },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: total,
      itemListElement: items.map((item, i) => ({
        "@type": "ListItem",
        position: offset + i + 1,
        name: item.title,
        url: postCanonical(item.slug, locale),
      })),
    },
  };
}

const EVENT_STATUS_SCHEMA: Record<string, string> = {
  cancelled: "https://schema.org/EventCancelled",
  postponed: "https://schema.org/EventPostponed",
};

const EVENT_ATTENDANCE_SCHEMA: Record<string, string> = {
  online: "https://schema.org/OnlineEventAttendanceMode",
  hybrid: "https://schema.org/MixedEventAttendanceMode",
  in_person: "https://schema.org/OfflineEventAttendanceMode",
};

/**
 * schema.org/Event for an Event-category post. Only the fields that are actually
 * present are emitted — no fabricated location, dates, or availability — so the
 * structured data matches the visible page. Returns null when the post has no
 * start date (not a real event).
 */
export function postEventJsonLd({
  event,
  title,
  description,
  url,
  image,
  org: orgArg,
}: {
  event: EventFields;
  title: string;
  description?: string | null;
  url: string;
  image?: string | null;
  /** Resolved published identity — `await getOrgIdentity()`. */
  org?: OrgIdentity;
}): Record<string, unknown> | null {
  if (!event.startAt) return null;
  const org = resolveOrgIdentity(orgArg);

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: title,
    startDate: event.startAt,
    url,
    eventStatus: event.statusOverride
      ? EVENT_STATUS_SCHEMA[event.statusOverride]
      : "https://schema.org/EventScheduled",
    organizer: organizationNode(org),
    isAccessibleForFree: true,
  };
  if (event.endAt) schema.endDate = event.endAt;
  if (description) schema.description = description;
  if (image) schema.image = image;
  if (event.format) schema.eventAttendanceMode = EVENT_ATTENDANCE_SCHEMA[event.format];

  // Location: a virtual location for online events, a physical place otherwise.
  if (event.format === "online") {
    schema.location = {
      "@type": "VirtualLocation",
      url: event.registrationUrl || url,
    };
  } else if (event.location) {
    schema.location = { "@type": "Place", name: event.location, address: event.location };
  }

  if (event.registrationUrl && event.statusOverride !== "cancelled") {
    schema.offers = {
      "@type": "Offer",
      url: event.registrationUrl,
      availability: "https://schema.org/InStock",
    };
  }

  return schema;
}
