# ផែនការដាក់ឱ្យដំណើរការ និងការថយក្រោយវិញ (Deployment & Rollback Plan — ដំណាក់កាលអភិបាលកិច្ច និងប្រតិបត្តិការ)

_បានបង្កើតនៅថ្ងៃទី ១២ ខែកក្កដា ឆ្នាំ២០២៦។ គ្រប់ដណ្តប់លើការផ្លាស់ប្តូរទិន្នន័យ (Migrations) 0086–0088 និងកូដដែលបានធ្វើក្នុងដំណាក់កាល ៣០–៦០ ថ្ងៃ ផ្នែកភាពជឿជាក់/អភិបាលកិច្ច។ សូមអាន `RUNBOOKS.md` §M6/§M7/§M8 សម្រាប់នីតិវិធីទូទៅ; ឯកសារនេះគឺសម្រាប់ដំណាក់កាលនេះតែម្តង។_

## អ្វីដែលត្រូវបញ្ចេញ (What ships)

| ផ្នែក (Area) | កូដ (មានសុវត្ថិភាពមុនពេល Migration) | Migration (អ្នកថែទាំជាអ្នករត់) |
|---|---|---|
| ការផ្ទៀងផ្ទាត់ទិន្នន័យ | `lib/content-status.ts`, `lib/metadata-quality.ts`, `app/actions/review.ts`, `app/actions/content-versions.ts`, ដំឡើង `/admin/review` ថ្មី | **0086** — វាក្យសព្ទ status, ជួរឈរប្រវត្តិ, books sync trigger, `content_versions` |
| អភិបាលកិច្ចការស្វែងរក | `lib/search/analytics.ts`, `/api/search/native` (តម្រង bot, session hash, សទិសន័យ, រៀបចំទុក), មុខងារ `search-insights` + action center | **0087** — `search_term_actions`, `search_synonyms`, `search_curated_results`, `session_hash`, អនុគមន៍ retention |
| ការទាញចេញទិន្នន័យ | `lib/exports/*`, `/api/export/*`, OAI ទាមទារផ្ទៀងផ្ទាត់សិន | គ្មាន (ទាញពីជួរឈរមានស្រាប់) |
| Backup និង ការតាមដាន | `scripts/backup/*`, `/api/health` ផ្នែកសុវត្ថិភាព, ដំឡើង retention កូដ cron | **0088** — `ops_events` |
| ឯកសារ (Docs) | `OPERATIONS-AUDIT`, `BACKUP-DR`, `ALERT-CATALOG`, `RUNBOOKS`, `DATA-GOVERNANCE`, `METADATA-EXPORTS`, `TABLETOP-EXERCISES` | — |

## លំដាប់លំដោយនៃការដាក់កូដ (Deploy order - កូដមុន — គ្រប់យ៉ាងនៅដើរធម្មតា)

កូដត្រូវបានសរសេរឡើងដើម្បីឱ្យដំណើរការ **មុនពេល** មានការផ្លាស់ប្តូរទិន្នន័យ (Migrations) ដោយប្រើបច្ចេកទេសជំនួសចាស់/ថ្មី (ដូចកាលធ្វើ 0062)។ ដូច្នេះ៖

1. **បញ្ចូល និងដាក់ឱ្យប្រើប្រាស់កូដ (Merge + deploy code)** (RUNBOOKS §M7)។ មុនពេលមាន Migrations៖
   - ប្រព័ន្ធ Review queue នឹងនៅតែដើរជាមួយលក្ខខណ្ឌចាស់ (draft/pending/rejected) ដដែល។
   - កំណត់ត្រាស្វែងរកនឹងមិនមាន `session_hash`; ឯសទិសន័យ/ការរៀបចំទុក នឹងស្ងាត់ៗអត់ដើរ។
   - មុខងារ Export នឹងទាញយកតែឯកសារមានការ "ផ្ទៀងផ្ទាត់-verified" ប៉ុណ្ណោះ។
   - `/api/health` ផ្នែកសុវត្ថិភាពនឹងបង្ហាញ `backupAgeHours: null` (អត់ដឹង)។
   - Script សម្រាប់ Backup នឹងរត់ហើយលោតពាក្យព្រមានថា `ops_events` អត់មានកត់ត្រាទេ។
