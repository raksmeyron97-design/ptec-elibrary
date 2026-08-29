# PTEC e-Library — Client Handover Guide
# សៀវភៅណែនាំប្រគល់ប្រព័ន្ធបណ្ណាល័យឌីជីថល PTEC

_Prepared 28 August 2026. Audience: the PTEC staff who will own and operate the library._
_រៀបចំនៅថ្ងៃទី ២៨ ខែសីហា ឆ្នាំ២០២៦។ សម្រាប់៖ បុគ្គលិក PTEC ដែលនឹងគ្រប់គ្រងបណ្ណាល័យ។_

| | |
|---|---|
| Public site / គេហទំព័រសាធារណៈ | https://library.ptec.edu.kh |
| Admin panel / ផ្ទាំងគ្រប់គ្រង | https://library.ptec.edu.kh/admin |
| Master account / គណនីមេ | `raksmeyron97@gmail.com` (**super_admin**) |
| Health check / ពិនិត្យសុខភាពប្រព័ន្ធ | https://library.ptec.edu.kh/api/health |

---

## 1. First sign-in / ការចូលប្រព័ន្ធលើកដំបូង

The account `raksmeyron97@gmail.com` has been elevated to **super_admin** —
the highest role. It has write access to every module: books, theses,
publications, catalog, posts, announcements, learning paths, users, roles,
settings and storage.

គណនី `raksmeyron97@gmail.com` ត្រូវបានតម្លើងទៅជា **super_admin** ដែលជាតួនាទីខ្ពស់បំផុត។
វាមានសិទ្ធិកែប្រែគ្រប់ផ្នែកទាំងអស់។

**Steps / ជំហាន:**

1. Go to **https://library.ptec.edu.kh/admin/login**
   ចូលទៅកាន់ទំព័រ Login។
2. Sign in with the Google account `raksmeyron97@gmail.com`.
   ចូលដោយប្រើគណនី Google។
3. You will be sent immediately to **MFA enrolment** (§2) — this is required,
   not optional. អ្នកនឹងត្រូវបញ្ជូនទៅការចុះឈ្មោះ MFA ភ្លាមៗ។

> **Note / ចំណាំ:** there is a second super_admin on the system
> (`ronraksmey3@gmail.com`) and one other admin (`mongkul.digital@gmail.com`).
> Review these at `/admin/users` and remove any that should not remain.
> មានគណនី super_admin មួយទៀត និង admin មួយទៀតក្នុងប្រព័ន្ធ។ សូមពិនិត្យ ហើយលុបចេញបើមិនចាំបាច់។

---

## 2. Enabling MFA / 2FA / ការបើកការផ្ទៀងផ្ទាត់ ២ ជាន់

Every account with admin-panel access **must** pass two-factor verification.
The system enforces this in the admin layout: a user with no enrolled factor is
sent to enrol; a user with a factor must verify before any admin page loads.

គ្រប់គណនីដែលចូលផ្ទាំងគ្រប់គ្រង **ត្រូវតែ** ឆ្លងកាត់ការផ្ទៀងផ្ទាត់ ២ ជាន់។

**Enrolment / ការចុះឈ្មោះ:**

1. Install an authenticator app on your phone (Google Authenticator, Microsoft
   Authenticator, or 1Password). ដំឡើងកម្មវិធី Authenticator លើទូរស័ព្ទ។
2. Go to **`/admin/mfa/enroll`**.
3. Scan the QR code with the app. ស្កេន QR Code។
4. Type the 6-digit code to confirm. វាយលេខ ៦ ខ្ទង់ដើម្បីបញ្ជាក់។
5. **Write the recovery information somewhere safe and offline.** If you lose
   the phone and have no recovery, you lose admin access.
   **សូមកត់ទុកព័ត៌មានសង្គ្រោះនៅកន្លែងសុវត្ថិភាព។** បើបាត់ទូរស័ព្ទ ហើយគ្មានព័ត៌មានសង្គ្រោះ
   អ្នកនឹងបាត់បង់សិទ្ធិចូលប្រព័ន្ធ។

