# Create vs Edit

## The rule

**One component, two modes.** A `CreateThingForm` and an `EditThingForm` as
separate files will drift — a field added to one and not the other is the most
common admin bug in this codebase's history. Take `initial?: T` (or an explicit
`mode` prop) and branch on it.

```tsx
export default function ThingForm({ initial }: { initial?: Thing }) {
  const isEdit = initial != null;
  …
}
```

Both route pages then stay thin:

```
app/(admin)/admin/(protected)/things/new/page.tsx        → <ThingForm />
app/(admin)/admin/(protected)/things/edit/[id]/page.tsx  → <ThingForm initial={thing} />
```

## What differs — and nothing else

| | Create | Edit |
|---|---|---|
| **Entry point** | Primary "New <thing>" button in `PageHeader.actions` on the list page | Row action → `/edit/[id]` |
| **Route** | `/new` or `/create` | `/edit/[id]` |
| **Missing record** | n/a | Dedicated not-found panel with a link back. Never an empty form, never a crash |
| **Initial state** | Explicit `EMPTY` defaults | Field-by-field mapping from the row. **Never a spread** — a Server Action rejecting unknown keys will fail on `created_at`/`id` carried through |
| **Header status** | "Draft — not saved yet" | "All changes saved" / "Unsaved changes" / "Saved at HH:MM" |
| **Dirty baseline** | Empty defaults | The loaded snapshot |
| **Discard** | Absent | Shown only when dirty; restores the snapshot, clears errors |
| **Primary label** | "Create <thing>" | "Save changes" |
| **Primary enabled** | Always (validation gates it) | Disabled while clean |
| **On success** | Toast → navigate to the list (or the new record's edit page) → `router.refresh()` | Toast → stay → reset snapshot → `router.refresh()` |
| **Concurrency** | n/a | If the table has a revision/`updated_at`, send it and surface a conflict rather than overwriting |

Everything else — layout, sections, field order, validation rules, upload
behaviour, keyboard shortcuts — is **identical**. If you find yourself writing a
third difference, question it.

## Dirty state

Track it against a snapshot, not with a boolean poked from every handler.

```tsx
const [snapshot, setSnapshot] = useState(() => initialState(initial));
const [state, setState] = useState(snapshot);
const dirty = state !== snapshot; // if state is one immutable object
```

If the state is spread across several `useState` calls, keep an explicit
`dirty` flag set inside a single shared `set()` helper — do not scatter
`setDirty(true)` across thirty `onChange` handlers.

**Do not** `JSON.stringify` both sides on every render to compare (iCase does;
it is a full serialization of the form on every keystroke). If you need a deep
compare, memoize a cheap signature instead.

After a successful save in edit mode, **reset the snapshot to what was saved** —
otherwise the form stays permanently "dirty" and the Save button never disables.

## Unsaved-changes protection

Two layers, both required when a form can lose more than a sentence of work:

1. **`beforeunload`**, registered only while dirty:
   ```tsx
   useEffect(() => {
     if (!dirty) return;
     const warn = (e: BeforeUnloadEvent) => e.preventDefault();
     window.addEventListener("beforeunload", warn);
     return () => window.removeEventListener("beforeunload", warn);
   }, [dirty]);
   ```
   This covers tab close and hard navigation. It does **not** cover Next.js
   client-side navigation, which is why layer 2 exists.

2. **In-app confirm** on Cancel, on a dialog's close/Escape/backdrop, and on a
   back link — route it through `ConfirmDialog` from `components/admin/kit`:

   > **Discard changes?** — "This <thing> has unsaved changes. Leaving now loses
   > them." · *Keep editing* / *Discard*

   Cancel on a **clean** form must close immediately with no dialog. Confirming
   on every close trains people to click through it.

## Success feedback

- **Toast, always** — `useToast()` from `components/admin/kit`. One sentence,
  past tense, naming the thing: "Publication created.", "Changes saved.",
  "Photo removed."
- **Never a toast alone for a state the user can see.** If the header now says
  "Saved at 14:32", the toast is confirmation, not the only signal.
- **Never optimistic.** Do not show "Saved" before the server confirms. PTEC's
  `SaveBar` is explicit about this and it is the right call: a lie here costs
  the user their work.
- **`router.refresh()`** after any mutation so the list/detail served by RSC is
  current. Server-side, the action must already be revalidating its cache tags
  (`lib/cache/revalidate.ts`) — do not add revalidation in the client.

## Navigation after create

Pick one and be consistent per section:

- **Back to the list** — when the user creates several in a row, or the record
  needs nothing more. Default.
- **To the new record's edit page** — when creating is step one of a longer job
  (upload files, add authors, publish). `PublicationForm` does this implicitly
  by staying put and flipping to edit mode, which is the smoothest version.

Never leave the user on a create form that now silently holds a saved record —
they will submit it twice.

## Entry points on the list page

- Primary "New <thing>" in `PageHeader`'s `actions` slot, filled brand button.
- When the list is empty, `EmptyState` from the kit carries the *same* action —
  do not make an empty list a dead end.
- Row actions: Edit is a link, not a button; it must be middle-clickable and
  copyable. Destructive row actions sit last and are visually separated.
