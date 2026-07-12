# របាយការណ៍សាកល្បងសង្គ្រោះទិន្នន័យ (Restore Drill: 2026-07-12)

**ប្រភេទ**: ការសាកល្បងសង្គ្រោះ Database ស្វ័យប្រវត្តិ
**ឧបករណ៍**: `scripts/backup/restore-drill.mjs`
**គោលដៅ**: PGlite (ក្នុង Memory)

## លទ្ធផល៖ ជោគជ័យ (PASS) 🟢

```
[RESTORE DRILL] Starting automated backup verification...
[RESTORE DRILL] Using latest archive: ~/ptec-backups/db/2026-07-12-0310/
[RESTORE DRILL] Loading schema into PGlite...
[RESTORE DRILL] Schema loaded (64 tables).
[RESTORE DRILL] Inserting data from JSONL...
[RESTORE DRILL] Data insert complete (2309 rows).
[RESTORE DRILL] Running validation checks...
  ✓ Admin accounts exist
  ✓ Metadata tables populated
  ✓ RLS policies active
[RESTORE DRILL] Validation passed in 7.12s.
```

## ចំណុចត្រូវតាមដាន

- **រយៈពេល (Speed)**: ការប្រើប្រាស់ `PGlite` គឺលឿនខ្លាំងណាស់ តែវាគ្រាន់តែជាការធ្វើតេស្តក្នុង Memory ប៉ុណ្ណោះ។ ពេលសង្គ្រោះពិតប្រាកដទៅកាន់ Cloud នឹងយូរជាងនេះ។ គោលដៅ RTO របស់ Database (៤ ម៉ោង) គឺនៅតែអាចសម្រេចបាន។
- **ទិន្នន័យ Auth**: ទិន្នន័យ `auth.users` មិនមាននៅក្នុង JSONL ទេ។ វាត្រូវការ Backup ចេញពី Supabase ផ្ទាល់ ទើបមានសុវត្ថិភាពពេញលេញ។
