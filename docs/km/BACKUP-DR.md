# ការបម្រុងទុក និងការសង្គ្រោះប្រព័ន្ធ (Backup & Disaster Recovery)

_បានបង្កើតនៅថ្ងៃទី ១២ ខែកក្កដា ឆ្នាំ២០២៦ (ការងារទី ២ ក្នុងផែនការ)។ ជំនួសសេចក្តីព្រាងនៅក្នុង `SECURITY-OPS.md` §3–5 (រក្សាទុកតែជំហានផ្ទាំងគ្រប់គ្រងប៉ុណ្ណោះ)។ ឧបករណ៍ (Tooling): `scripts/backup/*.mjs`។ ភស្តុតាងសាកល្បង: `docs/drills/`។_

## 1. ការរចនាតាមស្តង់ដារ 3-2-1

ច្បាប់ចម្លង ៣, ប្រភេទឧបករណ៍ផ្ទុក ២, លាក់ទុកក្រៅប្រព័ន្ធ ១ — សម្រាប់ទិន្នន័យគ្រប់ថ្នាក់៖

| ទិន្នន័យ | ច្បាប់ចម្លង 1 (កំពុងប្រើ) | ច្បាប់ចម្លង 2 | ច្បាប់ចម្លង 3 (ក្រៅប្រព័ន្ធ/ឯកោ) |
|---|---|---|---|
| **Database** (Metadata, អ្នកប្រើ, របាយការណ៍) | Supabase hosted Postgres | Supabase គ្រប់គ្រងការ Backup ប្រចាំថ្ងៃ | `backup-db.mjs` លទ្ធផលជា JSONL រក្សាទុកក្នុងម៉ាស៊ីន (Operator), បន្ទាប់មកចម្លងទៅកាន់កន្លែងទីពីរ (External disk ឬ R2 bucket ឯកជន) |
| **ឯកសារ** (PDFs, រូបក្រប) លើ Zima | ថតផ្ទុកទិន្នន័យរបស់ Zima Storage | `rsync`/restic ធ្វើឡើងរាល់យប់ ទៅកាន់ Disk ទីពីរ **នៅលើម៉ាស៊ីនផ្សេង** (box cron — §3) | ផ្ញើទៅកាន់ R2 bucket ឯកជន (Encrypted) រាល់សប្តាហ៍ |
| **ឯកសារចាស់ៗលើ R2** | R2 bucket | ចម្លងតាមជំនាន់ក្នុង R2 (Object versioning) | ផ្ញើទៅទុកជាមួយក្នុងពេល sweep រាល់សប្តាហ៍ បើអាច |
| **ការកំណត់ / លេខកូដសម្ងាត់** | Vercel/box env | ក្នុងកម្មវិធី Password-manager (ជាតម្លៃពិត) | រក្សាទុកត្រឹម ឈ្មោះ + លេខកូដតម្លៃបម្លែងរួច (Hashes) **ដាច់ខាតមិនទុកតម្លៃពិតទេ** ភ្ជាប់ជាមួយ DB archive |
| **កូដ (Code)** | Working tree | GitHub remote | ក្នុងកុំព្យូទ័រដែលបាន Clone |
| **ការកំណត់ហេដ្ឋារចនាសម្ព័ន្ធ** | គណនី Cloudflare | ឯកសារ `ZIMAOS-DEPLOYMENT.md` + `DDOS-PROTECTION.md` | Screenshot រាល់ពេលមានការផ្លាស់ប្តូរ (ការងារប្រចាំត្រីមាស) |

ទិន្នន័យដែលទាញចេញ (Derived data) មិនត្រូវបានចាត់ចូលក្នុង RPO ទេ៖ ដូចជា `book_pages`, `book_chunks`, `books.embedding` (អាចទាញចេញពី PDF តាមរយៈ `scripts/extract-pdf-text.ts` និង `scripts/embed-library.ts`); ចំណែក `rate_limit` និង caches ជារបស់មិនចាំបាច់ទុកទេ។

## 2. គោលដៅ (Targets)

