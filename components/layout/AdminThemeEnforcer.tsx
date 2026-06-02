"use client";

import { useLayoutEffect } from "react";

export default function AdminThemeEnforcer() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    const previousColorScheme = root.style.colorScheme;
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    const previousThemeColor = metaThemeColor?.getAttribute("content") ?? null;

    root.classList.remove("dark");
    root.style.colorScheme = "light";

    if (metaThemeColor) {
      metaThemeColor.setAttribute("content", "#172554");
    }

    return () => {
      if (wasDark) {
        root.classList.add("dark");
      }
      root.style.colorScheme = previousColorScheme;
      if (metaThemeColor && previousThemeColor) {
        metaThemeColor.setAttribute("content", previousThemeColor);
      }
    };
  }, []);

  return null;
}
