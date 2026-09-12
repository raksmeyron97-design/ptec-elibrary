# SEO 3.2 — final decision

**Status: COMPLETE WITH WARNINGS**

Verified 2026-09-12 against production (`library.ptec.edu.kh` over HTTP,
`supabase.storage-ptec.online` read-only). Full evidence:
`docs/SEO-3.2-FINAL-PRODUCTION-VERIFICATION.md`.

## What is proven

| | |
| --- | --- |
| Contributor graph populated | **162 contributors / 303 edges** — PRODUCTION VERIFIED |
| Canonical coverage | **299 / 299 published resources = 100%** |
| Duplicate edges / orphans / duplicate identities | **0 / 0 / 0** |
| Conflicts | **1 partial, 0 true disagreements** (0.33%) |
| Migration 0143 | **APPLIED** — 301 → a real 200 page, unknown slug 404s |
| Live JSON-LD, 6 cases | Person, multi-person, editor, organization, institution, Khmer — **all correct** |
| SEO 3.2 vs live output, all 296 books | **296 identical, 0 different** |
| Tests / build | 4777 pass · clean build · CI `test` green |

## The regression this pass caught

The 0105 backfill copied composite bylines into single `contributors` rows —
46 of 162. SEO 3.2 took a canonical row to be one entity by contract, so it
would have published one fabricated `Person` named
`"Oon-Seng Tan, Woon-Chia Liu, Ee-Ling Low (Editors)"` where production
correctly emits three. Invisible while the graph was empty.

Fixed: backfilled rows are put back through the one normalization contract —
expanded when they name several entities, omitted when they cannot be separated
safely, and taken as stored when the write path (not the backfill) produced
them. Proven output-neutral across all 296 books.

Also fixed this pass: 53 false "conflicts" from the audit comparing raw columns
against split bylines, and 4 high-severity CodeQL `js/incomplete-sanitization`
alerts in the audit scripts' markdown escaping — both at the root, not suppressed.

## Why not unconditionally COMPLETE

| Warning | Impact | Risk |
| --- | --- | --- |
| W-1 · 44 composite contributor rows remain | renders correctly; those credits cannot link to a contributor page | low |
| W-2 · thesis/publication ingestion writes no canonical credits | coverage decays from 100% as content is added | low now |
| W-3 · 1 partial conflict on the single thesis | graph is richer than the byline; nothing missing | none |
| W-4 · search intentionally legacy-backed | none — same strings | none |
| W-5 · post-merge HTTP verification pending deploy | the deployed new code is not yet measured | low (296/296 parity) |
| W-6 · 29 rows' stored type disagrees with their name | resolved correctly at read time, reported | low |

W-5 is the only one that blocks an unconditional COMPLETE, and it cannot be
cleared until the merge deploys.

## Not done, deliberately

No historical composite splitting. No new URL family. No `/authors` rename. No
sitemap or search migration. No SEO 3.3 work.
