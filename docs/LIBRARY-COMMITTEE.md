# Library Committee

The public committee page (`/about/committee`, `/km/about/committee`) and its
admin surface (`/admin/team/committee`).

**The one architectural decision: the committee is a RELATIONSHIP, not a second
directory of people.** `team_members` stays the canonical person record —
name in both languages, portrait, education, bios, slug, linked account,
publish state, privacy toggles. The committee stores only what is true about
the *committee*: which person holds a seat, under what role, in which grouping,
in what order, and whether the seat is published.

```
                     team_members
                  (canonical people)
                           │
              ┌────────────┴────────────┐
              │                         │
        /about/team              committee_members  ──►  committee_sections
                                          │
                                          ▼
                                 /about/committee
```

## Schema (migration `0150_library_committee.sql`)

| Table | Holds | Notes |
|---|---|---|
| `committee_sections` | `name_km/en`, `description_km/en`, `display_order`, `layout_variant`, `is_active` | `layout_variant` is CHECKed to `leadership \| grid` |
| `committee_members` | `team_member_id`, `committee_section_id`, `role_km/en`, `responsibility_km/en`, `display_order`, `is_published` | one row = one seat |

Four decisions worth keeping:

- **`unique (team_member_id)`, not `unique (team_member_id, committee_section_id)`.**
  The committee is one body: a person holds one seat, with one role. The pair
  would also not do the job — `committee_section_id` is nullable and NULLs never
  collide in a UNIQUE index, so two *unsectioned* seats for one person would both
  be accepted and the reader would meet them twice.
- **The cascade points at the person.** `team_member_id … ON DELETE CASCADE`:
  deleting a person retires their seat. Nothing travels the other way — removing
  a seat is a DELETE on `committee_members` and reaches no parent. That is the
  structural half of the promise the admin dialog makes in words.
- **`committee_section_id … ON DELETE SET NULL`.** Deleting a grouping must
  leave the seats standing (unsectioned, still published), never delete people.
- **`is_published` defaults to FALSE**, where `team_members.is_published`
  defaults to true. A committee listing is an institutional statement about
  governance; a seat reaches the public page only when someone publishes it.

Both tables have RLS enabled *and* an explicit `REVOKE … FROM public, anon,
authenticated` (CLAUDE.md's rule for a new public-schema table — PostgREST
auto-exposes every table on this project).

### The public read model

`committee_members_public` is the only relation the public page reads, through
the service client — the same path `/about/team` takes (`lib/team/data.ts`).

It carries **no phone, no email, no account link and no full biography**, so
the committee page cannot leak a contact detail even by a careless select. A
reader who wants more is sent to the staff profile page, which already enforces
the per-member privacy toggles.

`slug` is exposed as `case when tm.is_published then tm.slug end`: the profile
link is the one place the two surfaces meet, and a slug for a member who is not
published on `/about/team` is a URL the middleware slug gate answers with a 404.
The view withholds it rather than leaving the page to remember.

## Public page

`app/[locale]/(public)/about/committee/page.tsx` renders inside
`AboutPageShell`, like the other About pages. `committee` was added to
`ABOUT_PAGE_KEYS` / `ABOUT_NAV` at the same time: the page was already in the
header's About menu and in `sitemap.xml` but was not part of the About model, so
it alone had no sub-navigation, no breadcrumb, no pager and no related-pages
block.

- **Sections decide their own composition** (`components/about/CommitteeRoster.tsx`).
  `leadership` is prominent and centred; `grid` is the standard roster. Nothing
  in the page knows the words "Head" or "Deputy Head" — which group leads, what
  it is called in either language and who is in it are editorial data.
- **Three states, not two.** A failed read renders a "temporarily unavailable"
  notice; an empty committee renders the "being prepared" state with the official
  contact route. Saying "no members are published" when the database did not
  answer is a false statement about the institution.
- **No fabricated figures.** The only number on the page is the count of
  published seats, printed once in the section header.
- **Structured data**: `AboutPage` with the members as `member` of the library
  Organization (not `employee` — sitting on the committee is a role, and some
  holders of it are college staff rather than library staff), plus an `ItemList`
  of only those members who *have* a profile page.

## Admin

`/admin/team` and `/admin/team/committee` are two tabs of one workspace.

- **Adding a member searches the people who already exist.** When the person is
  missing, the dialog links to `/admin/team/new` — the existing team form, with
  its photo upload, bilingual identity, education, account linking and publish
  logic. There is deliberately no second person form.
- **Removing a seat is not deleting a person.** The confirm dialog says so, the
  action writes `team_member_deleted: false` on its audit row, and
  `lib/committee/schema.test.ts` fails if a `team_members` write ever appears in
  the committee actions.
- Reordering is server-resolved (up/down, neighbours read from the stored
  order), so a stale page cannot swap two rows that are no longer adjacent.
- Sections live at `/admin/team/committee/sections`.

### Authorization

One resource, `users`, through the existing registry (`lib/admin/access-policy.ts`):

| Policy | Kind | Requires |
|---|---|---|
| `team.committee` | route `/admin/team/committee` | `users: read` |
| `team.committee.sections` | route `/admin/team/committee/sections` | `users: write` |
| `team.committee.manage` | action | `users: write` |
| `team.committee.sections` | action | `users: write` |

An account trusted to decide who appears on `/about/team` is the account that
decides who appears on `/about/committee`; a separate resource row would have
been a permission nobody would ever configure differently. Read opens the
roster and its counts; every mutation is re-checked by `requireAction()`.

### Cache

Committee mutations revalidate `/admin/team`, `/admin/team/committee`,
`/admin/team/committee/sections` and `/about/committee` (through
`revalidateLocalizedPath`, so both locales are hit — a bare
`revalidatePath("/about/committee")` is a silent no-op). **Team mutations
revalidate `/about/committee` too**: the committee renders the same people, so
a corrected name that invalidated only `/about/team` would leave the two pages
disagreeing.

## Tests

| File | Rule |
|---|---|
| `lib/committee/public.test.ts` | deterministic public order at the editor's default `display_order`, no heading without a member, the profile link only where one resolves, a committee role and a library position never reported as the same kind of fact |
| `lib/committee/schema.test.ts` | source scan: no person field on `committee_members`, the cascade direction, the single-column unique index, RLS + revokes, no contact column in the public view, no `team_members` write in any committee action, a guard before every service client, an audit row per event, both-locale revalidation |
| `e2e/committee.spec.ts` | published seat shown, draft hidden, profile link reaches the canonical staff page, both locales, canonical + hreflang, ItemList counts only published seats, no phone overflow |
