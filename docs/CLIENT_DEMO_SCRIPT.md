# PTEC e-Library — Client Demo Script
# ស្គ្រីបបង្ហាញប្រព័ន្ធបណ្ណាល័យឌីជីថល PTEC

_Prepared 28 August 2026 for the client demonstration meeting._
_រៀបចំនៅថ្ងៃទី ២៨ ខែសីហា ឆ្នាំ២០២៦ សម្រាប់កិច្ចប្រជុំបង្ហាញជូនអតិថិជន។_

**Live site / គេហទំព័រផ្ទាល់:** https://library.ptec.edu.kh
**Duration / រយៈពេល:** ~30 minutes (10 / 12 / 8 per stage)
**Presenter account / គណនីអ្នកបង្ហាញ:** `raksmeyron97@gmail.com` (super_admin)

> **Read before presenting / សូមអានមុនពេលបង្ហាញ**
> Two records currently have missing files in storage and **must not be opened
> on screen**: the thesis `/theses/research` (PDF returns 404) and the book
> `/books/this-is-not-acceptable` (PDF and cover both 404). See
> `docs/PRE_MEETING_CHECKLIST.md` §2. Every book named in this script has been
> verified working.
>
> ឯកសារពីរមានបញ្ហាបាត់ File ក្នុង Storage ហើយ **មិនត្រូវបើកលើអេក្រង់ទេ**៖
> និក្ខេបបទ `/theses/research` និងសៀវភៅ `/books/this-is-not-acceptable`។
> សៀវភៅទាំងអស់ដែលមានឈ្មោះក្នុងស្គ្រីបនេះ ត្រូវបានពិនិត្យរួចរាល់ថាដំណើរការល្អ។

---

## Stage 1 — Public Portal & Reader Experience
## ដំណាក់កាលទី ១ — ទំព័រសាធារណៈ និងបទពិសោធន៍អ្នកអាន

**Goal / គោលដៅ:** show that a teacher-trainee can find and read material in
their own language, on any device, even without internet.
បង្ហាញថាសិស្សគរុកោសល្យអាចស្វែងរក និងអានឯកសារជាភាសាខ្លួនឯង លើឧបករណ៍ណាក៏បាន
សូម្បីតែពេលគ្មានអ៊ីនធឺណិត។

### 1.1 Homepage and bilingual switch / ទំព័រដើម និងការប្តូរភាសា

1. Open `https://library.ptec.edu.kh` — point out the live collection counters
   (these read one view, `public_resource_statistics`, so every page agrees).
   បើកគេហទំព័រ ហើយបង្ហាញលេខរាប់ចំនួនឯកសារ។
2. Click the language switcher to Khmer. The URL becomes `/km` — **a real
   Khmer URL, not a cookie**. Copy it, paste into a new tab: it stays Khmer.
   ចុចប្តូរភាសាទៅជាខ្មែរ។ URL ប្តូរទៅ `/km` — ជា URL ខ្មែរពិតប្រាកដ។
   ចម្លងវាទៅបើកក្នុង Tab ថ្មី វានៅតែជាភាសាខ្មែរ។
3. **Talking point / ចំណុចសំខាន់:** this matters for Google — Khmer pages are
   indexed separately with `hreflang`, so a search in Khmer finds the Khmer page.
   រឿងនេះសំខាន់សម្រាប់ Google — ទំព័រខ្មែរត្រូវបានចុះបញ្ជីដាច់ដោយឡែក។

### 1.2 Native Khmer search / ការស្វែងរកជាភាសាខ្មែរ

1. In the search box type **`វិទ្យាសាស្ត្រ`** (science).
   វាយពាក្យ `វិទ្យាសាស្ត្រ` ក្នុងប្រអប់ស្វែងរក។
2. Results return Khmer titles ranked by relevance. Khmer has no spaces between
   words, so ordinary search engines fail here — this uses trigram matching.
   លទ្ធផលជាភាសាខ្មែរ។ ភាសាខ្មែរមិនមានចន្លោះរវាងពាក្យ ដូច្នេះ Search ធម្មតាមិនដំណើរការ —
   ប្រព័ន្ធនេះប្រើ Trigram។
