"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Icon from "@/components/ui/core/Icon";

const THEME_STORAGE_KEY = "ptec.theme";
const LIGHT_THEME_COLOR = "#172554";
const DARK_THEME_COLOR = "#0B1530";

type Theme = "light" | "dark";

function getPreferredTheme(): Theme {
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;

  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute("content", theme === "dark" ? DARK_THEME_COLOR : LIGHT_THEME_COLOR);
  }
}

export default function ThemeToggle() {
  const t = useTranslations("nav");
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const preferredTheme = getPreferredTheme();
    setTheme(preferredTheme);
    applyTheme(preferredTheme);
  }, []);

  const toggleTheme = () => {
    const newTheme = (theme ?? getPreferredTheme()) === "light" ? "dark" : "light";
    setTheme(newTheme);
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    applyTheme(newTheme);
  };

  // Prevent hydration mismatch by not rendering the icon until mounted
  if (theme === null) {
    return <div className="h-10 w-10" aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === "light" ? t("switchToDark") : t("switchToLight")}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-body transition-colors hover:bg-paper hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
    >
      {theme === "light" ? (
        <Icon name="moon" className="text-[18px]" />
      ) : (
        <Icon name="sun" className="text-[18px]" />
      )}
    </button>
  );
}
