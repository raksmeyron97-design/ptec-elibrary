# PTEC E-Library Security Architecture

ឯកសារនេះរៀបរាប់លម្អិតអំពីប្រព័ន្ធសុវត្ថិភាព (Security Features) ដែលត្រូវបានបំពាក់ និងអនុវត្តនៅក្នុងប្រព័ន្ធ PTEC E-Library ដើម្បីការពារទិន្នន័យ អ្នកប្រើប្រាស់ និងប្រព័ន្ធទាំងមូលពីការវាយប្រហារផ្សេងៗ។

---

## 1. Authentication & Authorization (ប្រព័ន្ធចុះឈ្មោះ និងផ្ទៀងផ្ទាត់សិទ្ធិ)

* **Supabase Auth:** ប្រើប្រាស់ Supabase សម្រាប់គ្រប់គ្រងការ Login/Signup ដែលមានសុវត្ថិភាពខ្ពស់ រួមទាំងការប្រើប្រាស់ Session Cookies សុវត្ថិភាព (HttpOnly, Secure)។
* **Middleware Protection (`proxy.ts`):** រាល់ការចូលទៅកាន់ទំព័រឯកជនដូចជា `/dashboard`, `/profile`, ឬ ទំព័រ `/admin` ត្រូវបានត្រួតពិនិត្យដោយ Next.js Middleware។ ប្រសិនបើគ្មាន Session ត្រឹមត្រូវទេ ប្រព័ន្ធនឹងបង្វែរ (Redirect) អ្នកប្រើប្រាស់ទៅកាន់ទំព័រ Login វិញភ្លាមៗ។
* **Row Level Security (RLS):** ទិន្នន័យនៅក្នុង Database (PostgreSQL របស់ Supabase) ត្រូវបានការពារដោយគោលការណ៍ RLS។ អ្នកប្រើប្រាស់ទូទៅមិនអាចកែប្រែ ឬលុបទិន្នន័យផ្ដេសផ្ដាសបានទេ លុះត្រាតែមានសិទ្ធិជា Admin។

---

## 2. Bot & Brute-Force Protection (ការការពារការវាយប្រហារពី Bot)

* **Cloudflare Turnstile (CAPTCHA):** ត្រូវបានបំពាក់នៅលើទំព័រ `Login` និង `Signup`។
  * **គោលបំណង:** ទប់ស្កាត់មិនឲ្យ Hacker ប្រើប្រាស់ Bot ឬ Script បាញ់ទាយ Password រាប់ពាន់ដង (Brute-Force Attack) ឬបង្កើតគណនីក្លែងក្លាយ (Fake Accounts) ចូលមកក្នុងប្រព័ន្ធ។
  * **ដំណើរការ:** រាល់ការបញ្ជូនទិន្នន័យ (Form Submit) ត្រូវតែមាន Token ត្រឹមត្រូវពី Cloudflare ទើប Supabase អនុញ្ញាតឲ្យឆ្លងកាត់។

---

## 3. API Rate Limiting (ការទប់ស្កាត់ Spam និង DDoS)

ប្រព័ន្ធ API ត្រូវបានបំពាក់មុខងារ Rate Limiting ពីរស្រទាប់៖
* **In-Memory LRU Cache (`lib/rate-limit.ts`):** 
  * ការពារ Public APIs ដូចជា ទាញយកទិន្នន័យស្វែងរក (Suggestions) ឬ ទិន្នន័យពេញនិយម (Trending)។
  * ទប់ស្កាត់ IP ណាដែលបាញ់ Request ញឹកញាប់ខុសប្រក្រតី (ឧ. លើសពី ៦០ ដងក្នុង ១ នាទី) ដោយឆ្លើយតប `429 Too Many Requests`។
* **Database Rate Limit (`/api/contact`):**
  * មុខងារផ្ញើសារ (Contact Form) ត្រូវបានការពារយ៉ាងតឹងរ៉ឹង ដោយកត់ត្រាចូលក្នុង Database ផ្ទាល់។ 
  * អនុញ្ញាតឲ្យផ្ញើបានតែ ៣ ដងប៉ុណ្ណោះក្នុងមួយម៉ោង ក្នុងមួយ IP ដើម្បីការពារការ Spam សារទៅកាន់ Telegram ឬ Email របស់ Admin។

---

## 4. Secure File & Asset Delivery (ការការពារឯកសារ PDF/រូបភាព)

* **No Direct Access:** រាល់ឯកសារសំខាន់ៗ (ពិសេសសៀវភៅ PDF) ដែលផ្ទុកនៅលើ Cloudflare R2 ឬ Vercel Blob គឺមិនអាចចូលមើលដោយផ្ទាល់តាមរយៈ URL បានទេ។
* **Presigned URLs:** 
  * នៅពេលអ្នកប្រើប្រាស់ចុចអាន ឬទាញយកសៀវភៅ ប្រព័ន្ធនឹងរត់កាត់ Server (`/api/books/[slug]/download` ឬ `/file`) ជាមុនសិន ដើម្បីផ្ទៀងផ្ទាត់ថាតើអ្នកប្រើប្រាស់ពិតជាបាន Login ត្រឹមត្រូវឬទេ។
  * បន្ទាប់ពីផ្ទៀងផ្ទាត់ជោគជ័យ Server នឹងបង្កើត Presigned URL ថ្មីមួយដែលមានអាយុកាលខ្លី (ឧទាហរណ៍ ៥ នាទី) ទើបអនុញ្ញាតឲ្យទាញយកឯកសារ។ បន្ទាប់ពីផុតកំណត់ URL នោះនឹងលែងដំណើរការ ដែលការពារការលួចចម្លង Link យកទៅចែករំលែកបន្ត (Hotlinking)។
