import "server-only";

// lib/committee/data.ts — the server-side read for /about/committee.
//
// One query, one shape. It reads `committee_members_public` (migration 0150),
// which is the only relation with the publish rules and the safe column list
// baked in; nothing here re-derives either. Sections arrive denormalised on
// each row, so a section with no published seat produces no rows and therefore
// no empty heading.
//
// Why the service client, like lib/team/data.ts: this is a server render of
// public data, the view is closed to anon on purpose, and going through the
// service role keeps one read path for both About directories.
//
// THREE OUTCOMES, NOT TWO. A failed read is `unavailable` — never an empty
// committee. "No one has been published yet" and "the database did not answer"
// look identical in a list of zero rows and mean opposite things to a reader
// standing in front of an institutional page, so the page is told which it is.
// A relation that does not exist yet (the deploy window before this migration
// lands) is the FIRST state, not a failure: the feature is simply not set up.

import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/server";
import {
  PUBLIC_COMMITTEE_SELECT,
  groupCommittee,
  type CommitteeGroup,
  type PublicCommitteeMember,
} from "@/lib/committee/public";

export type CommitteeData = {
  groups: CommitteeGroup[];
  /** True when the read itself failed. The page says so rather than claiming
   *  the committee is empty. */
  unavailable: boolean;
};

/** PostgREST/Postgres codes for "that relation isn't there" — the pre-0150
 *  deploy window, which is an empty committee rather than an outage. */
const MISSING_RELATION = new Set(["42P01", "PGRST205", "PGRST200"]);

export const getPublicCommitteeData = cache(async (): Promise<CommitteeData> => {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("committee_members_public")
    .select(PUBLIC_COMMITTEE_SELECT)
    .order("section_order", { ascending: true })
    .order("display_order", { ascending: true });

  if (error) {
    if (MISSING_RELATION.has(error.code ?? "")) {
      return { groups: [], unavailable: false };
    }
    console.error("[committee] read failed:", error.message);
    return { groups: [], unavailable: true };
  }

  return {
    groups: groupCommittee((data ?? []) as unknown as PublicCommitteeMember[]),
    unavailable: false,
  };
});
