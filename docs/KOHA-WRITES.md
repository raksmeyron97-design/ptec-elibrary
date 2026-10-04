# Koha writes: records (Phase 5) and copies (Phase 6)

**Status (2026-09-27): Phase 5 (records) is live in production. Phase 6
(copies, below) is built and tested against a local Koha 26.05.03 holding
the full PMB catalogue, and not switched on.** Records switch on with
`KOHA_INTEGRATION=write` + `PTEC_API_LEVEL=cataloguing`; copies additionally
with `KOHA_WRITE_ITEMS=on` + `PTEC_API_LEVEL=items`.

With it on, a librarian creates and edits **bibliographic records** in the
e-Library's admin and they are written to Koha first. Koha stays the system of
record (docs/KOHA-SYNC.md); the e-Library saves its own row only from what
Koha accepted, and the 15-minute sync keeps the two in step afterwards.

Decisions (PTEC, 2026-09-27):

- **Records only.** Copies (Koha items) are Phase 6. Until Phase 6 is switched on, a record Koha holds gets its copies **in Koha**: after a save the e-Library links to Koha's "Add item" page, and the e-Library's own "add copies" is closed for Koha records (`copyOwnership` → `refuse`, and the Copies tab shows the Koha link instead). A copy that exists only in the e-Library could never be lent.
- **One permission:** the Koha API user gains `editcatalogue → edit_catalogue`. Never items, delete, circulation or patrons. Set by `PTEC_API_LEVEL=cataloguing` in the deployment package's `.env` and `scripts/ptec-configure.sh`, which resets the account to exactly that level on every run.
- **Duplicates:** Koha's own duplicate check decides what is a possible duplicate. The librarian sees the match (open it in the e-Library or in Koha) and may choose **Create a new record anyway**, which sends `x-confirm-not-duplicate` and writes a `koha_duplicate_override` audit row.

Code: `lib/koha/marc-write.ts` (form ⇄ MARC, pure), `lib/koha/biblio-write.ts`
(create / edit / conflicts, pure, client injected), `lib/koha/catalog-writes.ts`
(server-only glue), the catalog actions (`addCatalogBook`, `updateCatalogBook`),
and the client's `write()` (`lib/koha/client.ts`). Copies (Phase 6):
`lib/koha/item-write.ts` (pure) and the copy actions (`copy-actions.ts`).

## What is written, and what is not

| Field | Koha (MARC 21) | Written from the e-Library |
|---|---|---|
| Title | 245 $a (a subtitle in $b is folded into the title) | yes |
| Author | the first of 100 / 110 / 111, $a | yes; may be empty for a Koha record |
| ISBN | the first valid 020 $a | yes |
| Publisher, year | the first 264 (else 260) $b / $c, and 008/07-10 | yes |
| Language | 041 $a and 008/35-37 (`khm`, `eng`, `fre`, `chi`; "other" = `und`) | yes |
| Category | the first 653 with a **blank** second indicator, its $a | yes |
| Description | every 520 except reviews (ind1 1) and content advice (ind1 4), joined as paragraphs | yes — paragraphs kept; split into several 520s past 9,000 bytes (a MARC field holds 9,999, and Khmer is 3 bytes a character); a description that only restates the record (`lib/catalogs/derived-description.ts`) is never sent |
| Keywords | every 653 $a but the category's; written as 653 with second indicator **0** (topical term) | yes — the category's 653 is never touched by a keyword edit |
| Call number | the copies' 952 $o; a new record's Dewey number goes to 082 $a/$b | on create only; read-only afterwards |
| Department | the copies' collection, 952 $8 | no: read-only, from the copies in Koha |
| Item type | 942 $c on a new record; a new copy's item type (952 $y) | on create only, from the language: Khmer → `BK`, any other language → `BKEN` (below) |
| Cover, web address, SEO | — | the e-Library's own; never sent to Koha |

**Description and keywords: Koha holding nothing is not a conflict.** Most
Koha records have no 520 and no keyword 653 (the PMB converter wrote none), so
an e-Library edit to either is written even though Koha's value differs from
the e-Library's — Koha never held one. A 520 that Koha DOES hold and that
changed there since the last sync is a conflict like any other field. After a
save, Koha's empty description or keyword list never replaces the e-Library's
(`rowFieldsFromKoha`). Records saved before this existed are filled once by
`scripts/sync-all-to-koha.ts` (dry run by default).

