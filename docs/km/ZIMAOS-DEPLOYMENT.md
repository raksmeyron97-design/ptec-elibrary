# សៀវភៅណែនាំ៖ ការរៀបចំ និងដំឡើង Server លើ ZimaOS (PTEC e-Library)

ឯកសារនេះត្រូវបានរៀបចំឡើងជាភាសាខ្មែរ ដើមី្បជួយសម្រួលដល់អ្នកក្នុងការយក Laptop និងម៉ាស៊ីន ZimaOS ទៅរៀបចំដំឡើងនៅសាលា។

---

## 📋 ដំណាក់កាលត្រៀមខ្លួនមុនពេលទៅសាលា (លើ Laptop)

1. **ពិនិត្យមើល GitHub Actions Build៖**  
   ប្រាកដថា Docker Image ត្រូវបាន Build និង Push ទៅកាន់ GHCR (`ghcr.io/raksmeyron97-design/ptec-elibrary`) រួចរាល់តាមរយៈ PR #67។

2. **ចម្លងទុកឯកសារ `.env`៖**  
   រៀបចំឯកសារ `.env` ឱ្យមានតម្លៃត្រឹមត្រូវទាំងអស់ (Supabase Keys, App Configs ជាដើម) ដាក់ក្នុង Flash Drive ឬ Laptop របស់អ្នក។

---

## 🚀 ជំហានដំឡើងលើម៉ាស៊ីន ZimaOS (នៅសាលា)

សូមអនុវត្តតាមជំហានខាងក្រោមតាមលំដាប់លំដោយ លើម៉ាស៊ីន ZimaOS (តាមរយៈ Terminal ឬ SSH)៖

### ជំហានទី ១៖ បង្កើត Directory និង Clone ប្រព័ន្ធ

```bash
# ១. បង្កើត Folder សម្រាប់រក្សាទុក App
sudo mkdir -p /DATA/AppData/ptec-elibrary

# ២. Clone កូដពី GitHub ចូលទៅក្នុង ZimaOS
sudo git clone https://github.com/raksmeyron97-design/ptec-elibrary.git /DATA/AppData/ptec-elibrary/app

# ៣. ចូលទៅកាន់ Folder App
cd /DATA/AppData/ptec-elibrary/app
```

---

### ជំហានទី ២៖ រៀបចំឯកសារ `.env` និងកំណត់សិទ្ធិសុវត្ថិភាព

```bash
# ១. ចម្លងឯកសារ .env របស់អ្នកចូលទៅក្នុង Folder App
sudo cp /path/to/your/.env .env

# ២. កំណត់សិទ្ធិសុវត្ថិភាពឱ្យអានបានតែ Root ប៉ុណ្ណោះ
sudo chmod 600 .env
```

---

### ជំហានទី ៣៖ ចុះឈ្មោះចូល GHCR ក្នុងនាមជា Root (Docker Login)

*(ដោយសារប្រព័ន្ធដំឡើងស្វ័យប្រវត្តិ (Timer) រត់ក្នុងនាមជា Root ដូច្នេះត្រូវ Login ជា Root)*

