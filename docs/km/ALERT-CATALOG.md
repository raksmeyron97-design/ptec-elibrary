# កាតាឡុកនៃការជូនដំណឹងបញ្ហា (Alert Catalog)

_បានបង្កើតនៅថ្ងៃទី ១២ ខែកក្កដា ឆ្នាំ២០២៦ (ផែនការការងារទី ៥)។ នេះគឺជាបញ្ជីផ្លូវការ — គ្មានការជូនដំណឹងណាមួយមាន ឬអាចបន្ថែមបានទេ បើមិនមានបំពេញគ្រប់ជួរឈរ។ ការតាមដាន (Probes) និងការត្រង log ត្រូវបានកំណត់នៅក្នុង `MONITORING.md`; នីតិវិធីពេលមានអាសន្នមាននៅក្នុង `RUNBOOKS.md`។ អ្នកទទួលខុសត្រូវតាមលំនាំដើម៖ **WL** = ប្រធានក្រុមការងារវេប (web-team lead), **BO** = ម្ចាស់ម៉ាស៊ីន ZimaOS, **DIR** = នាយកបណ្ណាល័យ។_

## កម្រិតភាពធ្ងន់ធ្ងរ (Severity model)

| Sev | អត្ថន័យ | ការឆ្លើយតប | ឆានែលជូនដំណឹង |
|---|---|---|---|
| **1** | គាំងទាំងស្រុង ឬមានការជ្រៀតចូល (វេបសាយដាច់, DB ដាច់, គណនី Admin ត្រូវគេលួចចូល) | ដោះស្រាយភ្លាមៗ, ម៉ោងណាក៏ដោយ | ទូរស័ព្ទ/សារទៅ WL |
| **2** | ដំណើរការធ្លាក់ចុះខ្លាំង ឬហានិភ័យសុវត្ថិភាពខ្ពស់ (Storage ដាច់, ចូលគណនីបរាជ័យច្រើន, Backups មិនដំណើរការ) | ដោះស្រាយក្នុងថ្ងៃធ្វើការដដែល | សារ/អ៊ីមែលទៅ WL |
| **3** | ដំណើរការធ្លាក់ចុះមួយផ្នែក ឬបញ្ហាប្រតិបត្តិការ (មាន Error លើទំព័រមួយ, Disk ពេញ 80%, Captcha រំខានច្រើន) | ដោះស្រាយនៅថ្ងៃធ្វើការបន្ទាប់ / បង្កើត Ticket | អ៊ីមែល |
| **4** | ការព្រមាន ឬបញ្ហាថែទាំ (CSP ថ្មី, Cert សល់ < 30 ថ្ងៃ, ការប្រែប្រួលបន្តិចបន្តួច) | ត្រួតពិនិត្យប្រចាំសប្តាហ៍ | Dashboard/Digest |

## ដំណើរការទូទៅ និងហេដ្ឋារចនាសម្ព័ន្ធ (Availability & infrastructure)

