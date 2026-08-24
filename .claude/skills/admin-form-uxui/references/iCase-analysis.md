# iCase Admin Add/Edit — reverse-engineering notes

**Source inspected:** `bunrongGithub/icase`, local clone `/Users/mac/Documents/icase`,
branch `feature/visual-section-builder` @ `a9aa7ba` (2026-08-24). Private repo,
read with authenticated `gh`. Everything below is from the actual source; nothing
is inferred from the README or from how the app looks.

**Stack (discovered, not assumed):** Yarn-workspaces monorepo. `apps/icase-admin`
is Next.js 15 App Router + React 19 + Tailwind 3, `output: "standalone"`. Data
access is `axiosInstance` (`utils/axios.ts`, `withCredentials: true`) against an
API gateway — no data-fetching library, no server actions for the product form.
`sonner` for toasts, `lucide-react` for icons. `react-hook-form`, `zod`, `yup`
and `@hookform/resolvers` are all in `package.json` but **unused by the admin
forms** — validation is hand-written. `cypress` is configured with no committed
specs. There is no test suite for the admin app.

## File map

```
apps/icase-admin/
├── app/(dashboard)/dashboard/
│   ├── products/add-product/page.tsx          create entry — client, mounts <ProductForm mode="create"/>
│   ├── products/edit-product/[slug]/page.tsx  edit entry  — server fetch, 404 card, <ProductForm mode="edit" product={…}/>
│   ├── category/ · users/ · inventory/        modal-CRUD sections (legacy tier)
│   └── website/sections/                      visual section builder (newest tier)
├── components/
│   ├── product-actions/product-form/
│   │   ├── ProductForm.tsx     473  the orchestrator: state, dirty, validate, save, ⌘S, beforeunload
│   │   ├── panels.tsx          613  four tab panels, all presentational
│   │   ├── fields.tsx          325  Field/TextInput/TextArea/UnitInput/ChipGroup/Select/CategoryPicker
│   │   └── types.ts             85  form state, TABS (id→fields map), derived price helpers
│   ├── website/
│   │   ├── SectionEditor.tsx   553  full-screen editor: settings pane + live preview, discard guard
│   │   ├── AddSectionDialog.tsx 209 two-step visual "choose a section → choose a layout" catalogue
│   │   ├── editors/fields.tsx  368  second, more accessible field set (Field/TextField/Segmented/Toggle/Color/Slider)
│   │   └── ImageField.tsx      103  one image slot: preview · upload · replace · clear
│   ├── ui/panel.tsx                 Panel / SectionHeading / DataRow / Pill
│   ├── modals/Modal.tsx        160  LEGACY generic modal + ConfirmDelete
│   └── forms/inputs/InputFiel.tsx   LEGACY input
└── utils/section-registry.ts   313  section types → panels → templates (data-driven editors)
```

## Three tiers, not one design system

This matters more than any single pattern. iCase contains **three generations**
of admin form UI living side by side:

| Tier | Where | Character |
|---|---|---|
| **Legacy** | `modals/Modal.tsx`, `forms/inputs/InputFiel.tsx`, `category/Category.tsx` | Generic modal with a hardcoded red "Save"; no validation; no error display; no dialog semantics; indigo focus rings that match nothing else |
| **Product form** | `product-actions/product-form/*` | Deliberate, documented, coherent. The best thing in the repo |
| **Section builder** | `website/*` | Newest. Best accessibility, live preview, registry-driven |

Only tiers 2 and 3 are worth learning from. Tier 1 is exactly what PTEC's own
weaker forms already look like — copying it would be a regression.

## Form layout (tier 2)

```
sticky header  (z-30, bg-white/90 backdrop-blur, border-b)
 ├── back link (icon button, aria-label)
 ├── title (the record's live title, or "New product") + status line
 └── actions: [Discard]? [Create product | Save changes]
sticky tab nav (same header block, border-b-2 underline, error-count badge per tab)
body  mx-auto max-w-6xl  grid  lg:[minmax(0,1fr)_280px]
 ├── <main> the active panel
 └── <aside> sticky standing preview (image · title · resolved price · brand/condition/count)
```

Measured values: page `max-w-6xl`, gutters `px-4 sm:px-6`, section gap
`space-y-4`, field gap `space-y-4`, two-column `grid gap-4 sm:grid-cols-2`,
label→control `mb-1.5`, control→error `mt-1`, panel `rounded-xl border p-5`,
control `rounded-lg px-3 py-2 text-sm`, aside `280px` sticky at `top-32`.

**Why the structure works:** the header answers *what am I editing, is it saved,
how do I leave* and never scrolls away. Tabs cut a 30-field record into four
answerable questions. The aside restores the whole-record view that tabbing
destroys — without it, no single screen shows what the product amounts to.

## Add vs Edit

Both modes are **the same component** (`mode: "create" | "edit"`), which is why
they cannot drift. The differences are exactly five, and all of them are real:

| | Create | Edit |
|---|---|---|
| Entry | `/products/add-product`, client page | `/products/edit-product/[slug]`, server-fetched |
| Missing record | n/a | dedicated 404 card with a way back — not a crash, not an empty form |
| Initial state | `EMPTY` constant | `toFormState(product)`, field-by-field, never a spread |
| Header status | "Draft — not saved yet" | "Unsaved changes" / "All changes saved" |
| Discard button | absent | shown only when dirty; restores the initial snapshot |
| Primary label | "Create product" | "Save changes", disabled while clean |
| After success | toast → `router.push('/dashboard/products')` → `refresh()` | toast → stay → `refresh()` |

The **field-by-field `toFormState`** is a deliberate, commented decision: the API
rejects unknown properties, and a spread would carry `_id`/`views`/`__v` back
into the update and fail the request. Copy the discipline, not the reason.

## Field-level UX

| Field type | Component | Notes actually in the code |
|---|---|---|
| Text | `TextInput` | `invalid` prop swaps border+ring to rose; no `aria-invalid` |
| Textarea | `TextArea` | `resize-y`, `leading-relaxed` |
| Number+unit | `UnitInput` | `$` leading / `%` trailing, `pointer-events-none`, `tabular-nums`, `inputMode="decimal"` — currency reads wrong without the unit attached |
| Small enum | `ChipGroup` | `aria-pressed`, pill buttons. Used where seeing every choice beats a dropdown |
| Larger enum | `Select` | Custom listbox. `aria-haspopup`/`aria-expanded`/`role="listbox"`/`role="option"`/`aria-selected`, check mark on the selected row, click-outside close. **No keyboard navigation and no Escape** |
| Remote enum | `CategoryPicker` | Module-level promise cache (one fetch per page load, retried on remount after failure), skeleton chips while loading, an explicit failure message instead of an empty dropdown |
| Repeatable text | inline in `AdditionalPanel` | Row + labelled remove button + dashed "Add highlight" button + "No highlights yet." empty line |
| Images | `AttachmentPanel` | Drag-drop zone, browse fallback, grid of previews, "Primary" badge on index 0, hover/focus-within action overlay, make-primary and remove |
| Toggle | `editors/fields.tsx` `ToggleField` | Real `role="switch"` + `aria-checked` |
| Segmented | `editors/fields.tsx` `Segmented` | `<fieldset>`/`<legend>` + `role="radio"` buttons |
| Colour | `ColorField` | Swatch input paired with a `font-mono` hex text input |
| Slider | `SliderField` | Value echoed in `tabular-nums` beside the track |

`Field` (tier 2) renders label + required `*` + control + **error, else hint, in
one slot** — so correcting an error never shifts the layout.
`Field` (tier 3) additionally wires `aria-describedby` and `role="alert"`.

## Validation UX

- **On submit only.** No on-blur, no on-change validation. `validate(state)`
  returns a `Partial<Record<field, string>>`.
- **An error clears the moment its field changes**, inside the same `set()`
  helper that writes the value — so the user is never told about a problem they
  have just fixed.
- **Errors are routed to where they can be seen.** Each tab declares the fields
  it owns (`TABS[].fields`); on a failed save the form switches to the first tab
  containing an error and shows a per-tab count badge. This is the single
  best idea in the repository.
- **Messages are sentences, not codes**: "Enter a price above zero.",
  "The discount is larger than the price.", "Add at least one image."
- **The toast counts, it does not enumerate**: "One field needs attention before
  saving." / "3 fields need attention before saving."
- **Entered data is never discarded** on a validation or server failure.
- Tier 3 additionally mirrors server-side rules client-side deliberately, "so an
  administrator sees the problem next to the field instead of as a red banner
  after a round trip", and shows a `role="alert"` banner for form-level errors.

**Gap:** nothing focuses or scrolls to the first invalid *field* — only to its
tab. On a long panel the highlighted field can still be off-screen.

## Loading / saving lifecycle

```
idle → editing → (validate fail → back to editing, tab switched)
              → submitting → success (toast, navigate-or-stay, refresh)
                           → error   (toast, state preserved, stays editing)
```

- `saving` disables the primary button and swaps its icon for a spinner; the
  label does **not** change in tier 2 ("Create product" stays), but does in
  tier 3 (`SaveButton` → "Saving…").
- Duplicate submission is prevented by `disabled={saving}` only — there is no
  request-token or idempotency key.
- Uploads have their own `uploading` flag; tier 3 blocks Save while an upload is
  in flight (`disabled={saving || uploadingSlot !== null}`), tier 2 does not.
- Everything is **pessimistic** — no optimistic updates anywhere.
- Cache refresh is `router.refresh()` after both create and edit.
- `⌘/Ctrl+S` saves, registered on `window` with `preventDefault`.
- `beforeunload` is registered only while `dirty`.

## File upload UX

