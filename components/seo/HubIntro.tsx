import { hubIntro, type HubKey } from "@/lib/seo/hub-intros";

/**
 * A collection hub's approved introduction (SEO Phase 2.3), or nothing.
 * Server-rendered text under the page's header, shown only on the unfiltered
 * first page: filters and later pages are noindex or say something else, and
 * the same paragraph on every page of a list is repetition, not content.
 */
export default function HubIntro({
  hub,
  locale,
  show = true,
  className = "",
}: {
  hub: HubKey;
  locale: string;
  show?: boolean;
  className?: string;
}) {
  const text = show ? hubIntro(hub, locale) : null;
  if (!text) return null;
  return (
    <p className={`max-w-3xl text-[15px] leading-relaxed text-text-muted ${className}`.trim()}>{text}</p>
  );
}
