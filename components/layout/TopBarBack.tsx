"use client";

// components/layout/TopBarBack.tsx
// The phone top bar on a PUSHED screen — a book, a thesis, a learning path, an
// article, an author, an About page. Below `lg` only; the desktop header is
// untouched.
//
// Every app a student uses draws the same header one level down: Back on the
// left, and once the page's own title has scrolled away, that title in the
// bar. The site drew its brand on every page instead, so the only way up was
// the breadcrumb row (book) or an in-page "← Learning Paths" link (path), and
// in the INSTALLED app — no browser chrome, no Back button on iPhone — there
// was no consistent way back at all.
//
// WHERE BACK GOES. A history Back when the previous entry is this site (a
// search result, a shelf, a list the reader came from — they return to it
// scrolled where they were). When the reader LANDED here (a Google result, a
// Telegram link), a history Back would leave the library, so Back goes UP to
// the collection instead: lib/nav/shell-routes.ts `backTarget()`.
// `navigation.canGoBack` answers exactly that question (it only counts this
// origin's entries); where the Navigation API is missing, a count of the
// client navigations this tab has made stands in for it.
//
// THE TITLE. One IntersectionObserver on the page's <h1>, inset by the bar's
// height: while the heading is under the bar or above it, the bar shows its
// text. State is an attribute on <html> (`data-topbar-title`) and CSS does
// the crossfade (app/globals.css, "Pushed screens") — the same division of
// labour as NavbarStickyWrapper's `data-topbar`. The title copy is
// aria-hidden: the <h1> is still in the page, and a second announcement of it
// is noise.

import { useEffect, useRef } from "react";
import { ChevronLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { backTarget } from "@/lib/nav/shell-routes";

type NavigationWithCanGoBack = { canGoBack?: boolean };

/** Client navigations this tab has made on top of the page it loaded with,
 *  less the ones it has gone Back through. Module scope, so it survives
 *  route changes and resets with a full load — exactly the lifetime of the
 *  history entries it counts. Only consulted without the Navigation API. */
let pushedDepth = 0;
let popPending = false;

function canGoBackInApp(): boolean {
  const nav = (window as Window & { navigation?: NavigationWithCanGoBack }).navigation;
  if (nav && typeof nav.canGoBack === "boolean") return nav.canGoBack;
  return pushedDepth > 0;
}

export default function TopBarBack() {
  const t = useTranslations("nav");
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const parent = backTarget(pathname);
  // Written directly: the title changes once per page and is decorative, so
  // it costs no React render.
  const titleRef = useRef<HTMLSpanElement>(null);

  // Count client navigations (fallback for browsers without navigation.canGoBack).
  const firstPath = useRef(true);
  useEffect(() => {
    const onPop = () => {
      popPending = true;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    pushedDepth = popPending ? Math.max(0, pushedDepth - 1) : pushedDepth + 1;
    popPending = false;
  }, [pathname]);

  // Watch the page's <h1>. It may not exist yet when the route commits (the
  // route's loading.tsx streams first), and a skeleton's heading would be
  // REPLACED by the page's — so the observer follows whichever element is
  // the first <h1> in <main>, re-attaching when that changes. An observer
  // left on a removed node reports it "not intersecting" with an empty rect,
  // which reads exactly like "scrolled away": it would put a title in the bar
  // that the page no longer shows.
  useEffect(() => {
    const root = document.documentElement;
    const clear = () => {
      delete root.dataset.topbarTitle;
    };
    clear();
    if (!parent) return;
    const main = document.getElementById("main-content");
    if (!main) return;

    let io: IntersectionObserver | null = null;
    let watched: HTMLElement | null = null;
    const sync = () => {
      const h1 = main.querySelector<HTMLElement>("h1");
      if (h1 && h1 === watched) return;
      io?.disconnect();
      io = null;
      watched = null;
      clear();
      // The heading's first line. A bilingual <h1> (the About pages) stacks
      // the other language under the title as a block of its own; the bar
      // carries the title, not both run together.
      const text = h1?.innerText
        .split("\n")
        .map((line) => line.replace(/\s+/g, " ").trim())
        .find(Boolean);
      if (!h1 || !text) return;
      watched = h1;
      if (titleRef.current) titleRef.current.textContent = text;
      const bar = document.querySelector<HTMLElement>(".site-header")?.offsetHeight ?? 61;
      io = new IntersectionObserver(
        ([entry]) => {
          if (!entry.target.isConnected) return;
          // Out of view ABOVE the bar — not merely below the fold.
          const gone = !entry.isIntersecting && entry.boundingClientRect.bottom <= bar + 1;
          if (gone) root.dataset.topbarTitle = "";
          else clear();
        },
        { rootMargin: `-${bar}px 0px 0px 0px` },
      );
      io.observe(h1);
    };

    sync();
    // Coalesced to one check a frame: <main> can mutate often (a grid
    // loading more rows), and all a mutation can change here is WHICH
    // element is the first heading.
    let raf = 0;
    const mo = new MutationObserver(() => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        sync();
      });
    });
    mo.observe(main, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      cancelAnimationFrame(raf);
      io?.disconnect();
      clear();
    };
  }, [pathname, parent]);

  if (!parent) return null;

  const goBack = () => {
    if (canGoBackInApp()) router.back();
    else router.push(parent);
  };

  return (
    <>
      <button
        type="button"
        onClick={goBack}
        aria-label={t("back")}
        className="-ml-1.5 mr-0.5 flex size-11 shrink-0 items-center justify-center rounded-full text-text-heading transition-colors hover:bg-glass-selected active:bg-glass-selected lg:hidden [-webkit-tap-highlight-color:transparent]"
      >
        <ChevronLeft className="size-6" strokeWidth={2.2} aria-hidden="true" />
      </button>
      <span
        aria-hidden="true"
        className="topbar-title pointer-events-none absolute inset-y-0 left-10 right-1 flex items-center lg:hidden"
      >
        <span ref={titleRef} className="truncate text-[15px] font-bold leading-tight text-text-heading" />
      </span>
    </>
  );
}
