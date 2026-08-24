# Form checklist

Run before claiming a form is done. Tick honestly; an unticked box is a known
gap to report, not a box to leave ambiguous.

## Structure
- [ ] Exactly one `<h1>`, from `PageHeader`
- [ ] Sections are named questions, 3–8 fields each
- [ ] Max two field columns, collapsing at `sm`
- [ ] Long-text fields are full width
- [ ] Spacing matches `references/form-layout.md`
- [ ] No card-in-card, no gradient on a form surface, no decorative icons

## Create / Edit
- [ ] One component serves both modes
- [ ] Edit prefills field-by-field (no spread of the DB row)
- [ ] Edit handles a missing record with a real not-found panel
- [ ] Primary label is "Create <thing>" / "Save changes"
- [ ] Save is disabled while clean, in edit mode only
- [ ] Discard appears only when dirty and restores the snapshot
- [ ] Snapshot resets after a successful save
- [ ] `beforeunload` while dirty **and** an in-app discard confirm
- [ ] Cancel on a clean form closes with no dialog

## Fields
- [ ] Every control has a real `<label htmlFor>`
- [ ] Required marked with `*` + `required`; "(optional)" not appended to labels
- [ ] Error and hint share one slot — no layout shift when an error appears
- [ ] `aria-invalid` + `aria-describedby` wired on every invalid control
- [ ] Uses `components/admin/kit/form/` — no new label or input class string
- [ ] Design tokens only; no hex, no `gray-*`/`rose-*`/`indigo-*`
- [ ] `.focus-field` / `.focus-shell`; no hand-written focus ring

## Validation
- [ ] Errors clear on change
- [ ] Full validation on submit
- [ ] Steps/sections declare their fields; failed submit switches to the first
      offending one and shows per-step counts
- [ ] Focus and scroll land on the first invalid control
- [ ] Messages say the fix, in sentence case
- [ ] Blocking vs advisory separated; draft save does not block on publish rules
- [ ] Server field errors map back onto their fields
- [ ] No entered data is lost on any failure

## Save lifecycle
- [ ] Status line is `role="status" aria-live="polite"` and never optimistic
- [ ] Button label changes while submitting, not just the icon
- [ ] `motion-reduce:animate-none` on every spinner
- [ ] Double submission guarded by a ref, not only `disabled`
- [ ] Create captures the new id so a second submit cannot duplicate
- [ ] Save blocked while an upload is in flight
- [ ] Fields are not disabled during submit
- [ ] One toast per action, from `useToast()`
- [ ] `router.refresh()` after mutations

## Upload
- [ ] Drop zone **and** browse button
- [ ] Real `<input type="file">` kept in the DOM, `sr-only`, with a label
- [ ] `input.value = ""` after every pick
- [ ] Type and size validated client-side before the request
- [ ] Accepted types and size cap stated in the hint, before picking
- [ ] Progress visible; file name and size shown
- [ ] Existing file in edit mode shows as Replace / Remove, not an empty picker
- [ ] A failed upload leaves the existing URL untouched
- [ ] Retry re-sends without re-picking
- [ ] Removing a published file is confirmed

## Responsive
- [ ] No horizontal scroll at 360px
- [ ] Checked at 360×640, 768×1024, 1440×900
- [ ] Action bar sticky with `env(safe-area-inset-bottom)`
- [ ] Form body has bottom padding clearing the sticky bar
- [ ] Dialog header/footer `shrink-0`, only the body scrolls
- [ ] Step nav scrolls horizontally and keeps the active step in view
- [ ] Nothing essential lives only in a `lg:`-only aside

## Accessibility
- [ ] Whole form operable by keyboard alone
- [ ] Dialogs: `role`, `aria-modal`, labelled, focus in, **focus trapped**,
      Escape, scroll lock, focus restored
- [ ] Custom controls implement their keyboard contract (or use native elements)
- [ ] Icon-only buttons named for their object
- [ ] Status never colour-only
- [ ] `aria-live="assertive"` used nowhere except a blocking error

## Preserved behaviour
- [ ] No schema, migration, RLS policy or guard changed
- [ ] No Server Action signature or return shape changed
- [ ] No storage folder, key format or upload route changed
- [ ] No route path or redirect semantics changed
- [ ] No cache tag or revalidation call added, removed or moved
- [ ] Permission checks still present and unchanged

## Gates — record real output
- [ ] `npx tsc --noEmit`
- [ ] `npm run lint`
- [ ] `npx vitest run`
- [ ] `npm run build` when the change touches layout, routing or the PWA
- [ ] No new dependency added
- [ ] No component duplicated that already existed

## Manual passes
**Create:** empty submit · valid submit · one invalid field · several invalid
fields across steps · double-click submit · simulated server error · success
**Edit:** prefill correct · change one field · save · validation error · server
error · cancel clean · cancel dirty · reload while dirty
**Upload:** valid file · wrong type · oversized · failure · retry · replace ·
remove · save while uploading