| ការជូនដំណឹង (Alert) | គោលបំណង | ប្រភព | កម្រិតកំណត់ (Threshold) | Sev | អ្នកទទួលខុសត្រូវ | ការផ្អាកការជូនដំណឹង | ការរាយការណ៍បន្ត | សៀវភៅណែនាំ | លក្ខខណ្ឌសង្គ្រោះរួច |
|---|---|---|---|---|---|---|---|---|---|
| site-down | ចូលទំព័រដើមមិនបាន | External probe `GET /home` | បរាជ័យជាប់គ្នា ២ដង (≈២–១០ នាទី) | 1 | WL | កំណត់ម៉ោងថែទាំក្នុង monitor | BO បើខូច tunnel/box; DIR បើ > ២ម៉ោង | RUNBOOKS §I1 | probe ដើរវិញ ៥នាទី |
| dependency-degraded | DB ឬ Storage ខូច ខណៈ App នៅដើរ | Probe `GET /api/health` លោត 503 | ២ដងជាប់គ្នា | 1 (db) / 2 (storage) | WL | អំឡុងពេល site-down | ការគាំទ្រ Supabase / BO | §I2, §I3 | health 200 |
| dns-broken | Domain មិនដំណើរការ | External DNS check លើ `library.ptec.edu.kh` | មាន NXDOMAIN/SERVFAIL ណាមួយ | 1 | WL | គ្មាន | Registrar/Cloudflare support | §I1 ជំហាន DNS | ដំណើរការពីបណ្តាញ ២ |
| tls-expiry | Cert ជិតផុតកំណត់ | Monitor cert check | < ២១ ថ្ងៃ | 4 → 2 នៅ < ៧ ថ្ងៃ | WL/BO | គ្មាន | — | §M14 | cert > ៣០ ថ្ងៃ |
| tunnel-down | Cloudflared ងាប់ | Cloudflare tunnel status | គាំង "down" ៥ នាទី | 1 | BO | ពេលបិទថែទាំ box | WL | §I1 ជំហាន ២ | tunnel ដើរវិញ |
| origin-disk | Box disk ជិតពេញ | Box cron `df -h` | 80% (Sev 3) / 90% (Sev 2) | 3/2 | BO | គ្មាន | WL | §I7 | < 75% |
| db-capacity | Supabase disk/connections | Supabase dashboard alerts | 80% disk; error connection ក្នុង logs | 2 | WL | គ្មាន | សម្រេចចិត្តដំឡើង Plan → DIR | §I2 | < 70% |
| slow-queries | DB ដើរយឺត | `/api/health` ផ្នែក `latencyMs.db` | p95 > 1.5s រយៈពេល ១៥នាទី | 3 | WL | អំឡុងពេលភ្ញៀវចូលច្រើន | — | §I6 | p95 < 500ms |

## កម្មវិធី និងការងារកំណត់ពេល (Application & jobs)

| ការជូនដំណឹង (Alert) | គោលបំណង | ប្រភព | កម្រិតកំណត់ (Threshold) | Sev | អ្នកទទួលខុសត្រូវ | ការផ្អាកការជូនដំណឹង | ការរាយការណ៍បន្ត | សៀវភៅណែនាំ | លក្ខខណ្ឌសង្គ្រោះរួច |
|---|---|---|---|---|---|---|---|---|---|
| elevated-5xx | Error កើនឡើង | Logs: HTTP 5xx / `digest:` lines | > 10/ម៉ោង ឬ > 1% នៃសំណើ | 2 | WL | អំឡុងពេល Deploys (១៥នាទី) | Roll back ថយក្រោយវិញ | §I6 | < 2/ម៉ោង សម្រាប់ ១ម៉ោង |
| elevated-4xx | Scraping/broken links កើនឡើង | Logs: អត្រា 404/429 | កើន ៥ដង ធៀបនឹង ៧ថ្ងៃមុន រយៈពេល ៣០នាទី | 3 | WL | known crawler UAs | DDOS playbook បើត្រូវគេវាយប្រហារ | DDOS-PROTECTION.md | ត្រឡប់មកធម្មតា |
| pdf-unavailable | PDF សៀវភៅបើកមិនបាន | Probe: known PDF URL + `file_health` sweep | probe គាំង ២ដង ឬ > ៣ ខូចថ្មី | 2 | WL | ពេល storage-down | BO | §I4 | probe ដើរវិញ + ឯកសារល្អ |
| cron-missed | ការងារស្វ័យប្រវត្តិមិនរត់ | Cron pinger (healthchecks.io) | គ្មាន ping ២៦ ម៉ោង | 3 | WL | គ្មាន | — | §M2 | ទទួលបាន ping |
| queue-push-failures | web-push បញ្ជូនបរាជ័យ | Logs: push send failures | > 20% នៃការផ្ញើ | 3 | WL | គ្មាន | — | push runbook (0081 notes) | ការផ្ញើលើកក្រោយជោគជ័យ |
| upload-failures | Admin upload ឯកសារបរាជ័យ | Logs: 5xx លើ upload action | > 3/ម៉ោង | 3 | WL | អំឡុងពេល import ទិន្នន័យច្រើន | — | §I3 | Uploads ជោគជ័យ |
| contact-mail-failure | អ៊ីមែល Contact/auth ខូច | Logs: 5xx លើ `/api/contact` | ច្រើនជាប់គ្នា (2+ ក្នុង ១ម៉ោង) | 2 | WL | គ្មាន | ប្តូរ App-Password របស់ Gmail | §I5 | តេស្តផ្ញើអ៊ីមែលបានជោគជ័យ |

## ការបម្រុងទុក និងទិន្នន័យ (Backups & data)

