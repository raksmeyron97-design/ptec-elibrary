# Koha → e-Library sync (Phase 2)

**Status (2026-09-26): built and verified end to end against a local Koha
26.05.03 holding the full PMB catalogue (2,638 records, 13,429 items). Not yet
run against production.**

The Physical Library (`/catalogs`, `catalog_books` + `catalog_copies`) becomes
a **read-only projection of Koha**. Koha is where books are catalogued, lent
and returned. The e-Library copies what Koha holds, keeps its own
presentation (description, cover, SEO), and shows it to the public. Nothing is
ever written to Koha, and nothing is ever deleted from the e-Library.

Code: `lib/koha/projection.ts` (Koha → rows, pure), `lib/koha/sync-plan.ts`
(the diff, pure), `lib/koha/catalogue.ts` (reading Koha), `lib/koha/sync-run.ts`
(one run), `lib/koha/sync-server.ts` (starting one). Admin page:
`/admin/catalogs/koha-sync`. Schedule: `/api/cron/koha-sync` from
`.github/workflows/cron.yml`. Migration: `0157_koha_sync.sql`.

## Who owns which field

| Koha owns (the sync overwrites these) | The e-Library owns (the sync never touches these) |
|---|---|
| Record: title, author, ISBN, publisher, year, language, category, call number (`ddc`), department | slug, description, cover, keywords, SEO overrides |
| Copy: barcode, call number, status, shelf, holding library, accession number | copy number, condition, notes |
| Whether a copy still exists (withdrawn when Koha deletes it) | whether a record is listed (the sync only ever **un**lists) |

"Overwrites" only when Koha has a value: a field Koha leaves empty keeps what
the e-Library has (a hand-written shelf mark survives a Koha item with no
location). The admin edit screen says this on every Koha-linked record.

Where each value comes from in Koha:

- **title** 245$a (+ $b), ISBD punctuation trimmed; **author** 100/110/111$a,
  refused if it names nobody (`lib/resources/contributor-trust.ts`); **ISBN**
  020$a, validated, stored as digits; **publisher / year** 264 (else 260) $b/$c,
  year falling back to 008; **language** 041$a, else 008/35-37, else the
  title's script; **category** 653$a (the PMB shelf label).
- **call number** — the call number most of the record's copies carry.
- **department** — the **collection** (952$8, CCODE) most of its copies are in,
  by its label. The PMB department was not imported into Koha; the deployment
  package's `scripts/set-collections.sh` puts it there once, by barcode
  (below).
- **copy status**, in this order: withdrawn → lost (lost 4/5 = missing) →
  damaged → on loan (has a checkout date) → processing (not-for-loan < 0) →
  reference only (not-for-loan > 0, or restricted) → available.

## How a Koha item finds its e-Library copy

1. By the **stored Koha id** (`catalog_copies.koha_item_id`,
   `catalog_books.koha_biblio_id`) once linked.
2. Otherwise by **exact barcode** (`0803` is not `30803`, and leading zeros are
   kept). This is how the e-Library's existing records are linked instead of
   duplicated.
3. Otherwise a new record / copy is created.

A Koha record is linked to the e-Library record sharing the most barcodes with
it. Copies follow Koha: if Koha holds a barcode under a different record, the
copy moves there. A barcode already held by a copy linked to a *different* Koha
item is never taken; it is reported.

## Two kinds of run

| | reads | can see deletions | when |
|---|---|---|---|
| **incremental** | items changed since the last run (Koha `timestamp`), records changed since then, and every item of each affected record | no — an absence in a partial read proves nothing | every 15 minutes (`7/15 * * * *`) |
| **full** | all of Koha | yes: a copy Koha no longer has is **withdrawn**, a record with none left is **unlisted** | nightly at 02:25 Phnom Penh (`25 19 * * *` UTC) |

