// Links from the e-Library to the public Koha OPAC, koha.ptec.edu.kh: where a
// reader signs in to their library account, and the Koha page of one record.
//
// The e-Library is the catalogue readers search; the OPAC is where they manage
// what they borrow (docs/KOHA-INTEGRATION.md → Public OPAC links). These are
// plain outbound links: nothing here fetches Koha, so an OPAC that is down
// never affects a page that links to it.
//
// Outside lib/koha on purpose. Client components (the phone Explore sheet, the
// dashboard's loans panel) render these links, and no client component may
// import lib/koha (lib/koha/boundary.test.ts). Pure, no process.env, relative
// imports only: lib/koha/opac-proxy.ts takes the host from here and
// next.config.ts imports that module directly.
//
// Every URL is absolute. A relative one would pass through the locale-aware
// Link and come out as /km/…, which is not an OPAC address.

/** The OPAC's one public name. The proxy rules in lib/koha/opac-proxy.ts use the same constant. */
export const KOHA_OPAC_PUBLIC_HOST = "koha.ptec.edu.kh";

export const KOHA_OPAC_ORIGIN = `https://${KOHA_OPAC_PUBLIC_HOST}`;

/** The reader's account page: Koha shows its login form here when signed out. */
export const KOHA_OPAC_ACCOUNT_URL = `${KOHA_OPAC_ORIGIN}/cgi-bin/koha/opac-user.pl`;

/**
 * The OPAC page for one Koha record, or null when there is no valid Koha id.
 *
 * `/bib/N` is the record's canonical OPAC address (ptec-koha-deployment
 * docs/SEO-URL-POLICY.md). Only a positive safe integer is accepted — a
 * string, a fraction or anything else yields no link rather than a guessed
 * one — so the path can never carry anything but digits.
 */
export function kohaOpacRecordUrl(biblioId: unknown): string | null {
  if (typeof biblioId !== "number" || !Number.isSafeInteger(biblioId) || biblioId <= 0) return null;
  return `${KOHA_OPAC_ORIGIN}/bib/${biblioId}`;
}
