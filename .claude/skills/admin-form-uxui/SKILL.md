---
name: admin-form-uxui
description: The PTEC Admin Form UX/UI standard — layout, create vs edit workflow, field anatomy, validation, save lifecycle, upload, responsive and accessibility rules for every admin CRUD surface. Load before designing, reviewing, or writing any admin form, create/edit page, form dialog or drawer, upload flow, settings screen, or content-management workflow in this repository.
---

# Admin Form UX/UI (PTEC e-Library)

Answer **"how should this form behave and look?"** before **"how do I code this form?"**

This skill encodes a reusable interaction model. It was derived by reverse-engineering
the iCase admin dashboard (`bunrongGithub/icase`, `apps/icase-admin`) and reconciling
those patterns against PTEC's own architecture, design tokens and component system.

> **iCase is a reference for UX patterns, not a code dependency.**
> Never copy its imports, its Tailwind palette (`gray-*`/`rose-*`/`red-600`), its
> `sonner` toasts, its `axiosInstance`, or its component files. Translate the
> *principle* into PTEC's stack. See `references/iCase-analysis.md` for what is
> worth borrowing and what is explicitly not.

## When to use

Load this skill whenever the task touches:

- Admin forms of any kind — create pages, edit pages, wizards, steppers
- Form dialogs, drawers, modals, side panels, inline editors
- Upload forms (PDF, cover image, attachments, avatars, bulk CSV)
- CRUD workflows, destructive actions, confirmation dialogs
- Settings and configuration screens (`/admin/system-settings`, roles, manage)
- Content management (books, theses, publications, posts, catalogs, team, paths,
  categories, departments, announcements, homepage photos)
- Any request phrased as "improve the admin UX", "make this form better",
  "add a field", "why is this form confusing"

If the task is a *public* page, this skill does not apply — use `frontend-design`.

## Non-negotiable context

Read these before writing code. They are repository facts, not preferences:

1. **`CLAUDE.md` at the repo root** — the admin panel forces light mode, is *not*
   locale-routed (`/admin/*` uses plain `next/link` and `next/navigation`, never
   `i18n/navigation`), and every Server Action must call the right guard from
   `lib/auth-guards.ts`.
2. **`docs/ACCESSIBILITY-FOCUS.md`** — the focus system. Use `.focus-field` on a
   standalone control and `.focus-shell` on the wrapper of a grouped one. Never
   hand-write a focus ring. `lib/focus-system.test.ts` enforces this.
3. **Design tokens only.** `text-heading`, `text-body`, `text-muted`,
   `bg-surface`, `paper`, `divider`, `brand`, `brand-hover`, `success`,
   `warning`, `danger`, `info`, and the `-soft`/`-line`/`-text` status triplets.
   A literal hex, `gray-500`, `rose-500` or `indigo-600` in an admin form is a
   defect — `lib/status-tokens.test.ts` polices the callout case.
4. **Existing kit first.** `components/admin/kit/` already owns `PageHeader`,
   `ConfirmDialog`, `ToastProvider`/`useToast`, `EmptyState`, `Badge`,
   `StatusBadge`, and `components/admin/kit/form/` owns the field layer. Extend
   these. Do not create a ninth label style.

## Workflow

Follow in order. Do not skip step 1 — most "add a form" tasks are really
"extend an existing form".

1. **Inspect the existing implementation.** Find the form (`app/(admin)/…/_components/`
   or `components/admin/<section>/`). Read it end to end before changing a line.
2. **Identify the form type** — pick one shape from `references/form-layout.md`:
   single-panel page, sectioned page, stepper/wizard, dialog, or drawer. The
   choice follows field count and whether the user needs surrounding context.
3. **Inspect the data model.** The Server Action in `app/actions/`, the row type
   in `lib/`, the migration in `supabase/migrations/`. Required-ness, max length
   and enum values come from the schema, not from guesswork.
4. **Inspect shared components before writing one.** `components/admin/kit/form/`,
   `components/admin/kit/`, `components/ui/core/`, and the section's own
   `_components/`. Search for an equivalent; extend it if it is close.

   The form kit is `components/admin/kit/form/`:

   | Export | Use |
   |---|---|
   | `Field` | Every labelled control. Render-prop form (`{(p) => <input {...p} …/>}`) hands the control its `id`, `className`, `aria-invalid`, `aria-describedby` and `required`; plain-children form for composites like `TagInput` or a dropzone |
   | `FormSection` | A named group with an optional one-line explanation |
   | `focusFirstInvalid` / `focusFirstInvalidAfterPaint` | Send the user to the problem after a failed submit. The `AfterPaint` variant is for stepped forms, where the field is not in the DOM until the new step renders. Both skip `[hidden]` subtrees |
   | `INPUT_CLASS` `LABEL_CLASS` `TEXTAREA_CLASS` `MONO_INPUT_CLASS` `INPUT_INVALID_CLASS` `HINT_CLASS` `ERROR_CLASS` | The canonical control styling. `theses/_components/form-styles.ts` re-exports the first two for its existing importers |
5. **Apply the standard** — `references/form-layout.md`,
   `references/create-edit-patterns.md`, `references/validation.md`,
   `references/loading-states.md`, `references/file-upload.md`.