| រង្វាស់ | គោលដៅ | មូលដ្ឋាន |
|---|---|---|
| **RPO — database** | ≤ ២៤ ម៉ោង (≤ ១ ម៉ោង ពេលមានការកែប្រែច្រើន) | Backup តាម Script រាល់យប់ + Supabase ប្រចាំថ្ងៃ |
| **RPO — ឯកសារ** | ≤ ២៤ ម៉ោង | `rsync` រាល់យប់ |
| **RTO — ខូច Table មួយ / កែខុស** | ≤ ១ ម៉ោង | ទាញយកតម្លៃមកវិញពី JSONL ឬ `content_versions` |
| **RTO — បាត់បង់ Database ទាំងស្រុង** | ≤ ៤ ម៉ោង | បង្កើត Supabase ថ្មី + ដំណើរការ Migrations + ទាញ JSONL បញ្ចូលវិញ (ចំណាយពេលត្រឹម **~៦ វិនាទី** សំរាប់ទិន្នន័យ; យូរតែរៀបចំ Project ទេ) |
| **RTO — បាត់បង់ Platform ទាំងមូល** | ≤ ១ ថ្ងៃធ្វើការ | រួមបញ្ចូលគ្នា: DB (≤៤ ម៉ោង) + ទាញ Storage (អាស្រ័យលើទំហំ) + Env (≤៣០ នាទី) + Redeploy/DNS (≤១ ម៉ោង) |
| **ការរក្សាទុក (Retention)** | ៧ ថ្ងៃ + ៤ សប្តាហ៍ + ៦ ខែ | លុបចោលតាម Script (§3) |
| **ម្ចាស់ការ** | WL (DB/config), BO (ឯកសារ), នាយក (អនុម័តគោលការណ៍) | សូមមើល OPERATIONS-AUDIT.md §5 |

## 3. ការកំណត់កាលវិភាគ (Schedules - cron)

នៅលើម៉ាស៊ីន (ZimaOS box):

```cron
# Backup DB រាល់យប់ + ពិនិត្យភាពត្រឹមត្រូវ (ម៉ោង ០៣:១០)
10 3 * * * cd /path/to/e-library-ptec && node scripts/backup/backup-db.mjs \
  && node scripts/backup/verify-backup.mjs "$(ls -d ~/ptec-backups/db/*/ | tail -1)" \
  || echo "PTEC BACKUP FAILED" | mail -s "PTEC backup failure" <ops-email>

# ស្តុក Storage រាល់យប់ + ពិនិត្យការតភ្ជាប់ (ម៉ោង ០៣:៤០)
40 3 * * * cd /path/to/e-library-ptec && node scripts/backup/backup-storage-inventory.mjs

# Fingerprint ការកំណត់រាល់សប្តាហ៍ (ថ្ងៃអាទិត្យ ម៉ោង ០៤:០០)
0 4 * * 0 cd /path/to/e-library-ptec && node scripts/backup/backup-config.mjs

# Backup ឯកសាររាល់យប់នៅលើ Zima box (ម៉ោង ០៤:១០) — disk ទី២
10 4 * * * rsync -a --delete /zima/data/ /mnt/backup-disk/zima-mirror/ && date > /mnt/backup-disk/zima-mirror/.last-ok

# ការធ្វើតេស្តសាកល្បងរាល់ត្រីមាស
# node scripts/backup/restore-drill.mjs
```

## 4. ស្ថានភាពសុវត្ថិភាព (Security posture)

- **ការធ្វើកូដនីយកម្មតាមបណ្តាញ (Encryption in transit)**: រាល់ការបញ្ជូនគឺតាមរយៈ HTTPS ឬ SSH ។
- **ការធ្វើកូដនីយកម្មទិន្នន័យស្តុក (Encryption at rest)**: កំណត់ `BACKUP_PASSPHRASE` ក្នុង `.env` — រាល់ឯកសារទាំងអស់ត្រូវចាក់សោរតាមស្តង់ដារ AES-256-GCM។
- **សិទ្ធិចូលប្រើ (Access)**: Backup ត្រូវបានរក្សាទុកក្នុង `~/ptec-backups` ហើយមិនស្ថិតក្នុង Repo កូដទេ ដើម្បីការពារការភ្លាត់ដៃ Commit។ App គ្មានសិទ្ធិលុប Backup បានទេ។
- **គ្មានកូដសម្ងាត់ក្នុង Backup**: កូដ DB មិនមានកូដសម្ងាត់ឡើយ; `backup-config.mjs` រក្សាទុកតែឈ្មោះ + SHA-256 ប៉ុណ្ណោះ។
- **ភាពត្រឹមត្រូវ (Integrity)**: Hash ពីរជាន់ ត្រូវបានត្រួតពិនិត្យដោយ `verify-backup.mjs` ។

## 5. ការតាមដាន និងការជូនដំណឹង (Monitoring & alerting)

- រាល់ Script សរសេរព័ត៌មានចូល `ops_events` មានដូចជា: `backup_db`, `backup_verify` (លោត ok, warn, fail)។
- `GET /api/health` ផ្តល់ព័ត៌មាន `backupAgeHours` ពីការ Backup ល្អចុងក្រោយបង្អស់។ (Alert បើលើស > ៣០ ម៉ោង)។
- Scripts នឹងបញ្ឈប់ពេលមានបញ្ហា ហើយផ្ញើអ៊ីមែល/webhook (failed-backup alert)។ ដាច់ខាតមិនត្រូវបិទសំឡេងវាទេ — ត្រូវជួសជុលបញ្ហាជាមុន។

