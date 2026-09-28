// lib/catalogs/match-fields.ts
//
// The columns a physical-catalogue record is matched on when a reader
// searches "everything" — ONE list for both places that search print:
// /search's catalogue leg (app/api/search/native) and /catalogs' "All fields"
// scope (lib/catalogs/search-scope.ts). Phase 9.1, docs/UNIFIED-DISCOVERY.md.
//
// Before, the two pages disagreed: /search matched description, category,
// department and publisher but not accession number or shelf; /catalogs
// matched accession number but not category or description. The same query
// returned different books on the two pages that both claim to search the
// physical library.
//
// The two pages still MATCH differently on purpose — /catalogs takes the query
// as one phrase (a GET form that filters a shelf list), /search takes it word
// by word and ranks — but they look in the same places.
//
// Keywords are not here: `keywords` is a text[] PostgREST cannot
// substring-match, and widening search to it was deferred at Gate 2.

// Most valuable first: a URL has a ceiling (lib/db/postgrest-url.ts), and a
// very long query keeps the fields at the front of this list.
export const CATALOG_MATCH_FIELDS = [
  "title",
  "author",
  "ddc",
  "isbn",
  "accession_number",
  "category",
  "department",
  "publisher",
  "shelf_location",
  "description",
] as const;

export type CatalogMatchField = (typeof CATALOG_MATCH_FIELDS)[number];
