# Koha record writes (Phase 5)

**Status (2026-09-27): built and tested against a local Koha 26.05.03 holding
the full PMB catalogue. Not switched on in production.** It switches on with
`KOHA_INTEGRATION=write` on the box and `PTEC_API_LEVEL=cataloguing` in Koha's
deployment package, and not before.

With it on, a librarian creates and edits **bibliographic records** in the
e-Library's admin and they are written to Koha first. Koha stays the system of
record (docs/KOHA-SYNC.md); the e-Library saves its own row only from what
Koha accepted, and the 15-minute sync keeps the two in step afterwards.

Decisions (PTEC, 2026-09-27):

- **Records only.** Copies (Koha items) are Phase 6. A record Koha holds gets its copies **in Koha**: after a save the e-Library links to Koha's "Add item" page, and the e-Library's own "add copies" is closed for Koha records (`refuseKohaOwned`, and the Copies tab shows the Koha link instead). A copy that exists only in the e-Library could never be lent.
- **One permission:** the Koha API user gains `editcatalogue → edit_catalogue`. Never items, delete, circulation or patrons. Set by `PTEC_API_LEVEL=cataloguing` in the deployment package's `.env` and `scripts/ptec-configure.sh`, which resets the account to exactly that level on every run.
- **Duplicates:** Koha's own duplicate check decides what is a possible duplicate. The librarian sees the match (open it in the e-Library or in Koha) and may choose **Create a new record anyway**, which sends `x-confirm-not-duplicate` and writes a `koha_duplicate_override` audit row.

Code: `lib/koha/marc-write.ts` (form ⇄ MARC, pure), `lib/koha/biblio-write.ts`
(create / edit / conflicts, pure, client injected), `lib/koha/catalog-writes.ts`
(server-only glue), the catalog actions (`addCatalogBook`, `updateCatalogBook`),
and the client's `write()` (`lib/koha/client.ts`).

## What is written, and what is not

| Field | Koha (MARC 21) | Written from the e-Library |
|---|---|---|
| Title | 245 $a (a subtitle in $b is folded into the title) | yes |
| Author | the first of 100 / 110 / 111, $a | yes; may be empty for a Koha record |
| ISBN | the first valid 020 $a | yes |
| Publisher, year | the first 264 (else 260) $b / $c, and 008/07-10 | yes |
| Language | 041 $a and 008/35-37 (`khm`, `eng`, `fre`, `chi`; "other" = `und`) | yes |
| Category | the first 653 $a | yes |
| Call number | the copies' 952 $o; a new record's Dewey number goes to 082 $a/$b | on create only; read-only afterwards |
| Department | the copies' collection, 952 $8 | no: read-only, from the copies in Koha |
| Description, cover, keywords, web address, SEO | — | the e-Library's own; never sent to Koha |

**An edit is never a rebuild.** Koha's `PUT /biblios/{id}` replaces the whole
record (`C4::Biblio::ModBiblio`), and the e-Library understands a handful of
fields. So the admin reads the record from Koha, changes only the fields the
librarian changed, and sends the rest back as Koha had it: subjects, notes,
added entries, 942, 999. Koha returns records without items and strips item
fields on save, so no edit can touch a copy. `lib/koha/marc-write.test.ts`
pins both directions: whatever is written reads back through the Phase 2
projection unchanged, and every field an edit was not asked to change is
byte-identical.

## Consistency: Koha first, and what each failure leaves behind

| What happens | Koha | e-Library | The librarian sees |
|---|---|---|---|
| Save succeeds | written | its row is saved from what Koha now holds | the record |
| Koha refuses (validation, missing permission, locked record) | unchanged | unchanged, form kept | the reason |
| Koha's duplicate check matches (create) | unchanged | unchanged, form kept | the match, with *Open it here* / *Open in Koha* / *Create a new record anyway* |
| Someone changed the same field in Koha since the last sync (edit) | unchanged | unchanged, form kept | that field marked "Changed in Koha to …" |
| Koha did not answer (timeout, dropped connection, 5xx) | **unknown** | unchanged | that the outcome is unknown and what to check. The write is **never repeated automatically**: a timed-out write may have happened, and repeating it is how duplicates are made. On a create, Koha's duplicate check catches a retry of the same book |
| Koha saved, the e-Library's row did not (create) | created | missing | Koha's record number; pressing Save again **finishes that record** (`koha_adopt_biblio_id`) from what Koha holds, and creates nothing in Koha |
| Koha saved, the e-Library's row did not (edit) | written | stale | that the change is saved in Koha; the next sync brings it here within 15 minutes |
| The record was deleted in Koha (edit) | — | unchanged | that; the nightly full sync unlists it |

**Conflicts are three-way.** The e-Library's row is what it last synced from
Koha. A field the librarian changed (form ≠ row) that Koha also changed (Koha ≠
row) to something else (Koha ≠ form) is a conflict, and nothing is written.
Koha offers no version check on `PUT /biblios`, so this is the e-Library's
own: a change made in Koha in the seconds between the admin's read and its
write is overwritten for the changed fields only. A field the librarian did not
touch goes back exactly as Koha has it. A change Koha already holds is not
written again.

Every save writes one audit row (`addCatalogBook` / `updateCatalogBook` with the
Koha record number and the fields written); an override also writes
`koha_duplicate_override`.

## Also closed for Koha records

- **Deleting permanently.** The next sync would create the record again. The
  row action is not offered, and `hardDeleteCatalogBook` refuses. Unlisting
  still hides it; deleting is done in Koha.
- **Adding copies** (above).
- **Editing call number and department**, which come from the copies.

These follow the integration being ON (read or write), because the sync
overwrites them from Koha in either mode.

## Switching it on (production)

1. Merge; the box deploys it.
2. In the deployment package on the box: set `PTEC_API_LEVEL=cataloguing` in
   `.env`, then `scripts/ptec-configure.sh`. Check with
   `scripts/ptec-configure.sh --check`: `catalogue + edit_catalogue`.
3. In the e-Library's `.env` on the box: `KOHA_INTEGRATION=write`, and
   `KOHA_STAFF_URL=http://<box LAN IP>:8481` for the "Open in Koha" and "Add
   copies in Koha" links. Restart the e-Library.
4. `scripts/check-from-elibrary.sh` → `record writes: permitted (probe answered
   406; nothing was created)`. The probe sends a body Koha cannot accept:
   Koha checks the permission first, so 403 means "not allowed" and anything
   else means "allowed", and nothing is written either way.
5. A librarian adds one real book end to end: save → Koha record → add its
   copy in Koha → it appears on `/catalogs` within 15 minutes.

**To switch it off:** `KOHA_INTEGRATION=read` (the admin then saves to the
e-Library only, as in Phase 2) and `PTEC_API_LEVEL=read` +
`scripts/ptec-configure.sh` (the API user loses `edit_catalogue`).

## Not in Phase 5

Items (Phase 6), deleting records in Koha (never), patrons and circulation
(Phases 7–8), the CSV importer (it still creates e-Library-only records,
which the nightly sync lists for review), and Koha's MARC frameworks: new
records use the default framework, as the PMB import did.