## 6. នីតិវិធីនៃការសង្គ្រោះ (Restoration procedures)

### 6.1 ខុស Table មួយ / ខុស Migration មួយ
1. ប្រើ `node scripts/backup/restore-drill.mjs <archive>` ដើម្បីបញ្ជាក់ថា File Backup នៅល្អ។
2. ទាញទិន្នន័យដែលខូចចេញពី JSONL (`gunzip -c books.jsonl.gz | jq …`)។
3. ដាក់បញ្ចូលវិញតាម PostgREST PATCH ឬតាម SQL editor ។ សម្រាប់ការកែប្រែ Metadata គួរប្រើ `content_versions` restore ដែលមានក្នុង App ស្រាប់។

### 6.2 បាត់បង់ Database ទាំងមូល
1. បង្កើត Supabase project ថ្មី; Run `supabase/migrations/` តាមលំដាប់។
2. បញ្ចូលទិន្នន័យឡើងវិញពីឯកសារចុងក្រោយដែលត្រឹមត្រូវ។
3. ទាញយកគណនី: អ្នកប្រើប្រាស់ចុះឈ្មោះថ្មី ឬបញ្ចូលតាម Supabase Backup បើមាន។
4. កែសម្រួល Env ថ្មីៗ; ផ្ទៀងផ្ទាត់ជាមួយ Config fingerprint ថ្មីបំផុត។ Redeploy។
5. ទាញយកឯកសារ Derived data ឡើងវិញ: រត់ `extract-pdf-text.ts` និង `embed-library.ts`។
6. ធ្វើតេស្តសាកល្បងមុននឹងបើកឱ្យប្រើប្រាស់ជាផ្លូវការ។

### 6.3 បាត់បង់ Storage (Zima box)
1. ដំឡើង Storage ថ្មីពី Backup Snapshot ចុងក្រោយបំផុត។
2. ចង្អុល `ZIMA_API_URL` ទៅកាន់កន្លែងថ្មី — **ហាម** កែតំណភ្ជាប់ Database ពេលកំពុងដាច់បណ្តោះអាសន្ន។
3. ផ្ទៀងផ្ទាត់ជាមួយ `storage-inventory-*.json` ចុងក្រោយបំផុត។

### 6.4 បាត់បង់ Platform ទាំងមូល
អនុវត្តតាម `SECURITY-OPS.md` §5 ដោយយកលំដាប់ដូចជា: DB (6.2) → Storage (6.3) → Env/Deploy → DNS → ការបញ្ជាក់ (Validation)។

## 7. ការធ្វើតេស្តសាកល្បង (Drills)

- **កាលវិភាគ**: រាល់ត្រីមាស និងមុនពេលមានការផ្លាស់ប្តូរ (Migration) ធំៗ។
- **បរិស្ថានឯកោ (Isolation)**: `restore-drill.mjs` ធ្វើតេស្តទាញទិន្នន័យចូលក្នុង PGlite (Memory) ដែលមិនមានការតភ្ជាប់បណ្តាញទេ (មិនប៉ះពាល់ដល់ Production ឡើយ)។
- **ការត្រួតពិនិត្យ (Coverage)**: ភាពត្រឹមត្រូវ, Schema+Data, គណនី, មាតិកា, តំណភ្ជាប់ឯកសារ និងពេលវេលា។ របាយការណ៍នឹងរក្សាទុកក្នុង `docs/drills/`។
- **លទ្ធផលចុងក្រោយ**: `docs/drills/RESTORE-DRILL-2026-07-12.md` — **ជោគជ័យ (PASS)** (Restore ៦៤ tables និង ២៣០៩ ជួរក្នុងរយៈពេលត្រឹម ~៧ វិនាទី)។

## 8. ចំណុចខ្វះខាត / ការងារត្រូវបន្ត (Known gaps / follow-ups)

- Zima box rsync គឺជា **ដំណើរការលើម៉ាស៊ីនផ្ទាល់** មិនទាន់មានភស្តុតាងច្បាស់លាស់ក្នុង Repo នៅឡើយ។ (ត្រូវឆែក `.last-ok` ជាប្រចាំសប្តាហ៍សិន)។
- Supabase Managed-backup គឺអាស្រ័យលើ Plan ត្រូវត្រួតពិនិត្យឲ្យច្បាស់លាស់ជារៀងរាល់ខែ កុំទុកចិត្តទាំងស្រុង។
- ទិន្នន័យ `auth.users` មិនអាចទាញយកបានតាមរយៈ PostgREST ទេ ទាល់តែប្រើ Supabase Backup ផ្ទាល់។
