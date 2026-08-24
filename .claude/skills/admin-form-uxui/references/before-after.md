# Rollout record

One entry per form improved under this skill. Append; do not rewrite history.

Template:

```
## Form: <name> — <path>
### Before
### Problem
### iCase-inspired principle
### PTEC implementation
### Result
### Preserved
```

---

## Form: PublicationForm — `app/(admin)/admin/(protected)/publications/_components/PublicationForm.tsx`

**Pilot.** Chosen because it is the most complex real form in the panel (1325
lines, six steps, autosave, publish gate) and because its *workflow* was already
the best in the repo — which isolated the field layer as the thing actually
being tested.

### Before

- 26 label/input pairs written by hand as
  `<div><label className={LABEL_CLASS}>…</label><input className={INPUT_CLASS} …/></div>`.
- **Zero** `aria-invalid`, **zero** `aria-describedby`, **zero** per-field error
  slots in the whole file.
- Required-ness was invisible: `required` sat on the title input with no visual
  marker; nothing else was marked at all.
- Eleven labels carried a literal `"(optional)"` suffix — the inverse of the
  convention, and inconsistent (some optional fields had no suffix).
- Hints were `<p className="mt-1 text-[11px] text-text-muted">`, a size used
  nowhere else in the kit.
- Three different textarea class expressions built inline from `INPUT_CLASS`.
- Publish-blocking problems computed by `buildPublicationReview()` were rendered
  **only** in the Review panel. A server publish refusal set `publishError` and
  left the author on the Review step to re-audit six steps by eye.

### Problem

The form could tell you *that* three things were wrong and never *where*. On a
six-step form with every panel mounted-but-hidden, a blocking error on
`page_start` was two clicks and a scroll away from the message describing it.
And because the field layer was hand-written 26 times, adding an error slot to
any one field meant inventing markup that no other field shared.

### iCase-inspired principle

From `product-form/`:

- **`Field` owns label, required marker, control, and one slot that holds either
  the hint or the error** — so correcting a mistake never reflows the form.
- **Steps declare the fields they own, and a failed submit routes the user to
  the first offending one.** iCase switches to the tab; PTEC's review model
  already carries `{step, field}` per item, so it can go one better and land on
  the control.

Not copied: iCase's `gray-*`/`rose-*` palette, its keyboard-dead custom
`Select`, its on-submit-only model, or its habit of validating a draft as if it
were a publish.

### PTEC implementation

New shared layer, `components/admin/kit/form/`:

- `styles.ts` — the canonical `INPUT_CLASS`/`LABEL_CLASS` (moved verbatim from
  `theses/_components/form-styles.ts`, which now re-exports them so all fourteen
  existing importers were untouched), plus `TEXTAREA_CLASS`, `MONO_INPUT_CLASS`,
  `INPUT_INVALID_CLASS`, `HINT_CLASS`, `ERROR_CLASS`.
- `Field.tsx` — render-prop form hands the control `id`, `className`,
  `aria-invalid`, `aria-describedby` and `required`, so it cannot be
  mislabelled; plain-children form for composites (`TagInput`, dropzones).
- `FormSection.tsx` — titled group with an optional explanation.
- `focus-first-invalid.ts` — `focusFirstInvalid()` and
  `focusFirstInvalidAfterPaint()`, both skipping `[hidden]` subtrees because
  stepped forms keep every panel mounted.

In `PublicationForm`:

- All 26 pairs converted to `<Field>`. Required marked with `*` on title, slug,
  article type, language, keywords and the article PDF; every `"(optional)"`
  suffix removed from a label and, where it carried information, moved into the
  hint or the section description.
- `showFieldIssues` state, off by default. **Saving a draft never turns it on** —
  a draft is legitimately incomplete, and painting a new form red would report a
  dozen problems the author has not had a chance to make yet. Opening *Review*
  or a refused *Publish* turns it on.
- `fieldIssues` maps `review.errors[].field` (already the `pf-field-*` suffix)
  onto the fields, so the same review model that drives the Review panel and the
  server publish gate now also drives the inline errors — one source of truth,
  not a second client-side validator.
- On a refused publish: switch to the step owning the first field-scoped error,
  then `focusFirstInvalidAfterPaint()` scrolls it to centre and focuses it.
- "Journal & issue" and "Identifiers & rights" headings dropped from `text-lg`
  to the kit's `text-sm font-semibold` and gained one-line explanations — the
  first says everything under it is optional, the second says why a license
  blocks publishing.

### Result

- Every control in the form now carries `aria-invalid` and `aria-describedby`
  when it has a problem, and a `role="alert"` error node — from 0 to 26.
- A refused publish lands the cursor in the field that caused it.
- One label style and one input base across the file; the three inline textarea
  expressions collapsed to `TEXTAREA_CLASS`.
- `npx tsc --noEmit` clean · `npm run lint` 0 errors · `npx vitest run`
  1573 passed, 33 skipped, 0 failed.

### Preserved