* **Image Optimization Lock:** ត្រូវបានកំណត់ក្នុង `next.config.ts` (`remotePatterns`) ដោយអនុញ្ញាតឲ្យ Next.js ទាញយករូបភាពពី Domain ជាក់លាក់ប៉ុណ្ណោះ (Google, Supabase, Cloudflare) ការពារការវាយប្រហារប្រភេទ Open Proxy។

---

## 5. Strict Content Security Policy (Dynamic Nonce-based CSP)

ប្រព័ន្ធការពារ XSS (Cross-Site Scripting) ត្រូវបានអនុវត្តយ៉ាងតឹងរ៉ឹងបំផុតនៅក្នុង Middleware (`proxy.ts`):
* **Cryptographic Nonce:** រាល់ពេលទំព័រត្រូវបាន Load ម្ដងៗ Server នឹងបង្កើតលេខកូដសម្ងាត់ Nonce (`crypto.randomUUID()`) ថ្មីជានិច្ច។
* **Script Enforcement:** មានតែ Javascript Scripts ណាដែលមានផ្ទុក Attribute `nonce="..."` ត្រូវគ្នានឹង Server ប៉ុណ្ណោះ ទើប Browser អនុញ្ញាតឲ្យដំណើរការ។
* ប្រសិនបើ Hacker ព្យាយាមបញ្ចូលកូដគ្រោះថ្នាក់ (Malicious Script) ទៅក្នុង Input, Comment, ឬ URL នោះ Browser នឹង Block វាមិនឲ្យដំណើរការជាដាច់ខាត ព្រោះវាគ្មានលេខ Nonce។
* អនុញ្ញាតអោយភ្ជាប់ទៅកាន់ External Sources ដែលជឿទុកចិត្តប៉ុណ្ណោះ (ឧទាហរណ៍៖ Cloudflare Turnstile, Supabase WebSocket, Flagcounter)។

---

## 6. HTTP Network Security Headers

ក្រៅពី CSP ប្រព័ន្ធក៏មានបំពាក់ Security Headers សំខាន់ៗ ដើម្បីប្រាប់ Browser ឲ្យបិទចន្លោះប្រហោង៖
* **`X-Frame-Options: DENY`**: ការពារការវាយប្រហារ Clickjacking (មិនអនុញ្ញាតឲ្យគេយកវេបសាយយើងទៅបង្កប់ក្នុង iframe របស់គេ)។
* **`X-Content-Type-Options: nosniff`**: បង្ខំឲ្យ Browser អនុវត្តតាម Content-Type ដែល Server ផ្ដល់ឲ្យយ៉ាងតឹងរ៉ឹង ការពារកុំឲ្យ Hacker បោកបញ្ឆោតប្រភេទឯកសារ (MIME-sniffing)។
* **`Strict-Transport-Security (HSTS)`**: បង្ខំឲ្យរាល់ការភ្ជាប់ទាំងអស់ត្រូវតែឆ្លងកាត់ `HTTPS` ដែលមានសុវត្ថិភាព មិនឲ្យឆ្លងកាត់ `HTTP` ធម្មតាឡើយ (ការពារ Man-in-the-Middle Attack)។
* **`Referrer-Policy: strict-origin-when-cross-origin`**: លាក់ព័ត៌មាន URL លម្អិត (Parameters) មិនឲ្យធ្លាយទៅកាន់វេបសាយខាងក្រៅ នៅពេលអ្នកប្រើប្រាស់ចុច Link ចេញពីវេបសាយយើង។
* **`Permissions-Policy`**: បិទមិនឲ្យវេបសាយ ឬ iframe ទាមទារសិទ្ធិប្រើប្រាស់កាមេរ៉ា (Camera), មីក្រូហ្វូន (Microphone), ឬទីតាំង (Geolocation) របស់អ្នកប្រើប្រាស់ឡើយ ព្រោះប្រព័ន្ធ Library មិនត្រូវការសិទ្ធិទាំងនេះទេ។

---

## សេចក្ដីសន្និដ្ឋាន
ប្រព័ន្ធ PTEC E-Library ត្រូវបានបំពាក់នូវស្តង់ដារសុវត្ថិភាពកម្រិតខ្ពស់ (Enterprise-grade Security Standards) ចាប់តាំងពីស្រទាប់អ្នកប្រើប្រាស់ (Frontend XSS/CSP) រហូតដល់ស្រទាប់ទិន្នន័យ (Backend API/Database)។ ប្រព័ន្ធនេះមានសមត្ថភាពខ្ពស់ក្នុងការការពារការវាយប្រហារពី Bot, Spam, ការលួចទិន្នន័យ, និងការវាយប្រហារផ្សេងៗទៀតបានយ៉ាងមានប្រសិទ្ធភាព។
