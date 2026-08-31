# PTEC ↔ e-Library Entity Mapping

**Date:** 2026-08-31
**Sources:** `https://www.ptec.edu.kh` (public pages + its open WordPress REST
API, read 2026-08-31) and this repository's schema (`supabase/migrations/`).

This document records **what the two systems actually contain** and which
correspondences are safe to act on. It is deliberately conservative: §65 of the
SEO V3 brief requires a real relationship over a heuristic guess, and §13
requires that ambiguous people are never merged.

Everything below was read from the live systems. Nothing is inferred from
naming similarity alone, and nothing here is invented.

---

## 1. What `www.ptec.edu.kh` actually publishes

WordPress. The REST API is public and was used to enumerate content
(`/wp-json/wp/v2/*`).

### 1.1 Content types

| Post type | Label | Count (2026-08-31) |
|---|---|---|
| `post` | Posts (news) | 161 |
| `page` | Pages | 46 |
| `cm_academic_paper` | Academic Publications | **27** |
| `cm_partner` | Partners | 33 |
| `cm_student_project` | Student Projects | 1 |
| `cm_action_research` | Student Teacher Action Research | 0 |
| `cm_seminar_record` | Seminar Records | 0 |
| `cm_teaching_material` | Teaching Materials | 0 |
| `cm_event` | Upcoming Events & Holidays | 0 |
| `cm_department_post` | Department News and Events | — |
| `cm_online_meeting` | Online Meetings | — |

### 1.2 Taxonomies

| Taxonomy | Terms | Populated? |
|---|---|---|
| `cmdp_department` | **7** | **No** — 6 of 7 terms have count 0 |
| `cm_academic_journal` | **4** | **No** — all 4 terms have count 0 |
| `cm_content_type` | — | partially |
| `cm_action_research` | — | — |

### 1.3 The institutional hierarchy (from pages, authoritative)

**3 faculties**

| Faculty | Page |
|---|---|
| Faculty of Pedagogy and Research | `/faculty-pedagogy-research-education/`, `/faculty-of-pedagogy-and-research-structure/` |
| Faculty of Science Education | `/faculty-science-education/`, `/faculty-of-science-education-structure/` |
| Faculty of Social Sciences Education | `/faculty-social-sciences-education/`, `/faculty-of-social-science-education-structure/` |

**7 departments** (the `cmdp_department` term set, and the filter offered on
`/lecturer-directory/`)

| Department | Term slug | Structure page |
|---|---|---|
| Department of Pedagogy | `department-of-pedagogy-5` | `/department-of-pedagogy/` |
| Department of Educational Research and Library | `department-of-research-and-library-1` | `/department-of-educational-research-and-librarys-structure/` |
| Department of Sciences | `department-of-science-2` | `/department-of-sciences-structure/` |
| Department of Mathematics | `department-of-mathematics-3` | `/department-of-mathematics-s-structure/` |
| Department of Languages | `department-of-languages-4` | `/department-of-languages-structure/` |
| Department of Social Sciences | `department-of-social-sciences-8` | `/department-of-social-sciencess-structure/` |
| Department of ICT | `department-of-ict-7` | `/department-of-icts-structure/` |

**Programmes** — Teacher Education 12+4 (Primary; Lower Secondary), BA+1
(Primary; Lower Secondary), plus per-subject syllabus pages (Mathematics,
Social Science, ICT).

**147 lecturer profiles** at `/lecturer/<slug>/`, indexed by
`/lecturer-directory/` and filterable by the 7 departments. Profiles carry a
role (Head of Department, Deputy Head, Vice Dean, Lecturer, Senior Lecturer,
Teacher Educator), a department, and often qualifications.

**4 declared journals** (`cm_academic_journal`): Cambodian Journal of Teacher
Education · International Journal of Pedagogical Innovations · PTEC Educational
Research Journal · Southeast Asian Journal of STEM & TVET.