3. Show the **facet sidebar** (subject, language, year). Counts update live and
   cost no extra database queries.
   បង្ហាញ Sidebar ត្រងទិន្នន័យ។ លេខរាប់ប្តូរភ្លាមៗ។
4. Deliberately mistype a word — the fuzzy fallback still finds results.
   សាកល្បងវាយពាក្យខុស — ប្រព័ន្ធនៅតែរកឃើញ។

### 1.3 "Found inside" — search inside the PDFs / ស្វែងរកនៅក្នុង PDF

1. Search **`action research`**.
2. Scroll to the **"Found inside"** section. These are hits on the *text of
   individual pages*, not titles — the system has indexed the page text of the
   PDF collection.
   រំកិលទៅផ្នែក "Found inside"។ ទាំងនេះជាលទ្ធផលពី **អត្ថបទក្នុងទំព័រនីមួយៗ**
   មិនមែនចំណងជើងទេ។
3. Click a page hit — it opens the book **at that page**.
   ចុចលើលទ្ធផលទំព័រ — វាបើកសៀវភៅត្រង់ទំព័រនោះ។
4. **Talking point:** scanned image-only pages are skipped rather than indexed
   as garbage, so results stay trustworthy.
   ទំព័រដែលជារូបភាព (Scan) ត្រូវបានរំលង ដើម្បីកុំឱ្យលទ្ធផលមានភាពមិនត្រឹមត្រូវ។

### 1.4 In-browser reader / កម្មវិធីអានក្នុង Browser

1. Open **`/books/action-research-in-practice`** (verified working).
2. Read in the browser — no download, no external app.
   អានក្នុង Browser — មិនចាំបាច់ទាញយក ឬដំឡើងកម្មវិធីទេ។
3. Show page navigation, zoom, and the download button.
   បង្ហាញការប្តូរទំព័រ ការពង្រីក និងប៊ូតុងទាញយក។

### 1.5 PWA install & offline / ដំឡើងជា App និងការប្រើពេលគ្មានអ៊ីនធឺណិត

1. On the phone: browser menu → **Add to Home Screen**. The PTEC emblem and
   splash screen appear — it launches like a native app.
   លើទូរស័ព្ទ៖ Menu → Add to Home Screen។ វាបើកដូច App ពិតប្រាកដ។
2. Open a book, then **turn on flight mode**.
   បើកសៀវភៅ រួច **បើក Flight Mode**។
3. Go to **`/offline-books`** — the downloaded book still opens.
   ទៅ `/offline-books` — សៀវភៅដែលបានទាញយកនៅតែបើកបាន។
4. **Talking point:** this is the feature that matters most for provincial
   trainees with limited data.
   នេះជាមុខងារសំខាន់បំផុតសម្រាប់សិស្សនៅតាមខេត្ត ដែលមានអ៊ីនធឺណិតកំណត់។

---

## Stage 2 — Admin & Librarian Workspace
## ដំណាក់កាលទី ២ — កន្លែងធ្វើការសម្រាប់អ្នកគ្រប់គ្រង និងបណ្ណារក្ស

**Goal / គោលដៅ:** show that library staff can run this themselves, without a
developer. បង្ហាញថាបុគ្គលិកបណ្ណាល័យអាចគ្រប់គ្រងដោយខ្លួនឯង ដោយមិនត្រូវការអ្នកសរសេរកម្មវិធី។

### 2.1 Sign in / ចូលប្រព័ន្ធ

1. Go to **`/admin/login`**, sign in as `raksmeyron97@gmail.com`.
2. The system requires **two-factor verification** for every admin. Show the
   authenticator prompt.
   ប្រព័ន្ធតម្រូវឱ្យមានការផ្ទៀងផ្ទាត់ ២ ជាន់ សម្រាប់អ្នកគ្រប់គ្រងគ្រប់រូប។
