# Admin Authorization

How `/admin` decides who may open what, and who may change it.

The short version: **one registry, three consumers.**
`lib/admin/access-policy.ts` says what each route and each mutation requires.
The route guard enforces it on the server, the sidebar renders from it, and the
403 page explains it. There is no second place that decides.

---

## 1. Model

Three levels per resource, unchanged from before: `none`, `read`, `write`,
stored in `role_permissions` with hardcoded fallbacks in `lib/permissions.ts`.

| Level | Means |
| --- | --- |
| `none` | Cannot see the workspace, cannot open the page (direct URL → 403), cannot invoke its actions. |
| `read` | Can open the page and everything read-only on it: search, filter, detail, preview, queues, reports. Cannot create, edit, delete, upload, publish, approve or reject. |
| `write` | Everything `read` allows, plus every mutation the resource supports. |

`write` is a superset of `read`, never a sibling. `read` is access, not a
politer kind of `none` — that confusion is what put half the admin panel behind
a write check it did not need.

Super admins short-circuit every check, exactly as `requirePermission` always
has, so nothing driven by the registry can hide a surface the server would
admit them to.

## 2. The registry — `lib/admin/access-policy.ts`

Pure and client-safe on purpose: no `server-only`, no database, no
`next/headers`. The sidebar renders from it in the browser and the tests
exercise it offline, from the same table the server enforces.

```ts
// A destination.
{ id: "books.upload", route: "/admin/books/upload",
  requires: perm("books", "write"), backTo: "/admin/books" }

// A mutation.
"books.review.approve": perm("books", "write")
```

A requirement is one of three kinds:

- `perm(resource, level)` — the `role_permissions` matrix. The normal case.
- `roles([...])` — a fixed role list, for surfaces with no matrix row of their
  own (the security console, the activity log, role management). Kept explicit
  rather than inventing matrix rows that would decide nothing.
- `PANEL` — any account the `(protected)` layout already admitted. The
  dashboard and the admin's own profile: locking those would strand a valid
  administrator on a 403 the moment they signed in.

Helpers: `canAccessRoute`, `canPerform`, `canRead`, `canWrite`, `satisfies`,
`resolveRoutePolicy`, `describeDenial`, `reachableFallback`,
`resourceCapabilities`.

## 3. Enforcement

### Routes

Every admin page declares its access in one line:

```tsx
export default async function BooksPage() {
  const { can } = await requireRouteAccess("books.manage");
  const canWrite = can("books.create");
  …
}
```

`requireRouteAccess` runs the full `verifyAuthAndMFA` path — session, profile
role, emergency lockdown, AAL2 — resolves the permission matrix, and then either
returns the service client plus a capability closure, or does not return at all.
It never returns a "denied" value a caller could forget to check.

**There is no layout-only protection.** The `(protected)` layout still runs the
panel role check and the MFA gate, but it is a navigation control; the route
guard is the authorization control, because a Server Action can be POSTed to any
route without the layout ever rendering.

### Server Actions and API routes

Actions keep their own guards — `requirePermission(resource, level)` or the
named `requireAction("books.review.approve")`. They throw `AdminAuthError(403)`
rather than an HTTP interrupt, because an action returns a result to the page
the user is standing on; replacing that page would be wrong.

A hidden button is a courtesy. The refusal is the boundary.

### Rendering

Two ways to ask "should this control exist?", both reading the same registry:

- Server components: `can(...)` from the route guard's return, or `canDo(...)` /
  `canRoute(...)` / `canAccess(...)`.
- Client components: `useCan(actionId)`, `useCanRoute(policyId)`,
  `useAdminViewerIsSuperAdmin()` or `<CanDo action="…">`, from
  `components/admin/access/AdminCapabilities.tsx`.

The client context carries only the viewer's own permission levels — the same
information the sidebar already renders — and fails closed outside its provider.
It decides what to draw, never what is allowed.

**Which one to reach for.** Ask on the server when the page already has the
guard's `can` in hand and the control is one level down; ask in the client when
the control is four components down, because every intermediate component that
forwards a `canWrite` prop is a place the next person forgets. The inbox is the
worked example: `MessageDetail` already takes thirty props, and the thirty-first
is the one that would go missing.

**Three patterns, and when each is right:**

