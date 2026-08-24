# Loading & saving

## Lifecycle

```
idle ──edit──▶ dirty ──submit──▶ validating ──fail──▶ dirty (routed to the problem)
                                      │
                                      ▼
                                  submitting ──error──▶ dirty (values preserved, banner + toast)
                                      │
                                      ▼
                                   success ──▶ toast · snapshot reset · router.refresh()
                                                 └─ create: navigate · edit: stay
```

Every state must be visible. A form that looks identical while submitting is the
most common cause of double submission.

## The action bar

Sticky at the bottom of the form, not floating over content:

```tsx
<div className="sticky bottom-0 z-20 -mx-4 border-t border-divider bg-bg-surface/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
```

The `env(safe-area-inset-bottom)` padding is not optional — without it the bar
sits under the iOS home indicator.

Contents, left to right:

1. **Status line**, `role="status" aria-live="polite"`. Truthful, never
   optimistic. See `PublicationForm`'s `SaveBar` for the canonical set:
   *Not saved yet · Unsaved changes · Autosaving draft… · Saving… · Saved at 14:32 ·
   Unsaved changes — autosave failed, save manually*
2. **Problem counts**, as buttons that jump to the review step:
   `3 blocking` (danger), `2 warnings` (warning). Not decorative badges — they
   must be clickable, because a count the user cannot act on is just anxiety.
3. **Keyboard hint** (`⌘S saves`), `hidden md:inline-flex`.
4. **Cancel** — quiet border button.
5. **Secondary** — Preview, Save draft, Duplicate. Border or ghost.
6. **Primary** — filled, last in DOM order and rightmost.

Never put a destructive action in this cluster. Delete belongs on the list page,
in a row menu, or in a clearly separated "Danger" area at the foot of the form.

## Button states

| State | Appearance |
|---|---|
| Idle | Filled brand, label "Create <thing>" / "Save changes" |
| Disabled (clean, edit mode) | `disabled:opacity-50 disabled:cursor-not-allowed` — with a `title` explaining why |
| Submitting | `disabled`, spinner icon, label changes to "Saving…" / "Creating…" |
| Blocked by an in-flight upload | `disabled`, label "Waiting for upload…" |

Always change the **label**, not only the icon. A spinner alone beside an
unchanged "Save changes" is easy to miss, and screen readers get nothing from it.

Spinners must carry `motion-reduce:animate-none` — the repo already uses this
and the accessibility tests expect it.

## Preventing double submission

`disabled={saving}` is necessary but not sufficient. Also:

- **Guard at the top of the handler**, because Enter, ⌘S and the click can race:
  ```tsx
  const inFlight = useRef(false);
  async function submit() {
    if (inFlight.current) return;
    inFlight.current = true;
    try { … } finally { inFlight.current = false; }
  }
  ```
- **In create mode, capture the returned id** and flip to edit mode. Without
  this, a second submit creates a duplicate record rather than being blocked.
- Do not rely on `<form>`'s native double-submit behaviour; these forms submit
  via handlers, not navigation.

## Disabling fields while saving

**Do not.** Disabling every input on submit causes focus to be lost to `<body>`,
which is worse than a brief inconsistency and breaks screen-reader position. The
action bar being disabled is enough. The exception is a field whose value is
being consumed by the in-flight request in a way a change would corrupt — rare.

## Optimistic vs pessimistic

**Pessimistic by default.** These are library records; a save that appears to
succeed and did not is a data-integrity problem, not a UI blemish.

Optimistic is acceptable only for reversible, low-stakes, single-value toggles
where the row is still on screen to correct — a publish switch in a list, a
sort-order nudge. Even then, revert visibly and toast the failure.

## Autosave

Only for long forms where losing work is realistic (publications, theses,
announcements). Rules:

- Debounce ~3s after the last change.
- Autosave writes a **recovery draft**, not the record. It must never publish,
  never change `is_published`, and never bump a public `updated_at`.
- Its status is a *separate* line from the manual save state, and its failure
  must be visible ("autosave failed, save manually") — a silent failure is worse
  than no autosave, because the user stops saving manually.
- Offer recovery on next load with an explicit choice, not a silent restore.

## Loading the form itself

- Edit pages fetch on the server; give the route a `loading.tsx`.
- Skeletons must match the real layout's shape — a generic spinner where a
  sectioned form will appear causes a visible jump.
- A **remote option list** (categories, departments, cohorts, authors) inside a
  loaded form needs its own three states: skeleton, loaded, and an explicit
  failure message. An empty dropdown that is really a failed fetch is a bug
  users report as "the categories are gone".

## Toasts

- `useToast()` from `components/admin/kit`. The provider is mounted **once** in
  the protected admin layout — never mount another.
- Success 5s, error 8s (already configured).
- One toast per user action. A save that triggers three cache revalidations is
  still one toast.
- Never use a toast as the only report of a validation failure; it is gone
  before a long form can be scanned.
