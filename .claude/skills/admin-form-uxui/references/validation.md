# Validation UX

Validation is a conversation, not a gate. The goal is that a user never learns
about a problem they cannot immediately understand and fix.

## When validation runs

| Moment | What runs | Why |
|---|---|---|
| **On change** | Nothing new. **Clear** the field's existing error | Never keep telling someone about a mistake they just corrected |
| **On blur** | Only *format* checks that cannot be judged mid-typing — email, DOI, ISBN, URL, slug charset | Validating a half-typed email on every keystroke is hostile |
| **On submit** | Everything | The only moment the whole record is meaningful |
| **After the server responds** | Map field-scoped server errors onto their fields | A round-trip error that appears only as a banner makes the user hunt |

Never validate a field the user has not touched and has not submitted.

## Where the error goes

**In the field's own slot, replacing the hint.** Same position, same height
class, so nothing reflows:

```tsx
{error ? (
  <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs font-medium text-danger">{error}</p>
) : hint ? (
  <p id={`${id}-hint`} className="mt-1.5 text-xs text-text-muted">{hint}</p>
) : null}
```

And the control carries `aria-invalid` + `aria-describedby` pointing at it.
This is what `components/admin/kit/form/Field.tsx` does — use it rather than
re-deriving it.

**A form-level banner is additive, not a substitute.** Use one only for errors
that belong to no field: a failed save, a permissions problem, a concurrency
conflict. `role="alert"`, `bg-danger-soft border-danger-line text-danger-text`.

## Routing the user to the problem

This is the single most valuable pattern taken from iCase, and it must be
implemented in full:

1. Each **step/section owns its fields** — declare the map, do not infer it.
   ```tsx
   const STEPS = [
     { key: "basic", label: "Basic info", fields: ["title", "slug", "language"] },
     { key: "files", label: "Files",      fields: ["pdf_url"] },
   ] as const;
   ```
2. On a failed submit, **switch to the first step that contains an error**.
3. Show a **count badge** on every step that has errors, so the user can see
   there is more than one place to go.
4. **Then focus and scroll to the first invalid control** — iCase stops at step
   3 and PTEC should not:
   ```tsx
   const el = formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']");
   el?.scrollIntoView({ block: "center", behavior: "smooth" });
   el?.focus({ preventScroll: true });
   ```
   Do this after the step switch has painted (`requestAnimationFrame` or in an
   effect keyed on the step).
5. **Announce the count** — one `role="status"` line, or a toast:
   "One field needs attention." / "3 fields need attention before saving."
   Count; do not enumerate. A toast listing five field names is unreadable and
   gone in five seconds.

## Message wording

Write the fix, not the rule. Sentence case, full stop, no field name prefix
(the label is right there), no "Error:", no exclamation marks.

| Instead of | Write |
|---|---|
| `title is required` | Give this publication a title. |
| `Invalid input` | Use lowercase letters, numbers and hyphens only. |
| `Value must be > 0` | Enter a number above zero. |
| `Max length exceeded` | Keep this under 160 characters. |
| `Field cannot be empty` | Add at least one author. |
| `ERR_DUPLICATE_SLUG` | Another publication already uses this URL. |

For a *warning* (publishable but ill-advised), say what will happen:
"No cover image — the listing will show a placeholder."

## Blocking vs advisory

Separate them explicitly. PTEC already does this in `lib/publish-readiness.ts`
and `lib/publications/review.ts`; reuse the shape.

- **Blocking (`danger`)** — the save or publish cannot proceed. Keep the list
  short; anything that could be fixed later should not block a *draft* save.
- **Warning (`warning`)** — the save proceeds. Surface it in the review step and
  as a count in the action bar, never as a modal.

A **draft save should almost never block.** Users save drafts precisely because
the record is incomplete. Gate *publish*, not *save*.

## Server errors

- Map anything field-scoped back onto its field, then run the route-to-the-problem
  sequence above.
- Everything else goes to the form-level banner **and** a toast, worded for the
  user: "Your changes could not be saved. Try again." Log the technical detail;
  do not render a stack trace or a Postgres error code.
- **Preserve every value the user entered.** A failed submit must never reset,
  clear, or re-fetch the form. This includes uploaded-but-unsaved files.
- On a **concurrency conflict** (revision mismatch), say so plainly and offer a
  choice — never silently overwrite:
  "Someone else saved this publication while you were editing. Reload to see
  their version, or save yours over it."

## Anti-patterns

- Validating on every keystroke and painting the field red while it is being
  typed into.
- A single "Please fill all required fields" banner with no field-level marks.
- `alert()` or `window.confirm()` for validation.
- Disabling the submit button until the form is valid. The user then has no way
  to find out *what* is wrong. Let them submit and tell them.
- Clearing the form on error.
- Different validation client-side and server-side. Mirror the server rules
  deliberately so the user sees the problem before the round trip — and keep the
  server as the authority.
