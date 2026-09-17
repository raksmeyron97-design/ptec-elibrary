# Deferred items — 2026-07-26 audit run

Anything from `docs/AUDIT.md` not fixed in this run, with the reason.

## Not fixed — conflicts with existing, deliberate design (needs a product decision)

**#9 "Hide categories below a small threshold" (e.g. '1 thesis').**
`docs/RESOURCE-STATISTICS.md` documents a hard rule: the collection-stats service never
fabricates or suppresses a real non-zero count, and `lib/resource-stats-consistency.test.ts`
+ `e2e/resource-stats.spec.ts` enforce "homepage total == sum of its categories" as a tested
invariant. Hiding "1 thesis" while still counting it in the total breaks that invariant;
excluding it from the total too would mean the total no longer means "everything published."
This is a legitimate product question — does a young collection look worse showing "1 thesis"
than showing nothing? — not an engineering bug, and the task's own instruction is to document
rather than act on ambiguous/risky changes. **Recommendation if the product wants this**: add
an explicit, separately-tested threshold rule to `getCollectionStats()` itself (so there is
still exactly one source of truth) rather than hiding it ad hoc in a display component, and
update both consistency tests to assert the new (documented) behavior.

## Not fixed — legitimate follow-up, out of scope for a conservative single pass

**A4 — AI prompt-injection boundary in `/api/ask` and `/api/chat`.**
Confirmed output rendering is sanitized, but did not fully trace whether retrieved
`book_chunks` content is explicitly delimited from the system instructions in the prompt
assembly (i.e., could a maliciously crafted PDF's extracted text contain something like
"ignore previous instructions" and have it treated as a directive rather than data). This
needs a careful read of the exact prompt-construction code in both routes and, ideally, a
short adversarial test fixture — worth its own focused pass rather than a rushed read here.

**A7 — Full hardcoded-string sweep for i18n.**
`lib/i18n-namespaces.test.ts` guards that namespaces are complete, but that doesn't catch a
literal English string typed directly into JSX that was never routed through `t()` at all.
A real sweep means grepping every `.tsx` under `app/` and `components/` for literal
user-facing text, which is a large, mechanical, low-risk-of-breaking-anything task but a
high-effort one — better run as its own dedicated pass with its own PR, not bundled into a
security/correctness audit.

## Not fixed — explicitly prohibited by this run's instructions

**#3 — Legacy R2 covers migration.** The task explicitly says "do NOT migrate storage in this
run; write a migration plan doc only." Done: `docs/R2-COVERS-MIGRATION-PLAN.md`. The repo
already has a reversible, dry-run-capable script (`scripts/optimize-legacy-covers.mjs`) that
implements exactly this plan; it has not been run.

## Verified as already fixed, not re-touched

Items #1, #2, #4, #5, #6, #8, #10 from the external review were all found already correct in
the current code (see `docs/AUDIT.md` for evidence per item). No changes were made for these
— re-implementing something that already works risks introducing a regression for zero
benefit.

## Tooling limitations acknowledged here, not hidden

Two independent limits in this sandbox, not the codebase:

1. **Shell command timeout.** The tool available to this agent caps any single command at 45
   seconds. `npm run lint` (whole repo), `npx tsc --noEmit`, `npm run build`, and the full
   `npm test` / `npm run test:e2e` suites all exceed that on this codebase's size.
2. **`vitest`/`rolldown` cannot run at all here**, independent of the timeout: this sandbox's
   mounted project folder has `node_modules` installed on the user's Mac
   (`@rolldown/binding-*` etc. are platform-specific native binaries), and this agent's shell
   is Linux — `npx vitest run <anything>` fails immediately with `Cannot find module
   '../rolldown-binding.linux-x64-gnu.node'`, confirmed by running it against an existing,
   untouched test (`lib/library-hours.test.ts`) with the same result. Reinstalling
   `node_modules` for Linux inside the mounted folder was **deliberately not done** — that
   folder is the user's real project directory, and doing so would corrupt it for their actual
   (macOS) machine.

What this means concretely: `npx eslint <file>` was run per changed file and is clean (ESLint
itself has no native-binding dependency and works fine here). The new test,
`components/ui/home/LibraryNow.test.tsx`, was written following the repo's existing
`next-intl` + `@/i18n/navigation` mocking convention (mirrors
`components/ui/theses/ThesisAbstractReader.test.tsx`) and reviewed by hand line-by-line, but
**could not be executed** in this environment to confirm it passes. The full battery —
lint, typecheck, build, `npm test`, `npm run test:e2e` — must still run (in CI, or on the
user's own machine) before this branch is mergeable. This is called out again in
`docs/FINAL_REPORT.md` with the exact commands to run first.

---

# Deferred items — added after the 2026-07-26 run

Same rule as above: anything shipped as a stopgap, with the work it defers and
the condition that retires it.

## Populate the physical catalogue (`catalog_books`)

**Deferred by:** the `PHYSICAL_CATALOG_MIN_DISPLAY` floor in
`components/ui/home/TrustBar.tsx` (2026-09-17).

Production held **6** active `catalog_books` rows on 2026-09-17, against 1,732
books and 1,734 digital resources. The homepage trust band therefore advertised
"6 — Books in the physical library" directly under the hero, in a band whose
entire purpose is to make the collection's size credible. The figure is true;
it is also the smallest number on the page, and it reads as the size of the
room rather than as the size of the catalogue *record set*, which is what it
actually measures.

The tile is now hidden while that count is under 25. **This is a display
band-aid over a data gap, not a fix**, and it is deliberately reversible with
no code change: catalogue the 25th book and the tile returns on the next
`collection-stats` revalidation.

**The real work**, in the order it unblocks things:

1. Catalogue the physical holdings into `catalog_books` (`is_active = true`).
   `/admin/catalogs` is the existing surface; no schema change is needed.
2. Re-check the floor once the true shelf count is known. 25 was chosen as a
   round number comfortably above 6, not measured against the real holdings —
   if the library has 4,000 physical books, a floor of 25 is meaningless and
   should simply be removed rather than tuned.
3. Delete `PHYSICAL_CATALOG_MIN_DISPLAY` and its tests when the count can no
   longer plausibly fall under it.

**What this is NOT.** The floor lives in the display component, never in
`getCollectionStats()`. Suppressing there would hide the figure from every
consumer — including `/catalogs`, the physical catalogue's own page, which must
always state its real size, and `/llms.txt`. `docs/RESOURCE-STATISTICS.md`'s
rule that the service never invents or suppresses a count is unchanged, and the
"homepage total == sum of its categories" invariant is untouched because
`physicalCatalogs` was never part of that total.

**Related:** this is the same product question as **#9** above ("Hide
categories below a small threshold"), decided for this one tile only. #9's
recommendation — put the rule in `getCollectionStats()` — was deliberately NOT
followed, for the reason in the paragraph above; the single-source-of-truth
concern it raises is met instead by the tile's floor and its rendered value
being the same field of the same read, pinned by
`components/ui/home/TrustBar.test.tsx`.