A full run also lists what needs a person (`/admin/catalogs/koha-sync`, "For a
librarian to look at"): records and copies the e-Library has that Koha never
had, a record whose copies Koha files under other records, barcode conflicts,
and Koha records it could not read.

Cursors are stored exactly as Koha wrote them, offset included
(`2026-09-26T13:52:57+07:00`). This matters: `/biblios` compares a UTC value
(`…Z`) as if it were local time, seven hours early, so a UTC cursor made every
record look changed.

### Guarantees

- **One run at a time.** A lease on the `koha_sync_state` row (30 minutes);
  a second start answers "already running". A run cut short by a deploy leaves
  a lease that expires on its own; every step is idempotent, so the next run
  finishes the job.
- **The scheduled job never builds.** It starts nothing until a person has
  applied the first full build, and nothing while `KOHA_INTEGRATION` is not
  `read`/`write`. Both answer 409, which the workflow treats as normal.
- **A full apply needs a fresh preview.** "Apply" / "Build" is refused unless
  the last run was a successful full *preview* from the last 24 hours, so the
  person pressing it has seen the numbers.
- **Nothing is deleted.** `lib/koha/sync-boundary.test.ts` fails if a
  `.delete(` appears in the sync, or if it calls anything on the Koha client
  but `get`.
- **A failed run moves no cursor**, records its error on the admin page, and
  the next run retries.

## Reading Koha 26.05 — measured rules

Each of these answered 500, or read the wrong rows, on a live 26.05.03 when
not followed (pinned in `lib/koha/catalogue.test.ts`):

- `/biblios` sorts by `+biblio_id`; `+me.biblio_id` becomes
  `me.me.biblionumber` → 500.
- `/biblios` filters on `me.timestamp`; a bare `timestamp` is ambiguous → 500.
- The JSON `/biblios` listing needs an explicit `Accept: application/json`
  (else 406). The MARC listing (`application/marc-in-json`) sends no
  `X-Total-Count`, so paging stops on a short page.
- `x-koha-request-id` must be an integer (PR #256).
- **Pages are 100 rows, each with a 60 s budget.** Koha's item serializer costs
  about 23 ms an item with labels (100 items 2.3 s, 500 items 9.3 s), and the
  interactive default `KOHA_TIMEOUT_MS` is 8 s: a 500-item page did not fit.
  Background reads pass their own budget (`timeoutMs`, capped at 120 s); the
  admin's interactive calls keep `KOHA_TIMEOUT_MS`.
- The incremental pass reads changed items without labels (it only needs to
  know which records changed) and re-reads the affected records' items with
  them.

Measured on a local Koha (x86_64 Mac, Docker): a full read is about 5
minutes; a quiet incremental pass about 1.5 s; the incremental pass after
9,000 items were given a collection took 7 minutes. A slower box scales these.

## Going live (production)

Everything below is a production step. Each needs approval at the Phase 2 gate.

1. **Merge the PR.** The box applies migration 0157 on deploy
   (`infra/supabase/scripts/migrate.sh`; `migrate.yml` alone applies nothing
   here). Until then `/admin/catalogs/koha-sync` says the table is missing and
   the cron answers 409.
2. **Give Koha the departments** (on the box, in the deployment package — see
   its `docs/03-PMB-MIGRATION.md`, "Departments"): re-run the converter with
   `--collections migration/departments.json`, then
   `scripts/set-collections.sh` (dry run), then `--apply`. It only fills empty
   collections. Doing this first means the build creates records with their
   department.
3. **Take a database backup** (the box's usual backup).
4. **Preview.** `/admin/catalogs/koha-sync` → *Preview full sync*. Expected
   against production's current 6 records / 8 copies (the first six PMB titles):
   about **2,632 records to create, 6 to link, 13,421 copies to create, 8 to
   link**, and no exceptions. Anything else: stop and look.
5. **Build.** *Build the Physical Library from Koha* → confirm. Then
   `/catalogs` should list 2,638 records.
6. From then on the 15-minute and nightly jobs run by themselves.

**If a build fails part-way** (2026-09-26, the first production build:
`null value in column "author" … violates not-null constraint`): nothing needs
undoing. Each batch of 200 records is one insert, so a batch with one bad row
is refused whole while the others are created. The run is recorded as failed,
nothing is marked built, and no cursor moves. Fix the cause, then **Preview
again**: the records already created are matched by their Koha id, and the
preview lists only what is still missing. Then Build.

That failure was schema drift. Production's `catalog_books` refused NULL in
`author` although the migration chain has always declared it nullable.
Migration **0158** restates the chain's intent for the three columns the sync
can leave empty (`author`, `category`, `created_by`); it is a no-op wherever the
column is already nullable. Reconstructed from the same Koha data: 1 of 14
batches was accepted, so production held 206 records / 564 copies after that
run, and the recovery preview should show about **2,432 records and 12,865
copies to create**.

**`CATALOG_AVAILABILITY_IS_LIVE` stays `false`** until the PMB → Koha
cut-over ("freeze and re-lend") is finished. Until every current PMB loan is
re-issued in Koha, Koha calls those books available, and so would the public
catalogue if it claimed to be live.

**Undoing a build**, if it must be undone: restore the backup from step 3.
Without one, the records the build created are exactly those with a
`koha_biblio_id` created after the build started, and deleting them cascades to
their copies; the 6 pre-existing records keep their rows but had their
Koha-owned fields overwritten.

**Turning it off:** `KOHA_INTEGRATION=off` on the box. The cron then answers
409, the data stays as it is, and the admin forms work as before.

## What Phase 2 does not do

No writes to Koha (Phase 5+). No patrons, loans or holds (Phases 7–8). No
covers from Koha. No deletion, ever. The CSV importer remains in the admin, but
a record added only in the e-Library is not in Koha, so it cannot be lent; the
nightly run lists it for review. New physical books are catalogued in Koha.
