# CodeQL triage — September 2026

`.github/workflows/codeql.yml` runs the `security-and-quality` suite on every
PR, on `main`, and weekly. It is advisory: `.github/branch-protection.json`
lists `test`, `secret-scan`, `dependency-review` and `e2e` as the required
contexts, and `CodeQL` is not one of them. Findings are triaged here, in the
Security tab, rather than blocking a merge.

This is the record of the 54 alerts open on `main` as of 2026-09-11: what was
fixed, what was taken out of scope, and — for everything dismissed — the
specific reason it is not a defect. A dismissal with no stated reason is worse
than an open alert, because the next person cannot tell it from a real one that
somebody got tired of.

## What CodeQL does and does not recognise here

Three facts about this codebase's interaction with the JS queries, learned the
expensive way. They explain most of the table below, and they are worth reading
before re-attempting any of it.

1. **A sanitizer that TRANSFORMS a value is honoured; a sanitizer that returns
   a BOOLEAN is not.** Dataflow follows the value, so `scrubLogValue(x)` breaks
   a `js/log-injection` path even though it is a call into another module.
   `isSafeImageSrc(x)` returns `true`/`false`, and `js/xss-through-dom` does not
   treat a call to a user-defined predicate as a barrier guard no matter how it
   is written — verified across three re-scans on PR #113 with the predicate
   written as a regex prefix test, as a single-read local, and as a `new URL()`
   + explicit `.protocol ===` comparison. Do not re-attempt "a smarter guard
   function" for that rule.

   **But the transform has to be one the analysis can read**, and for
   `js/log-injection` that means a `.replace()` whose pattern names the line
   break literally and whose replacement is the EMPTY STRING:

   ```js
   .replace(/[\r\n]/g, "")   // recognised
   .replace(/[\r\n]+/g, " ")  // NOT recognised — non-empty replacement
   .replace(/\r\n|\r|\n/g, "\\n")  // NOT recognised — non-empty replacement
   .replace(/[\u0000-\u001f]/g, "")  // NOT recognised — \n is inside a range
   ```

   The first version of `lib/log-safe.ts` flattened line breaks to a visible
   `\n` marker, which is a non-empty replacement, and the PR scan came back with
   three fresh `js/log-injection` alerts at the three lines it had just
   "fixed". `lib/pdf-page-index.ts` had already learned this and said so in a
   comment; the two scrubbers have since been consolidated into
   `lib/log-safe.ts` so there is one place for the lesson to live. The
   information the marker carried is now a ` [flattened]` suffix, which needs no
   replacement at all.

   A negated class (`.replace(/[^\w-]/g, "")`) is also recognised, which is why
   `lib/indexing/state.ts` was the one log-injection site that cleared on the
   first attempt.
2. **Rebuilding a URL is only a barrier if the rebuild does not copy the
   input.** `toAllowedStorageUrl()` was already assembling its result on an
   allow-listed host, but it did so with `new URL(u.href)` and then assigned
   `.hostname` — and the taint rides in on `u.href`. Alert #2 pointed at
   exactly that line. The fix was to build the origin from a scheme literal and
   an allow-listed host and copy path/query/fragment in through the setters.
3. **The quality queries see through test fixtures and CLI scripts about as
   well as you would expect.** A test that asserts on source text containing
   `${` is a `js/template-syntax-in-string-literal`; a maintenance script that
   reads `.env` and then calls `fetch` is a `js/file-access-to-http`. Twenty-five
   of the 54 are that shape.

## Fixed in code (12)