**Related properties:** `courses.ptec.edu.kh` (LMS) and
`sites.google.com/ptec.edu.kh/pteclibrarypress/` (PTEC Library Press, incl. a
journal section).

### 1.4 How an academic paper is actually stored

Real record, `cm_academic_paper` #9180:

```jsonc
"meta": {
  "_cm_department_id": 2,
  "_cm_department_name": "",
  "_cm_author_lecturers": [314],          // ← FK to a lecturer profile
  "_cm_authors": "Roeurn Solinda",        // ← free text
  "_cm_academic_year": "2023-2024",
  "_cm_journal": "Action Research Series Volume 4, 2024",   // ← free text
  "_cm_doi": "",
  "_cm_status": "approved",
  "_cm_visibility": "public"
},
"cmdp_department": [],                     // ← taxonomy UNUSED
"cm_academic_journal": []                  // ← taxonomy UNUSED
```

**This is the decisive fact for machine integration.** PTEC's normalised
taxonomies exist but are empty; the real linkage lives in free-text and numeric
postmeta. So:

- department linkage is `_cm_department_id` (an integer with no published
  mapping to the taxonomy term ids);
- journal is a free-text string that does not match any of the four declared
  journal terms;
- authorship is `_cm_author_lecturers` (reliable, an internal id) **plus**
  `_cm_authors` (free text) — and only the free-text form is rendered publicly.

Anything crossing the system boundary can therefore rely on **names and titles
only**, which is exactly the ambiguity §13 says must not be auto-merged.

---

## 2. What the e-Library actually models

| Concept | Table | Notes |
|---|---|---|
| Organization | `organizations` (0104) | org-scopes the canonical model; default = PTEC |
| Contributor | `contributors` (0105) | `display_name`, `name_en`, `name_km`, `orcid`, `affiliation`, `biography_*` — **populated, not publicly read** (D-11) |
| Author (legacy) | `authors`, `publication_authors` | the current public read source |
| Subject | `subjects` (0107) | hierarchical (`parent_id`), EN + KM, slugged |
| Subject (legacy) | `categories` | `(id, name, slug, created_at)` — the current public read source |
| Department | `departments` | `(id, name, slug, created_at)` — **admin-only**, no public route |
| Degree programme | `research_programs` (0055) | `code`, `name_en`, `name_km`, `duration_years` |
| Programme track | `research_faculties` (0055) | `program_code`, `code`, `name_en`, `name_km` |
| Learning path | `learning_paths` (0111) | `status` lifecycle + mirrored `is_published` |

---

## 3. The "faculty" vocabulary conflict — resolved by naming, not by migration

| | Meaning | Cardinality | Examples |
|---|---|---|---|
| **PTEC "Faculty"** | academic unit of the college | 3 | Faculty of Science Education |
| **`research_faculties`** | specialisation inside a degree programme | 5 | Primary Education · Early Childhood Education · School Management |

These are **different concepts with the same word**. `research_faculties` rows
are what the institution elsewhere calls *programme tracks* or *majors*; PTEC's
own three faculties are not modelled in this database at all.

**Decision:** do not migrate, rename columns, or invent a faculty table.
`research_faculties` is thesis metadata reached through `/theses` filters and
`/theses/summary`; it has no public landing page and must never acquire one
under the label "Faculty", because that would publish a claim about PTEC's
structure that contradicts PTEC's own website.

**Enforced by:** `lib/seo/institution.test.ts` — asserts the three real faculty
names and the seven real department names, and asserts that no public route
renders `research_faculties` values under a "faculty" label.

---

## 4. Mapping table

Confidence is about **instance-level machine linking**, not about whether the
concepts correspond.

