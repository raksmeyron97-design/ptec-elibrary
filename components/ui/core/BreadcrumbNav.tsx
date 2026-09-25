import type { ComponentProps } from "react";
import { useTranslations } from "next-intl";

/**
 * The breadcrumb landmark, named in the page's language.
 *
 * Thirteen public pages each wrote `<nav aria-label="Breadcrumb">`, so a
 * screen reader on /km announced an English landmark over a Khmer trail.
 * Sync on purpose: next-intl's useTranslations works in a server component
 * that does not await, which is what every caller renders it from.
 */
export default function BreadcrumbNav(props: Omit<ComponentProps<"nav">, "aria-label">) {
  const t = useTranslations("nav");
  return <nav {...props} aria-label={t("breadcrumbLabel")} />;
}