3. **Talking point:** admins cannot opt out — this is enforced in the layout,
   not by policy.
   អ្នកគ្រប់គ្រងមិនអាចបដិសេធបានទេ — វាត្រូវបានអនុវត្តដោយប្រព័ន្ធ។

### 2.2 Dashboard analytics / ផ្ទាំងវិភាគទិន្នន័យ

1. **`/admin/dashboard`** — four engagement measures: detail views, unique
   visitors, reader opens, downloads.
   មាតិកា ៤៖ ចំនួនមើល អ្នកទស្សនាថ្មី ការបើកអាន និងការទាញយក។
2. Toggle metrics on the chart; click a tile to open the metric drawer.
3. **Talking point:** the colours are colour-blind safe and each metric also
   has its own line pattern and marker — colour is never the only signal.
   ពណ៌ត្រូវបានជ្រើសរើសសម្រាប់អ្នកមានបញ្ហាមើលពណ៌ ហើយមាតិកានីមួយៗមានលំនាំបន្ទាត់ផ្សេងគ្នា។

### 2.3 Search insights / ការវិភាគការស្វែងរក

1. **`/admin/search-insights`** — what readers actually searched for, and what
   they clicked.
   បង្ហាញនូវអ្វីដែលអ្នកអានស្វែងរក និងអ្វីដែលពួកគេចុច។
2. **Talking point (important for trust):** queries are anonymised by
   construction — a daily-rotated one-way hash. Queries group within one day
   and **cannot be linked across days**. No IP address is ever stored.
   ទិន្នន័យស្វែងរកត្រូវបានលាក់អត្តសញ្ញាណ។ វាមិនអាចភ្ជាប់ពីមួយថ្ងៃទៅមួយថ្ងៃបានទេ
   ហើយ **មិនរក្សាទុក IP Address ឡើយ**។
3. Zero-result queries here tell the librarian what to acquire next.
   ពាក្យស្វែងរកដែលគ្មានលទ្ធផល ប្រាប់បណ្ណារក្សថាគួរបន្ថែមឯកសារអ្វី។

### 2.4 Book & thesis CRUD / ការគ្រប់គ្រងសៀវភៅ និងនិក្ខេបបទ

1. **`/admin/books`** → **New**. Fill title, author, subject, language.
2. Upload a PDF and a cover. Images are optimised automatically on upload.
   ផ្ទុកឡើង PDF និងរូបក្រប។ រូបភាពត្រូវបានបង្រួមដោយស្វ័យប្រវត្តិ។
3. Save as **draft**, then show the **schedule** option (publishes itself when
   the date passes).
   រក្សាទុកជា Draft រួចបង្ហាញជម្រើស Schedule (វាចេញផ្សាយដោយខ្លួនឯងនៅពេលដល់កាលបរិច្ឆេទ)។
4. **Talking point:** the page text is indexed in the background right after
   upload, so it becomes searchable inside without any extra step.
   អត្ថបទក្នុងទំព័រត្រូវបានចុះបញ្ជីភ្លាមៗក្រោយពេលផ្ទុកឡើង។

### 2.5 Metadata quality / គុណភាព Metadata

1. **`/admin/data-quality`** — every published record is scored, and the
   **repair queue** is ordered by which missing field costs the most.
   កំណត់ពិន្ទុគ្រប់ឯកសារ ហើយរៀបតាមលំដាប់សារៈសំខាន់។
2. **Talking point:** it ranks by *impact*, not by raw count — fixing one
   high-impact field lifts the whole collection's completeness more than
   fixing many trivial ones.
   វារៀបតាម **ផលប៉ះពាល់** មិនមែនតាមចំនួនទេ។
3. Filter by type / tier / field to show it is a real work queue.

### 2.6 Review queue / ជួរពិនិត្យមុនចេញផ្សាយ

