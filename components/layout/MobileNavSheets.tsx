"use client";

// components/layout/MobileNavSheets.tsx
// The tab bar's two sheets — Library and Profile — split out of
// MobileBottomNav so they are not on every page's critical path.
//
// The bar is on every public page; these sheets are needed only after a tap.
// Measured on production builds (390 px, same data), carrying them in the bar
// cost 3–9 KB of gzipped JavaScript before `load` on every route. The bar now
// loads this module at browser idle (next/dynamic, no SSR), so a first tap
// finds it ready and the open animation still plays; a tap before idle simply
// mounts it then.
//
// Sheets are portalled (GlassSheet): the bar is a backdrop-filter surface,
// which would otherwise become the containing block of anything fixed.

import { Link, usePathname } from "@/i18n/navigation";
import NextLink from "next/link";
import { useState, type ComponentType, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Bookmark,
  ChevronRight,
  ExternalLink,
  HardDriveDownload,
  Info,
  Landmark,
  LayoutDashboard,
  LogIn,
  LogOut,
  Newspaper,
  PenLine,
  Settings,
  Tags,
  type LucideProps,
} from "lucide-react";
import { ADMIN_PANEL_ROLES, ROLE_META } from "@/lib/types/roles";
import { useSession } from "@/components/providers/SessionProvider";
import { clearPrivateBrowserState } from "@/lib/sw-client";
import GlassSheet from "@/components/ui/glass/GlassSheet";
import { resolveLibraryStatus } from "@/lib/about/status";
import type { HoursClosure } from "@/lib/system-settings/types";
import { DIGITAL_LIBRARY_ITEMS } from "./digital-library-nav";
import { useLibraryOpenStatus } from "./useLibraryOpenStatus";
import { getInitials } from "./user-initials";

type Icon = ComponentType<LucideProps>;
type Hours = { spec: string[]; closures: HoursClosure[] };

// ── A row inside a sheet ────────────────────────────────────────────────────
function SheetRow({
  href,
  Icon,
  label,
  description,
  onNavigate,
  current,
  external,
  externalLabel,
  trailing,
}: {
  href: string;
  Icon: Icon;
  label: string;
  description?: ReactNode;
  onNavigate: () => void;
  current?: boolean;
  external?: boolean;
  externalLabel?: string;
  trailing?: ReactNode;
}) {
  const body = (
    <>
      <span
        aria-hidden="true"
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          current ? "bg-brand text-brand-contrast" : "bg-glass-selected text-brand"
        }`}
      >
        <Icon className="h-5 w-5" strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-snug text-text-heading">{label}</span>
        {description && <span className="mt-0.5 block text-[12.5px] leading-snug text-text-muted">{description}</span>}
      </span>
      {trailing}
      {external ? (
        <>
          <ExternalLink className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
          <span className="sr-only">({externalLabel})</span>
        </>
      ) : (
        <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
      )}
    </>
  );
  const className = `flex min-h-14 items-center gap-3 rounded-2xl px-3 py-2 transition-colors hover:bg-glass-selected ${
    current ? "bg-glass-selected" : ""
  }`;
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={onNavigate} className={className}>
        {body}
      </a>
    );
  }
  return (
    <Link href={href} onClick={onNavigate} aria-current={current ? "page" : undefined} className={className}>
      {body}
    </Link>
  );
}

// ── The physical library's live status line ────────────────────────────────
// Mounted only while the Library sheet is open, so it ticks only then.
function PhysicalLibraryStatus({ hours }: { hours: Hours }) {
  const rawLocale = useLocale();
  const locale = rawLocale === "km" ? "km" : "en";
  const [initialStatus] = useState(() => resolveLibraryStatus(new Date(), hours.spec, hours.closures));
  const { tone, text } = useLibraryOpenStatus({ initialStatus, spec: hours.spec, closures: hours.closures, locale });
  return (
    <span className="mt-0.5 flex items-center gap-1.5 text-[12.5px] leading-snug text-text-muted">
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${
          tone === "open"
            ? "bg-[var(--ptec-success)]"
            : tone === "notice"
              ? "bg-[var(--ptec-warning)]"
              : "bg-[var(--ptec-border-strong)]"
        }`}
      />
      {text}
    </span>
  );
}

