"use client";

// components/layout/MobileNavSheets.tsx
// The tab bar's three sheets — Explore, Saved and More — split out of
// MobileBottomNav so they are not on every page's critical path.
//
// The bar is on every public page; these sheets are needed only after a tap.
// Measured on production builds (390 px, same data), carrying them in the bar
// cost 3–9 KB of gzipped JavaScript before `load` on every route. The bar
// loads this module at browser idle (next/dynamic, no SSR), so a first tap
// finds it ready and the open animation still plays; a tap before idle simply
// mounts it then.
//
// Between them the sheets carry EVERY destination and control the ☰ drawer
// carried. The drawer is gone below `lg` — the phone top bar is the brand and
// a search button — so a destination missing here would be a feature removed
// (components/layout/mobile-shell-parity.test.ts fails if one goes missing):
//   Explore  Learning Paths first (it has no tab of its own now), the digital
//            collections from DIGITAL_LIBRARY_ITEMS, the physical library with
//            its live open/closed line, subjects, authors, external libraries.
//   Saved    what the reader has kept: the dashboard, saved books and reading
//            lists (their account), and this device's downloads (signed in or
//            out — downloads belong to the device, not an account).
//   More     the account (settings, notifications, sign in / out), News, every
//            About page, appearance and language, the library's contact
//            details, and the install button.
//
// Sheets are portalled (GlassSheet): the bar is a backdrop-filter surface,
// which would otherwise become the containing block of anything fixed.

import { Link, usePathname } from "@/i18n/navigation";
import NextLink from "next/link";
import { useState, type ComponentType, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Bell,
  Bookmark,
  ChevronRight,
  Clock3,
  ExternalLink,
  HardDriveDownload,
  Landmark,
  Languages,
  LayoutDashboard,
  ListChecks,
  LogIn,
  LogOut,
  Mail,
  MapPin,
  Newspaper,
  PenLine,
  Phone,
  Settings,
  SunMoon,
  Tags,
  type LucideProps,
} from "lucide-react";
import { ADMIN_PANEL_ROLES, ROLE_META } from "@/lib/types/roles";
import { useSession } from "@/components/providers/SessionProvider";
import { clearPrivateBrowserState } from "@/lib/sw-client";
import GlassSheet from "@/components/ui/glass/GlassSheet";
import ThemeToggle from "@/components/ui/core/ThemeToggle";
import LanguageSwitcher from "@/components/ui/core/LanguageSwitcher";
import NotificationBell from "@/components/ui/notifications/NotificationBell";
import InstallPWA from "@/components/ui/pwa/InstallPWA";
import { resolveLibraryStatus } from "@/lib/about/status";
import type { HoursClosure } from "@/lib/system-settings/types";
import { DIGITAL_LIBRARY_ITEMS, type DigitalLibraryItem } from "./digital-library-nav";
import MobileAboutAccordion from "./MobileAboutAccordion";
import { useLibraryOpenStatus } from "./useLibraryOpenStatus";
import { getInitials } from "./user-initials";

type Icon = ComponentType<LucideProps>;
type Hours = { spec: string[]; closures: HoursClosure[] };

export type ShellSheet = "explore" | "saved" | "more";

/** The library's published contact details, resolved on the server (Footer)
 *  from System Settings — never hard-coded here. */
export type ShellContact = {
  phone: string;
  phoneTel: string;
  email: string;
  mapPlace: string;
  /** Pre-formatted opening hours (compactHoursLabel). */
  hoursLabel: string;
};

/** Learning Paths leads the Explore sheet; everything else keeps the nav
 *  config's order (the sort is stable). */
function pathsFirst(items: readonly DigitalLibraryItem[]): DigitalLibraryItem[] {
  return [...items].sort((a, b) => Number(b.href === "/paths") - Number(a.href === "/paths"));
}

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