`AttachmentPanel` (multi-image) and `ImageField` (single slot):

- Drag-and-drop with `onDragOver preventDefault` + `onDrop`, **and** a "browse"
  button — never drop-only.
- The `<input type="file">` stays in the DOM, `sr-only`, with a real
  `<label htmlFor>` — keyboard reachable and announced. `ImageField` documents
  this as deliberate.
- `input.value = ""` after every pick, so choosing the same file twice still
  fires a change.
- Upload happens immediately on pick (a file must become a URL); the rest of the
  form stays local until Save.
- Busy state is an overlay on the preview, not a replacement for it.
- First image is "Primary", badged, with a make-primary action on the others.
- Actions appear on `group-hover` **and** `focus-within`.
- On failure tier 3 returns `null` and leaves the existing URL in place —
  commented: "Null leaves the existing image in place rather than clearing a URL
  that is still perfectly good."

**Gaps:** no client-side type or size check, no progress percentage (only a
spinner), no per-file retry, no drag-to-reorder beyond make-primary.

## Responsive behaviour

- Header wraps (`flex-wrap`), tab nav scrolls horizontally (`overflow-x-auto`).
- Two-column field grids are `sm:grid-cols-2` — one column on phones.
- The preview aside is `hidden lg:block`; the record's status stays in the
  always-visible header, so nothing essential is lost.
- The section editor's settings pane is `lg:w-[420px]` beside the preview and
  stacks `flex-col` below `lg`, "so neither column becomes unusably narrow".
- Image grid `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`.
- The legacy modal caps at `max-h-[calc(100vh-10rem)]` with an internal scroll
  and a `shrink-0` footer, and stacks its buttons full-width below `sm`.

## Accessibility — what is actually supported

Verified by grep, not by appearance.

**Present:** every tier-2/3 control has a real `<label htmlFor>`; `aria-label` on
icon-only buttons; `aria-pressed` on chips; `role="switch"`+`aria-checked` on
toggles; `role="radio"` in `<fieldset>`/`<legend>` groups; `aria-current="page"`
on the active tab; `role="listbox"`/`role="option"`/`aria-selected` in the
select; `aria-describedby` and `role="alert"` in tier 3; `role="dialog"`+
`aria-modal`+`aria-labelledby` on the section editor, its discard
`role="alertdialog"`, and the add-section dialog; focus moved into the section
editor on open; Escape routed through the dirty guard.

**Absent — do not claim these:**
- **No focus trap anywhere.** `grep -rn "focus-trap\|FocusTrap\|inert"` returns
  nothing. Tab escapes every dialog, including the newest ones.
- **No scroll lock** behind any overlay.
- **No focus restoration** to the trigger on close.
- The legacy `Modal.tsx` has **no** `role`, `aria-modal`, or labelling at all,
  and wraps the whole overlay in a bare `<form>`.
- The tier-2 `Select` has **no keyboard support** — no arrow keys, no Enter, no
  Escape, no `aria-activedescendant`.
- `aria-invalid` appears **nowhere** in tier 2.
- `<Toaster>` is mounted per-page in six places rather than once in a layout.
- `role="radio"` buttons sit in a `<fieldset>`, not a `role="radiogroup"`.

## Design tokens as used

Neutral `gray-50/100/200/300/400/500/600/700/900` as the whole surface scale;
`rose-*` for errors in tier 2 but `red-600` as the brand/primary in tier 3;
`emerald-600` for savings, `amber-*` for soft warnings. Radii `rounded-lg`
(controls) / `rounded-xl` (panels) / `rounded-2xl` (large dialogs) /
`rounded-full` (chips, badges). Type scale `text-[10px]` badge, `text-xs` hint,
`text-[13px]` control/button, `text-sm` body, `text-base` page title,
`text-3xl` the one hero figure. Shadows only on overlays and the aside — panels
carry a border, not a shadow. `tabular-nums` on every number that is compared.

## Verdict

**Borrow:** tab/step ownership of fields with error-count badges and
route-to-the-problem; the single-component create/edit with a five-difference
delta; error-replaces-hint in one slot; the standing preview aside; the
resolved-value panel ("what the customer sees") for derived arithmetic; unit
affixes on numeric inputs; module-cached remote option lists with skeleton and
explicit failure states; the visual "choose a type → choose a layout" catalogue
as a create entry point; upload-failure-leaves-the-old-file-alone; sentence-form
error messages; counting toasts.

**Do not borrow:** the legacy `Modal`/`InputFiel`/`Category` tier at all; the
grey/rose Tailwind palette (PTEC has tokens); `sonner` (PTEC has
`ToastProvider`); per-page `<Toaster>` mounts; the keyboard-dead custom
`Select`; the missing focus trap, scroll lock and focus restoration; the absent
`aria-invalid`; on-submit-only validation with no focus to the offending field;
uploads with no type or size validation; `JSON.stringify` dirty comparison on
every render.