| Pattern | Use when |
| --- | --- |
| Omit the control | The default. A control the viewer can never use is noise. |
| Render the state as a badge instead | The value is information the reader needs even without the power to change it — a message's status and priority, a team member's published state. A disabled `<select>` reads as broken; a badge reads as a fact. |
| Disable with a reason | Only where the block is temporary or per-row and the reason is on screen (an in-flight save, a super-admin target). Never for "you lack the permission" — that is what omission is for. |

**Gate the interaction, not just the button.** Homepage photos are reorderable by
drag as well as by arrow buttons; hiding the arrows while leaving the row
`draggable` is a control that only *looks* gone. `lib/admin/ui-capabilities.test.ts`
scans each surface for a capability question near every checkbox.

### Surfaces with granular controls

Every one of these keeps its full read experience — search, filters, detail,
stats, export — and loses only what writes:

| Surface | Read shows | Write adds |
| --- | --- | --- |
| `/admin/inbox` | the thread, internal notes, delivery history, status/priority as badges | status + priority selects, spam/close/delete, retry send, note and reply composers |
| `/admin/storage` | folders, files, previews, trash listing | upload, new folder, rename, move, trash — and `storage_manage` for permanent deletion |
| `/admin/homepage-photos` | the gallery in order, with hero slots marked | add, drag/arrow reorder, show/hide, edit, delete |
| `/admin/book-requests` | every request, its reason and status | approve / mark added / reject, the admin note, delete |
| `/admin/users` | the directory, filters, stats, CSV export | invite, import, role assignment, suspend, delete |
| `/admin/team` | members, sections, translation-gap and photo health | add, edit, duplicate, reorder, publish toggle, delete, manage sections |

## 4. The 403

`requireRouteAccess` records the denial and raises Next's `forbidden()`
interrupt (`experimental.authInterrupts`). Next routes that to
`app/(admin)/admin/(protected)/forbidden.tsx` — **not** to `error.tsx` — with a
real 403 status and an injected `noindex`.

This is the fix for the "Something went wrong!" bug, and the reason a string
match could never have fixed it: React redacts server error messages before they
reach a client error boundary, so in production every authorization failure
arrived as an opaque digest that no `error.message` test could classify.

| Status | Surface | Looks like |
| --- | --- | --- |
| 401 | `unauthorized.tsx` | "Sign in required" — neutral, links to `/admin/login` |
| 403 | `forbidden.tsx` → `AccessDenied` | "Access restricted" — amber/neutral, shows current vs required access |
| 404 | `not-found.tsx` | "Page not found" — inside the admin shell |
| 500 | `error.tsx` → `AdminErrorState` | "Something went wrong" — danger tokens, digest only |