| PTEC entity | e-Library entity | Concept match | Instance linking | Action in V3 |
|---|---|---|---|---|
| PTEC (the college) | `organizations` default row / `#organization` node | **exact** | **certain** — one institution | **Implemented.** One `@id`, referenced everywhere (fixes D-2) |
| PTEC Library (Dept. of Educational Research and Library) | `#library` node | **exact** | **certain** | **Implemented.** `parentOrganization` → `#organization` |
| Faculty (3) | *not modelled* | n/a | n/a | **Documented only** (§3) |
| Department (7) | `departments` | **partial** — same vocabulary, unverified row set | **weak**: e-Library `departments` rows are free-text names entered in the admin book form | **Documented + asserted.** No public page (audit D-6) |
| Programme | `research_programs` | **strong** — 12+4 / BA+1 / Master's appear in both | **medium**: matched by name, no shared identifier | **Documented.** No public page (0 published paths) |
| Programme track | `research_faculties` | **strong** | **medium** | **Documented.** Vocabulary conflict §3 |
| Lecturer (147) | `contributors` / `authors` | **strong** — PTEC lecturers author PTEC research | **WEAK — names only.** PTEC exposes no ORCID, no email, no stable public id on a profile page | **No automatic matching.** See §5 |
| Academic paper (27) | `publications` | **exact** | **weak** — title matching only; 0 publications exist to match against | **Deferred** until publications are published |
| Journal (4 declared) | `publications.journal_name` | **exact** concept | **weak** — PTEC's own journal taxonomy is unpopulated (§1.4) | **Documented** |
| Research area | `subjects` / `categories` | **strong** | **medium** | Subject hubs already exist (V2) |
| News post | `posts` | **exact** | separate editorial streams, intentionally | none |

---

## 5. Lecturer ↔ Author: why nothing is auto-merged

§12 calls this the highest-value feature and §13 requires a reliable identity
strategy. The available signals:

| Signal | Available on PTEC? | Available in e-Library? | Usable? |
|---|---|---|---|
| ORCID | no | `contributors.orcid` (unique index) | **no** — one side only |
| Institutional email | no (not published) | `contributors.email` | **no** |
| Stable shared id | no | no | **no** |
| Department | postmeta int, no public mapping (§1.4) | free-text `departments.name` | **no** |
| Exact name | yes (`_cm_authors`, free text) | yes | **name only** |

Only the weakest signal is available on both sides — and Khmer personal names
romanise inconsistently (the directory itself carries both
`/lecturer/sopheak-sophorn/` and `/lecturer/sophearanny-yorn/`-style orderings,
plus one profile slugged in Khmer script). Family-name-first vs
given-name-first alone makes exact matching unsafe.

**Decision, per §13 and §65:** implement **no** automatic cross-system person
merging. The e-Library's own author identity (`contributors`, with its unique
ORCID index and legacy-id provenance) stays the sole authority for who wrote
what. A future link to a PTEC lecturer profile must be an **explicit admin
mapping** — a stored URL on the author record, entered by a person — not a
fuzzy match.

**Not built in V3** (no admin mapping UI exists yet, and with 0 published
theses/publications there is nothing to map). Recorded as the correct design
so a later session does not "helpfully" add name matching.

---

## 6. Relationships that are safe and useful today

Only these are acted on in SEO V3:

1. **PTEC is one entity, addressed by one `@id`.** Every node that needs the
   institution references `#organization`; nothing re-declares it. Its `url` is
   `https://www.ptec.edu.kh` and its `sameAs` lists the official properties.
   (Fixes audit D-2.)
2. **The library is a `Library` whose `parentOrganization` is that entity.**
   Already true; V3 makes the resource-page copies reference it instead of
   duplicating it.
3. **PTEC → library already links inbound.** `www.ptec.edu.kh` links to
   `https://library.ptec.edu.kh/books` from its homepage. The reciprocal
   outbound link exists in the library's own settings (`links.website`) and in
   `sameAs`.
4. **Subjects are the working topic layer.** Built in V2, populated, bilingual.
   Faculty/department/programme are *not* substitutes for it and must not
   compete with it for the same queries.

Everything else in the brief's institutional section is **withheld pending
content**, per audit §3.