6. **Implement UX changes without touching behaviour.** Schema, RLS, guards,
   Server Action contracts, storage paths, route semantics and cache
   revalidation stay exactly as they are unless the UX defect *is* in them.
7. **Verify against `references/checklist.md`.** Every box, honestly.
8. **Run the gates**: `npx tsc --noEmit`, `npm run lint`, `npx vitest run`.
   Report real output. Never claim a check passed that you did not run.

## The PTEC Form Design Standard

Every admin form resolves to this anatomy. Deviating needs a stated reason.

```
Page
├── PageHeader              breadcrumb · h1 · one-line description · actions slot
├── [Step nav]              only when the form is a wizard
├── Form
│   ├── FormSection         title, optional explanation, related fields only
│   │   ├── Field           label · required marker · control · error | hint
│   │   └── Field
│   └── FormSection
└── FormActions             sticky · truthful status · Cancel · [secondary] · Primary
```

**Rules that make it work**

- **One `<h1>` per page**, from `PageHeader`. Section titles are `<h3>`.
- **Max content width `max-w-5xl`** for a form page; a form column inside a
  two-pane layout is `minmax(0,1fr)` with a `280–360px` aside.
- **Vertical rhythm**: `space-y-6` between sections, `space-y-4` between fields
  inside a section, `gap-4` in a field grid, `mb-1.5` label→control,
  `mt-1.5` control→error/hint.
- **Two columns maximum**, and only for genuinely short, related fields
  (`grid gap-4 sm:grid-cols-2`). Title, abstract and description are always
  full width. Collapse to one column below `sm`.
- **Mark required, never optional.** A `*` in `text-danger` after the label,
  with `aria-hidden` on the glyph and `required`/`aria-required` on the control.
  Do not append "(optional)" to labels — if most fields are optional, say so
  once in the section description.
- **Labels are sentence case, `text-sm font-semibold text-text-body`.** The
  uppercase micro-caps style is legacy; do not add more of it.
- **Error replaces hint**, in the same slot, so the layout never jumps.
- **Primary action is last in DOM order** and visually rightmost. Cancel is a
  quiet border button, never a filled one. Destructive actions live apart from
  the save cluster — a different row or the section they belong to.
- **Restraint.** One card per section, one border, one radius scale
  (`rounded-lg` controls, `rounded-xl`/`rounded-2xl` panels), no gradients on
  form surfaces, no shadow deeper than `shadow-sm` outside overlays, no
  decorative icon that does not disambiguate something.

## Reusable patterns

### Create
`Entry: a primary "New …" button on the list page → dedicated /new or /create route.`
Empty defaults, no dirty guard until the first edit, primary reads
**"Create <thing>"**. On success: toast, then navigate to the list or the new
record's edit page, then `router.refresh()`.

### Edit
`Entry: a row action on the list page → /edit/[id].` Fully prefilled, dirty
tracked from the loaded snapshot, primary reads **"Save changes"** and is
disabled while clean. Discard appears only when dirty and restores the snapshot.
On success: stay in place, update the snapshot, toast, `router.refresh()`.
Unsaved changes are protected by `beforeunload` *and* by an in-app confirm on
close/back.

### Destructive
`Trigger → ConfirmDialog (kit) → busy state on the confirm button → toast → refresh.`
Name the thing being deleted in the dialog body. State what is lost and whether
it is reversible. Never `window.confirm()`.

### Upload
`Select or drop → validate type+size client-side → local preview → upload → progress → success → replace/remove; retry on failure.`
An upload failure must never clear an existing good file. See
`references/file-upload.md`.

## Reference files

| File | Read it when |
|---|---|
| `references/iCase-analysis.md` | You want the evidence base, or to know what *not* to copy |
| `references/form-layout.md` | Choosing a form shape, spacing, grid, section grouping |
| `references/create-edit-patterns.md` | Building or auditing a create/edit pair |
| `references/validation.md` | Deciding when and how errors appear |
| `references/loading-states.md` | Submit lifecycle, save bars, double-submit, toasts |
| `references/file-upload.md` | Any PDF, cover, avatar or attachment field |
| `references/responsive.md` | Breakpoint behaviour, sticky actions, mobile forms |
| `references/accessibility.md` | Labels, focus, ARIA, announcements, dialogs |
| `references/checklist.md` | Before you claim a form is done |
| `references/ptec-gap-analysis.md` | The audit this skill was built from — current state, priorities, affected forms |
| `references/before-after.md` | The rollout record — append an entry per form |

## Hard rules

- Do not introduce a form library (`react-hook-form`, `formik`, `zod` resolvers)
  — PTEC forms are `useState` + Server Actions, and the bundle cost is not paid
  for by what they would add here.
- Do not add a dependency to make a form look different.
- Do not duplicate a component that exists. Extend it, or lift the shared part
  into `components/admin/kit/form/`.
- Do not change a Server Action's parameters, a table, an RLS policy, a guard,
  a storage folder or a revalidation tag as part of a UX change.
- Do not redesign a form because it looks unlike iCase. Change it because a
  named usability problem exists.
- Do not report a check as passing unless you ran it and read the output.