**Afterwards / បន្ទាប់ពីនោះ:** each sign-in asks for the 6-digit code at
`/admin/mfa/verify`. រាល់ពេលចូល ប្រព័ន្ធនឹងសួរលេខ ៦ ខ្ទង់។

> **Recommendation / អនុសាសន៍:** enrol **two** people before the system goes
> into daily use, so one lost phone never locks the institution out.
> សូមចុះឈ្មោះ **មនុស្ស ២ នាក់** ដើម្បីកុំឱ្យស្ថាប័នជាប់គាំង។

---

## 3. Updating organization details / ការកែប្រែព័ត៌មានស្ថាប័ន

All institutional information is edited at **`/admin/system-settings`** — no
developer needed. ព័ត៌មានស្ថាប័នទាំងអស់កែប្រែនៅ `/admin/system-settings`។

**The five sections / ផ្នែកទាំង ៥:**

| Section | What it controls / អ្វីដែលវាគ្រប់គ្រង |
|---|---|
| **Organization** | Institution name (EN/KM), library name, short description / ឈ្មោះស្ថាប័ន និងបណ្ណាល័យ |
| **Contact** | Email, phone, postal address / អ៊ីមែល ទូរស័ព្ទ អាសយដ្ឋាន |
| **Hours** | Weekly opening hours and holiday closures / ម៉ោងបើកទ្វារ និងថ្ងៃឈប់សម្រាក |
| **Links** | Facebook, Telegram, map link / តំណសង្គម និងផែនទី |
| **SEO** | Default page title, description, share image, and the site-wide indexing switch / ចំណងជើង SEO និងកុងតាក់ចុះបញ្ជី |

**The safe workflow — draft, then publish / វិធីធ្វើការដោយសុវត្ថិភាព:**

1. Edit the field. កែប្រែព័ត៌មាន។
2. Click **Save draft**. Nothing on the public site changes yet.
   ចុច Save draft។ គេហទំព័រសាធារណៈមិនទាន់ប្តូរទេ។
3. Check the draft carefully. ពិនិត្យឱ្យបានហ្មត់ចត់។
4. Click **Publish**. The change goes live and the public cache is refreshed.
   ចុច Publish។ ការផ្លាស់ប្តូរឡើងជាសាធារណៈ។
5. Made a mistake? Open **version history** and **roll back** to any earlier
   version. ធ្វើខុស? បើកប្រវត្តិជំនាន់ ហើយត្រឡប់ក្រោយវិញ។

> Only `admin` and `super_admin` can write settings. Every save re-checks the
> permission on the server.
> មានតែ `admin` និង `super_admin` ទេដែលកែបាន។

---

## 4. Content upload guidelines / ការណែនាំពីការផ្ទុកឯកសារ

### 4.1 PDF files / ឯកសារ PDF

| Rule / ច្បាប់ | Detail / លម្អិត |
|---|---|
| Format | PDF only for books and theses / PDF តែប៉ុណ្ណោះ |
| Max size | **100 MB** per file / អតិបរមា ១០០ MB |
| Text layer | **Must contain real text, not just scanned images** / ត្រូវមានអត្ថបទពិត មិនមែនតែរូបភាព Scan |
| Filename | Use ASCII letters, digits and hyphens / ប្រើអក្សរឡាតាំង លេខ និងសញ្ញាបន្ទាត់ |

**Why the text layer matters / ហេតុអ្វីអត្ថបទសំខាន់:** after upload the system
reads the PDF page by page and indexes the text, which is what powers the
"Found inside" search results. A scan with no text layer is skipped — the book
will still be readable and downloadable, but it will **not** be searchable
inside. Run OCR before uploading scanned material.

ក្រោយពេលផ្ទុកឡើង ប្រព័ន្ធអានអត្ថបទក្នុង PDF ទំព័រម្តងៗ ដើម្បីធ្វើ Index។
ឯកសារ Scan ដែលគ្មានអត្ថបទ **មិនអាចស្វែងរកខាងក្នុងបានទេ**។ សូមធ្វើ OCR ជាមុន។

**On filenames / អំពីឈ្មោះឯកសារ:** do not upload files whose names are written
in Khmer script. The storage layer strips non-ASCII characters, which has
already produced one unusable file on this system (a name reduced to a row of
underscores). Rename to Latin characters first — the *title* shown to readers
is a separate field and should absolutely be in Khmer.