| Alert | Rule | Where | Fix |
|---|---|---|---|
| #2 | `js/request-forgery` (**critical**) | `lib/pdf-page-index.ts:306` | `toAllowedStorageUrl()` now assembles the origin from a scheme literal plus a host rebuilt character-by-character out of a constant alphabet, then copies path/query/fragment through the URL setters. Nothing of the input string reaches the authority. Byte-for-byte preservation of the signed path+query is pinned by `lib/zima.test.ts` — R2 presigns both, so a rebuild that re-encodes either one 403s every legacy file. |
| #129 | `js/insecure-randomness` | `lib/book-utils.ts:132` | The uid counter seed and the two-character random suffix both come from `crypto.getRandomValues`. The `Math.random()` fallback is gone rather than guarded: a silent downgrade to a predictable sequence is the failure being defended against. Seeding is lazy, so importing the module never touches `crypto`. |
| #15 | `js/incomplete-sanitization` | `lib/citations.ts:67` | `escapeBibtex()` is one pass with a lookup table instead of a chain of `.replace()` calls that hid backslashes behind a NUL placeholder. That placeholder was also a real (if narrow) defect: a literal NUL in a title came back out as `\textbackslash{}`. Regression test added. |
| #33 | `js/remote-property-injection` | `app/api/oai/route.ts:85` | The property name written into the args object is now taken from `OAI_ARG_NAMES`, a closed constant list, never from the query string. Unknown parameter names are collected separately so `validateArgs` still reports them verbatim — they are reported, but they no longer address anything. |
| #112 | `js/log-injection` | `app/actions/upload.ts:85` | `scrubLogValue()` (new, `lib/log-safe.ts`). |
| #125 | `js/log-injection` | `app/api/search/native/route.ts:1191` | `scrubLogValue()`. |
| #119, #120 | `js/log-injection` | `lib/indexing/state.ts:285,304` | `scrubLogValue()` ahead of the existing `[^\w-]` narrowing. |
| #44 | `js/log-injection` | `scripts/get-gmail-refresh-token.mjs:77` | Line breaks removed (not replaced with a space — see fact 1) and length capped, before the OAuth error reaches the operator's terminal. |
| #113 | `js/unused-local-variable` | `app/api/books/[slug]/download/route.test.ts:10` | Dropped the unused `from` from the destructure. |
| #127 | `js/useless-assignment-to-local` | `scripts/smoke-test.ts:55` | `bodyOk`/`statusText` declared without dead initializers; every path assigns them. |
| #118 | `js/comparison-between-incompatible-types` | `lib/polyfills/dom-matrix.ts:38` | Null check before the `typeof` narrowing. |

`lib/log-safe.ts` is new and is now the one place that decides what is safe to
put in a log line. It holds two functions: `scrubLogValue()` for an arbitrary
value on its way into a log call (removes line breaks, drops C0/C1/DEL, caps
length, reads `.message` off an `Error`, appends ` [flattened]` when it removed
a line break) and `sanitizeLogId()`, moved here from `lib/pdf-page-index.ts` and
re-exported from there so its existing callers and test are untouched. Two
near-identical scrubbers in two files is exactly the drift that lets one of them
fall behind — which is what happened: the version in `pdf-page-index.ts` already
knew the empty-replacement rule and the new one did not.

## Taken out of scan scope (2)

`.github/codeql/codeql-config.yml` adds one `paths-ignore` entry,
`docs/mockups/**`, which clears **#10** and **#11**
(`js/xss-through-dom` in `ptec-footer.html` and
`hero-search-constellation.html`).

Those files are static HTML design mockups opened directly in a browser by a
designer. They are never built, imported, served or deployed — `docs/` ships
nowhere. The finding is a real pattern (a mockup assembles its own preview
document with `innerHTML`) against a document with no untrusted input and no
audience. The suite itself is unchanged and still `security-and-quality`; the
config file exists so a scope decision sits next to its justification instead
of inside a workflow `with:` block.

## Dismissed — false positive (39)

### `js/xss-through-dom` × 6 — #4, #5, #6, #9, #110, #111

All six are `<img src={…}>` in an admin or dashboard form, and **all six already
carry an `isSafeImageSrc()` guard at the sink** (`lib/safe-image-src.ts`:
parses the URL, allows only `http:`/`https:`/`blob:` and image `data:` MIME
types). CodeQL does not accept a boolean predicate as a barrier guard — see
fact 1 above.

