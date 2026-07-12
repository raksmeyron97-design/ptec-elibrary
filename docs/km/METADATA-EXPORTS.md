# ការទាញចេញទិន្នន័យ (Metadata Exports — Schema & Contract)

_បានបង្កើតនៅថ្ងៃទី ១២ ខែកក្កដា ឆ្នាំ២០២៦ (ការងារទី ៤ ក្នុងផែនការ)។ កូដ: `lib/exports/scholarly.ts` (pure formatters, មាន unit-test), `lib/exports/works.ts` (ទាញយក + ត្រួតពិនិត្យ), `app/api/export/`។ ឯកសារពាក់ព័ន្ធ: `oai-pmh-registration.md` (OAI-PMH endpoint)។_

## ចំណុចប្រទាក់ (Endpoints)

| ចំណុចប្រទាក់ | គោលបំណង |
|---|---|
| `GET /api/export/{type}` | ទាញទិន្នន័យច្រើន។ `type` អាចជា `books`, `theses`, `publications` |
| `GET /api/export/{type}/{slug}` | ទាញទិន្នន័យឯកសារមួយ |
| `GET /api/oai?verb=…` | OAI-PMH v2.0 (`oai_dc`), សម្រាប់អ្នកចុះឈ្មោះប្រមូលទិន្នន័យ |

ប៉ារ៉ាម៉ែត្រ (Query parameters): `format` (ខាងក្រោម, លំនាំដើម `csl-json`), `page` (≥1), `pageSize` (1–100, លំនាំដើម 50)។ ការតម្រៀបតាមលំដាប់លំដោយគឺច្បាស់លាស់ (អក្ខរក្រម slug) ដូច្នេះទំព័រនីមួយៗនឹងមិនរត់ខុសគ្នាទេ។

## ទម្រង់ទិន្នន័យ (Formats)

| `format` | Content-Type | កំណត់សម្គាល់ |
|---|---|---|
| `csl-json` | `application/vnd.citationstyles.csl+json` | សម្រាប់ Citation Style Language។ ឈ្មោះអ្នកនិពន្ធគឺ `literal` — ឈ្មោះខ្មែរគ្មានការបែងចែកនាមត្រកូល/នាមខ្លួនទេ។ |
| `dc-json` | `application/json` | ធាតុ Dublin Core ដែលមាន `dc:` នៅខាងមុខ; ធាតុដែលស្ទួនគ្នា គឺជា arrays។ |
| `dc-xml` | `application/xml` | Dublin Core នៅក្នុងទម្រង់ `oai_dc` (ដូចគ្នាទៅនឹងអ្វីដែល OAI ផ្តល់ឱ្យ; បានពិនិត្យតាមរយៈ `lib/exports/scholarly.test.ts`)។ |
| `bibtex` | `application/x-bibtex` | ដូចគ្នាទៅនឹងប៊ូតុង "Cite this" លើទំព័រ (LaTeX-escaped, បានធ្វើតេស្តក្នុង `lib/citations.test.ts`)។ ឯកសារមួយទាញជា `{slug}.bib`។ |
| `ris` | `application/x-research-info-systems` | ឯកសារមួយទាញជា `{slug}.ris`។ |

**អ្វីដែលមិនមានដោយចេតនា**: ទម្រង់ "DataCite"។ DataCite ទាមទារ DOI ចុះឈ្មោះត្រឹមត្រូវ និងទិន្នន័យកំហិតមួយចំនួនដែលឯកសារយើងភាគច្រើនអត់មាន; ការអះអាងថាមានស្តង់ដារទាំងដែលអត់បានពិនិត្យត្រឹមត្រូវ គឺជាការកុហក។ អាចគិតគូរឡើងវិញ បើ PTEC ចុះឈ្មោះ DOI នាពេលក្រោយ។

## ការតម្រូវទិន្នន័យ (Field mapping)

ទិន្នន័យដែលអាចទាញបាន (នឹងបាត់បើឯកសារអត់មាន)៖
ចំណងជើង, អ្នកនិពន្ធ, អ្នករួមចំណែក (ទីប្រឹក្សាសារណា), ស្ថាប័ន, ដេប៉ាតឺម៉ង់, កម្មវិធីសិក្សា, ថ្ងៃ/ឆ្នាំបោះពុម្ព, ប្រភេទធនធាន, ភាសា, មូលវិចារ (Abstract), ពាក្យគន្លឹះ, URL ទំព័រដើម (ជានិច្ច; ជាអត្តសញ្ញាណចម្បង), URL ឯកសារ (proxy ទាញយកដែលបានកត់ត្រា និងគ្រប់គ្រងសិទ្ធិ — មិនមែន URL ផ្ទាល់ទេ), ទម្រង់, DOI, ISBN, សិទ្ធិ/អាជ្ញាប័ណ្ណ, ទស្សនាវដ្តី/ភាគ/លេខ/ទំព័រ (សម្រាប់ការបោះពុម្ព), ម៉ោងពេលកែប្រែចុងក្រោយ។

## ច្បាប់ទាញយកទិន្នន័យ (Gating — the authoritative-feed contract)