1. **`/admin/review`** — publish gates: a record cannot go public until the
   required fields are present.
   ឯកសារមិនអាចចេញផ្សាយបានទេ រហូតដល់មានព័ត៌មានចាំបាច់គ្រប់គ្រាន់។
2. **`/admin/logs`** — every administrative change is recorded with who and when.
   រាល់ការផ្លាស់ប្តូរត្រូវបានកត់ត្រា ថានរណាធ្វើ និងពេលណា។

---

## Stage 3 — System Customization
## ដំណាក់កាលទី ៣ — ការកំណត់ប្រព័ន្ធ

**Goal / គោលដៅ:** show the client they own the system — no developer needed to
change institutional details. បង្ហាញថាអតិថិជនជាម្ចាស់ប្រព័ន្ធ។

### 3.1 System settings / ការកំណត់ប្រព័ន្ធ

1. **`/admin/system-settings`** — organization name, contacts, address,
   opening hours, social links, SEO defaults.
   ឈ្មោះស្ថាប័ន ទំនាក់ទំនង អាសយដ្ឋាន ម៉ោងបើកទ្វារ តំណសង្គម និង SEO។
2. Change the library phone number → **Save draft**. Show the public site is
   **unchanged**.
   ប្តូរលេខទូរស័ព្ទ → Save draft។ បង្ហាញថាគេហទំព័រសាធារណៈ **មិនទាន់ប្តូរទេ**។
3. Now **Publish**. Refresh the public footer — the new number appears.
   ឥឡូវចុច Publish។ Refresh ទំព័រសាធារណៈ — លេខថ្មីលេចឡើង។
4. Open **version history** and **roll back**.
   បើកប្រវត្តិជំនាន់ ហើយសាកល្បង Rollback។
5. **Talking point:** draft → publish → rollback means a mistake is never live
   and is always reversible.
   ការធ្វើខុសមិនដែលឡើងជាសាធារណៈភ្លាមទេ ហើយអាចត្រឡប់វិញបានជានិច្ច។

### 3.2 Roles & users / តួនាទី និងអ្នកប្រើប្រាស់

1. **`/admin/users`** — show the five roles: reader, staff, librarian, admin,
   super_admin. តួនាទីទាំង ៥។
2. **`/admin/roles`** — the permission grid (resource × none/read/write).
   Toggle `books` from write to read for `staff` and explain the effect.
   តារាងសិទ្ធិ។
3. **Talking point:** permissions are checked again on the server for every
   action — hiding a button is not the security boundary.
   សិទ្ធិត្រូវបានពិនិត្យម្តងទៀតនៅលើ Server សម្រាប់រាល់សកម្មភាព។

---

## Closing / ការបញ្ចប់

Three sentences to end on / ប្រយោគ ៣ សម្រាប់បញ្ចប់៖

1. **It is free and public.** No login is needed to read.
   **វាឥតគិតថ្លៃ និងជាសាធារណៈ។** មិនចាំបាច់ចូលគណនីដើម្បីអានទេ។
2. **It works in Khmer, and it works offline.**
   **វាដំណើរការជាភាសាខ្មែរ និងដំណើរការពេលគ្មានអ៊ីនធឺណិត។**
3. **PTEC staff run it themselves** — content, settings, and users are all
   editable without a developer.
   **បុគ្គលិក PTEC គ្រប់គ្រងវាដោយខ្លួនឯង** ដោយមិនត្រូវការអ្នកសរសេរកម្មវិធីទេ។

### If asked "is our research discoverable?" / បើគេសួរអំពីការចុះបញ្ជីស្រាវជ្រាវ

Yes — the library publishes an OAI-PMH feed at `/api/oai`, the standard
academic harvesting protocol, so published, publicly-licensed items can be
indexed by BASE, CORE and OpenAIRE alongside Google.
បាទ/ចាស — បណ្ណាល័យមាន OAI-PMH នៅ `/api/oai` ដែលអាចឱ្យ BASE, CORE និង OpenAIRE
ចុះបញ្ជីឯកសាររបស់យើងបាន។