| ការជូនដំណឹង (Alert) | គោលបំណង | ប្រភព | កម្រិតកំណត់ (Threshold) | Sev | អ្នកទទួលខុសត្រូវ | ការផ្អាកការជូនដំណឹង | ការរាយការណ៍បន្ត | សៀវភៅណែនាំ | លក្ខខណ្ឌសង្គ្រោះរួច |
|---|---|---|---|---|---|---|---|---|---|
| backup-failed | Backup ប្រចាំថ្ងៃបរាជ័យ | Cron exit ≠ 0 → mail/webhook; `ops_events` | ណាមួយ | 2 | WL | គ្មាន | — | §I17 | ដំណើរការលើកក្រោយ OK |
| backup-stale | Backup អត់រត់ដោយស្ងាត់ៗ | `/api/health` ផ្នែក `backupAgeHours` | > 30 ម៉ោង ឬ null | 2 | WL | ពេលម៉ាស៊ីន backup ប្រកាសបិទថែទាំ | — | §I17 | អាយុ < 24 ម៉ោង |
| backup-integrity | ឯកសារ Backup ខូច | ដំណើរការ `verify-backup.mjs` បរាជ័យ | ណាមួយ | 2 | WL | គ្មាន | Run សារថ្មីម្តងទៀត | §I17 | verify OK |
| file-snapshot-stale | Zima rsync ងាប់ | អាយុកាលកត់ត្រា `.last-ok` | > ៨ ថ្ងៃ | 2 | BO | គ្មាន | WL | BACKUP-DR §3 | មានកំណត់ត្រាថ្មី |
| drill-overdue | មិនមានធ្វើតេស្តសាកល្បង Backup ត្រីមាសនេះ | Calendar / `ops_events` kind=restore_drill | > 100 ថ្ងៃ | 4 | WL | គ្មាន | DIR | BACKUP-DR §7 | ទទួលបានលទ្ធផល PASS |
| data-quality-broken-files | Link ឯកសារខូច | លទ្ធផល `/admin/data-quality` | ឯកសារខូចថ្មី > 3 | 3 | WL | គ្មាន | — | data-quality dashboard | sweep clean |

## សុវត្ថិភាព (Security)

| ការជូនដំណឹង (Alert) | គោលបំណង | ប្រភព | កម្រិតកំណត់ (Threshold) | Sev | អ្នកទទួលខុសត្រូវ | ការផ្អាកការជូនដំណឹង | ការរាយការណ៍បន្ត | សៀវភៅណែនាំ | លក្ខខណ្ឌសង្គ្រោះរួច |
|---|---|---|---|---|---|---|---|---|---|
| admin-auth-anomaly | មានអ្នកព្យាយាមចូល / ហេកគណនី | `evt:security` `auth_forbidden`/`mfa_required` | > 10/ម៉ោង ពី User ឬ IP តែមួយ | 2 | WL | ពេល Pen-test | §I8 ភ្លាមៗបើគិតថាគេអាចចូលបាន | §I8 | ស្ងាត់ ២៤ម៉ោង |
| privilege-change | មានការផ្តល់សិទ្ធិធំជាងមុន | ក្នុង `admin_audit_log` ផ្នែក role-change | ការផ្តល់សិទ្ធិ admin/super_admin ណាមួយ | 3 (info) / 1 បើខុសប្រក្រតី | WL | មាន Ticket សុំផ្លាស់ប្តូរ | DIR | §I8/§M12 | ពិនិត្យ + យល់ព្រម |
| cron-secret-guessing | អ្នកព្យាយាមទាយលេខកូដ job endpoints | `evt:security` `cron_auth_failed` | ណាមួយ | 2 | WL | misconfig ខ្លួនឯងក្រោយ Deploy | ប្តូរ CRON_SECRET | §I10 | ស្ងាត់ ២៤ម៉ោង |
| malware-upload | មានឯកសារមេរោគត្រូវបានទប់ស្កាត់ | `virus_scan_blocked` / VirusTotal hit | ណាមួយ | 2 | WL | គ្មាន | §I12; DIR ប៉ះពាល់ឯកសារផុសហើយ | §I12 | លុបចោល + ស្កេនម្តងទៀតស្អាត |
| captcha-storm | មាន Bot ទម្លាក់សំណើច្រើនលើ Form | `captcha_failed` | > 50/ម៉ោង | 3 | WL | គ្មាន | DDOS playbook | DDOS-PROTECTION.md | < 10/ម៉ោង |
| rate-limit-storm | ការរំលោភបំពាន/ការទាញយករាប់រយ | `rate_limited` | > 100/ម៉ោង | 2 | WL | ការតេស្តទម្លាក់បន្ទុក (Load test) | DDOS playbook / បើក env តឹងរ៉ឹង | §I13 | < 20/ម៉ោង |
| waf-spike | ការវាយប្រហារនៅគែមបណ្តាញ (Edge attack) | Cloudflare Security Events | ១០ដង នៃបន្ទុកធម្មតា | 3 → 2 ជាប់គ្នា | WL | គ្មាន | បើកមុខងារ Under Attack Mode | DDOS-PROTECTION.md | បន្ទុកធម្មតា ២ម៉ោង |
| csp-novel-violation | ការជ្រៀតចូលថ្មីតាម (Injection vector) | `/api/csp-report` | កើតឡើងលើកដំបូង | 4 | WL | extension នៅក្នុង Browser | — | SECURITY-HEADERS.md | បានពិនិត្យ |
| dependency-vuln | មានចន្លោះប្រហោងសុវត្ថិភាពលើ Prod | CI `npm audit` + dependency-review | ខ្ពស់/ធ្ងន់ធ្ងរ | 3 | WL | បញ្ជីហានិភ័យដែលព្រមទទួលយក | — | §M5 | CI ដើរធម្មតា |
| secret-in-history | លេចធ្លាយលេខកូដសម្ងាត់ | gitleaks CI | ណាមួយ | 1 | WL | គ្មាន | ប្តូរលេខកូដសិន, ទើបកែប្រវត្តិ | §I10 | ប្តូររួច + ស្កេនស្អាតល្អ |

