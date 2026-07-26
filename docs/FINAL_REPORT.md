# Final Report — audit run 2026-07-26

Branch: `improve/audit-20260726` (based on `origin/main` @ `3551bd2`), 3 commits, not merged,
**not pushed** (see "Could not complete" below). Full findings: `docs/SYSTEM_MAP.md`,
`docs/AUDIT.md`, `docs/DEFERRED.md`, `docs/R2-COVERS-MIGRATION-PLAN.md`.

## What was fixed

**`components/ui/home/LibraryNow.tsx` (+ new test)** — external review item #7, "today's
hours SSRs empty." The live open/closed status was deliberately client-only (correct, to avoid
showing a stale status on an ISR-cached page), but that gate also blanked the *hours-range
text itself* until mount, so SSR/crawlers/no-JS visitors saw a permanent loading skeleton
instead of "8:00 AM – 5:00 PM". Fixed by splitting the two concerns: the schedule text (which
only depends on today's weekday, constant all day) now renders from first paint; the
genuinely time-sensitive isOpen/closesAt claim still waits for client mount, unchanged. Added
`components/ui/home/LibraryNow.test.tsx` asserting both halves of that behavior.

**`docs/R2-COVERS-MIGRATION-PLAN.md`** — external review item #3. No storage was touched (per
explicit instruction); documented how to safely run the migration script that already exists
in the repo (`scripts/optimize-legacy-covers.mjs`).

## What was found already fixed (no change made)

Items #1, #2, #4, #5, #6, #8, #10 from the external review were all verified against current
code and found already correct — see `docs/AUDIT.md` for the file:line evidence on each. This
repo has an active remediation history (`git log` shows recent `fix(a11y)`, `fix(auth)`,
`perf(theses)` commits); the external review appears to predate several of them, including
`3551bd2` (`fix(auth): consolidate OAuth callback redirect guard...`), which landed on `main`
after the branch point this review likely ran against.

## What was deferred

- **#9** (hide "1 thesis"-style small counts) — conflicts with `docs/RESOURCE-STATISTICS.md`'s
  documented "never hide a real count" rule and the tested homepage-total-equals-sum-of-
  categories invariant. Needs a product decision, not an engineering fix. See `docs/DEFERRED.md`.
- **A4** (full trace of the AI prompt-injection boundary in `/api/ask`/`/api/chat`) — output
  sanitization confirmed, but whether retrieved book-chunk text is explicitly delimited from
  system instructions wasn't fully traced. Worth its own focused pass.
- **A7** (full hardcoded-string sweep for i18n) — large, mechanical, better as its own PR.

## What needs a human decision

1. **#9 above** — is showing "1 thesis" actually undesirable, and if so, should the total
   figure exclude it too (breaking the current "total = sum of parts" guarantee)?
2. Whether to schedule the R2 covers migration (`docs/R2-COVERS-MIGRATION-PLAN.md`) and when.
3. Whether to prioritize the deferred AI prompt-injection trace (A4) as a follow-up.

## Could not complete — and why (environment limitations, not skipped steps)

**This branch was not pushed and no PR was opened.** This sandbox has no GitHub
authentication of any kind: no `gh` CLI installed, no stored git credentials, and
`git push` fails immediately with "could not read Username for 'https://github.com'". This is
expected — this run happened inside Cowork against a locally-mounted folder, not inside an
authenticated `gh`/Claude Code checkout. **Manual step required:**

```bash
cd <path to e-library-ptec on your machine>
git push -u origin improve/audit-20260726
gh pr create --title "Audit 2026-07-26: today's-hours SSR fix + audit docs" \
  --body-file docs/FINAL_REPORT.md
```

(or push and open the PR from the GitHub web UI, using `docs/AUDIT.md` + this file as the PR
description).

**Full lint/typecheck/build/test battery was not run to completion**, for two independent
reasons, both explained in detail in `docs/DEFERRED.md`:

1. This agent's shell tool caps any single command at 45 seconds; whole-repo `npm run lint`,
   `npx tsc --noEmit`, and `npm run build` all exceed that here.
2. `vitest`/`rolldown` (and `react-doctor`/`oxc-parser`) cannot run **at all** in this sandbox
   regardless of timeout: the mounted `node_modules` was `npm install`ed on the user's Mac, and
   its native Rust bindings have no Linux build. Confirmed by running an existing, untouched
   test (`lib/library-hours.test.ts`) and getting the identical `MODULE_NOT_FOUND` — this is a
   pre-existing environment condition, not something this run's changes caused. Reinstalling
   `node_modules` for Linux inside the mounted folder was deliberately not attempted, since that
   folder is the user's real project directory and doing so would break it for their actual
   machine.

Every file this run touched was individually checked with `npx eslint <file>` (clean on all
four: `LibraryNow.tsx`, `LibraryNow.test.tsx`, and both new doc files don't apply to eslint).
The new test was written to match this repo's existing test-mocking conventions exactly
(`NextIntlClientProvider` + a `vi.mock("@/i18n/navigation", ...)` swap-in for `Link`, mirroring
`components/ui/theses/ThesisAbstractReader.test.tsx`) and reviewed by hand, but **was not
executed**. **Manual step required before merge, on a machine where the toolchain actually
runs:**

```bash
npm run lint
npx tsc --noEmit
npm run build
npm test
npm run test:e2e
```

Per the task's own merge gate, this PR should **not be merged** until all of the above are
confirmed green (and this run also touches no migrations, no RLS, no storage layer, and no
auth flow, so that part of the gate is already satisfied by construction — see the commit list
below).

## Commits on this branch

1. `docs(audit): add system map, audit findings, and deferred-items log`
2. `docs(storage): add legacy R2 covers migration plan (no migration performed)`
3. `fix(a11y,perf): render today's hours default before client mount`

## Suggested next run

1. Push this branch, open the PR, run the full toolchain on a real machine/CI, merge if green.
2. A focused pass on A4 (AI prompt-injection boundary) with adversarial test fixtures.
3. A dedicated i18n sweep (A7) as its own PR, not bundled with a security/correctness audit.
4. Bring #9 to a product decision; if the answer is "yes, hide small counts," implement the
   threshold inside `getCollectionStats()` itself (one source of truth) and update
   `lib/resource-stats-consistency.test.ts` + `e2e/resource-stats.spec.ts` to match the new,
   explicitly documented rule.
5. Schedule the R2 covers migration per `docs/R2-COVERS-MIGRATION-PLAN.md` when convenient.

## A note on this sandbox's git behavior

Every git write operation in this session left a stale `.lock` file (`index.lock`,
`HEAD.lock`, loose-object temp files) that this agent could not delete — the mounted folder is
a FUSE bridge that permits create/write/rename but not `unlink`, confirmed by testing generic
file deletion directly. Each commit above required manually renaming the stale lock out of the
way first (same-filesystem `rename` works even though `unlink` doesn't). This did not corrupt
anything — `git log`/`git status` on the resulting branch are clean — but if a real
`index.lock`/`HEAD.lock` file is ever left behind after this session ends, it's inert; deleting
it normally on your own machine (where `rm` isn't restricted) resolves it instantly.