No change to: the Server Actions (`savePublicationWorkspace`,
`publishPublicationValidated`, `savePublicationDraft`, …) or their signatures;
the `SCALAR_FIELDS` FormData contract; the autosave/draft-recovery machinery;
optimistic-concurrency `revision`; `buildPublicationReview` or the server publish
gate; the step model; upload routes and storage paths; permissions; cache
revalidation; routing. `INPUT_CLASS`/`LABEL_CLASS` values are byte-identical, so
there is no visual regression to the controls themselves — the additions are the
required markers, the hints, and the error slot.

---

## Forms: AddBookWizard + EditBookWizard — `app/(admin)/admin/(protected)/catalogs/{add,edit/[id]}/_components/`

Second rollout target, chosen because these two files carried the clearest
evidence that the shared field layer was already wanted: a **verbatim-duplicated**
`labelCls` / `inputCls` / `fieldError()` / `errProps()` block, 21 lines, in both.

### Before

```tsx
const labelCls = "block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5";
const inputCls = ` w-full rounded-xl border border-divider bg-paper/50 … `;
const fieldError = (name) => fieldErrors[name] ? <p … className="…text-red-500">…</p> : null;
const errProps  = (name) => fieldErrors[name]
  ? { "aria-invalid": true, "aria-describedby": `${name}-error`, className: inputCls + " !border-red-300" }
  : { className: inputCls };
```

Both files then repeated
`<div><label className={labelCls}>…</label><input {...errProps(n)}/>{fieldError(n)}</div>`
nine times each.

### Problem

1. The duplication itself — a fix to one would not reach the other.
2. `!border-red-300` and `text-red-500` are raw Tailwind, not PTEC tokens, so the
   invalid state did not match `--ptec-danger` used everywhere else.
3. `inputCls` was a **third** input base (`rounded-xl px-3.5 py-2.5`) competing
   with `form-styles`' `h-11 rounded-lg px-4`, so the catalog forms visibly did
   not match the thesis and publication forms.
4. `labelCls` was the uppercase micro-caps idiom while the rest of the panel's
   newer forms use sentence-case semibold.
5. Required-ness was carried inside the translation strings
   (`"titleReq": "Title *"`), which meant the marker was untranslatable as a
   concept, invisible to assistive tech, and applied to only three of nine
   fields.
6. `fieldError` was rendered *after* `errProps` had already pointed
   `aria-describedby` at it — correct, but re-derived rather than guaranteed.

### iCase-inspired principle

`Field` owns label, required marker, control and the error slot; the caller
cannot forget the wiring. iCase's `product-form/fields.tsx` `Field` is the
shape; PTEC's adds the ARIA that iCase's tier-2 omits.

### PTEC implementation

- Both local helper blocks deleted; both files now import
  `{ Field, ERROR_CLASS }` from `@/components/admin/kit/form`.
- All nine field pairs per file converted to `<Field>` with the render-prop
  form, so each control gets the canonical `INPUT_CLASS`, `aria-invalid`,
  `aria-describedby` and `required` from one place.
- `" *"` stripped from `adminCatalog.form.titleReq` / `authorReq` /
  `languageReq` in **both** `messages/en.json` and `messages/km.json`; the
  marker now comes from `required` on `<Field>`, which also sets `required` on
  the control.
- The "Library details" sub-heading dropped from uppercase micro-caps to the
  kit's `text-sm font-semibold text-text-heading`.
- Cover-field errors, which sit outside a `Field` because `CatalogCoverField`
  owns its own layout, render through `ERROR_CLASS` with `role="alert"`.

### Result

- 42 lines of duplicated helper code removed.
- The catalog forms' controls now match the thesis, publication and learning-path
  forms exactly — one input base instead of three across those files.
- Invalid state uses `--ptec-danger` instead of raw `red-300`/`red-500`.
- Required marking went from 3 fields carrying a baked-in glyph to 3 fields
  carrying a real `required` attribute plus an `aria-hidden` marker.

### Preserved

`addCatalogBook` / `updateCatalogBook` Server Actions, their `fieldErrors`
return shape, every `name=` attribute (the FormData contract is unchanged), the
copies tab, the dirty guard and its `ConfirmDialog`, `CatalogCoverField`,
`SeoOverrideFields`, routing and permissions. Only the three `*` glyphs were
removed from the message files; no key was added, removed or renamed, so
`lib/i18n-namespaces.test.ts` is unaffected.

---

## Theses: create, edit and manage-cohorts

`app/(admin)/admin/(protected)/theses/{create,edit/[id],manage-cohorts}/` plus
`components/admin/theses/form/*`.

### Before

**The Create form opened already failing.** `validateThesisPublish()` ran
unconditionally on every render, and it returns seven errors for an empty
thesis. So a brand-new upload page rendered with red counts on four of the
seven steps — Basic Info **2**, Classification **3**, People **1**, Files
**1** — and "Title is required" under an input nobody had reached. At the same
time `completedSteps` was `steps with zero errors`, so Abstract, References and
Review showed **green ticks** while empty. Red for untouched, green for
untouched, on the same nav.