2. **Back up ជាមុនសិន**: រត់ `node scripts/backup/backup-db.mjs` (RUNBOOKS §M6.2)។
3. **អនុវត្ត Migrations តាមលំដាប់** នៅលើកន្លែងកូដ SQL (hosted SQL editor): 0086 → 0087 → 0088 ។ Migration នីមួយៗសុទ្ធតែមានកត់ត្រាពីរបៀបថយក្រោយ (rollback notes) នៅក្នុងចំណងជើងរបស់វា។ ចម្លងលទ្ធផលទុកក្នុងកំណត់ត្រា deploy។
4. **ផ្ទៀងផ្ទាត់ក្រោយពេល Migration**:
   - `/admin/review`: មាន status filter ថ្មីៗ + ពិន្ទុគុណភាព + មើលប្រវត្តិឯកសារបាន; សាកល្បង បញ្ជូនសំណើ → ផ្ទៀងផ្ទាត់ → បោះពុម្ព; ហើយបញ្ជាក់ថាបណ្ណារក្សមិនអាចអនុម័តសំណើរបស់ខ្លួនឯងបានទេ (បង្កើតគណនីមួយ, ផ្ទៀងផ្ទាត់ដោយគណនីមួយទៀត)។
   - `/admin/search-insights`: មជ្ឈមណ្ឌលសកម្មភាពបង្ហាញក្រុមពាក្យដែលរកមិនឃើញ; បន្ថែមសទិសន័យមួយ; បញ្ជាក់ថាវាដំណើរការតែនៅពេលមានអ្នករកពាក្យនោះមិនឃើញ។
   - `curl /api/export/theses?format=dc-xml | head` នឹងបញ្ចេញលទ្ធផល។
   - ផ្នែក `/api/health` ពេលនេះនឹងបង្ហាញជាតួលេខ `backupAgeHours`។
   - រត់ `node scripts/backup/restore-drill.mjs` → នឹងចេញ PASS។
5. **ភ្ជាប់ការងារ cron** (បើមិនទាន់ភ្ជាប់): ឥឡូវនេះ `/api/cron/cleanup` នឹងដំណើរការការលុបទិន្នន័យចាស់ៗ ២កន្លែងផងដែរ; រៀងរាល់យប់មាន `backup-db.mjs` + `verify-backup.mjs`។
6. **កំណត់រចនាសម្ព័ន្ធការជូនដំណឹង (Configure alerts)** យោងតាម `ALERT-CATALOG.md` (យ៉ាងហោចណាស់មាន: site-down, dependency-degraded, backup-stale, admin-auth-anomaly)។

## ការថយក្រោយវិញ (Rollback)

- **ចំពោះកូដ**: ធ្វើតាមការ rollback ធម្មតា (§M8)។ កូដនេះអាចប្រើបានទាំងមុន និងក្រោយពេល Migration ដូច្នេះការ rollback កូដនៅក្រោយពេល Migration គឺនៅតែមានសុវត្ថិភាពដដែល។
- **0088**: ប្រើកូដ `drop table public.ops_events;` — គ្មានអ្វីផ្សេងទៀតពឹងផ្អែកលើវាទេ។
- **0087**: លុប `search_term_actions`, `search_synonyms`, `search_curated_results`, `purge_search_analytics`, និងជួរឈរ `search_queries.session_hash`។ មិនមានការបាត់បង់ទិន្នន័យអ្វីឡើយ ក្រៅពីទិន្នន័យដែលយើងរៀបចំទុក។
- **0086**: លុប triggers ទាំង ៣ `*_capture_version` + តារាង `content_versions` + `capture_content_version` + `purge_content_versions`; ស្តារច្បាប់ constraints ពី 0061/0075 មកវិញ; ចង្អុល trigger សៀវភៅទៅ `public.sync_publish_status` វិញ។ ជួរឈរប្រវត្តិ (Provenance) អាចទុកក៏បាន (អត់បញ្ហា) ឬលុបក៏បាន។ ទិន្នន័យមាតិកានឹងមិនត្រូវកែប្រែក្នុងទិសដៅណាមួយឡើយ។
- ដោយសារតែ Migration នីមួយៗអាចថយក្រោយបានដោយឯករាជ្យ អ្នកអាច rollback មួយណាដែលថ្មីបំផុតដោយមិនប៉ះពាល់ដល់មួយផ្សេងទៀត។

## ហានិភ័យនៅសេសសល់ក្រោយដំណាក់កាលនេះ

សូមមើល `OPERATIONS-AUDIT.md` §7 (បញ្ជីហានិភ័យ) និង ការងារបន្តនៅបើកចំហក្នុង `TABLETOP-EXERCISES.md`។ ការងារសំខាន់ៗ៖
- **F1 (អាទិភាព)**: មានគណនី Admin តែ១ គត់ដែលកំពុងប្រើ — ត្រូវបង្កើតគណនី Admin ទី២ ជាបន្ទាន់ទុកគ្រាន់ប្រើពេលមានអាសន្ន។
- **F2**: បញ្ជាក់ថា Zima file-snapshot cron ពិតជាកំពុងរត់។
- **F6**: អនុវត្ត 0086–0088 (គឺជាផែនការក្នុងឯកសារនេះផ្ទាល់)។
- ការលុបចោលទាំងស្រុង (Hard deletes) មិនមានកត់ត្រាប្រវត្តិទេ (TT-5) — កូដតម្រូវឲ្យប្រើការ "archive" ជាជាងលុប; ការ archive រាល់យប់គឺជាស្រទាប់សង្គ្រោះទិន្នន័យរហូតដល់មាន Migration 0089 ជាជម្រើស។