Four of them (#4, #5, #6, #110) are additionally false at the source: the
flagged value is `URL.createObjectURL(file)`, a `blob:` URL minted by the
browser for a file the user picked from their own disk. It cannot be
`javascript:`. CodeQL flags it because `e.target.files` is DOM-derived and
`createObjectURL` is not modelled.

The other two (#9 `SeoOverrideFields`, #111 `CatalogCoverField`) do trace an
admin-typed URL from `e.target.value` to the sink. That is the case the guard
was added for, and it is in place at both sinks.

### `js/user-controlled-bypass` × 4 — #20, #21, #22, #23

- `app/(auth)/auth/callback/route.ts:43,59` — the flagged conditions are
  `if (token_hash && type)` and `else if (code)`. They select WHICH Supabase
  flow to run (email OTP vs PKCE). The authentication decision is
  `verifyOtp()` / `exchangeCodeForSession()` on the next line, and its
  `error` is what gates everything after. A caller choosing the branch chooses
  which verification to fail.
- `app/actions/review.ts:492` — `type === "book" ? verifyEbook(id) : verifyThesis(id)`.
  A dispatch on a resource type. Both branches are reviewer-gated,
  quality-gated and audit-logged inside the action they call.

### `js/clear-text-logging` × 2 — #76, #77

The query treats any `process.env` read as sensitive.

- `scripts/backup/backup-storage-files.mjs:87` logs `STORAGE_BACKUP_SOURCE` —
  a filesystem path — in the "source does not exist" error.
- `scripts/ops/create-breakglass-admin.mjs:157` logs `NEXT_PUBLIC_SITE_URL` —
  a public URL, with `NEXT_PUBLIC_` in its name.

### `js/file-access-to-http` × 20 — #24, #25, #26, #27, #28, #29, #30, #80, #81, #82, #83, #84, #85, #86, #87, #88, #89, #121, #122, #126

"Outbound network request depends on file data." In every one of these the
"file data" is the script's own configuration or input:

- `scripts/backup/lib.mjs`, `scripts/ops/create-breakglass-admin.mjs`,
  `scripts/ops/alert-telegram.mjs`, `scripts/fix-metadata-2026-07-11.mjs` —
  read `.env` from the repo root, then call the Supabase/Telegram API with the
  credentials it holds. That is what a CLI script is.
- `scripts/search-benchmark.ts`, `scripts/migration/benchmark.mjs`,
  `lib/ai/ollama.ts:167` (reached from `scripts/calibrate-chunk-threshold.ts`)
  — read a local JSON file of benchmark questions and send them to the model
  under test. Also the entire point.

None of these paths run in the application. `lib/ai/ollama.ts` is flagged only
because a benchmark script imports it; the request URL is `opts.baseUrl`, which
comes from `OLLAMA_BASE_URL`, not from the file.

### `js/http-to-file-access` × 2 — #34, #35

The inverse, same shape: `scripts/backup/backup-db.mjs:131` writes a failed
table dump's error into the backup report, and
`scripts/fix-metadata-2026-07-11.mjs:151` writes an API response to a local
report file. Writing a fetched response to a local file is what a backup script
does.

### `js/template-syntax-in-string-literal` × 5 — #45, #46, #91, #92, #93

`lib/pwa/launch.test.ts` and `lib/seo/entity-graph.test.ts` are source-scanning
invariant tests. They hold `${…}` inside ordinary quoted strings because the
string is a fragment of source code they are asserting about, not a template
they forgot to make a template.

## Dismissed — by design (1)

### #78 `js/clear-text-logging` — `scripts/ops/create-breakglass-admin.mjs:159`

This line prints the generated break-glass super-admin password to the
operator's terminal:

```
─── WRITE THIS INTO THE SEALED ENVELOPE, THEN CLEAR YOUR TERMINAL ───
```

There is no other channel. The credential is generated, shown once, never
stored, and the surrounding output tells the operator to seal it and clear the
scrollback. The procedure is `docs/BREAK-GLASS-PROCEDURE.md`; the account
enrolls MFA on first activation and is reviewed quarterly. Removing the print
would remove the script's only output.

## Re-triaging

Re-run the grouping with:

```bash
gh api "repos/raksmeyron97-design/ptec-elibrary/code-scanning/alerts?state=open&per_page=100&ref=refs/heads/main" \
  --jq '.[] | "\(.number)\t\(.rule.security_severity_level // .rule.severity)\t\(.rule.id)\t\(.most_recent_instance.location.path):\(.most_recent_instance.location.start_line)"' \
  | sort -t$'\t' -k3,3 -k4,4
```

To read a flow rather than guess at one — which is what separated the six
`js/xss-through-dom` alerts into "guarded, browser-minted" and "guarded,
admin-typed" — download the SARIF and walk `codeFlows`:

```bash
gh api "repos/raksmeyron97-design/ptec-elibrary/code-scanning/analyses/<id>" \
  -H "Accept: application/sarif+json" > sarif.json
```
