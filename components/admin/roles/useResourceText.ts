"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { titleizeResourceKey } from "@/lib/admin/roles-shared";

/**
 * Resource labels/descriptions that can never leak a translation key.
 *
 * `PERMISSION_GROUPS` is the source of truth for which rows the matrix shows,
 * and it grows whenever a new permission resource ships (that is how
 * `announcements_push` arrived from migration 0100). next-intl renders the
 * full key path for a missing message, so a resource added without its two
 * message entries printed `adminRoles.resources.announcements_push` straight
 * into the table.
 *
 * `lib/admin/roles-i18n.test.ts` fails CI when a key is missing, so this is the
 * belt to that braces — and it keeps a half-translated locale readable rather
 * than broken.
 */

const warned = new Set<string>();

function warnOnce(path: string) {
  if (process.env.NODE_ENV === "production" || warned.has(path)) return;
  warned.add(path);
  console.warn(
    `[adminRoles] Missing translation "${path}". Add it to messages/en.json and messages/km.json — see PERMISSION_GROUPS in lib/admin/roles-shared.ts.`,
  );
}

export type ResourceText = {
  /** Translated resource name, or a title-cased key ("Announcements Push"). */
  label: (key: string) => string;
  /** Translated one-liner, or an empty string — never a raw key. */
  description: (key: string) => string;
  /** Everything a feature search should match: raw key + label + description. */
  search: (key: string) => string;
};

export function useResourceText(): ResourceText {
  const tRes = useTranslations("adminRoles.resources");
  const tResDesc = useTranslations("adminRoles.resourceDescriptions");

  // Memoised because callers put `res.search` in a useMemo dependency list:
  // a fresh object each render made every one of those memos recompute on
  // every render, which is the opposite of what they were written for.
  return useMemo<ResourceText>(() => {
    const text: ResourceText = {
      label(key) {
        if (tRes.has(key)) return tRes(key);
        warnOnce(`adminRoles.resources.${key}`);
        return titleizeResourceKey(key);
      },
      description(key) {
        if (tResDesc.has(key)) return tResDesc(key);
        warnOnce(`adminRoles.resourceDescriptions.${key}`);
        // Deliberately empty: an invented description would read as fact.
        return "";
      },
      search(key) {
        // The raw key stays searchable so "announcements_push" finds the row
        // even when an admin is pasting a resource name out of a migration.
        return `${key} ${text.label(key)} ${text.description(key)}`;
      },
    };

    return text;
  }, [tRes, tResDesc]);
}
