# SEO 3.1 — Entity Architecture

How a contributor expression becomes an entity, and the rules that keep it
truthful. Companions: [SEO-3.1-ENTITY-AUDIT.md](SEO-3.1-ENTITY-AUDIT.md) ·
[SEO-3.1-CONTRIBUTOR-MIGRATION.md](SEO-3.1-CONTRIBUTOR-MIGRATION.md)

---

## 1. The shape

```
   catalogue text ("Bert P.M. Creemers, Leonidas Kyriakides, Pam Sammons (Editors)")
        │
        ▼
   lib/resources/contributor-identity.ts        ← THE ONE PARSER (pure)
        │  normalizeByline() → { sourceText, role, contributors[], resolved }
        │
        ├──────────────────────────────┐
        ▼                              ▼
   INGESTION                      RENDER
   lib/resources/                 lib/seo/contributor.ts   ← projection only
   contributor-write.ts                │
        │                              ▼
        ▼                         JSON-LD nodes
   contributors                   Person / Organization / @id → #organization
   resource_contributors
   (typed, roled, ordered)
```

Before 3.1 the left branch did not exist and the right branch *was* the parser,
duplicated eight times.

## 2. The rules, and why each exists

### R1 — One parser, many consumers

`lib/resources/contributor-identity.ts` is the only module that decides what a
byline names. `lib/seo/contributor.ts` maps its answer to schema.org and adds
exactly one thing (R3). Ingestion consumes the same answer.

*Why:* the defect being repaired was eight independent answers to one question.
A second parser recreates it, whatever it is called.

**Guarded by:** a source scan in `lib/seo/contributor.test.ts` — only the team
pages (real, individually catalogued staff) may write `"@type": "Person"` by
hand. It scans `app`, `lib` and `components`, so a new parser anywhere in the
domain layer is caught, and it uses the filesystem rather than git so an
uncommitted file cannot hide from it.

### R2 — Identity is decided on the WHOLE string, before any split

Institution, then organisation, then split.

*Why:* an institution's name routinely contains the delimiters a list uses.
`Ministry of Education, Youth and Sport` is **one** body; splitting first turns
one true fact into three fabrications. The cost is that a mixed
"`<person>` and `<organisation>`" byline is typed by its organisational word —
no such byline exists in this collection, while institution names containing
commas certainly do (27 of them).

### R3 — The institution is referenced, never re-minted

A byline matching the published identity resolves to a bare `@id` reference to
`#organization` — the node `RootShell` already declares.

*Why:* otherwise one document describes one institution twice, under two
`@id`s and two types. This is the SEO 3.0 headline defect, and matching is
against **System Settings**, never a literal in source: the name is editable
there, and a hardcoded copy is a second source of truth that goes stale
(`lib/settings-consistency.test.ts` enforces this, and caught it once).

### R4 — Splitting is conservative; omission beats fabrication

A comma-delimited byline splits only when every segment is a full name
(≥ 2 tokens), so `Smith, John` — one inverted name — is never split into two
people. When a byline names several entities but cannot be separated safely,
**nothing is emitted**.

*Why:* the asymmetry. Being wrong by refusing costs a less granular but TRUE
record. Being wrong by splitting invents a human being.

### R5 — Role is extracted, not destroyed

`(Editors)` means the contributors are editors. `resource_contributors.role`
(0105) has the column, with `editor`, `translator` and `compiler` already in
its CHECK.

*Why:* the information was being deleted because the old model — one string in
`books.author` — had nowhere to put it. It does now.

### R6 — Precision over recall in organisation detection

Latin vocabulary matches whole words; Khmer matches substrings (no segmenter
exists here, and Khmer head-words are unambiguous compounds). `press`, `board`,
`trust`, `fund`, `union`, `network` and `office` are **deliberately absent**.

*Why:* each is a plausible surname. A false positive retypes a real person as
an institution — the same untrue claim, pointed the other way.

### R7 — A byline may be TEXT, but only a resolved entity may be a NODE

An unresolvable byline still appears in prose (`description` renders
"A Book by Smith, John — a free e-book…"): that is a quotation of what the
catalogue says. It must never become a typed node, which is an assertion that a
thing exists.

*Why:* forbidding the string everywhere would delete honest prose along with
the dishonest claim. Pinned in `lib/seo/contributor-jsonld.test.ts`.

### R8 — Recording a credit must never fail a save

`recordResourceContributors()` is non-throwing by contract and runs in
`after()`. A failure returns `null`; the book is already saved.

*Why:* a credit is derived data. Losing a 95 MB upload because a contributor
row would not insert is a worse outcome than a missing credit the audit script
can find.

### R9 — The canonical write is ADDITIVE

`books.author_id` and the legacy `authors` row are untouched.

*Why:* those drive `/authors/<slug>`, which is indexed. Retiring them is a URL
decision, not a side effect of fixing ingestion.

## 3. Where `institution` lives in the data model

`contributors.contributor_type` has two values: `person` and `organization`.
A byline matching the institution is stored as an **organization**; the
institution *identity* is resolved at RENDER time against System Settings.

Deliberate: widening the CHECK would need a migration, and would buy nothing —
the identity match already produces the `@id` reference, and it keeps working
if the institution is renamed, which a stored enum would not.

## 4. What is NOT in this architecture

- **No new table.** Everything needed existed in 0104–0109.
- **No change to any author URL.** See the migration document.
- **No thesis/catalog canonical write yet.** Deferred with a reason (audit §1).
- **No `contributors.display_name` unique index.** Two distinct people can
  share a name; an index would reject the second one. Duplicate rows are
  visible to the audit script instead.