សូម**កុំ**ដាក់ឈ្មោះ File ជាអក្សរខ្មែរ។ ប្រព័ន្ធផ្ទុកលុបអក្សរមិនមែនឡាតាំងចេញ
ដែលបានធ្វើឱ្យខូច File មួយរួចហើយ។ សូមប្តូរឈ្មោះជាអក្សរឡាតាំងជាមុនសិន។
ចំណងជើងដែលអ្នកអានឃើញ គឺជាវាលដាច់ដោយឡែក ហើយគួរតែជាភាសាខ្មែរ។

### 4.2 Cover images / រូបភាពក្រប

| Rule / ច្បាប់ | Detail / លម្អិត |
|---|---|
| Format in | JPG, PNG, WebP or AVIF / ទម្រង់ដែលទទួល |
| Max size | **25 MB** / អតិបរមា ២៥ MB |
| Shape | Portrait, book-cover proportions / បញ្ឈរ តាមរូបរាងក្របសៀវភៅ |
| Minimum | At least 800 px wide / យ៉ាងតិច ៨០០ px |

The system converts covers to WebP at up to 800 px wide automatically — a
finished cover is roughly 50–150 KB. **Do not pre-shrink images yourself**;
upload the best quality you have and let the system optimise it.

ប្រព័ន្ធបំប្លែងរូបក្របទៅជា WebP ដោយស្វ័យប្រវត្តិ។ **សូមកុំបង្រួមរូបភាពដោយខ្លួនឯង** —
សូមផ្ទុករូបភាពគុណភាពល្អបំផុត ហើយទុកឱ្យប្រព័ន្ធធ្វើការបង្រួម។

### 4.3 Before publishing / មុនពេលចេញផ្សាយ

1. Fill the metadata: title, author, subject, language, year, description.
   បំពេញព័ត៌មាន៖ ចំណងជើង អ្នកនិពន្ធ មុខវិជ្ជា ភាសា ឆ្នាំ និងការពិពណ៌នា។
2. Check **`/admin/data-quality`** — it will tell you which missing field costs
   the most. ពិនិត្យទំព័រគុណភាព Metadata។
3. Set the licence. **This matters:** published items with a public licence are
   exposed to academic harvesters (BASE, CORE, OpenAIRE) through the OAI-PMH
   feed at `/api/oai`, and to Google. Do not publish material you do not have
   the right to distribute.
   កំណត់អាជ្ញាបណ្ណ។ **រឿងនេះសំខាន់៖** ឯកសារដែលចេញផ្សាយជាមួយអាជ្ញាបណ្ណសាធារណៈ
   ត្រូវបានផ្សព្វផ្សាយទៅកាន់ប្រព័ន្ធស្រាវជ្រាវអន្តរជាតិ។ សូមកុំចេញផ្សាយឯកសារ
   ដែលអ្នកគ្មានសិទ្ធិចែកចាយ។
4. Save as draft or schedule, then publish. រក្សាទុកជា Draft រួចចេញផ្សាយ។

---

## 5. Backup verification / ការផ្ទៀងផ្ទាត់ការបម្រុងទុក

Full policy: `docs/BACKUP-DR.md` (English) and `docs/km/BACKUP-DR.md` (ខ្មែរ).
The commands below are the routine an operator should actually run.

គោលការណ៍ពេញលេញ៖ `docs/km/BACKUP-DR.md`។

### 5.1 Daily / ប្រចាំថ្ងៃ

The nightly cron already runs the backup. Your daily job is to **confirm it
succeeded** — a backup nobody checks is not a backup.
Cron រត់រាល់យប់រួចហើយ។ ភារកិច្ចរបស់អ្នកគឺ **ផ្ទៀងផ្ទាត់ថាវាបានជោគជ័យ**។

```bash
# 1. Was a new archive created today? / មាន Archive ថ្មីថ្ងៃនេះទេ?
ls -td ~/ptec-backups/db/*/ | head -3

# 2. Verify the newest archive's checksums / ផ្ទៀងផ្ទាត់ Checksum
node scripts/backup/verify-backup.mjs "$(ls -td ~/ptec-backups/db/*/ | head -1)"
```