The 403 page takes no props (Next's `forbidden.js` convention passes none), so
context reaches it two ways: a request-scoped record written immediately before
the interrupt, and — if that scope does not survive into the boundary render —
the pathname (set by `middleware.ts` on `/admin` only) resolved against the
registry, which reconstructs exactly the same two levels. It shows the resource,
the level held, the level required and a back link the viewer can actually
reach. It shows no message, digest, stack, query or database text.

An MFA gap is a **redirect**, not a denial: the user is authorized, they just
have a step left.

### The status code on a denied PAGE is 200, and that is a Next constraint

`forbidden()` sets a 403 only if it runs *before* the response starts
streaming. In Next 16 every dynamic route streams a static shell first, so by
the time a page component's guard resolves, the status line is already sent.
Verified locally: a denied `/admin/books/upload` renders the Access Denied panel
with an injected `noindex`, and returns 200. Removing
`(protected)/loading.tsx` does not change it — the shell streams regardless.

What is NOT affected: **admin API routes return real 403s** (Route Handlers do
not stream — verified: `/api/admin/users/export` → 403, `/api/admin/bulk-upload`
→ 403, `/api/admin/upload` → 403, `/api/admin/dashboard` → 200 for staff), and
Server Actions return a refusal to their caller.

Next's own guidance is to move the check into `proxy`/middleware to get the
status. That is deliberately **not** done here: middleware is Edge and does not
read the session for `/admin` today, so it would add a `getUser()` plus a
profile read plus a `role_permissions` read to every admin navigation — and,
worse, it would create a second authorization decision point that can drift from
this registry, which is the exact failure this replaced. The denial is correct,
the UI is correct, the page is noindexed, and no data is disclosed; only the
status line differs. Do not "fix" it by deleting `loading.tsx` (no effect) or by
re-deciding authorization in middleware (a real regression) without weighing
both costs.

## 5. Route inventory

Generated from the registry. `staff`, `librarian`, `admin` and `super_admin`
columns are the default `role_permissions` seeds; an administrator can move any
of them on `/admin/roles`.

| Route | Policy id | Requires | staff | librarian | admin | super_admin | Page file |
| --- | --- | --- | :-: | :-: | :-: | :-: | --- |
| `/admin` | `dashboard` | any panel role | ✅ | ✅ | ✅ | ✅ | `page.tsx` |
| `/admin/profile` | `profile` | any panel role | ✅ | ✅ | ✅ | ✅ | `profile/page.tsx` |
| `/admin/books` | `books.manage` | `books` / **read** | ✅ | ✅ | ✅ | ✅ | `books/page.tsx` |
| `/admin/books/upload` | `books.upload` | `books` / **write** | — | ✅ | ✅ | ✅ | `books/upload/page.tsx` |
| `/admin/books/duplicates` | `books.duplicates` | `books` / **write** | — | ✅ | ✅ | ✅ | `books/duplicates/page.tsx` |
| `/admin/edit/[id]` | `books.edit` | `books` / **write** | — | ✅ | ✅ | ✅ | `edit/[id]/page.tsx` |
| `/admin/review` | `books.review` | `books` / **read** | ✅ | ✅ | ✅ | ✅ | `review/page.tsx` |
| `/admin/book-requests` | `books.requests` | `books` / **read** | ✅ | ✅ | ✅ | ✅ | `book-requests/page.tsx` |
| `/admin/catalogs` | `catalog.manage` | `catalog` / **read** | ✅ | ✅ | ✅ | ✅ | `catalogs/page.tsx` |
| `/admin/catalogs/add` | `catalog.create` | `catalog` / **write** | — | ✅ | ✅ | ✅ | `catalogs/add/page.tsx` |
| `/admin/catalogs/edit/[id]` | `catalog.edit` | `catalog` / **write** | — | ✅ | ✅ | ✅ | `catalogs/edit/[id]/page.tsx` |
| `/admin/catalogs/add-copies/[bookId]` | `catalog.copies` | `catalog` / **write** | — | ✅ | ✅ | ✅ | `catalogs/add-copies/[bookId]/page.tsx` |
| `/admin/posts` | `posts.manage` | `posts` / **read** | ✅ | ✅ | ✅ | ✅ | `posts/page.tsx` |
| `/admin/posts/new` | `posts.create` | `posts` / **write** | ✅ | — | ✅ | ✅ | `posts/new/page.tsx` |
| `/admin/posts/edit/[id]` | `posts.edit` | `posts` / **write** | ✅ | — | ✅ | ✅ | `posts/edit/[id]/page.tsx` |
| `/admin/theses` | `theses.manage` | `research` / **read** | ✅ | ✅ | ✅ | ✅ | `theses/page.tsx` |
| `/admin/theses/create` | `theses.create` | `research` / **write** | — | ✅ | ✅ | ✅ | `theses/create/page.tsx` |
| `/admin/theses/edit/[id]` | `theses.edit` | `research` / **write** | — | ✅ | ✅ | ✅ | `theses/edit/[id]/page.tsx` |
| `/admin/theses/manage-cohorts` | `theses.cohorts` | `research` / **write** | — | ✅ | ✅ | ✅ | `theses/manage-cohorts/page.tsx` |
| `/admin/publications` | `publications.manage` | `publications` / **read** | ✅ | ✅ | ✅ | ✅ | `publications/page.tsx` |
| `/admin/publications/new` | `publications.create` | `publications` / **write** | — | ✅ | ✅ | ✅ | `publications/new/page.tsx` |
| `/admin/publications/edit/[id]` | `publications.edit` | `publications` / **write** | — | ✅ | ✅ | ✅ | `publications/edit/[id]/page.tsx` |
| `/admin/publications/authors` | `publications.authors` | `publications` / **read** | ✅ | ✅ | ✅ | ✅ | `publications/authors/page.tsx` |
| `/admin/paths` | `paths.manage` | `learning_paths` / **read** | ✅ | ✅ | ✅ | ✅ | `paths/page.tsx` |
| `/admin/paths/create` | `paths.create` | `learning_paths` / **write** | — | ✅ | ✅ | ✅ | `paths/create/page.tsx` |
| `/admin/paths/edit/[id]` | `paths.edit` | `learning_paths` / **write** | — | ✅ | ✅ | ✅ | `paths/edit/[id]/page.tsx` |
| `/admin/announcements` | `announcements.manage` | `announcements` / **read** | ✅ | ✅ | ✅ | ✅ | `announcements/page.tsx` |
| `/admin/announcements/new` | `announcements.create` | `announcements` / **write** | ✅ | — | ✅ | ✅ | `announcements/new/page.tsx` |
| `/admin/announcements/templates` | `announcements.templates` | `announcements` / **read** | ✅ | ✅ | ✅ | ✅ | `announcements/templates/page.tsx` |
| `/admin/announcements/[id]/edit` | `announcements.edit` | `announcements` / **write** | ✅ | — | ✅ | ✅ | `announcements/[id]/edit/page.tsx` |
| `/admin/announcements/[id]` | `announcements.detail` | `announcements` / **read** | ✅ | ✅ | ✅ | ✅ | `announcements/[id]/page.tsx` |
| `/admin/homepage-photos` | `homepagePhotos.manage` | `homepage_photos` / **read** | ✅ | ✅ | ✅ | ✅ | `homepage-photos/page.tsx` |
| `/admin/inbox` | `inbox.manage` | `contact` / **read** | ✅ | ✅ | ✅ | ✅ | `inbox/page.tsx` |
| `/admin/storage` | `storage.browse` | `storage` / **read** | ✅ | ✅ | ✅ | ✅ | `storage/page.tsx` |
| `/admin/search-insights` | `insights.search` | `books` / **read** | ✅ | ✅ | ✅ | ✅ | `search-insights/page.tsx` |
| `/admin/data-quality` | `insights.dataQuality` | `books` / **read** | ✅ | ✅ | ✅ | ✅ | `data-quality/page.tsx` |
| `/admin/users` | `users.manage` | `users` / **read** | — | — | ✅ | ✅ | `users/page.tsx` |
| `/admin/team` | `team.manage` | `users` / **read** | — | — | ✅ | ✅ | `team/page.tsx` |
| `/admin/team/new` | `team.create` | `users` / **write** | — | — | ✅ | ✅ | `team/new/page.tsx` |
| `/admin/team/sections` | `team.sections` | `users` / **write** | — | — | ✅ | ✅ | `team/sections/page.tsx` |
| `/admin/team/[id]/edit` | `team.edit` | `users` / **write** | — | — | ✅ | ✅ | `team/[id]/edit/page.tsx` |
| `/admin/roles` | `roles.manage` | `roles` / **write** | — | — | — | ✅ | `roles/page.tsx` |
| `/admin/system-settings` | `settings.manage` | `settings` / **read** | — | — | ✅ | ✅ | `system-settings/page.tsx` |
| `/admin/security` | `security.console` | role ∈ admin, super_admin | — | — | ✅ | ✅ | `security/page.tsx` |
| `/admin/security/incidents` | `security.incidents` | role ∈ admin, super_admin | — | — | ✅ | ✅ | `security/incidents/page.tsx` |
| `/admin/security/incidents/[reference]` | `security.incident` | role ∈ admin, super_admin | — | — | ✅ | ✅ | `security/incidents/[reference]/page.tsx` |
| `/admin/security/events` | `security.events` | role ∈ admin, super_admin | — | — | ✅ | ✅ | `security/events/page.tsx` |
| `/admin/logs` | `logs.activity` | role ∈ admin, super_admin | — | — | ✅ | ✅ | `logs/page.tsx` |

| Action id | Requires | staff | librarian | admin | super_admin |
| --- | --- | :-: | :-: | :-: | :-: |
| `books.create` | `books` / **write** | — | ✅ | ✅ | ✅ |
| `books.edit` | `books` / **write** | — | ✅ | ✅ | ✅ |
| `books.delete` | `books` / **write** | — | ✅ | ✅ | ✅ |
| `books.publish` | `books` / **write** | — | ✅ | ✅ | ✅ |
| `books.archive` | `books` / **write** | — | ✅ | ✅ | ✅ |
| `books.verify` | `books` / **write** | — | ✅ | ✅ | ✅ |
| `books.bulk` | `books` / **write** | — | ✅ | ✅ | ✅ |
| `books.replaceFile` | `books` / **write** | — | ✅ | ✅ | ✅ |
| `books.retireDuplicate` | `books` / **write** | — | ✅ | ✅ | ✅ |
| `books.review.view` | `books` / **read** | ✅ | ✅ | ✅ | ✅ |
| `books.review.approve` | `books` / **write** | — | ✅ | ✅ | ✅ |
| `books.review.reject` | `books` / **write** | — | ✅ | ✅ | ✅ |
| `books.review.assign` | `books` / **write** | — | ✅ | ✅ | ✅ |
| `books.review.verify` | `books` / **write** | — | ✅ | ✅ | ✅ |
| `research.review.approve` | `research` / **write** | — | ✅ | ✅ | ✅ |
| `research.review.reject` | `research` / **write** | — | ✅ | ✅ | ✅ |
| `research.review.assign` | `research` / **write** | — | ✅ | ✅ | ✅ |
| `research.review.verify` | `research` / **write** | — | ✅ | ✅ | ✅ |
| `books.requests.update` | `books` / **write** | — | ✅ | ✅ | ✅ |
| `books.requests.delete` | `books` / **write** | — | ✅ | ✅ | ✅ |
| `catalog.create` | `catalog` / **write** | — | ✅ | ✅ | ✅ |
| `catalog.edit` | `catalog` / **write** | — | ✅ | ✅ | ✅ |
| `catalog.delete` | `catalog` / **write** | — | ✅ | ✅ | ✅ |
| `catalog.import` | `catalog` / **write** | — | ✅ | ✅ | ✅ |
| `catalog.copies.manage` | `catalog` / **write** | — | ✅ | ✅ | ✅ |
| `posts.create` | `posts` / **write** | ✅ | — | ✅ | ✅ |
| `posts.edit` | `posts` / **write** | ✅ | — | ✅ | ✅ |
| `posts.delete` | `posts` / **write** | ✅ | — | ✅ | ✅ |
| `theses.create` | `research` / **write** | — | ✅ | ✅ | ✅ |
| `theses.edit` | `research` / **write** | — | ✅ | ✅ | ✅ |
| `theses.delete` | `research` / **write** | — | ✅ | ✅ | ✅ |
| `publications.create` | `publications` / **write** | — | ✅ | ✅ | ✅ |
| `publications.edit` | `publications` / **write** | — | ✅ | ✅ | ✅ |
| `publications.delete` | `publications` / **write** | — | ✅ | ✅ | ✅ |
| `publications.authors.merge` | `publications` / **write** | — | ✅ | ✅ | ✅ |
| `paths.create` | `learning_paths` / **write** | — | ✅ | ✅ | ✅ |
| `paths.edit` | `learning_paths` / **write** | — | ✅ | ✅ | ✅ |
| `paths.delete` | `learning_paths` / **write** | — | ✅ | ✅ | ✅ |
| `announcements.create` | `announcements` / **write** | ✅ | — | ✅ | ✅ |
| `announcements.edit` | `announcements` / **write** | ✅ | — | ✅ | ✅ |
| `announcements.delete` | `announcements` / **write** | ✅ | — | ✅ | ✅ |
| `announcements.push` | `announcements_push` / **write** | — | — | ✅ | ✅ |
| `homepagePhotos.manage` | `homepage_photos` / **write** | ✅ | ✅ | ✅ | ✅ |
| `insights.recalculate` | `books` / **write** | — | ✅ | ✅ | ✅ |
| `insights.searchCurate` | `books` / **write** | — | ✅ | ✅ | ✅ |
| `inbox.reply` | `contact` / **write** | ✅ | ✅ | ✅ | ✅ |
| `inbox.update` | `contact` / **write** | ✅ | ✅ | ✅ | ✅ |
| `inbox.delete` | `contact` / **write** | ✅ | ✅ | ✅ | ✅ |
| `storage.upload` | `storage` / **write** | ✅ | ✅ | ✅ | ✅ |
| `storage.modify` | `storage` / **write** | ✅ | ✅ | ✅ | ✅ |
| `storage.purge` | `storage_manage` / **write** | — | — | — | ✅ |
| `users.invite` | `users` / **write** | — | — | ✅ | ✅ |
| `users.update` | `users` / **write** | — | — | ✅ | ✅ |
| `team.manage` | `users` / **write** | — | — | ✅ | ✅ |
| `team.create` | `users` / **write** | — | — | ✅ | ✅ |
| `team.sections` | `users` / **write** | — | — | ✅ | ✅ |
| `settings.publish` | `settings` / **write** | — | — | ✅ | ✅ |
| `roles.save` | `roles` / **write** | — | — | — | ✅ |

## 6. Tests

| File | What it pins |
| --- | --- |
| `lib/admin/access-policy.test.ts` | The decision functions against all five default roles; the reported bugs as named cases; every admin page declares a policy; every policy points at a page that exists; route resolution precedence; denial descriptions leak nothing. |
| `lib/admin/authorization-boundary.test.ts` | A 403 never reaches the error boundary; every admin Server Action file and every `/api/admin` route guards before it opens a service-role client; the registry stays pure; MFA, lockdown, fail-closed resolution and security logging survive. |
| `lib/admin/books-nav.test.ts` | The Books sidebar section names route policy ids, and the pages declare the same ones. |
| `lib/admin/ui-capabilities.test.ts` | Every mutation surface asks the registry through the capability layer (never a hand-rolled level comparison); read/write/none behaviour per surface; no matrix row governs nothing; no action id names an unknown resource or is unsatisfiable; the roles editor matches the delegation rules. |
| `app/(admin)/admin/(protected)/roles/actions.test.ts` | The save path: the registry guard by policy id, and each delegation rule against a forged payload. |
| `lib/admin/roles-bulk.test.ts` | Bulk edits on `/admin/roles`, including that fixed resources never move. |

## 7. Deliberate exceptions

- **`/admin/roles` is delegable, and bounded.** The page and
  `saveRolePermissions` both require `perm("roles", "write")`, so a super admin
  can hand role management to a trusted `admin` from the matrix itself rather
  than by editing a hardcoded role list — and the `roles` row finally decides
  something. Because `roles: write` is the one grant that can grant grants, a
  level check is not the whole check; see §9.
- **The security console and activity log use `roles([...])`**, not the matrix.
  They read the security pipeline's own service-role-only tables and have no
  delegable sub-capability. A matrix row for them would be a control that
  decides nothing.
- **Legacy redirect pages carry no guard** (`/admin/dashboard`, `/admin/manage`,
  `/admin/upload`, `/admin/manage/duplicates`). They forward to a guarded route;
  a guard here would 403 a bookmark before it could be forwarded.

## 8. Delegating role management

`roles` defaults to `write` for super_admin and `none` for everyone else, so
replacing the old hardcoded super-admin check with a permission produced the
identical answer for all five shipped roles. What it adds is a supported way to
widen that, with three rules on top of the level — named in
`ROLES_DELEGATION_RULES` and enforced per cell in `saveRolePermissions`, so a
bulk action ("copy Admin onto Staff", "reset to defaults") is refused by the
same rule as the segmented control:

| Rule | What it forbids |
| --- | --- |
| `superAdminRowImmutable` | Any change to the super_admin row, by anyone. |
| `rolesRowSuperAdminOnly` | Anyone but a super admin moving the `roles` row. |
| `wellFormedChange` | A cell naming an unknown role, resource or level. |

The middle rule is the one that bounds the delegation, and it does two jobs at
once. **Delegation is not transitive:** a delegated administrator administers
every other permission but cannot appoint further administrators, so the trust
boundary can only be widened by a super admin. And because the same rule blocks
*revoking* the row, **self-lockout is impossible** — a delegate cannot take
`roles` away from their own role, or from anyone else's.

On screen, the `roles` row is flagged rather than hidden: it carries an amber
note saying what granting it hands over, and — for a delegated administrator who
may not move it — who can. That is `ELEVATED_RESOURCES`, which replaced the old
`FIXED_RESOURCES`; the row used to be rendered locked for everyone, which made
it decide nothing, the same defect the `catalog` row once had.

What delegation does **not** reach: `is_super_admin`, and assigning the
`super_admin` role. Both live on `/admin/users`, behind `users: write` plus the
caller's own super-admin status.

## 9. Adding a route

1. Add a `RoutePolicy` to `ROUTE_POLICIES` with an id, the route pattern, its
   requirement and — for a write route — a `backTo` hub.
2. Call `requireRouteAccess("<id>")` as the first statement of the page.
3. Gate its mutations with `requireAction("<action id>")` (add the action to
   `ACTION_POLICIES`) or `requirePermission`.
4. Render its controls behind `can(...)` / `useCan(...)` / `<CanDo>`.
5. If it belongs in the sidebar, gate the entry on the same policy id.

Steps 1–2 are enforced by `lib/admin/access-policy.test.ts`; skipping either
fails the suite rather than shipping an unguarded page.
