"use server";
// app/admin/catalogs/library-cards/actions.ts
//
// Koha Phase 7/8: link an e-Library reader to their Koha library card at the
// desk (docs/KOHA-PATRONS.md). Every action asks the registry first; the link
// is re-verified against Koha on the server — the browser only says which
// reader and which card number, never which patron id. Card lookups, links and
// unlinks are audited, with the card's last four characters, never the whole
// number.

import { revalidatePath } from "next/cache";
import { requireAction } from "@/lib/admin/route-guard";
import { createServiceClient } from "@/lib/supabase/server";
import { logAdminAction } from "@/app/actions/audit";
import { forgetPatron, kohaReadsPatrons, lookupCard } from "@/lib/koha/patron-server";
import { cardHint, type PatronSummary } from "@/lib/koha/patrons";
import { KohaError } from "@/lib/koha/errors";

export type Reader = { profileId: string; name: string | null; email: string; linkedCard: string | null };
/** What the desk is shown of a Koha patron (lib/koha/patrons.ts summarisePatron — nothing more). */
export type CardPatron = PatronSummary;
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const PAGE = "/admin/catalogs/library-cards";
const off = { ok: false as const, error: "Library cards are not switched on (KOHA_READ_PATRONS)." };

function kohaMessage(e: unknown): string {
  if (e instanceof KohaError && e.kind === "forbidden") {
    return "Koha refused: the e-Library's Koha account may not read patrons. The Koha administrator sets PTEC_API_LEVEL=patrons and runs scripts/ptec-configure.sh.";
  }
  if (e instanceof KohaError && e.failureKind === "transient") return "Koha did not answer. Try again in a moment.";
  return `Koha could not be asked: ${e instanceof Error ? e.message : String(e)}`;
}

/** The e-Library reader with exactly this email (case-insensitive; no partial matches). */
export async function findReader(email: string): Promise<Result<Reader | null>> {
  await requireAction("catalog.library-cards.manage");
  if (!kohaReadsPatrons()) return off;
  const e = email.trim();
  if (!e || !e.includes("@") || e.length > 254) return { ok: false, error: "Enter the reader's full email address." };
  const db = createServiceClient();
  // ilike without wildcards = case-insensitive exact; % and _ are escaped so they stay literal.
  const { data, error } = await db.from("profiles").select("id, email, full_name")
    .ilike("email", e.replace(/[\\%_]/g, (c) => `\\${c}`)).limit(2);
  if (error) return { ok: false, error: `The reader could not be looked up: ${error.message}` };
  if (!data?.length) return { ok: true, value: null };
  const p = data[0];
  const { data: link } = await db.from("koha_patron_links").select("card_hint").eq("profile_id", p.id).maybeSingle();
  return { ok: true, value: { profileId: p.id, name: p.full_name ?? null, email: p.email ?? e, linkedCard: link?.card_hint ?? null } };
}

/** The Koha patron with exactly this card number, and the reader it is already linked to, if any. */
export async function findCard(cardnumber: string): Promise<Result<{ patron: PatronSummary; linkedTo: string | null } | null>> {
  const { userId } = await requireAction("catalog.library-cards.manage");
  if (!kohaReadsPatrons()) return off;
  const card = cardnumber.trim();
  if (!card || card.length > 32) return { ok: false, error: "Enter the card number exactly as printed." };
  let patron: PatronSummary | null;
  try {
    patron = await lookupCard(card);
  } catch (e) {
    return { ok: false, error: kohaMessage(e) };
  }
  await logAdminAction(userId, "koha_card_lookup", "koha_patron_links", undefined, { card: cardHint(card), found: !!patron });
  if (!patron) return { ok: true, value: null };
  const db = createServiceClient();
  const { data: link } = await db.from("koha_patron_links").select("profile_id").eq("koha_patron_id", patron.patronId).maybeSingle();
  let linkedTo: string | null = null;
  if (link) {
    const { data: p } = await db.from("profiles").select("email").eq("id", link.profile_id).maybeSingle();
    linkedTo = p?.email ?? "another reader";
  }
  return { ok: true, value: { patron, linkedTo } };
}

/** Link a reader to a card. The card is looked up again here: Koha decides which patron it is. */
export async function linkCard(profileId: string, cardnumber: string): Promise<Result<string>> {
  const { userId } = await requireAction("catalog.library-cards.manage");
  if (!kohaReadsPatrons()) return off;
  let patron: PatronSummary | null;
  try {
    patron = await lookupCard(cardnumber);
  } catch (e) {
    return { ok: false, error: kohaMessage(e) };
  }
  if (!patron) return { ok: false, error: "Koha has no card with that number." };
  const db = createServiceClient();
  const { data: reader } = await db.from("profiles").select("id").eq("id", profileId).maybeSingle();
  if (!reader) return { ok: false, error: "That reader no longer exists." };

  const hint = cardHint(patron.cardnumber);
  const { data, error } = await db.from("koha_patron_links")
    .insert({ profile_id: profileId, koha_patron_id: patron.patronId, card_hint: hint, linked_by: userId })
    .select("profile_id");
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: /koha_patron_id|patron_key/.test(error.message)
        ? "That card is already linked to another reader. Unlink it there first."
        : "This reader already has a card linked. Unlink it first." };
    }
    return { ok: false, error: `The link could not be saved: ${error.message}` };
  }
  if (!data?.length) return { ok: false, error: "The link could not be saved." };
  await logAdminAction(userId, "koha_card_link", "koha_patron_links", profileId, { card: hint, kohaPatronId: patron.patronId });
  forgetPatron(patron.patronId);
  revalidatePath(PAGE);
  return { ok: true, value: `Linked to card ${hint}.` };
}

/** Remove a reader's link. Their loans stop showing in My Library; nothing changes in Koha. */
export async function unlinkCard(profileId: string): Promise<Result<string>> {
  const { userId } = await requireAction("catalog.library-cards.manage");
  const db = createServiceClient();
  const { data, error } = await db.from("koha_patron_links").delete().eq("profile_id", profileId).select("koha_patron_id, card_hint");
  if (error) return { ok: false, error: `The link could not be removed: ${error.message}` };
  if (!data?.length) return { ok: false, error: "That reader had no card linked." };
  await logAdminAction(userId, "koha_card_unlink", "koha_patron_links", profileId, { card: data[0].card_hint, kohaPatronId: data[0].koha_patron_id });
  forgetPatron(data[0].koha_patron_id);
  revalidatePath(PAGE);
  return { ok: true, value: `Card ${data[0].card_hint} unlinked.` };
}