**Publishing was whack-a-mole.** `handleSubmit` did
`for (…) if (errors[key]) return fail(errors[key], step)` — it reported error
one, switched to its step, and stopped. Fixing it and resubmitting revealed
error two. There was no way to see how many remained, and nothing focused the
offending control.

**Deleting a program said nothing about what went with it.** All four levels
(program, faculty, cohort, academic year) used an inline `Delete?` + `Yes`/`No`
pair — with `No` hardcoded in English next to a translated `Yes`. Deleting a
program cascades to its faculties, its cohorts and their academic years; the
prompt named neither the record nor the cascade.

**Neither form page had an `<h1>` where the heading belongs.** Both pages
opened with a bare icon back-link and a subtitle; the `<h1>` lived *inside*
`ThesisForm`, below them. On Edit, `DownloadAccessCard` rendered above all of
it, so the first thing on the page was download-permission controls for a
thesis the page had not yet named.

**Raw palette throughout** — `amber-*` draft banner, `red-*` errors, `cyan-*`
progress, `bg-red-500` step badges, `text-emerald-500` ticks: 40 literals
across 13 files, none of them tokens.

**Seven `aria-live="polite"` regions**, one per step button, all re-announcing
whenever the error counts recomputed — which was on every keystroke.

**Back from manage-cohorts always went to `/admin/theses/create`**, even when
you arrived from Edit, where it discarded whatever you were editing.

### iCase-inspired principle

From `product-form/`: steps own their fields, a failed save routes to the
first offending one, and the toast **counts** rather than enumerating. From
`SectionEditor`: state the consequence before a destructive action, and never
let Escape or a close button silently drop work.

Not copied: iCase validates on submit only and never focuses the invalid field
— PTEC now does both. iCase's `ConfirmDelete` asks "Are you sure you want to
delete this item?" and names nothing; PTEC's dialog names the record and counts
the cascade.

### PTEC implementation

**Validation now waits until the rules apply.** `publishRulesApply = status is
published/scheduled || wasPublished`; `showPublishIssues = publishAttempted ||
publishRulesApply`. Saving a draft has only ever needed a title, so a draft
never lights up. A refused publish sets `publishAttempted` and the counts stay
on from then. `completedSteps` now means *the author put something here*
(`stepFilled` per step) **and** it has no errors.

**All blocking problems are reported at once.** `handleSubmit` collects the
failing set, shows `"{count} fields must be filled in before this thesis can be
published."`, switches to the first offending step, and calls
`focusFirstInvalidAfterPaint()` from the form kit — the `AfterPaint` variant
because the control is not in the DOM until the new step renders.

**One `ConfirmDialog` replaces four inline prompts.** A `PendingDelete`
discriminated union carries the record's name and its dependent counts, so the
dialog says *"Delete the Bachelor of Education program?"* / *"This also removes
3 faculties and 12 cohorts under it, together with their academic years."*, with
`"This cannot be undone. Theses already classified under it keep the value they
were saved with."` as the hint. Eight state variables collapsed to two. The
dialog brings the focus trap, scroll lock and Escape handling the inline prompt
never had.

**`PageHeader` on all three pages**, with the `<h1>` removed from `ThesisForm`
so there is exactly one per page. Edit names the thesis and shows its status
via `StatusBadge` + a new `STATUS_TONES` map, with a "View public page" action
when it is live; `DownloadAccessCard` now sits below that heading.
manage-cohorts goes back to `/admin/theses`.

**Palette tokenized** — 40 literals across 13 files replaced with
`danger`/`success`/`warning`/`info` and their `-soft`/`-line`/`-text` triplets.
The error banner gained `role="alert"` and an icon; the upload-progress banner
gained `role="status" aria-live="polite"` and `motion-reduce:animate-none`.

**One live region for the step nav** instead of seven; the per-step `sr-only`
text is now part of each button's accessible name rather than its own region.

**Also:** the compact inline inputs in manage-cohorts derive from the kit's
`INPUT_CLASS` instead of being a fourth independent base; every icon-only
delete button is `aria-label`-ed with the record's name; the primary submit
shows a spinner and explains the one case where it is disabled; the
"Manage cohorts" link keeps `target="_blank"` **on purpose** — client-side
`<Link>` navigation bypasses `beforeunload`, so following it in place would
drop the in-progress form — and now says so to screen readers.

### Result

A new Upload Thesis page opens clean: no counts, no ticks, no red. Choosing
Publish, or attempting one, turns the full picture on at once and puts the
cursor in the first field that needs work. Deleting a program states what it
takes with it.

### Preserved

`createThesis` / `updateThesis` / the `thesis-drafts` actions and their
signatures; `validateThesisDraft` / `validateThesisPublish` / the publish gate
in `lib/publish-readiness.ts`; autosave and draft recovery; the `intent`
submitter contract on the sticky bar; `DownloadAccessCard` and the download
override model; upload routes and the `reports/` folder; the four cohort CRUD
Server Actions; permissions, routing and revalidation. Four message keys that
existed only for the removed inline prompts were deleted; nine were added,
in both `en` and `km`.
