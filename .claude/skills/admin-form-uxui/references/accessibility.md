# Accessibility

Only claim what the code supports. "It looks clear" is not an accessibility
property. Everything below is verifiable by reading the markup.

Read `docs/ACCESSIBILITY-FOCUS.md` first — the focus system is repo-specific and
enforced by `lib/focus-system.test.ts`.

## Labels

- Every control has a real `<label htmlFor>` pointing at its `id`. Not a `<p>`,
  not a `<span>`, not `placeholder` alone.
- `useId()` for ids so a component can appear twice on a page.
- A placeholder is an example, never a label. A field whose only label is its
  placeholder loses its name the moment the user types.
- Icon-only buttons get `aria-label` naming the object:
  `aria-label="Remove supporting file 2"`, not `aria-label="Remove"`.
- Required: a visible `*` in `text-danger` with `aria-hidden="true"` on the
  glyph, plus `required` (or `aria-required`) on the control. The asterisk alone
  is not announced.
- Grouped controls (radio sets, checkbox sets, a from/to pair) go in a
  `<fieldset>` with a `<legend>` — the legend is what associates the group name
  with each option.

## Error announcement

```tsx
<input
  id={id}
  aria-invalid={error ? true : undefined}
  aria-describedby={[hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined}
/>
{error && <p id={`${id}-error`} role="alert" className="…text-danger">{error}</p>}
```

- `aria-invalid` **and** `aria-describedby` — one without the other is half the
  information.
- `role="alert"` on the error node so it is announced when it appears.
- Form-level errors: one `role="alert"` region. Do not put `role="alert"` on
  twenty field errors *and* the banner; the announcement storm is worse than
  silence. Field errors carry it; the banner carries it; they do not duplicate
  the same text.
- Never colour alone. Every error has text; every invalid control has
  `aria-invalid`.

## Focus

- Use `.focus-field` (standalone control) or `.focus-shell` (wrapper of a
  grouped control). Do **not** hand-write `focus:ring-*` — the repo's focus
  tokens and the `data-focus-modality` weighting handle keyboard vs pointer, and
  a hand-rolled ring paints a second indicator.
- On a failed submit, move focus to the first invalid control after switching to
  its step. Scroll it into view with `block: "center"`.
- Do not disable inputs on submit — focus is dumped to `<body>` and the screen
  reader loses its place.
- Never remove an outline without replacing it.

## Dialogs

`ConfirmDialog` in `components/admin/kit` already does all of this. Any new
overlay must match it:

| Requirement | Implementation |
|---|---|
| Identity | `role="dialog"` (or `role="alertdialog"` for a destructive confirm) + `aria-modal="true"` |
| Name | `aria-labelledby` → the `<h2>`; `aria-describedby` → the body text |
| Initial focus | Into the dialog on open — the primary action for a confirm, the first field for a form |
| Focus trap | Tab and Shift+Tab cycle within. **This is required**, and it is precisely what iCase lacks — do not copy the omission |
| Escape | Closes, routed through the unsaved-changes guard |
| Backdrop click | Closes, same guard, and disabled while busy |
| Scroll lock | `document.body.style.overflow = "hidden"` while open |
| Focus restoration | Return focus to the trigger on close |

`ConfirmDialog` currently does everything above except focus restoration — if
you touch it, add that rather than working around it.

## Keyboard

- Tab order follows visual order. No `tabIndex` above 0.
- Every custom control needs its native keyboard contract:
  - **Listbox/select**: ↑↓ move, Home/End jump, Enter/Space select, Escape
    closes and returns focus to the trigger, typeahead if the list is long.
    A `role="listbox"` with click handlers and no key handling is worse than a
    native `<select>` — use the native element unless there is a real reason.
  - **Combobox**: `role="combobox"`, `aria-expanded`, `aria-controls`,
    `aria-activedescendant` on the input.
  - **Switch**: `role="switch"` + `aria-checked`, Space toggles.
  - **Radio group**: `role="radiogroup"` wrapper with `role="radio"` children,
    or real inputs. iCase uses `<fieldset>` + `role="radio"` without the
    `radiogroup` — that combination does not give arrow-key semantics.
  - **Tabs / step nav**: `aria-current="page"` on the active step is enough for
    a nav; if you use `role="tablist"` you owe arrow-key navigation and
    `aria-selected`/`aria-controls`.
- `⌘/Ctrl+S` saves on long forms. `preventDefault`, and document it in the
  action bar so it is discoverable.
- Escape in a form field must not clear the field.

## Announcements

- Save status: one `role="status" aria-live="polite"` node in the action bar
  whose text changes. Not a new node per state.
- Toasts: the provider's viewport is already `aria-live="polite"` with
  `role="status"` per toast. Do not add another live region.
- Upload progress: `role="progressbar"` with `aria-valuenow`/`aria-valuemin`/
  `aria-valuemax`, or an `aria-live="polite"` text label at coarse intervals.
  Do not announce every percent.
- `aria-live="assertive"` is for one thing only: an error that stops the user
  from continuing. Everything else is `polite`.

## Motion

- Every spinner: `motion-reduce:animate-none`.
- No animated field transitions.
- Scroll-to-error uses `behavior: "smooth"` — acceptable, but the focus call
  must use `preventScroll: true` so the two do not fight.

## Contrast and colour

- Use the tokens; they are already tuned for both themes. The admin panel forces
  light mode (`AdminThemeEnforcer`), but tokens keep it consistent with the rest
  of the app and survive that changing.
- Status must never be colour-only: pair every tone with an icon or a word.
  `StatusBadge` and `Badge` in the kit do this.
- Placeholder text at `text-text-muted/50` is decorative-weight — never put
  information there that the user needs after typing starts.

## Checking your work

- Tab through the whole form with the mouse untouched. Can you reach and operate
  every control, submit, and leave?
- Submit an invalid form. Does focus land on the problem?
- Open every dialog with the keyboard. Does Tab stay inside? Does Escape work?
  Does focus come back?
- `npx vitest run lib/focus-system.test.ts lib/status-tokens.test.ts`
- The repo has `docs/ACCESSIBILITY-TESTING.md` and `e2e/focus-system.spec.ts` —
  extend them when you add a new interaction pattern.
