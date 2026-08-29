import { ExternalLink, Globe, GraduationCap, Users } from "lucide-react";
import type { AuthorLink, AuthorLinkKind } from "@/lib/authors/links";

/**
 * ORCID's mark, inline rather than from an icon set: lucide has no ORCID glyph,
 * and the iD is the one external identifier on this page that readers recognise
 * by its logo. Two paths, no gradients — it survives being 14px tall.
 */
function OrcidMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 256 256" className={className} aria-hidden="true" focusable="false">
      <circle cx="128" cy="128" r="128" fill="currentColor" opacity="0.15" />
      <path
        fill="currentColor"
        d="M86 76a11 11 0 1 1-22 0 11 11 0 0 1 22 0Zm-19 24h16v88H67v-88Zm34 0h34c33 0 48 21 48 44 0 25-19 44-48 44h-34v-88Zm16 14v60h17c24 0 32-15 32-30 0-16-10-30-33-30h-16Z"
      />
    </svg>
  );
}

const ICONS: Record<AuthorLinkKind, (props: { className?: string }) => React.ReactNode> = {
  orcid: (p) => <OrcidMark {...p} />,
  website: (p) => <Globe {...p} aria-hidden="true" />,
  scholar: (p) => <GraduationCap {...p} aria-hidden="true" />,
  researchgate: (p) => <Users {...p} aria-hidden="true" />,
};

/**
 * The author's external scholarly identities.
 *
 * Every entry is an icon PLUS a text label, never an icon alone: an unlabelled
 * mortarboard is not a recognisable name for "Google Scholar" to a screen
 * reader or to a reader who has never seen the icon. `accessibleNames` carries
 * the translated "<kind> profile" wording for the aria-label, so the visible
 * label can stay short.
 */
export default function AuthorProfileLinks({
  links,
  accessibleNames,
  className = "",
}: {
  links: AuthorLink[];
  accessibleNames: Record<AuthorLinkKind, string>;
  className?: string;
}) {
  if (links.length === 0) return null;

  return (
    <ul className={`flex flex-wrap items-center gap-2 ${className}`}>
      {links.map((link) => {
        const Icon = ICONS[link.kind];
        return (
          <li key={link.kind}>
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer external"
              aria-label={`${accessibleNames[link.kind]} (opens in a new tab)`}
              className="focus-field inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-divider bg-bg-surface px-2.5 py-1.5 text-[12.5px] font-semibold text-text-body transition-colors hover:border-brand/40 hover:text-brand"
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="max-w-[190px] truncate">{link.label}</span>
              <ExternalLink className="h-3 w-3 shrink-0 opacity-50" aria-hidden="true" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