## វិធានអនាម័យនៃការជូនដំណឹង (ដើម្បីកុំឲ្យរំខានពេក)
1. **ការដាក់ជាក្រុម (Grouping)**: dependency-degraded គឺជាកូនចៅរបស់ site-down; pdf-unavailable គឺជាកូនចៅរបស់ storage checks — បើបញ្ហាធំ (មេ) លោតហើយ វានឹងលាក់បញ្ហាតូចៗ (កូនចៅ) មិនឲ្យលោតរំខានទេ។
2. **ការកាត់ស្ទួន (Dedupe)**: Monitors លោតប្រាប់តែពេលមាន *ការផ្លាស់ប្តូរស្ថានភាព* ប៉ុណ្ណោះ មិនមែនលោតរាល់ពេលដែលឆែកឃើញ Error ម្តងៗនោះទេ។
3. **ម៉ោងថែទាំប្រព័ន្ធ (Maintenance windows)**: កំណត់ម៉ោងថែទាំក្នុង monitor មុនពេលធ្វើការងារធំៗ — កុំបិទ Alert ចោលដោយគ្មានហេតុផល។
4. **មិនមានការលោតប្រាប់រាល់ Error របស់អ្នកប្រើប្រាស់ទេ**: Error 404 ម្តងម្កាល, ការវាយ Password ខុសពីរបីដង, គ្រាន់តែជាទិន្នន័យក្នុង Dashboard ប៉ុណ្ណោះ មិនមែនជាការជូនដំណឹង (Alert) ទេ។
5. **ការត្រួតពិនិត្យប្រចាំខែ**: នៅថ្ងៃច័ន្ទទី១ នៃខែនីមួយៗ — កែសម្រួល Alert ណាដែលលោតជាង ៣ដង តែគ្មានអ្នកអើពើ (អាចដំឡើង Threshold ឬដោះស្រាយបញ្ហាឫសគល់; ហាមបិទចោលដោយស្ងាត់ៗ)។
6. **មិនបញ្ចេញពត៌មានផ្ទាល់ខ្លួន ឬកូដសម្ងាត់ (No secrets/PII)**: ការជូនដំណឹងគ្រាន់តែប្រាប់ចំនួន តំណភ្ជាប់ទៅកាន់ Dashboard តែប៉ុណ្ណោះ — ហាមមិនឲ្យបង្ហាញ Token, Password, អត្ថបទសារ ឬ IP ឡើយ។