Expect a line like `OK: 97 tables, 34736 rows verified`. Any other output, or a
non-zero exit code, means **escalate**.
លទ្ធផលត្រូវតែជា `OK: ... verified`។ បើមិនដូច្នេះទេ សូមរាយការណ៍ជាបន្ទាន់។

### 5.2 Weekly / ប្រចាំសប្តាហ៍

```bash
# Full backup including derived tables / បម្រុងទុកពេញលេញ
node scripts/backup/backup-db.mjs --full
node scripts/backup/verify-backup.mjs "$(ls -td ~/ptec-backups/db/*/ | head -1)"

# Restore drill — proves the archive can actually be restored, not just read
# សាកល្បងស្តារឡើងវិញ — បញ្ជាក់ថា Archive អាចប្រើការបានពិតប្រាកដ
node scripts/backup/restore-drill.mjs
```

Also confirm weekly / សូមពិនិត្យផងដែរ:

- A copy exists on a **second device**, not only this machine (3-2-1 rule).
  មានច្បាប់ចម្លងលើ **ឧបករណ៍ទីពីរ** មិនមែនតែលើម៉ាស៊ីននេះទេ។
- `BACKUP_PASSPHRASE` is set, so archives are encrypted. Without it the backup
  contains user data in clear text.
  `BACKUP_PASSPHRASE` ត្រូវបានកំណត់ ដើម្បីឱ្យ Archive ត្រូវបានអ៊ិនគ្រីប។
- Prune old archives: keep 7 daily, 4 weekly, 6 monthly.
  លុប Archive ចាស់៖ ទុក ៧ ថ្ងៃ ៤ សប្តាហ៍ និង ៦ ខែ។

### 5.3 What the backup does and does not cover / អ្វីដែលរាប់បញ្ចូល និងមិនរាប់បញ្ចូល

**Covered / រាប់បញ្ចូល:** all database tables — books, users, reviews, settings,
audit logs, analytics. ទិន្នន័យក្នុង Database ទាំងអស់។

**Not covered by this script / មិនរាប់បញ្ចូល:** the **PDF and image files
themselves**, which live in Zima Storage. Those need their own `rsync`/restic
snapshot to a second disk. This distinction matters — the database backup
records that a book exists and where its file is, but it does not contain the
file. **ឯកសារ PDF និងរូបភាព** មិនត្រូវបានរាប់បញ្ចូលក្នុង Script នេះទេ។
ពួកវាត្រូវការការបម្រុងទុកដោយឡែក។

---

## 6. Routine health checks / ការពិនិត្យសុខភាពប្រព័ន្ធ

| Check | Command / URL | Expected / លទ្ធផលរំពឹងទុក |
|---|---|---|
| Site up / គេហទំព័រដំណើរការ | `/api/health` | `{"status":"ok","checks":{"db":"ok","storage":"ok"}}` |
| Broken files / ឯកសារខូច | `npx tsx scripts/check-file-health.ts` | `0 broken` |
| Search embeddings | `npx tsx scripts/embed-library.ts` | all records embedded |

Run the file-health sweep **monthly**, and always after a bulk upload. It
catches PDFs and covers whose files have gone missing from storage before a
reader does. សូមរត់ការត្រួតពិនិត្យឯកសារ **ប្រចាំខែ** និងក្រោយពេលផ្ទុកឯកសារច្រើន។

---

## 7. Getting help / ការស្នើសុំជំនួយ

1. Check `/api/health` first — it separates "site down" from "one page broken".
   ពិនិត្យ `/api/health` ជាមុនសិន។
2. Check `/admin/logs` — it records who changed what and when.
   ពិនិត្យ `/admin/logs`។
3. Operational runbooks: `docs/RUNBOOKS.md` and `docs/km/RUNBOOKS.md`.
   សៀវភៅណែនាំប្រតិបត្តិការ។
4. Incident response and alerts: `docs/MONITORING.md`, `docs/ALERT-CATALOG.md`.
   ការឆ្លើយតបនឹងឧប្បត្តិហេតុ។