// ── Component ───────────────────────────────────────────────────────────────
export default function MobileNavSheets({
  sheet,
  onClose,
  hours,
  showAvatar,
}: {
  sheet: "library" | "profile" | null;
  onClose: () => void;
  hours?: Hours;
  /** The bar's verdict on the avatar image (it has seen whether it loads). */
  showAvatar: boolean;
}) {
  const { user } = useSession();
  const t = useTranslations("nav");
  const tOffline = useTranslations("offline");
  const pathname = usePathname() ?? "/";
  const closeSheet = onClose;
  const isCurrent = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  // The digital collections come from the nav config; Learning Paths has its
  // own tab, and the external SVA catalogue is listed last and labelled as
  // external, exactly as in the drawer.
  const digital = DIGITAL_LIBRARY_ITEMS.filter((item) => item.href !== "/paths");
  const internalDigital = digital.filter((item) => !item.external);
  const external = digital.filter((item) => item.external);

  return (
    <>
      {/* ── Library ────────────────────────────────────────────────── */}
      {/* The sheets' lists keep an explicit role="list": outside a <nav>,
          Safari/VoiceOver drops list semantics from a `list-style: none` list,
          and "list, 7 items" is how a screen-reader user learns the size of
          the menu. The tab bar's own list sits inside <nav> and needs none. */}
      <GlassSheet
        open={sheet === "library"}
        onClose={closeSheet}
        title={t("librarySheetTitle")}
        closeLabel={t("close")}
        className="lg:hidden"
      >
        <ul role="list" className="space-y-0.5">
          {internalDigital.map((item) => (
            <li key={item.href}>
              <SheetRow
                href={item.href}
                Icon={item.icon}
                label={t(item.labelKey)}
                description={t(item.descriptionKey)}
                current={isCurrent(item.href)}
                onNavigate={closeSheet}
              />
            </li>
          ))}
          <li>
            <SheetRow
              href="/catalogs"
              Icon={Landmark}
              label={t("booksInLibrary")}
              description={
                hours ? <PhysicalLibraryStatus hours={hours} /> : t("physicalLibraryDescription")
              }
              current={isCurrent("/catalogs")}
              onNavigate={closeSheet}
            />
          </li>
          <li>
            <SheetRow
              href="/subjects"
              Icon={Tags}
              label={t("subjects")}
              description={t("subjectsDescription")}
              current={isCurrent("/subjects")}
              onNavigate={closeSheet}
            />
          </li>
          <li>
            <SheetRow
              href="/authors"
              Icon={PenLine}
              label={t("authors")}
              description={t("authorsDescription")}
              current={isCurrent("/authors")}
              onNavigate={closeSheet}
            />
          </li>
        </ul>
        {external.length > 0 && (
          <>
            <p className="px-3 pb-1 pt-4 text-[12px] font-semibold text-text-muted">{t("digitalLibraryExternalGroup")}</p>
            <ul role="list">
              {external.map((item) => (
                <li key={item.href}>
                  <SheetRow
                    href={item.href}
                    Icon={item.icon}
                    label={t(item.labelKey)}
                    description={t(item.descriptionKey)}
                    external
                    externalLabel={t("opensNewTab")}
                    onNavigate={closeSheet}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </GlassSheet>

      {/* ── Profile ────────────────────────────────────────────────── */}
      <GlassSheet
        open={sheet === "profile"}
        onClose={closeSheet}
        title={t("profileMenu")}
        hideTitle
        closeLabel={t("close")}
        className="lg:hidden"
        header={
          user ? (
            <div className="flex items-center gap-3 px-5 pb-3">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full">
                {showAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.avatar_url!}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-contrast">
                    {getInitials(user.full_name, user.email)}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[16px] font-bold text-text-heading">{user.full_name || user.email}</p>
                {user.full_name && <p className="truncate text-[12.5px] text-text-muted">{user.email}</p>}
                {ADMIN_PANEL_ROLES.includes(user.role) && (
                  <span
                    className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${ROLE_META[user.role].bgColor} ${ROLE_META[user.role].color}`}
                  >
                    {ROLE_META[user.role].label}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p className="px-5 pb-3 text-[14px] leading-relaxed text-text-body">{t("signInHint")}</p>
          )
        }
        footer={
          user ? (
            <form action="/auth/signout" method="POST" onSubmit={() => { void clearPrivateBrowserState(); }}>
              <button
                type="submit"
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-danger-soft px-4 text-[15px] font-semibold text-danger-text transition-colors hover:brightness-95"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                {t("logout")}
              </button>
            </form>
          ) : (
            // Plain next/link: /auth is outside the locale scheme, so the
            // localized Link would send a Khmer reader to /km/auth/login.
            <NextLink
              href="/auth/login"
              onClick={closeSheet}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 text-[15px] font-semibold text-brand-contrast transition-colors hover:bg-brand-hover"
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              {t("login")}
            </NextLink>
          )
        }
      >
        <ul role="list" className="space-y-0.5">
          {user && (
            <>
              <li>
                <SheetRow href="/dashboard" Icon={LayoutDashboard} label={t("myDashboard")} current={pathname === "/dashboard"} onNavigate={closeSheet} />
              </li>
              <li>
                <SheetRow href="/dashboard#saved" Icon={Bookmark} label={t("savedBooks")} onNavigate={closeSheet} />
              </li>
            </>
          )}
          {/* Device storage, not an account: offered signed in or out. */}
          <li>
            <SheetRow
              href="/offline-books"
              Icon={HardDriveDownload}
              label={tOffline("libraryTitle")}
              current={isCurrent("/offline-books")}
              onNavigate={closeSheet}
            />
          </li>
          {user && (
            <li>
              <SheetRow href="/dashboard/settings" Icon={Settings} label={t("settings")} current={isCurrent("/dashboard/settings")} onNavigate={closeSheet} />
            </li>
          )}
        </ul>
        <div className="mx-3 my-2 h-px bg-divider/70" aria-hidden="true" />
        <ul role="list" className="space-y-0.5">
          <li>
            <SheetRow href="/posts" Icon={Newspaper} label={t("posts")} current={isCurrent("/posts")} onNavigate={closeSheet} />
          </li>
          <li>
            <SheetRow href="/about" Icon={Info} label={t("about")} current={isCurrent("/about")} onNavigate={closeSheet} />
          </li>
        </ul>
      </GlassSheet>
    </>
  );
}
