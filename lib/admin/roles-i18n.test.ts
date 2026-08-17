import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import km from "@/messages/km.json";
import { ALL_ROLES } from "@/lib/types/roles";
import {
  ALL_RESOURCE_KEYS,
  PERMISSION_GROUPS,
  titleizeResourceKey,
} from "@/lib/admin/roles-shared";

// ──────────────────────────────────────────────────────────────────
// The Role Management matrix renders one row per entry in
// PERMISSION_GROUPS and reads its label/description out of
// `adminRoles.resources` / `adminRoles.resourceDescriptions`. next-intl
// renders the *full key path* for a missing message, so a resource that
// ships without its two message entries prints
// `adminRoles.resources.announcements_push` into the table for every admin
// to see. That is exactly what happened when migration 0100 added the
// `announcements_push` resource.
//
// PERMISSION_GROUPS is the source of truth; these assertions make a new
// resource fail CI instead of failing in the UI.
// ──────────────────────────────────────────────────────────────────

const LOCALES = [
  ["en", en],
  ["km", km],
] as const;

type Messages = { adminRoles: Record<string, Record<string, string>> };

describe("adminRoles message coverage", () => {
  it.each(LOCALES)("%s translates every permission resource", (_locale, messages) => {
    const resources = (messages as unknown as Messages).adminRoles.resources;
    const missing = ALL_RESOURCE_KEYS.filter((key) => !resources[key]);
    expect(missing).toEqual([]);
  });

  it.each(LOCALES)("%s describes every permission resource", (_locale, messages) => {
    const descriptions = (messages as unknown as Messages).adminRoles.resourceDescriptions;
    const missing = ALL_RESOURCE_KEYS.filter((key) => !descriptions[key]);
    expect(missing).toEqual([]);
  });

  it.each(LOCALES)("%s names every permission group and its description", (_locale, messages) => {
    const groups = (messages as unknown as Messages).adminRoles.groups;
    const groupDescriptions = (messages as unknown as Messages).adminRoles.groupDescriptions;
    for (const group of PERMISSION_GROUPS) {
      expect(groups[group.id], `groups.${group.id}`).toBeTruthy();
      expect(groupDescriptions[group.id], `groupDescriptions.${group.id}`).toBeTruthy();
    }
  });

  it.each(LOCALES)("%s supplies a matrix column initial for every role", (_locale, messages) => {
    // The mobile card list labels each permission badge with the role initial
    // and has no room for the full name.
    const initials = (messages as unknown as Messages).adminRoles.initials;
    const missing = ALL_ROLES.filter((role) => !initials[role]);
    expect(missing).toEqual([]);
  });

  it("carries no resource messages for keys the matrix never renders", () => {
    // A stale entry is a resource that was removed from PERMISSION_GROUPS
    // without its messages, or a typo'd key that silently translates nothing.
    const known = new Set(ALL_RESOURCE_KEYS);
    for (const [locale, messages] of LOCALES) {
      const stale = Object.keys((messages as unknown as Messages).adminRoles.resources).filter(
        (key) => !known.has(key),
      );
      expect(stale, `${locale} has stale resource messages`).toEqual([]);
    }
  });
});

describe("titleizeResourceKey", () => {
  it("turns a snake_case resource key into readable words", () => {
    expect(titleizeResourceKey("announcements_push")).toBe("Announcements Push");
    expect(titleizeResourceKey("learning_paths")).toBe("Learning Paths");
    expect(titleizeResourceKey("books")).toBe("Books");
  });

  it("never returns an empty string for a non-empty key", () => {
    // This is the on-screen fallback — an empty label would look like a bug.
    for (const key of ALL_RESOURCE_KEYS) {
      expect(titleizeResourceKey(key).length).toBeGreaterThan(0);
    }
  });
});
