// lib/seo/hub-intros.ts
//
// The approved introduction of a collection hub (/books, /theses, /journals,
// /posts, /authors, /catalogs; SEO Phase 2.3). The text lives in
// content/hub-intros.json, which holds APPROVED entries only — drafts are in
// content/drafts/hub-intros.json, which no page reads. An entry that fails
// the approval rules (lib/seo/intro-drafts.ts) is not shown, and the test
// beside this file fails on it, so a half-reviewed text can reach neither.

import approvedFile from "@/content/hub-intros.json";
import { HUB_INTRO_WORDS, introProblems } from "@/lib/seo/intro-drafts";

export const HUB_KEYS = ["books", "theses", "journals", "posts", "authors", "catalogs"] as const;
export type HubKey = (typeof HUB_KEYS)[number];

export type HubIntroEntry = { en?: string | null; km?: string | null; status?: string };

const HUBS = (approvedFile as { hubs: Partial<Record<string, HubIntroEntry>> }).hubs;

/** Why an approved-file entry may not be shown; empty when it may. */
export function hubIntroProblems(entry: HubIntroEntry | undefined): string[] {
  if (!entry) return [];
  const problems: string[] = [];
  if (entry.status !== "approved") problems.push(`status is "${entry.status ?? ""}", not "approved"`);
  problems.push(...introProblems(entry.en, "en", HUB_INTRO_WORDS), ...introProblems(entry.km, "km", HUB_INTRO_WORDS));
  return problems;
}

/** The hub's approved introduction in the page's language, or null. The
 *  other language is never borrowed. */
export function hubIntro(hub: HubKey, locale: string, hubs = HUBS): string | null {
  const entry = hubs[hub];
  if (!entry || hubIntroProblems(entry).length > 0) return null;
  const text = locale === "km" ? entry.km : entry.en;
  return text?.trim() ? text.trim() : null;
}
