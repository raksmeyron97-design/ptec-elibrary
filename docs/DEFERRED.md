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