**The item type follows the language.** PTEC lends by language (*Library
rules* v1.0): a student teacher keeps a Khmer book 14 days and an English one
7. Koha sets loan periods per item type, so PTEC's Koha has two book types
(ptec-koha-deployment, docs/10, Phase 1, 2026-09-29): `BK` Khmer book and
`BKEN` foreign-language book, which covers English and every other language
(`other` included, by PTEC's decision). `lib/koha/item-types.ts` decides it
for a new record's 942 $c and for each new copy, from the record's language;
a copy's call site must pass that language, so none falls back to `BK` by
forgetting it. A row with no language keeps `BK`, the old default. An edit
that changes a record's language does not change its item type or its
copies' (942 goes back as Koha had it): Koha's saved report 1, *PTEC check:
copies whose item type does not match their language*, lists them, and the
librarians fix them with Koha's batch tools.

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
- **Adding copies**, unless copy writes are on (Phase 6, below): then they are added here and written to Koha first.
- **Deleting a copy** Koha holds: it is withdrawn instead.
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

## Copies (Phase 6)

With `KOHA_WRITE_ITEMS=on` (and `KOHA_INTEGRATION=write`), the Copies tab of
a Koha record works again: librarians add copies (one, or a generated
sequence), edit them and change their status, and each change goes to Koha
first. It is a switch of its own because production already runs `write` for
records: deploying Phase 6 changes nothing until the Koha API user has
`edit_items` and someone turns it on.

Decisions (PTEC, 2026-09-27): the API user gains `editcatalogue → edit_items`
as a new level, `PTEC_API_LEVEL=items`; librarians may set **every status but
lending**; a copy on loan keeps its status.

Koha 26.05.03's contract (`Koha/REST/V1/Biblios.pm`, `Koha/Item.pm`):

- Copies are written under their record: `POST /biblios/{id}/items` and
  `PUT /biblios/{id}/items/{item}` (there is no `POST /items`).
- **A barcode Koha already holds is refused with 409.** That makes a create
  safe to repeat: a repeat of a create that did happen meets its own barcode,
  finds the copy on the same record and takes it. A timed-out create is
  settled at once the same way. So every copy in Koha needs a barcode.
- An update changes only the fields sent (`set_from_api`), so the admin sends
  only what the librarian changed, with the same three-way conflict check as
  records.
- Status changes go through Koha's own rules (`Koha::Item->store`), exactly
  as in Koha's item editor: marking a lost copy found runs Koha's *found*
  trigger, which can reverse lost-item charges.

| e-Library | Koha item field |
|---|---|
| Barcode | `external_id` (952$p), unique, required |
| Call number | `callnumber` (952$o) |
| Shelf location | `location` (952$c): a choice from **Koha's own shelving-location list** (Administration › Authorised values › LOC), read live from Koha and cached five minutes. PTEC decision 2026-09-27. Koha has no free-text shelf field (952$j `shelving_control_number` is a NUMBER in the 26.05 API), and a free-text `location` would be blanked by Koha's item editor, so only codes on the list are written; a mark like "B-2-01" becomes a list entry a Koha administrator adds once. The e-Library shows the entry's label |
| Accession number | `inventory_number` (952$i) |
| Status | the four flags below |
| Holding library | set to `KOHA_LIBRARY_ID` on create; read-only after |
| Copy number, condition, notes | the e-Library's own; not sent |

**One status, four flags.** The e-Library shows one status; Koha keeps
`withdrawn`, `lost_status` (4 = missing), `damaged_status` and
`not_for_loan_status` (−1 processing, > 0 reference). A status change sends
only the flags that must change for the copy to read back as the new
status, so a flag that does not decide it survives (a staff-collection
code under "damaged", a "long overdue" lost value under "lost"). A property
test checks every settable status against every combination of flags.

| Settable | On loan / reserved / in repair |
|---|---|
| available, reference only, processing, damaged, lost, missing, withdrawn | decided by Koha's circulation: shown, not offered. A copy **on loan keeps its status** (its call number and shelf can still change); returns happen at Koha's desk, and renewals there or online (Phase 10.1) |

**A batch can partly succeed.** Koha has no batch endpoint, so a generated
sequence is created one copy at a time. The copies Koha accepted are saved;
those it refused (a barcode already used, say) stay pending on the form with
the reason, and saving them again is safe.

**Never deleted.** A copy Koha holds is withdrawn, not deleted: deleting only
the e-Library's row would have the sync bring it back, and deleting in Koha
loses its circulation history. The Delete button is not offered on Koha
copies, and the action refuses.

| What happens | Koha | e-Library | The librarian sees |
|---|---|---|---|
| Save succeeds | written | row saved from the item Koha returned | the copy |
| Barcode already in Koha on another record | unchanged | unchanged | which record holds it |
| Same barcode already on this record (a repeat) | unchanged | the existing Koha copy is taken | the copy, once |
| Koha did not answer (create) | settled by the barcode at once | saved if Koha has it | the copy, or "saving again is safe" |
| Koha did not answer (edit) | unknown | unchanged | reload in a minute |
| Same field changed in Koha since the last sync | unchanged | unchanged | "Changed in Koha to …" |
| Status change on a copy on loan | unchanged | unchanged | return it in Koha first |
| Koha saved, the e-Library's row did not | written | missing / stale | the sync brings it within 15 minutes (the record is linked) |

### Switching copies on (production)

1. Merge; the box deploys it. Nothing changes yet.
2. In the deployment package: `PTEC_API_LEVEL=items` in `.env`, then
   `scripts/ptec-configure.sh`; `--check` →
   `catalogue + edit_catalogue + edit_items`.
3. In the e-Library's `.env`: `KOHA_WRITE_ITEMS=on`. Restart.
4. `scripts/check-from-elibrary.sh` → `copy writes: permitted (probe answered
   …; nothing was created)`. The probe asks to add an item to record 0, which
   does not exist: Koha checks the permission first, so 403 means "not
   allowed" and anything else "allowed", and nothing can be created.
5. Add one copy to a real record, then lend and return it in Koha: its status
   follows within 15 minutes.

**Off again:** `KOHA_WRITE_ITEMS` unset (copies are added in Koha, as in
Phase 5), and `PTEC_API_LEVEL=cataloguing` + `scripts/ptec-configure.sh`.

## Not in Phase 5

Deleting records or copies in Koha (never), patrons and circulation
(Phases 7–8), the CSV importer (it still creates e-Library-only records,
which the nightly sync lists for review), and Koha's MARC frameworks: new
records use the default framework, as the PMB import did.