- **ត្រូវបានអនុញ្ញាត**: ឯកសារដែល `published` (បានបោះពុម្ព) **និងបានផ្ទៀងផ្ទាត់ (verified)** (`verified_at IS NOT NULL`, បញ្ជាក់ដោយបណ្ណារក្ស — សូមមើល migration 0086 និង `/admin/review`)។
- **Publications (ការបោះពុម្ពអត្ថបទ)**: ទាមទារត្រឹម `is_published` ប៉ុណ្ណោះ — ផ្នែកបោះពុម្ពអត្ថបទមានដំណើរការត្រួតពិនិត្យដាច់ដោយឡែករបស់វា (`publication_reviews`); មិនមានជួរឈរ `verified_at` ទេ។
- **មិនត្រូវបានអនុញ្ញាតជាដាច់ខាត**: ឯកសារព្រាង (Drafts), ទិន្នន័យ Import ដែលមិនទាន់ពិនិត្យ, ឯកសារបណ្ណសារ (Archived), ឯកសារមិនទាន់បោះពុម្ពទាំងអស់។ ឯកសារដែលបោះពុម្ពហើយ តែមិនទាន់ផ្ទៀងផ្ទាត់ នឹងបង្ហាញនៅលើវេបសាយធម្មតា (តែមានប្រាប់ថា "unverified") ប៉ុន្តែបើយើងទាញយកតាម `/api/export/...` វានឹងលោតកូដ **404** ហើយមិនចេញក្នុងបញ្ជីទាញយកឡើយ។
- **OAI-PMH**: ទាមទារបន្ថែមនូវអាជ្ញាប័ណ្ណសាធារណៈ (`OAI_ALLOWED_LICENSES` / ការពិនិត្យអត្ថបទសេរី សម្រាប់ការបោះពុម្ព) ព្រោះការទាញយកមានន័យថាគេយកទៅចែកចាយបន្ត; ផ្លូវ `/api/export` ផ្តល់តែព័ត៌មាន (Metadata) ប៉ុណ្ណោះ ដូចគ្នានឹងលើវេបសាយដែរ ហើយបញ្ជាក់អាជ្ញាប័ណ្ណតាម `dc:rights` ឲ្យអ្នកយកទៅប្រើដឹងខ្លួនឯង។

## លក្ខណៈបច្ចេកទេស (Operational properties)

- **ជំនាន់ (Version)**: រាល់ការឆ្លើយតបសុទ្ធតែមាន `X-Export-Schema-Version` (បច្ចុប្បន្ន `1.0`) ហើយទម្រង់ JSON មានភ្ជាប់ `schemaVersion`។ ការផ្លាស់ប្តូរទម្រង់ធំដុំ នឹងតម្លើងលេខជំនាន់នេះ។
- **ការរក្សាទុកបណ្តោះអាសន្ន (Caching)**: `s-maxage=3600, stale-while-revalidate=86400` (ប្រព័ន្ធ CDN ចាប់យក; ទិន្នន័យប្រែប្រួលយ៉ាងច្រើន ២-៣ ដងប៉ុណ្ណោះក្នុងមួយថ្ងៃ)។
- **កម្រិតទាញយក (Rate limit)**: គោលការណ៍ `export`, ៣០ សំណើ/នាទី/IP (`RL_EXPORT_PER_MIN`) ដូចគ្នាទៅនឹងកន្លែងផ្សេងៗទៀតក្នុង DB ដែរ។
- **ការសរសេរកូដអក្សរ (Encoding)**: ប្រើប្រាស់ UTF-8; អក្សរខ្មែរដើរល្អ ដែលត្រូវបានធ្វើតេស្តក្នុង unit tests យ៉ាងច្បាស់លាស់។

## ការផ្ទៀងផ្ទាត់ (Validation)

- `lib/exports/scholarly.test.ts` — ពិនិត្យទម្រង់ DC XML (DOMParser), ការប្រើសញ្ញា `<`, `>`, `&` ក្នុងចំណងជើង, ការប្រើអក្សរខ្មែរ, ទម្រង់ CSL, និងការតម្រៀបទំព័រ។
- `lib/oai/xml.test.ts` + កំណត់ត្រា XSD validation ថ្ងៃទី 2026-07-09 — សម្រាប់ OAI។
- ការត្រួតពិនិត្យដោយដៃ: `curl -s 'http://localhost:3000/api/export/theses?format=dc-xml' | xmllint --noout -`។

## របៀបប្រើប្រាស់រហ័ស (Consumer quick-start)

```bash
# ទម្រង់ CSL-JSON សម្រាប់ Zotero/Pandoc, ទាញយកម្តងមួយទំព័រ
curl 'https://library.ptec.edu.kh/api/export/theses?format=csl-json&page=1'

# ទាញឯកសារមួយជាទម្រង់ BibTeX (ចេញជា file {slug}.bib)
curl -O 'https://library.ptec.edu.kh/api/export/books/teaching-methods?format=bibtex'

# ទាញយកទម្រង់ Dublin Core XML
curl 'https://library.ptec.edu.kh/api/export/publications?format=dc-xml'
```

នៅលើទំព័រនីមួយៗ: រាល់ទំព័រ សៀវភៅ/សារណា/បោះពុម្ព តែងតែមានផ្ទាំង "Cite this" សម្រាប់ឲ្យ Copy និងទាញយកជា APA/MLA/Chicago/IEEE/BibTeX/RIS ផងដែរ។