// ── A row that holds a control rather than going anywhere ──────────────────
function ControlRow({ Icon, label, children }: { Icon: Icon; label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-14 items-center gap-3 rounded-2xl px-3 py-1.5">
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-glass-selected text-brand"
      >
        <Icon className="h-5 w-5" strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-text-heading">{label}</span>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="px-3 pb-1 pt-4 text-[12px] font-semibold text-text-muted">{children}</p>;
}

const CONTACT_ROW =
  "flex min-h-12 items-center gap-3 rounded-2xl px-3 text-[14px] leading-snug text-text-body transition-colors hover:bg-glass-selected";

// ── The physical library's live status line ────────────────────────────────
// Mounted only while the Explore sheet is open, so it ticks only then.
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
  contact,
  showAvatar,
}: {
  sheet: ShellSheet | null;
  onClose: () => void;
  hours?: Hours;
  contact?: ShellContact;
  /** The bar's verdict on the avatar image (it has seen whether it loads). */
  showAvatar: boolean;
}) {
  const { user } = useSession();
  const t = useTranslations("nav");
  const tOffline = useTranslations("offline");
  const tFooter = useTranslations("footer");
  const tNotifications = useTranslations("notifications");
  const rawLocale = useLocale();
  const locale: "en" | "km" = rawLocale === "km" ? "km" : "en";
  const pathname = usePathname() ?? "/";
  const closeSheet = onClose;
  const isCurrent = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  // The digital collections come from the nav config — the list the desktop
  // mega-menu and the homepage collection grid render — with Learning Paths
  // moved to the front; the external libraries are listed last and labelled
  // as external, exactly as in the desktop menu.
  const digital = pathsFirst(DIGITAL_LIBRARY_ITEMS);
  const internalDigital = digital.filter((item) => !item.external);
  const external = digital.filter((item) => item.external);

  const signIn = (
    // Plain next/link: /auth is outside the locale scheme, so the localized
    // Link would send a Khmer reader to /km/auth/login.
    <NextLink
      href="/auth/login"
      onClick={closeSheet}
      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 text-[15px] font-semibold text-brand-contrast transition-colors hover:bg-brand-hover"
    >
      <LogIn className="h-4 w-4" aria-hidden="true" />
      {t("login")}
    </NextLink>
  );

  return (
    <>
      {/* ── Explore ────────────────────────────────────────────────── */}
      {/* The sheets' lists keep an explicit role="list": outside a <nav>,
          Safari/VoiceOver drops list semantics from a `list-style: none` list,
          and "list, 8 items" is how a screen-reader user learns the size of
          the menu. The tab bar's own list sits inside <nav> and needs none. */}
      <GlassSheet
        open={sheet === "explore"}
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
            <SectionLabel>{t("digitalLibraryExternalGroup")}</SectionLabel>
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

      {/* ── Saved ──────────────────────────────────────────────────── */}
      <GlassSheet
        open={sheet === "saved"}
        onClose={closeSheet}
        title={t("savedSheetTitle")}
        closeLabel={t("close")}
        className="lg:hidden"
        header={
          user ? undefined : (
            <p className="px-5 pb-3 text-[14px] leading-relaxed text-text-body">{t("savedSignInHint")}</p>
          )
        }
        footer={user ? undefined : signIn}
      >
        <ul role="list" className="space-y-0.5">
          {user && (
            <>
              <li>
                <SheetRow
                  href="/dashboard"
                  Icon={LayoutDashboard}
                  label={t("myDashboard")}
                  description={t("myDashboardDescription")}
                  current={pathname === "/dashboard"}
                  onNavigate={closeSheet}
                />
              </li>
              {/* The dashboard reads ?tab= to open the right panel. */}
              <li>
                <SheetRow href="/dashboard?tab=saved" Icon={Bookmark} label={t("savedBooks")} onNavigate={closeSheet} />
              </li>
              <li>
                <SheetRow href="/dashboard?tab=lists" Icon={ListChecks} label={t("readingLists")} onNavigate={closeSheet} />
              </li>
            </>
          )}
          {/* Device storage, not an account: offered signed in or out. */}
          <li>
            <SheetRow
              href="/offline-books"
              Icon={HardDriveDownload}
              label={tOffline("libraryTitle")}
              description={t("offlineBooksDescription")}
              current={isCurrent("/offline-books")}
              onNavigate={closeSheet}
            />
          </li>
        </ul>
      </GlassSheet>

      {/* ── More ───────────────────────────────────────────────────── */}
      <GlassSheet
        open={sheet === "more"}
        onClose={closeSheet}
        title={t("more")}
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
            signIn
          )
        }
      >
        <ul role="list" className="space-y-0.5">
          {user && (
            <>
              <li>
                <SheetRow
                  href="/dashboard/settings"
                  Icon={Settings}
                  label={t("settings")}
                  current={isCurrent("/dashboard/settings")}
                  onNavigate={closeSheet}
                />
              </li>
              <li>
                <ControlRow Icon={Bell} label={tNotifications("title")}>
                  <NotificationBell userId={user.id} userRole={user.role} />
                </ControlRow>
              </li>
            </>
          )}
          <li>
            <SheetRow href="/posts" Icon={Newspaper} label={t("posts")} current={isCurrent("/posts")} onNavigate={closeSheet} />
          </li>
        </ul>
        {/* All seven About pages, grouped as in the desktop popover — the
            same accordion the drawer used. */}
        <div className="mt-0.5">
          <MobileAboutAccordion pathname={pathname} onNavigate={closeSheet} />
        </div>

        <SectionLabel>{t("appearance")}</SectionLabel>
        <ControlRow Icon={SunMoon} label={t("appearance")}>
          <ThemeToggle />
        </ControlRow>
        <ControlRow Icon={Languages} label={t("language")}>
          <LanguageSwitcher locale={locale} size="touch" />
        </ControlRow>

        {contact && (
          <>
            <SectionLabel>{tFooter("information")}</SectionLabel>
            <ul role="list" className="space-y-0.5">
              <li className="flex min-h-12 items-center gap-3 px-3 text-[14px] leading-snug text-text-body">
                <Clock3 className="h-[18px] w-[18px] shrink-0 text-text-muted" aria-hidden="true" />
                <span>
                  <span className="sr-only">{tFooter("hoursLabel")}: </span>
                  {contact.hoursLabel}
                </span>
              </li>
              <li>
                <a href={contact.phoneTel} className={CONTACT_ROW}>
                  <Phone className="h-[18px] w-[18px] shrink-0 text-text-muted" aria-hidden="true" />
                  <span className="sr-only">{tFooter("phoneLabel")}: </span>
                  {contact.phone}
                </a>
              </li>
              <li>
                <a href={`mailto:${contact.email}`} className={`${CONTACT_ROW} break-all`}>
                  <Mail className="h-[18px] w-[18px] shrink-0 text-text-muted" aria-hidden="true" />
                  <span className="sr-only">{tFooter("emailLabel")}: </span>
                  {contact.email}
                </a>
              </li>
              <li>
                <a href={contact.mapPlace} target="_blank" rel="noopener noreferrer" className={CONTACT_ROW}>
                  <MapPin className="h-[18px] w-[18px] shrink-0 text-text-muted" aria-hidden="true" />
                  <span className="min-w-0 flex-1">{tFooter("getDirections")}</span>
                  <ExternalLink className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                  <span className="sr-only">({t("opensNewTab")})</span>
                </a>
              </li>
            </ul>
          </>
        )}
        <div className="relative px-3 pt-3">
          <InstallPWA
            label={tFooter("installApp")}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-divider bg-bg-surface px-4 text-[14px] font-semibold text-text-heading transition-colors hover:border-brand/30 hover:text-brand"
            hintClassName="absolute bottom-full left-0 right-0 z-[80] mb-2 rounded-xl border border-divider bg-bg-surface p-4 text-text-body shadow-lg"
          />
        </div>
      </GlassSheet>
    </>
  );
}
