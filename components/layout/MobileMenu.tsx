"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import NextLink from "next/link";
import Icon from "@/components/ui/core/Icon";
import ThemeToggle from "@/components/ui/core/ThemeToggle";
import { useTranslations } from "next-intl";
import LanguageSwitcher from "@/components/ui/core/LanguageSwitcher";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import { useMountTransition } from "@/lib/hooks/useMountTransition";
import MobileDigitalLibraryAccordion from "./MobileDigitalLibraryAccordion";
import MobileAboutAccordion from "./MobileAboutAccordion";
import NotificationBell from "@/components/ui/notifications/NotificationBell";
import InstallPWA from "@/components/ui/pwa/InstallPWA";
import { Seal } from "@/components/ui/core/Seal";
import { PTEC } from "@/lib/ptec";

type NavItem = { label: string; href: string };

type UserInfo = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: "reader" | "admin";
};

type MobileMenuProps = {
  navLinks: NavItem[];
  user: UserInfo | null;
  locale: "en" | "km";
};

function getInitials(name: string | null, email: string) {
  if (name) {
    return name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return email.slice(0, 2).toUpperCase();
}

function sectionLabelClass() {
  return "px-4 pb-2 pt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted";
}

export default function MobileMenu({ navLinks, user, locale }: MobileMenuProps) {
  const t = useTranslations("nav");
  const footerT = useTranslations("footer");
  const notificationsT = useTranslations("notifications");
  const pathname = usePathname();
  const drawerId = useId();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const open = openPath === pathname;
  const drawer = useMountTransition(open);

  const closeDrawer = useCallback(() => setOpenPath(null), []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeDrawer();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closeDrawer]);

  const trapRef = useFocusTrap<HTMLDivElement>(open && drawer.mounted);

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpenPath(pathname)}
        aria-label={t("openMenu")}
        aria-expanded={open}
        aria-controls={drawerId}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-text-body transition-colors hover:bg-paper hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
      >
        <svg
          className="h-6 w-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
        </svg>
      </button>

      {drawer.mounted && (
        <div
          onClick={closeDrawer}
          aria-hidden="true"
          className="fixed left-0 top-0 z-[60] h-[100dvh] w-screen bg-slate-950/45 backdrop-blur-[2px] transition-opacity duration-200 ease-out motion-reduce:transition-none"
          style={{ opacity: drawer.shown ? 1 : 0 }}
        />
      )}

      {drawer.mounted && (
        <div
          id={drawerId}
          ref={trapRef}
          role="dialog"
          aria-modal="true"
          aria-label={t("menu")}
          inert={!open}
          aria-hidden={!open}
          tabIndex={-1}
          className="fixed right-0 top-0 z-[70] flex h-[100dvh] w-[min(100vw,390px)] flex-col bg-bg-surface pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] shadow-[-10px_0_32px_rgba(0,0,0,0.18)] outline-none transition-transform duration-[240ms] ease-out motion-reduce:transition-none"
          style={{ transform: drawer.shown ? "translateX(0)" : "translateX(100%)" }}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-divider px-4 py-3">
            <Link href="/home" onClick={closeDrawer} className="flex min-w-0 items-center gap-3">
              <Seal size={42} />
              <span className="min-w-0">
                <span lang="km" className="block truncate font-khmer-serif text-[13px] font-bold leading-tight text-brand">
                  បណ្ណាល័យ វ.គ.ភ
                </span>
                <span className="block truncate text-[12px] font-semibold text-text-heading">
                  PTEC Library
                </span>
              </span>
            </Link>
            <button
              type="button"
              onClick={closeDrawer}
              aria-label={t("closeMenu")}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-paper hover:text-text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <Icon name="x" className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            <Link
              href="/search"
              onClick={closeDrawer}
              className="mt-4 flex min-h-12 items-center gap-3 rounded-xl border border-divider bg-paper px-4 text-[15px] font-semibold text-text-heading transition-colors hover:border-brand/30 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
            >
              <Icon name="search" className="h-5 w-5 text-text-muted" aria-hidden="true" />
              {t("searchLibrary")}
            </Link>

            <nav aria-label={t("menu")} className="mt-2">
              <p className={sectionLabelClass()}>{t("digitalLibraryTitle")}</p>
              <div className="space-y-1">
                {navLinks.map((link, index) => {
                  const active = isActive(link.href);
                  return (
                    <div key={link.href}>
                      <Link
                        href={link.href}
                        aria-current={active ? "page" : undefined}
                        onClick={closeDrawer}
                        className={`flex min-h-12 items-center justify-between rounded-lg px-4 py-3 text-[15px] font-semibold transition-colors ${
                          active
                            ? "bg-brand/10 text-brand"
                            : "text-text-body hover:bg-paper hover:text-brand-hover"
                        }`}
                      >
                        <span className="min-w-0 break-words">{link.label}</span>
                        {active && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />}
                      </Link>

                      {index === 0 && (
                        <MobileDigitalLibraryAccordion
                          pathname={pathname}
                          onNavigate={closeDrawer}
                        />
                      )}

                      {index === 2 && (
                        <MobileAboutAccordion
                          pathname={pathname}
                          onNavigate={closeDrawer}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </nav>

            <div className="mt-2 border-t border-divider">
              <p className={sectionLabelClass()}>{t("profile")}</p>
              {user ? (
                <div className="space-y-2">
                  <div className="flex min-w-0 items-center gap-3 rounded-xl bg-paper px-4 py-3">
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-brand text-brand-contrast">
                      {user.avatar_url && !avatarFailed ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={user.avatar_url}
                          alt={user.full_name || user.email}
                          referrerPolicy="no-referrer"
                          onError={() => setAvatarFailed(true)}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-xs font-bold">
                          {getInitials(user.full_name, user.email)}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-text-heading">
                        {user.full_name || user.email}
                      </p>
                      {user.full_name && <p className="truncate text-xs text-text-muted">{user.email}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-1">
                    <Link href="/dashboard" onClick={closeDrawer} className="flex min-h-11 items-center gap-3 rounded-lg px-4 text-sm font-medium text-text-body hover:bg-paper hover:text-brand">
                      <Icon name="account" className="h-4 w-4 text-text-muted" aria-hidden="true" />
                      {t("myDashboard")}
                    </Link>
                    <Link href="/dashboard#saved" onClick={closeDrawer} className="flex min-h-11 items-center gap-3 rounded-lg px-4 text-sm font-medium text-text-body hover:bg-paper hover:text-brand">
                      <Icon name="bookmark" className="h-4 w-4 text-text-muted" aria-hidden="true" />
                      {t("savedBooks")}
                    </Link>
                    <Link href="/dashboard/settings" onClick={closeDrawer} className="flex min-h-11 items-center gap-3 rounded-lg px-4 text-sm font-medium text-text-body hover:bg-paper hover:text-brand">
                      <Icon name="settings" className="h-4 w-4 text-text-muted" aria-hidden="true" />
                      {t("settings")}
                    </Link>
                    <div className="flex min-h-11 items-center justify-between rounded-lg px-4 text-sm font-medium text-text-body">
                      <span className="flex items-center gap-3">
                        <Icon name="bell" className="h-4 w-4 text-text-muted" aria-hidden="true" />
                        {notificationsT("title")}
                      </span>
                      <NotificationBell userId={user.id} userRole={user.role} />
                    </div>
                  </div>
                </div>
              ) : (
                <NextLink
                  href="/auth/login"
                  onClick={closeDrawer}
                  className="flex min-h-11 w-full items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-brand-contrast transition-colors hover:bg-brand-hover"
                >
                  {t("login")}
                </NextLink>
              )}
            </div>

            <div className="mt-2 border-t border-divider">
              <p className={sectionLabelClass()}>{t("appearance")}</p>
              <div className="space-y-2">
                <div className="flex min-h-12 items-center justify-between rounded-lg border border-divider px-4 py-2">
                  <span className="text-sm font-medium text-text-muted">{t("appearance")}</span>
                  <ThemeToggle />
                </div>
                <div className="flex min-h-12 items-center justify-between rounded-lg border border-divider px-4 py-2">
                  <span className="text-sm font-medium text-text-muted">{t("language")}</span>
                  <LanguageSwitcher locale={locale} />
                </div>
              </div>
            </div>

            <div className="mt-2 border-t border-divider">
              <p className={sectionLabelClass()}>{footerT("information")}</p>
              <div className="space-y-1">
                <a href={PTEC.phoneTel} className="flex min-h-11 items-center gap-3 rounded-lg px-4 text-sm font-medium text-text-body hover:bg-paper hover:text-brand">
                  <Icon name="phone" className="h-4 w-4 text-text-muted" aria-hidden="true" />
                  {PTEC.phone}
                </a>
                <a href={`mailto:${PTEC.email}`} className="flex min-h-11 items-center gap-3 rounded-lg px-4 text-sm font-medium text-text-body hover:bg-paper hover:text-brand">
                  <Icon name="mail" className="h-4 w-4 text-text-muted" aria-hidden="true" />
                  {PTEC.email}
                </a>
                <a href={PTEC.links.mapPlace} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-3 rounded-lg px-4 text-sm font-medium text-text-body hover:bg-paper hover:text-brand">
                  <Icon name="map-pin" className="h-4 w-4 text-text-muted" aria-hidden="true" />
                  {footerT("getDirections")}
                </a>
                <InstallPWA
                  label={footerT("installApp")}
                  className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-divider bg-paper px-4 text-sm font-semibold text-text-heading transition-colors hover:border-brand/30 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  hintClassName="absolute bottom-full right-0 z-[80] mb-2 w-64 rounded-xl border border-divider bg-bg-surface p-4 shadow-lg"
                />
              </div>
            </div>
          </div>

          {user && (
            <div className="shrink-0 border-t border-divider px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <form action="/auth/signout" method="POST">
                <button
                  type="submit"
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-divider px-4 text-sm font-semibold text-text-body transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  {t("logout")}
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
