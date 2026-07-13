"use client";

// Defers the Cmd+K search modal (~500-line component + gcse.css) out of the
// first-load bundle of every page. The modal chunk loads either:
//   1. after the browser goes idle (so the shortcut works without a hitch), or
//   2. immediately on the first Cmd+K / Ctrl+K press, opening once loaded.
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { isAdminPath } from "@/lib/is-admin-path";

const GoogleSearchModal = dynamic(
  () => import("@/components/ui/search/GoogleSearchModal"),
  { ssr: false }
);

export default function SearchModalLazy() {
  const pathname = usePathname();
  // This modal is mounted by the ROOT layout, so it would otherwise also load
  // inside the admin panel — where it hijacks ⌘K (it searches the *public*
  // library and navigates to public routes) and fights AdminCommandPalette.
  // The admin panel has its own ⌘K palette, so skip it entirely there: no
  // shortcut collision, and its chunk + gcse.css never load on admin pages.
  const isAdmin = isAdminPath(pathname);

  const [load, setLoad] = useState(false);
  const [openOnMount, setOpenOnMount] = useState(false);

  useEffect(() => {
    if (isAdmin || load) return;

    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpenOnMount(true);
        setLoad(true);
      }
    };
    document.addEventListener("keydown", onKey);

    const hasIdle = typeof window.requestIdleCallback === "function";
    const idle = hasIdle
      ? window.requestIdleCallback(() => setLoad(true), { timeout: 4000 })
      : window.setTimeout(() => setLoad(true), 3000);

    return () => {
      document.removeEventListener("keydown", onKey);
      if (hasIdle) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
  }, [load, isAdmin]);

  if (isAdmin || !load) return null;
  return <GoogleSearchModal defaultOpen={openOnMount} />;
}
