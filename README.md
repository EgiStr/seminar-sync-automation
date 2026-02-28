# 📢 Seminar Sync Automation

> Sistem otomasi berbasis **n8n** yang mem-broadcast jadwal seminar mahasiswa dari Google Spreadsheet ke **Telegram** dan **Google Calendar** — mendukung **6 program studi** dengan format data yang berbeda-beda.

[![Platform](https://img.shields.io/badge/platform-n8n-ff6d5a)](#) [![Builder](https://img.shields.io/badge/builder-Node.js-339933)](#) [![Programs](https://img.shields.io/badge/programs-6%20prodi-blue)](#) [![License](https://img.shields.io/badge/license-MIT-green)](#-license)

---

## ✨ Fitur Utama

| Fitur | Deskripsi |
|-------|-----------|
| 🔌 **Plugin System** | Tambah/hapus jenis seminar cukup dari satu node config |
| 📊 **Multi-Program** | 6 program studi, masing-masing dengan parser khusus |
| 🗺️ **Flexible Column Mapping** | Setiap source bisa punya layout kolom berbeda |
| 🔒 **Idempotency** | Hash-based tracking — tidak pernah kirim broadcast duplikat |
| 📅 **Google Calendar** | Buat event + sertakan link undangan di pesan Telegram |
| ⏰ **Unified Reminder** | Satu workflow reminder untuk semua program (shared state) |
| 🔄 **Auto-Retry** | Calendar & Telegram retry 3× jika gagal |
| 🧠 **Smart Parser** | Handle 15+ variasi format tanggal/jam Indonesia |
| 📝 **HTML Parse Mode** | Pesan Telegram bersih tanpa backslash escaping |
| 🏗️ **Builder Pattern** | Workflow JSON di-generate dari Node.js scripts |

---

## 🎓 Program Studi yang Didukung

| # | Program Studi | Builder Script | Seminar | Keunikan Parser |
|---|---------------|----------------|---------|-----------------|
| 1 | **Sains Data** | `build-workflow.js` | SEMHAS, SEMPRO | Standar — kolom terpisah |
| 2 | **Sains Aktuaria** | `build-workflow-aktuaria.js` | SEMHAS, SEMPRO | Combined Hari/TGL, DD/MM/YYYY, messy time |
| 3 | **Arsitektur Lanskap** | `build-workflow-arl.js` | SEMHAS, SEMPRO | Google Forms, AM/PM, US date M/D/YYYY |
| 4 | **Biologi** | `build-workflow-biologi.js` | SEMHAS, SEMPRO | Standar — tanpa kolom No & Link |
| 5 | **Farmasi** | `build-workflow-farmasi.js` | SEMHAS, SEMPRO | Combined jadwal (multiline), Pembimbing 3, KK |
| 6 | **Teknik Geologi** | `build-workflow-geologi.js` | SEMHAS, Sidang | Multi-row entries, NIM extraction, 10+ format tanggal |

---

## 🏗️ Arsitektur

### Sistem Overview

```
┌──────────────────────────────────────────────────────────────┐
│                     BUILD LAYER (Node.js)                     │
│                                                               │
│  build-workflow.js        build-workflow-aktuaria.js          │
│  build-workflow-arl.js    build-workflow-biologi.js           │
│  build-workflow-farmasi.js build-workflow-geologi.js          │
│  build-reminder-workflow-unified.js                           │
│                                                               │
│         │ node build-*.js  (generates JSON)                   │
└─────────┼────────────────────────────────────────────────────┘
          ▼
┌──────────────────────────────────────────────────────────────┐
│                    n8n RUNTIME LAYER                          │
│                                                               │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│  │ Broadcast    │ │ Broadcast   │ │ ... (×6)    │            │
│  │ Sains Data  │ │ Aktuaria    │ │             │            │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘            │
│         └───────────────┼───────────────┘                    │
│                         │  Shared State Sheet                │
│                         ▼                                    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │         Unified Reminder Workflow (05:30 WIB)        │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
          │
    ┌─────┼─────┐
    ▼     ▼     ▼
 Sheets Calendar Telegram
```

### Workflow Broadcast (13 nodes per workflow)

```
Schedule ──► Config Sources ──► Loop Over Sources ◄────────────────────┐
                                       │                               │
                          ┌────────────┴────────────┐                  │
                          ▼                         ▼                  │
                    Fetch CSV               Read State Sheet           │
                          │                         │                  │
                          ▼                         │                  │
                   Parse & Transform                │                  │
                          │                         │                  │
                          └────────────┬────────────┘                  │
                                       ▼                               │
                              Idempotency Filter                       │
                              (SQL LEFT JOIN)                          │
                                       │                               │
                                       ▼                               │
                              Has New Events?                          │
                                       │                               │
                                       ▼                               │
                           Create Calendar Event                       │
                                       │                               │
                                       ▼                               │
                            Merge Calendar + Data                      │
                                       │                               │
                          ┌────────────┴────────────┐                  │
                          ▼                         ▼                  │
                  Telegram Broadcast        Update State Sheet         │
                          │                         │                  │
                          └────────────┬────────────┘                  │
                                       ▼                               │
                            Done Processing Source ────────────────────┘
```

### Workflow Reminder (Unified — 4 nodes)

```
Schedule (05:30) ──► Read State Sheet ──► Filter Today ──► Telegram Reminder
```

---

## 📋 Cara Kerja

### 1. Config Sources (Plugin System)

Setiap workflow mendefinisikan sumber data via Config Sources node:

```javascript
return [
  { json: {
    type: "Seminar Hasil",
    sheetUrl: "https://docs.google.com/spreadsheets/d/.../export?format=csv&gid=...",
    columns: {
      nim: 1, nama: 2, pembimbing1: 3, pembimbing2: 4,
      penguji1: 5, penguji2: 6,       // -1 jika tidak ada
      judul: 7, tanggal: 8, hari: 9,
      jam: 10, link: 11, ruangan: 12
    }
  }}
];
```

> **Konvensi**: Gunakan `-1` untuk kolom yang tidak tersedia di sumber tertentu.

### 2. Smart CSV Parser

Setiap program memiliki parser yang disesuaikan dengan format spreadsheet-nya:

| Kemampuan | Contoh | Program |
|-----------|--------|---------|
| Tanggal Indonesia | `30 Maret 2024` | Semua |
| DD/MM/YYYY gabungan | `Kamis, 19/09/2024` | Aktuaria |
| US date M/D/YYYY | `3/5/2026` | ARL |
| AM/PM time | `1:00:00 PM` | ARL |
| Combined jadwal | `Senin, 1 Juli 2024\n14.00-15.00` | Farmasi |
| Multi-row entries | Main row + continuation rows | Geologi |
| NIM dari nama | `"M. Rayhan (118150047)"` | Geologi |
| Quoted CSV fields | `"Dr. Ahmad, M.Kom"` | Semua |
| Messy time | `13 . 30`, `09:00 s.d Selesai` | Aktuaria, Geologi |

### 3. Idempotency (Anti-Duplikasi)

Setiap event di-hash menggunakan FNV-1a: `seminarType + NIM + start_datetime`

```
Input:  "Seminar Hasil|122450032|2024-03-30T09:00:00+07:00"
Output: "evt_4fd758a6"   ← prefix mencegah Google Sheets scientific notation
```

State Sheet tracking via SQL:

```sql
SELECT input1.*
FROM input1
LEFT JOIN input2 ON input1.event_hash_id = input2.event_hash_id
WHERE input2.event_hash_id IS NULL
```

### 4. Calendar → Merge → Telegram → State Sheet

1. **Create Calendar Event** → dapatkan `htmlLink`
2. **Merge Calendar + Data** → gabungkan data asli + calendar link
3. **Telegram Broadcast** → kirim pesan HTML dengan link Calendar
4. **Update State Sheet** → simpan hash + semua data + calendar link

### 5. Unified Morning Reminder

Satu workflow reminder membaca **shared state sheet** (diisi oleh semua 6 broadcast workflows):

1. Read State Sheet (all programs)
2. Filter seminar **hari ini** (compare `start_datetime` with Jakarta time)
3. Sort by time ascending
4. Send `⏰ REMINDER HARI INI` per event via Telegram

---

## 🚀 Quick Start

### Prerequisites

- [n8n](https://n8n.io/) instance (self-hosted atau cloud)
- Google Cloud Project dengan OAuth2 credentials (Sheets + Calendar)
- Telegram Bot (via [@BotFather](https://t.me/BotFather))
- Node.js ≥ 16

### 1. Clone & Build

```bash
git clone https://github.com/EgiStr/seminar-sync-automation.git
cd seminar-sync-automation

# Generate semua workflow JSON
node build-workflow.js
node build-workflow-aktuaria.js
node build-workflow-arl.js
node build-workflow-biologi.js
node build-workflow-farmasi.js
node build-workflow-geologi.js
node build-reminder-workflow-unified.js
```

### 2. Setup State Sheet

Buat Google Spreadsheet baru → rename sheet ke `state-sheet` → import `state-sheet-template.csv` atau ketik header 20 kolom:

```
event_hash_id | program | seminar_type | nim | nama | judul | hari | tanggal | jam |
ruangan | pembimbing1 | pembimbing2 | pembimbing3 | penguji1 | penguji2 | link |
start_datetime | end_datetime | calendar_link | processed_at
```

### 3. Import & Configure di n8n

1. **Import** semua 7 file JSON ke n8n (6 broadcast + 1 reminder)
2. **Setup credentials**: Google Sheets OAuth2, Google Calendar OAuth2, Telegram Bot API
3. **Konfigurasi nodes** di setiap workflow:

| Node | Parameter |
|------|-----------|
| `Read State Sheet` | URL State Sheet Anda |
| `Update State Sheet` | URL State Sheet Anda (sama) |
| `Create Google Calendar Event` | Calendar ID + credential |
| `Telegram Broadcast` / `Reminder` | Chat ID grup/channel |

### 4. Test

```
1. Jalankan manual satu broadcast workflow
2. Cek output Parse & Transform → semua record ter-parse?
3. Cek Google Calendar → event terbuat?
4. Cek Telegram → pesan terkirim dengan link Calendar?
5. Cek State Sheet → hash tersimpan?
6. Jalankan ulang → pastikan TIDAK ada duplikat
7. Test reminder workflow
```

---

## 📁 Struktur File

```
seminar-sync-automation/
│
├── README.md                              # Dokumentasi ini (overview)
├── DOCUMENTATION.md                       # Dokumentasi lengkap & detail
├── state-sheet-template.csv               # Template header State Sheet (20 kolom)
│
├── Builder Scripts (sumber kebenaran — SELALU edit ini)
│   ├── build-workflow.js                  # Sains Data
│   ├── build-workflow-aktuaria.js         # Sains Aktuaria
│   ├── build-workflow-arl.js              # Arsitektur Lanskap
│   ├── build-workflow-biologi.js          # Biologi
│   ├── build-workflow-farmasi.js          # Farmasi
│   ├── build-workflow-geologi.js          # Teknik Geologi
│   └── build-reminder-workflow-unified.js # Unified Reminder (all programs)
│
└── Generated Outputs (jangan edit manual!)
    ├── seminar-broadcast-workflow.json
    ├── seminar-broadcast-workflow-aktuaria.json
    ├── seminar-broadcast-workflow-arl.json
    ├── seminar-broadcast-workflow-biologi.json
    ├── seminar-broadcast-workflow-farmasi.json
    ├── seminar-broadcast-workflow-geologi.json
    └── seminar-reminder-workflow-unified.json
```

> ⚠️ **Penting**: Selalu edit **builder scripts** (`.js`), lalu jalankan `node build-*.js` untuk regenerate JSON. Jangan pernah edit file JSON secara langsung.

---

## 🔧 Menambah Program Studi Baru

1. **Analisis spreadsheet** — identifikasi layout kolom, format tanggal/jam, kolom khusus
2. **Copy builder script** yang paling mirip (lihat tabel di bawah)
3. **Modifikasi**: Config Sources, parser, program label, Telegram template
4. **Build & Deploy**: `node build-workflow-NEWPROGRAM.js` → import ke n8n

| Jika Layout Mirip... | Copy Dari |
|----------------------|-----------|
| Standar (kolom terpisah) | `build-workflow-biologi.js` |
| Combined Hari/Tanggal | `build-workflow-aktuaria.js` |
| Google Forms format | `build-workflow-arl.js` |
| Combined Jadwal + multiline | `build-workflow-farmasi.js` |
| Multi-row entries, messy data | `build-workflow-geologi.js` |

> 📖 Panduan detail: lihat [DOCUMENTATION.md](DOCUMENTATION.md) Bab 12.

---

## ⚠️ Troubleshooting

| Masalah | Penyebab | Solusi |
|---------|----------|--------|
| Broadcast duplikat | Hash formula berubah / State Sheet URL salah | Clear State Sheet, pastikan URL konsisten |
| Backslash di Telegram | `parse_mode` tidak diset | Pastikan `parse_mode: "HTML"` |
| Kolom tertukar | Column mapping salah | Buka CSV, hitung indeks 0-based, update Config Sources |
| Calendar link kosong | Calendar credential gagal | Cek OAuth2, pastikan Calendar node enabled |
| Reminder tidak kirim | Tidak ada seminar hari ini / belum di-broadcast | Jalankan broadcast dulu |
| Parser 0 results | CSV kosong / semua row gagal validasi | Cek URL spreadsheet, cek format NIM/tanggal/jam |

---

## 📝 Best Practices

1. ✅ **Selalu edit builder scripts** — jangan edit JSON manual
2. ✅ **Run verifikasi** setelah build (script otomatis print check results)
3. ✅ **Test manual** di n8n sebelum aktifkan schedule
4. ✅ **Gunakan `-1`** untuk kolom yang tidak ada (bukan `null`)
5. ✅ **Clear State Sheet** jika hash formula berubah
6. ✅ **Monitor execution log** secara berkala
7. ✅ **Jangan commit** credential ID yang sebenarnya

---

## 📖 Dokumentasi Lengkap

Untuk dokumentasi komprehensif (arsitektur detail, profil per-prodi, schema state sheet, referensi teknis, dll.), lihat:

**→ [DOCUMENTATION.md](DOCUMENTATION.md)**

---

## 📄 License

MIT