```bash
# ១. បង្កើត Folder រក្សាទុក Config របស់ Docker
sudo mkdir -p /DATA/AppData/ptec-elibrary/.docker

# ២. Login ចូលទៅ GHCR (ជំនួស YOUR_PAT ជាមួយ GitHub Personal Access Token និង YOUR_GITHUB_USERNAME ជាមួយ Username របស់អ្នក)
echo YOUR_PAT | sudo DOCKER_CONFIG=/DATA/AppData/ptec-elibrary/.docker \
     docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

---

### ជំហានទី ៤៖ ដំឡើងសេវាកម្មទាញយក និង Deploy ដោយស្វ័យប្រវត្តិ

```bash
# រត់ Script ដំឡើង Systemd Timer & Service
sudo ./deploy/install.sh
```

---

### ជំហានទី ៥៖ ធ្វើតេស្តក្នុងបណ្តាញផ្ទៃក្នុងសាលា (LAN Test)

1. រកមើល IP របស់ម៉ាស៊ីន ZimaOS ក្នុងបណ្តាញ Wi-Fi សាលា (ឧទាហរណ៍៖ `192.168.x.x`)។
2. បើក Browser ពី Laptop ឬទូរស័ព្ទដៃរបស់អ្នកដែលភ្ជាប់ Wi-Fi សាលាជាមួយគ្នា រួចវាយ៖
   ```text
   http://<IP-របស់-ZimaOS>:3000
   ```
3. ប្រសិនបើឃើញគេហទំព័របណ្ណាល័យបង្ហាញឡើង នោះមានន័យថាការដំឡើងលើ ZimaOS ជោគជ័យ ១០០% ហើយ!

---

### ជំហានទី ៦៖ ភ្ជាប់ Cloudflare Tunnel (នៅពេលរៀបចំ Domain រួចរាល់)

1. នៅពេលអ្នកទទួលបាន **`TUNNEL_TOKEN`** ពី Cloudflare សូមបន្ថែមវាទៅក្នុងឯកសារ `.env`៖
   ```bash
   sudo nano .env
   # បន្ថែមបន្ទាត់៖ TUNNEL_TOKEN=ey...
   ```
2. រត់ Command ដើមី្បឱ្យប្រព័ន្ធដំឡើង Tunnel ដោយស្វ័យប្រវត្តិ៖
   ```bash
   sudo ./deploy/deploy.sh --force
   ```

---

## 🛠️ Command សម្រាប់ពិនិត្យ និងគ្រប់គ្រងប្រព័ន្ធ (Operations)

| ការងារដែលត្រូវធ្វើ | Command (រត់ក្នុង `/DATA/AppData/ptec-elibrary/app`) |
| --- | --- |
| **ពិនិត្យមើលស្ថានភាព App ឥឡូវនេះ** | `./deploy/deploy.sh --status` |
| **ពិនិត្យមើលពេលដែលប្រព័ន្ធនឹង Check Update លើកក្រោយ** | `systemctl list-timers ptec-elibrary-deploy.timer` |
| **មើល Log នៃការ Deploy** | `journalctl -u ptec-elibrary-deploy -f` |
| **មើល Log របស់ App** | `docker logs -f ptec-elibrary` |
| **មើល Log របស់ Cloudflare Tunnel** | `docker logs -f ptec-tunnel` |
| **រៀបចំ Deploy ភ្លាមៗ (មិនបាច់ចាំ 5 នាទី)** | `sudo ./deploy/deploy.sh --force` |
| **បិទការ Update ស្វ័យប្រវត្តិជាបណ្តោះអាសន្ន** | `sudo systemctl disable --now ptec-elibrary-deploy.timer` |
| **បើកការ Update ស្វ័យប្រវត្តិវិញ** | `sudo systemctl enable --now ptec-elibrary-deploy.timer` |

---

## 🆘 ដំណោះស្រាយនៅពេលមានបញ្ហា (Troubleshooting)

1. **ប្រព័ន្ធប្រាប់ថា `pull failed … not logged in to ghcr.io`៖**
   * សូមធ្វើជំហានទី ៣ (Docker Login) ឡើងវិញឱ្យបានត្រឹមត្រូវ។
2. **App ដើរ ប៉ុន្តែគេហទំព័របង្ហាញ Error 502៖**
   * Cloudflare Tunnel ចង្អុលខុស។ ត្រូវប្រាកដថា Tunnel ចង្អុលទៅ `http://app:3000` (មិនមែន `localhost:3000` ទេ)។
3. **Container មិនឡើង trạng thái `healthy`៖**
   * មើល Log តាមរយៈ `docker logs ptec-elibrary`។ ជាទូទៅមកពីខ្វះអថេរក្នុង `.env` (ដូចជា Supabase Keys)។
