# 📢 Seminar Sync Automation — Dokumentasi Lengkap

> **Versi**: 2.0 — Multi-Program  
> **Terakhir diperbarui**: 1 Maret 2026  
> **Repository**: `EgiStr/seminar-sync-automation`  
> **Platform**: [n8n](https://n8n.io/) Workflow Automation  
> **Bahasa Builder**: Node.js (JavaScript)

---

## 📑 Daftar Isi

- [1. Ringkasan Proyek](#1-ringkasan-proyek)
- [2. Arsitektur Sistem](#2-arsitektur-sistem)
  - [2.1 Diagram Arsitektur Tingkat Tinggi](#21-diagram-arsitektur-tingkat-tinggi)
  - [2.2 Komponen Inti](#22-komponen-inti)
  - [2.3 Alur Data (Data Flow)](#23-alur-data-data-flow)
- [3. Daftar Workflow & Builder Scripts](#3-daftar-workflow--builder-scripts)
  - [3.1 Workflow Broadcast (Per-Program)](#31-workflow-broadcast-per-program)
  - [3.2 Workflow Reminder (Unified)](#32-workflow-reminder-unified)
- [4. Profil Program Studi](#4-profil-program-studi)
  - [4.1 Sains Data](#41-sains-data)
  - [4.2 Sains Aktuaria](#42-sains-aktuaria)
  - [4.3 Arsitektur Lanskap (ARL)](#43-arsitektur-lanskap-arl)
  - [4.4 Biologi](#44-biologi)
  - [4.5 Farmasi](#45-farmasi)
  - [4.6 Teknik Geologi](#46-teknik-geologi)
- [5. Arsitektur Node n8n (Workflow Broadcast)](#5-arsitektur-node-n8n-workflow-broadcast)
  - [5.1 Schedule Trigger](#51-schedule-trigger)
  - [5.2 Config Sources (Plugin System)](#52-config-sources-plugin-system)
  - [5.3 Loop Over Sources](#53-loop-over-sources)
  - [5.4 Fetch CSV (HTTP Request)](#54-fetch-csv-http-request)
  - [5.5 Parse & Transform Data](#55-parse--transform-data)
  - [5.6 Read State Sheet](#56-read-state-sheet)
  - [5.7 Idempotency Filter](#57-idempotency-filter)
  - [5.8 Has New Events?](#58-has-new-events)
  - [5.9 Create Google Calendar Event](#59-create-google-calendar-event)
  - [5.10 Merge Calendar + Data](#510-merge-calendar--data)
  - [5.11 Telegram Broadcast](#511-telegram-broadcast)
  - [5.12 Update State Sheet](#512-update-state-sheet)
  - [5.13 Done Processing Source](#513-done-processing-source)
- [6. Sistem Parser CSV](#6-sistem-parser-csv)
  - [6.1 CSV Parser Engine](#61-csv-parser-engine)
  - [6.2 Format Tanggal yang Didukung](#62-format-tanggal-yang-didukung)
  - [6.3 Format Jam yang Didukung](#63-format-jam-yang-didukung)
  - [6.4 Fitur Khusus Per-Program](#64-fitur-khusus-per-program)
- [7. Sistem Idempotency (Anti-Duplikasi)](#7-sistem-idempotency-anti-duplikasi)
  - [7.1 Mekanisme Hashing](#71-mekanisme-hashing)
  - [7.2 State Sheet Schema](#72-state-sheet-schema)
  - [7.3 SQL Merge Query](#73-sql-merge-query)
- [8. Integrasi Eksternal](#8-integrasi-eksternal)
  - [8.1 Google Spreadsheet (Sumber Data)](#81-google-spreadsheet-sumber-data)
  - [8.2 Google Calendar](#82-google-calendar)
  - [8.3 Telegram Bot](#83-telegram-bot)
  - [8.4 Google Sheets (State Sheet)](#84-google-sheets-state-sheet)
- [9. Template Pesan Telegram](#9-template-pesan-telegram)
  - [9.1 Broadcast (New Event)](#91-broadcast-new-event)
  - [9.2 Reminder (Morning)](#92-reminder-morning)
- [10. Struktur File Proyek](#10-struktur-file-proyek)
- [11. Panduan Setup & Deployment](#11-panduan-setup--deployment)
  - [11.1 Prerequisites](#111-prerequisites)
  - [11.2 Langkah Setup](#112-langkah-setup)
  - [11.3 Konfigurasi Credentials](#113-konfigurasi-credentials)
  - [11.4 Deployment ke n8n](#114-deployment-ke-n8n)
- [12. Panduan Menambah Program Studi Baru](#12-panduan-menambah-program-studi-baru)
- [13. Error Handling & Retry](#13-error-handling--retry)
- [14. Troubleshooting](#14-troubleshooting)
- [15. Best Practices](#15-best-practices)
- [16. Referensi Teknis](#16-referensi-teknis)

---

## 1. Ringkasan Proyek

**Seminar Sync Automation** adalah sistem otomasi berbasis **n8n workflow** yang secara otomatis:

1. **Mengekstrak** jadwal seminar mahasiswa dari Google Spreadsheet (CSV export)
2. **Mem-parsing** data dengan berbagai format tanggal, jam, dan layout kolom
3. **Mendeteksi** event baru menggunakan mekanisme idempotency (anti-duplikasi)
4. **Membuat** event di Google Calendar dengan informasi lengkap
5. **Mengirim** broadcast jadwal seminar ke Telegram dengan link undangan Google Calendar
6. **Menyimpan** state ke Google Sheets untuk tracking dan mencegah duplikasi
7. **Mengirim** reminder pagi hari untuk seminar yang dijadwalkan hari itu

### Cakupan Program Studi

Sistem ini mendukung **6 program studi** di Institut Teknologi Sumatera (ITERA), masing-masing dengan spreadsheet, format data, dan layout kolom yang berbeda:

| # | Program Studi | Builder Script | Jenis Seminar |
|---|---------------|---------------|---------------|
| 1 | Sains Data | `build-workflow.js` | SEMHAS, SEMPRO |
| 2 | Sains Aktuaria | `build-workflow-aktuaria.js` | SEMHAS, SEMPRO |
| 3 | Arsitektur Lanskap | `build-workflow-arl.js` | SEMHAS, SEMPRO |
| 4 | Biologi | `build-workflow-biologi.js` | SEMHAS, SEMPRO |
| 5 | Farmasi | `build-workflow-farmasi.js` | SEMHAS, SEMPRO |
| 6 | Teknik Geologi | `build-workflow-geologi.js` | SEMHAS (+Sidang Skripsi) |

### Fitur Utama

| Fitur | Deskripsi |
|-------|-----------|
| 🔌 **Plugin System** | Tambah/hapus jenis seminar cukup dari satu node config |
| 📊 **Multi-Source** | Satu workflow memproses banyak sheet/tab sekaligus |
| 🗺️ **Flexible Column Mapping** | Setiap source bisa punya layout kolom berbeda |
| 🔒 **Idempotency** | Hash-based tracking — tidak pernah kirim broadcast duplikat |
| 📅 **Google Calendar Integration** | Buat event + sertakan link undangan di pesan Telegram |
| ⏰ **Morning Reminder** | Workflow unified mengirim pengingat untuk seminar hari ini |
| 🔄 **Auto-Retry** | Calendar & Telegram retry otomatis 3× jika gagal |
| 🧠 **Smart Parser** | Handle 15+ variasi format tanggal/jam Indonesia |
| 📝 **HTML Parse Mode** | Pesan Telegram bersih tanpa backslash escaping |
| 🏗️ **Builder Pattern** | Workflow JSON di-generate dari script JS, bukan diedit manual |

---

## 2. Arsitektur Sistem

### 2.1 Diagram Arsitektur Tingkat Tinggi

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BUILD LAYER (Node.js)                        │
│                                                                     │
│  build-workflow.js          build-workflow-aktuaria.js              │
│  build-workflow-arl.js      build-workflow-biologi.js               │
│  build-workflow-farmasi.js  build-workflow-geologi.js               │
│  build-reminder-workflow-unified.js                                 │
│                                                                     │
│         ↓ node build-*.js                                          │
│         ↓ (generates)                                               │
│                                                                     │
│  seminar-broadcast-workflow-*.json                                  │
│  seminar-reminder-workflow-unified.json                             │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ Import ke n8n
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      n8n RUNTIME LAYER                              │
│                                                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐   │
│  │ Broadcast WF #1  │  │ Broadcast WF #2  │  │  ... WF #6     │   │
│  │ (Sains Data)     │  │ (Aktuaria)       │  │  (Geologi)     │   │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬───────┘   │
│           │                     │                      │           │
│           └─────────────────────┼──────────────────────┘           │
│                                 │ Shared State Sheet               │
│                                 ▼                                  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              Unified Reminder Workflow                        │  │
│  │              (05:30 WIB — reads State Sheet)                 │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
   ┌────────────┐  ┌────────────┐  ┌────────────┐
   │  Google     │  │  Google    │  │  Telegram   │
   │  Sheets     │  │  Calendar  │  │  Bot API    │
   │  (Source +  │  │            │  │             │
   │   State)    │  │            │  │             │
   └────────────┘  └────────────┘  └────────────┘
```

### 2.2 Komponen Inti

| Komponen | Teknologi | Peran |
|----------|-----------|-------|
| **Builder Scripts** | Node.js | Menghasilkan file JSON workflow n8n |
| **n8n Workflows** | n8n (JSON) | Eksekusi otomasi pada jadwal atau manual |
| **Google Sheets** | Google API | Sumber data (jadwal seminar) + state tracking |
| **Google Calendar** | Google API | Pembuatan event kalender otomatis |
| **Telegram Bot** | Telegram API | Pengiriman broadcast & reminder |
| **State Sheet** | Google Sheets | Penyimpanan hash untuk idempotency |

### 2.3 Alur Data (Data Flow)

#### Workflow Broadcast (Per-Program)

```
                    [Schedule: 06:00 WIB]
                           │
                           ▼
                    [Config Sources]
                    Return array of {type, sheetUrl, columns}
                           │
                           ▼
                    [Loop Over Sources] ◄──────────────────────────────┐
                    SplitInBatches (batchSize=1)                       │
                           │                                           │
              ┌────────────┴────────────┐                              │
              ▼                         ▼                              │
   [Fetch CSV via HTTP]        [Read State Sheet]                     │
   GET sheetUrl → raw text     Read event_hash_id list                │
              │                         │                              │
              ▼                         │                              │
   [Parse & Transform]                 │                              │
   CSV → structured JSON               │                              │
   + hash generation                    │                              │
              │                         │                              │
              └────────────┬────────────┘                              │
                           ▼                                           │
                    [Idempotency Filter]                               │
                    SQL: LEFT JOIN WHERE NULL                          │
                           │                                           │
                           ▼                                           │
                    [Has New Events?]                                  │
                    Filter empty items                                │
                           │                                           │
                      (if any)                                         │
                           ▼                                           │
                    [Create Calendar Event]                            │
                    → returns htmlLink                                 │
                           │                                           │
                           ▼                                           │
                    [Merge Calendar + Data]                            │
                    Combine original data + calendar link              │
                           │                                           │
              ┌────────────┴────────────┐                              │
              ▼                         ▼                              │
   [Telegram Broadcast]        [Update State Sheet]                   │
   Send HTML message           Append row with hash                   │
              │                         │                              │
              └────────────┬────────────┘                              │
                           ▼                                           │
                    [Done Processing Source] ───────────────────────────┘
```

#### Workflow Reminder (Unified)

```
   [Schedule: 05:30 WIB]
           │
           ▼
   [Read State Sheet]
   (shared across ALL programs)
           │
           ▼
   [Filter Today's Seminars]
   Compare start_datetime with today (Jakarta TZ)
   Sort by time ascending
           │
           ▼
   [Telegram Reminder]
   Send "⏰ REMINDER HARI INI" for each event
```

---

## 3. Daftar Workflow & Builder Scripts

### 3.1 Workflow Broadcast (Per-Program)

Setiap program studi memiliki **builder script** dan **output JSON** sendiri karena:
- Layout kolom spreadsheet berbeda
- Format tanggal/jam bervariasi
- Beberapa prodi punya kolom khusus (KK, Moderator, Pembimbing 3, dll.)
- Logic parsing yang berbeda (multi-row entries, combined fields, dll.)

| Builder Script | Output JSON | Program | Jenis Seminar |
|---------------|-------------|---------|---------------|
| `build-workflow.js` | `seminar-broadcast-workflow.json` | Sains Data | SEMHAS, SEMPRO |
| `build-workflow-aktuaria.js` | `seminar-broadcast-workflow-aktuaria.json` | Sains Aktuaria | SEMHAS, SEMPRO |
| `build-workflow-arl.js` | `seminar-broadcast-workflow-arl.json` | Arsitektur Lanskap | SEMHAS, SEMPRO |
| `build-workflow-biologi.js` | `seminar-broadcast-workflow-biologi.json` | Biologi | SEMHAS, SEMPRO |
| `build-workflow-farmasi.js` | `seminar-broadcast-workflow-farmasi.json` | Farmasi | SEMHAS, SEMPRO |
| `build-workflow-geologi.js` | `seminar-broadcast-workflow-geologi.json` | Teknik Geologi | SEMHAS, Sidang |

### 3.2 Workflow Reminder (Unified)

| Builder Script | Output JSON | Deskripsi |
|---------------|-------------|-----------|
| `build-reminder-workflow-unified.js` | `seminar-reminder-workflow-unified.json` | Reminder pagi untuk SEMUA program |

Reminder workflow membaca **State Sheet yang sama** (diisi oleh semua broadcast workflow), sehingga cukup satu workflow reminder untuk semua program.

---

## 4. Profil Program Studi

### 4.1 Sains Data

| Aspek | Detail |
|-------|--------|
| **Spreadsheet ID** | `109HxAVZofGjyDlz-O8pfK4iqYPDXyX7H` |
| **SEMHAS gid** | `1341055501` |
| **SEMPRO gid** | `1605122729` |
| **Layout** | Standar: No, NIM, Nama, Pemb1, Pemb2, Penguji1, Penguji2, Judul, Tgl, Hari, Jam, Link, Ruangan |
| **Tanggal** | `30 Maret 2024`, `5-Jan-2026` (terpisah dari hari) |
| **Jam** | `09.00-10.40`, `13.30 WIB` |
| **Khusus** | SEMPRO hanya 1 penguji (`penguji2: -1`), kolom bergeser |
| **Default durasi** | 2 jam (jika jam tunggal tanpa range) |

**Column Mapping — SEMHAS:**
```
no:0, nim:1, nama:2, pembimbing1:3, pembimbing2:4,
penguji1:5, penguji2:6, judul:7, tanggal:8, hari:9,
jam:10, link:11, ruangan:12
```

**Column Mapping — SEMPRO:**
```
no:0, nim:1, nama:2, pembimbing1:3, pembimbing2:4,
penguji1:5, penguji2:-1, judul:6, tanggal:7, hari:8,
jam:9, link:10, ruangan:11
```

### 4.2 Sains Aktuaria

| Aspek | Detail |
|-------|--------|
| **Spreadsheet ID** | `1n-VY-xCwTjmR7P4T3e2IZiaHc-0d9lc0WWF03WXeLPQ` |
| **SEMHAS gid** | `1557763186` |
| **SEMPRO gid** | `0` |
| **Layout** | Hari/TGL (gabungan), Jam, Nama, NIM, Pemb1, Pemb2, Penguji1, Penguji2, Judul, Ruangan |
| **Tanggal** | `Kamis, 19/09/2024` (DD/MM/YYYY gabungan dengan hari) |
| **Jam** | `13.00-14.00`, `09.30`, `8:00`, `13 . 30` (format berantakan) |
| **Khusus** | Tidak ada kolom link (seminar offline), combined Hari/TGL field |
| **Default durasi** | 1 jam |

**Column Mapping — SEMHAS:**
```
hariTanggal:0, jam:1, nama:2, nim:3,
pembimbing1:4, pembimbing2:5,
penguji1:6, penguji2:7,
judul:8, ruangan:9,
tanggal:-1, hari:-1, link:-1
```

**Fitur Parser Khusus:**
- `parseHariTanggal()` — parsing combined "Hari, DD/MM/YYYY" atau "Hari, DD Month YYYY"
- `cleanHari()` — normalisasi nama hari: "Jum,at" / "Jum'at" → "Jumat"
- Bulan typo handling: "febuari" → Februari
- Space normalisasi pada jam: "13 . 30" → "13.30"

### 4.3 Arsitektur Lanskap (ARL)

| Aspek | Detail |
|-------|--------|
| **Spreadsheet ID** | `1LmT0TTOHwSwSEPFZfsTdE-KZrQEZgaX51s1oSF3FNt0` |
| **SEMHAS gid** | `1098398615` |
| **SEMPRO gid** | `1747146599` |
| **Layout** | Google Forms response: Timestamp, NIM, Nama, Judul, Pemb1, Pemb2, Penguji, Moderator, Hari+Tgl, Jam, Ruang |
| **Tanggal** | `Senin, 01 April 2024`, `3/5/2026` (US date M/D/YYYY) |
| **Jam** | `09.00-10.00`, `1:00:00 PM` (12-hour with seconds) |
| **Khusus** | Google Forms format, single Penguji + Moderator, US date handling, SEMHAS punya `bentukTA` |
| **Default durasi** | 1 jam |

**Column Mapping — SEMHAS:**
```
timestamp:0, nim:1, nama:2,
bentukTA:3, judul:4,
pembimbing1:5, pembimbing2:6,
penguji1:7, penguji2:8,
hariTanggal:9, jam:10, ruangan:11, link:-1
```

**Column Mapping — SEMPRO:**
```
timestamp:0, nim:1, nama:2,
bentukTA:-1, judul:3,
pembimbing1:4, pembimbing2:5,
penguji1:6, penguji2:7,
hariTanggal:8, jam:9, ruangan:10, link:-1
```

**Fitur Parser Khusus:**
- AM/PM time parsing: `1:00:00 PM` → 13:00
- US date format: `3/5/2026` → 5 Maret 2026 (M/D/YYYY)
- Day name map: normalisasi "Jum'at" → "Jumat"
- Penguji + Moderator dipetakan ke `penguji1` + `penguji2`
- Telegram template menampilkan "Penguji" dan "Moderator" (bukan Penguji 1/2)
- Typo handling: "nopember" → November

### 4.4 Biologi

| Aspek | Detail |
|-------|--------|
| **Spreadsheet ID** | `1spNQQo3ArS1wwsbAKad-Nm3BPsa1HGXCxXmxtJwxZQc` |
| **SEMHAS gid** | `388660725` |
| **SEMPRO gid** | `435468985` |
| **Layout** | NIM, Nama, Judul, Pemb1, Pemb2, Penguji1, Penguji2, Hari, Tanggal, Jam, Ruangan |
| **Tanggal** | `03 Maret 2026`, `1-Mar-2025` |
| **Jam** | `10:00-11:00` (HH:MM-HH:MM) |
| **Khusus** | Tidak ada kolom No dan Link, layout identik SEMHAS & SEMPRO |
| **Default durasi** | 2 jam |

**Column Mapping (Sama untuk SEMHAS & SEMPRO):**
```
nim:0, nama:1, judul:2,
pembimbing1:3, pembimbing2:4,
penguji1:5, penguji2:6,
hari:7, tanggal:8, jam:9, ruangan:10, link:-1
```

### 4.5 Farmasi

| Aspek | Detail |
|-------|--------|
| **Spreadsheet ID** | `1hpWSt0Pg-f97Hs3qa1SmG7umlZLQFtHEY0qTQ7PWmmw` |
| **SEMHAS gid** | `1349278172` |
| **SEMPRO gid** | `2108042402` |
| **Layout** | No, Nama, NIM, KK, Judul, Pemb1, Pemb2, (Pemb3), Penguji1, Penguji2, Jadwal, Jam, Ruangan |
| **Tanggal** | `Senin, 1 Juli 2024` (combined jadwal field) |
| **Jam** | `10.00-11.00`, embedded in jadwal cell (multiline) |
| **Khusus** | **Pembimbing 3** (SEMHAS), combined jadwal field, multiline date+time, KK (Kelompok Keahlian) |
| **Default durasi** | 1 jam |

**Column Mapping — SEMHAS:**
```
no:0, nama:1, nim:2, kk:3, judul:4,
pembimbing1:5, pembimbing2:6, pembimbing3:7,
penguji1:8, penguji2:9,
jadwal:10, jam:11, ruangan:12, link:-1
```

**Column Mapping — SEMPRO:**
```
no:0, nama:1, nim:2, kk:3, judul:4,
pembimbing1:5, pembimbing2:6, pembimbing3:-1,
penguji1:7, penguji2:8,
jadwal:9, jam:10, ruangan:11, link:-1
```

**Fitur Parser Khusus:**
- `parseJadwal()` — parsing combined jadwal field yang bisa multiline:
  - `"Senin, 1 Juli 2024"` → hari + tanggal
  - `"Senin, 14 Oktober 2024\n14.00-15.00"` → hari + tanggal + embedded jam
- Smart jam/ruangan detection: jika kolom "jam" bukan format waktu, coba ambil dari embedded jadwal
- Kolom KK ditampilkan di Telegram
- Pembimbing 3 ditampilkan jika ada

### 4.6 Teknik Geologi

| Aspek | Detail |
|-------|--------|
| **Spreadsheet ID** | `12-MQNd_btAS1eRf7IIu9u7a4fQi8ZZausM0arnyl0RY` |
| **SEMHAS+SIDANG gid** | `0` |
| **SEMPRO gid** | *(belum tersedia)* |
| **Layout** | No, Jenis, Nama, NIM, Judul, Hari/Tgl+Waktu, Waktu, Pembimbing, Penguji, Ruangan, Lokasi, Link |
| **Tanggal** | 10+ variasi format (lihat di bawah) |
| **Jam** | Embedded dalam kolom tanggal atau kolom terpisah |
| **Khusus** | **Multi-row entries**, NIM extraction dari nama, 10+ format tanggal, JENIS column (Seminar Hasil / Sidang Skripsi) |
| **Default durasi** | 2 jam |

**Column Mapping:**
```
no:0, jenis:1, nama:2, nim:3,
judul:4, hariTanggal:5, waktu:6,
pembimbing:7, penguji:8,
ruangan:9, lokasiOffline:10, link:11
```

**Format Tanggal yang Ditangani:**
```
"Rabu, 13 Juli 2022 (Pukul 09:00 s.d Selesai)"
"Kamis/06 Oktober 2022 (Pukul 15:00 - 17:00 WIB)"
"Rabu, 8 Januari 2025 10.00 - 12.00"
"Senin, 3 Juni 2024        15.00 - 17.00"
"Jumat, 7 Februari 2025 "  → time in col 6
"Kamis, 20 Februari 2025"  → time in col 6
DD/MM/YYYY, DD-MM-YYYY
```

**Fitur Parser Khusus (Paling Kompleks):**
- **Two-pass parsing** untuk multi-row entries:
  - Pass 1: Identifikasi main row (ada NIM) dan continuation row (pembimbing2/penguji2)
  - Pass 2: Transform entries menjadi output items
- `extractNimFromName()` — NIM bisa di dalam kurung: `"M. Rayhan (118150047)"` atau setelah slash: `"Nama/118150094"`
- `cleanName()` — Bersihkan nama dari NIM, marker seminar, dll.
- `parseHariTanggalWaktu()` — Menangani 10+ format:
  - Time di dalam kurung: `(Pukul 09:00 s.d Selesai)`
  - Time di akhir string: `8 Januari 2025 10.00 - 12.00`
  - Time di kolom terpisah (kolom 6)
  - Hari dipisahkan koma atau slash
- Skip NIP rows (baris kelanjutan berisi NIP dosen)
- JENIS column mapping: `SIDANG SKRIPSI` → `Sidang Skripsi`, `SEMINAR HASIL` → `Seminar Hasil`
- Ruangan fallback: `ruangan` (col 9) → `lokasiOffline` (col 10)

---

## 5. Arsitektur Node n8n (Workflow Broadcast)

Setiap workflow broadcast memiliki **13 node** dengan topologi yang identik:

```
[1] Schedule Trigger ──► [2] Config Sources ──► [3] Loop Over Sources
                                                        │
                              ┌──────────────────────────┤
                              ▼                          ▼
                      [4] Fetch CSV              [6] Read State Sheet
                              │                          │
                              ▼                          │
                      [5] Parse & Transform              │
                              │                          │
                              └────────────┬─────────────┘
                                           ▼
                                   [7] Idempotency Filter
                                           │
                                           ▼
                                   [8] Has New Events?
                                           │
                                           ▼
                                   [9] Create Calendar Event
                                           │
                                           ▼
                                   [10] Merge Calendar + Data
                                           │
                              ┌────────────┴────────────┐
                              ▼                         ▼
                   [11] Telegram Broadcast     [12] Update State Sheet
                              │                         │
                              └────────────┬────────────┘
                                           ▼
                                   [13] Done Processing Source ──► [3] Loop Back
```

### 5.1 Schedule Trigger

| Property | Value |
|----------|-------|
| **Type** | `n8n-nodes-base.scheduleTrigger` |
| **Jadwal** | Setiap hari jam 06:00 WIB |
| **Timezone** | `Asia/Jakarta` (diatur di workflow settings) |

### 5.2 Config Sources (Plugin System)

| Property | Value |
|----------|-------|
| **Type** | `n8n-nodes-base.code` |
| **Output** | Array of config objects |

Setiap config object berisi:
```javascript
{
  type: "Seminar Hasil",           // Label jenis seminar
  sheetUrl: "https://docs.google.com/spreadsheets/d/.../export?format=csv&gid=...",
  columns: {
    nim: 1,              // Indeks kolom NIM (0-based)
    nama: 2,             // Indeks kolom Nama
    pembimbing1: 3,      // Indeks kolom Pembimbing 1
    pembimbing2: 4,      // Indeks kolom Pembimbing 2 (-1 jika tidak ada)
    penguji1: 5,         // Indeks kolom Penguji 1
    penguji2: 6,         // Indeks kolom Penguji 2 (-1 jika tidak ada)
    judul: 7,            // Indeks kolom Judul
    tanggal: 8,          // Indeks kolom Tanggal (-1 jika gabungan)
    hari: 9,             // Indeks kolom Hari (-1 jika gabungan)
    jam: 10,             // Indeks kolom Jam
    link: 11,            // Indeks kolom Link (-1 jika tidak ada)
    ruangan: 12,         // Indeks kolom Ruangan
    // Kolom khusus (bervariasi per program):
    hariTanggal: -1,     // Gabungan hari+tanggal (Aktuaria, ARL, Geologi)
    jadwal: -1,          // Jadwal combined (Farmasi)
    pembimbing3: -1,     // Pembimbing ke-3 (Farmasi)
    kk: -1,              // Kelompok Keahlian (Farmasi)
    timestamp: -1,       // Google Forms timestamp (ARL)
    bentukTA: -1,        // Bentuk TA (ARL)
    jenis: -1,           // Jenis seminar dari data (Geologi)
    waktu: -1,           // Kolom waktu terpisah (Geologi)
  }
}
```

> **Konvensi**: Gunakan `-1` untuk menandakan kolom yang tidak tersedia pada sumber tertentu.

### 5.3 Loop Over Sources

| Property | Value |
|----------|-------|
| **Type** | `n8n-nodes-base.splitInBatches` |
| **Batch Size** | 1 |
| **Fungsi** | Proses satu source config pada satu waktu |

Output memiliki 2 branch:
- **Output 0**: Empty (loop completion signal)
- **Output 1**: Current batch item → triggers parallel Fetch CSV + Read State Sheet

### 5.4 Fetch CSV (HTTP Request)

| Property | Value |
|----------|-------|
| **Type** | `n8n-nodes-base.httpRequest` |
| **Method** | GET |
| **URL** | `={{ $json.sheetUrl }}` (dynamic dari Config Sources) |
| **Auth** | Google Sheets OAuth2 |
| **Response Format** | Text (raw CSV) |

URL menggunakan format Google Sheets CSV export:
```
https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/export?format=csv&gid={SHEET_GID}
```

### 5.5 Parse & Transform Data

| Property | Value |
|----------|-------|
| **Type** | `n8n-nodes-base.code` |
| **Fungsi** | Parse CSV → structured JSON + hash generation |

Ini adalah node paling kompleks — lihat [Section 6: Sistem Parser CSV](#6-sistem-parser-csv) untuk detail lengkap.

**Output per item:**
```javascript
{
  program: "Sains Data",           // Nama program studi
  seminar_type: "Seminar Hasil",   // Jenis seminar
  nim: "122450032",
  nama: "John Doe",
  tanggal: "30 Maret 2024",
  hari: "Sabtu",
  jam: "09.00-10.40",
  ruangan: "GD 510",
  judul: "Implementasi Machine Learning...",
  link: "https://meet.google.com/...",
  pembimbing1: "Dr. Ahmad, M.Kom",
  pembimbing2: "Dr. Budi, M.Si",
  pembimbing3: "",                 // Opsional (Farmasi)
  penguji1: "Prof. Siti, Ph.D",
  penguji2: "Dr. Dewi, M.T",
  start_datetime: "2024-03-30T09:00:00+07:00",
  end_datetime: "2024-03-30T10:40:00+07:00",
  event_hash_id: "evt_4fd758a6",
  calendar_summary: "[Seminar Hasil] John Doe - 122450032",
  calendar_location: "Ruangan GD 510",
  calendar_description: "Judul: ...\nNIM: ...\n..."
}
```

### 5.6 Read State Sheet

| Property | Value |
|----------|-------|
| **Type** | `n8n-nodes-base.googleSheets` |
| **Operation** | Read |
| **Sheet Name** | `state-sheet` |

Membaca semua row dari state sheet, terutama kolom `event_hash_id` untuk idempotency check.

### 5.7 Idempotency Filter

| Property | Value |
|----------|-------|
| **Type** | `n8n-nodes-base.merge` |
| **Mode** | Combine By SQL |
| **Input 1** | Parse & Transform (data baru) |
| **Input 2** | Read State Sheet (data lama) |

```sql
SELECT input1.*
FROM input1
LEFT JOIN input2 ON input1.event_hash_id = input2.event_hash_id
WHERE input2.event_hash_id IS NULL
```

Logika: Hanya loloskan event yang **belum ada** di state sheet.

### 5.8 Has New Events?

| Property | Value |
|----------|-------|
| **Type** | `n8n-nodes-base.code` |
| **Fungsi** | Filter empty items dari SQL Merge |

```javascript
const items = $input.all();
const valid = items.filter(item => {
  const hash = (item.json.event_hash_id || '').trim();
  return hash.length > 0;
});
return valid;
```

> Jika tidak ada valid items, downstream nodes tidak akan dieksekusi (n8n behavior).

### 5.9 Create Google Calendar Event

| Property | Value |
|----------|-------|
| **Type** | `n8n-nodes-base.googleCalendar` |
| **Calendar ID** | `eggi.122450032@student.itera.ac.id` |
| **Retry** | 3× dengan jeda 5 detik |
| **On Error** | Continue Regular Output |

Event fields:
- **Summary**: `[Seminar Hasil] Nama - NIM`
- **Location**: `Ruangan GD 510` atau `TBA`
- **Description**: Detail lengkap (judul, pembimbing, penguji, link)
- **Start/End**: ISO 8601 dengan timezone `+07:00`

### 5.10 Merge Calendar + Data

| Property | Value |
|----------|-------|
| **Type** | `n8n-nodes-base.code` |
| **Fungsi** | Gabungkan htmlLink dari Calendar dengan data asli |

```javascript
const calItems = $input.all();
const originals = $('Has New Events?').all();
const results = [];
for (let i = 0; i < calItems.length; i++) {
  const calLink = calItems[i].json.htmlLink || '';
  const orig = originals[i] ? originals[i].json : {};
  results.push({ json: { ...orig, calendar_link: calLink } });
}
return results;
```

### 5.11 Telegram Broadcast

| Property | Value |
|----------|-------|
| **Type** | `n8n-nodes-base.telegram` |
| **Chat ID** | `1404670948` |
| **Parse Mode** | HTML |
| **Retry** | 3× dengan jeda 5 detik |

### 5.12 Update State Sheet

| Property | Value |
|----------|-------|
| **Type** | `n8n-nodes-base.googleSheets` |
| **Operation** | Append |
| **Sheet Name** | `state-sheet` |
| **Columns** | 20 kolom (lihat [Section 7.2](#72-state-sheet-schema)) |

### 5.13 Done Processing Source

| Property | Value |
|----------|-------|
| **Type** | `n8n-nodes-base.noOp` |
| **Fungsi** | Placeholder — loop back ke Loop Over Sources |

---

## 6. Sistem Parser CSV

### 6.1 CSV Parser Engine

Semua workflow menggunakan custom CSV parser yang menangani:

| Kemampuan | Penjelasan |
|-----------|------------|
| **Quoted fields** | `"Dr. Ahmad, M.Kom"` — koma di dalam quotes tidak jadi separator |
| **Escaped quotes** | `""` di dalam quoted field menjadi literal `"` |
| **Embedded newlines** | Newline di dalam quoted field ditangani (untuk Farmasi multiline jadwal) |
| **CR/LF handling** | Skip `\r`, split pada `\n` |
| **Trimming** | Semua field di-trim whitespace |

```javascript
function parseCsvToArrays(csvText) {
  // Phase 1: Split into logical lines (respecting quotes)
  // Phase 2: Split each line into fields (respecting quotes)
  // Returns: Array of Array of String
}
```

### 6.2 Format Tanggal yang Didukung

| Format | Contoh | Digunakan Oleh |
|--------|--------|----------------|
| `DD Bulan YYYY` | `30 Maret 2024` | Semua |
| `DD-Mon-YYYY` | `5-Jan-2026` | Sains Data, Biologi |
| `DD/MM/YYYY` | `19/09/2024` | Aktuaria |
| `M/D/YYYY` (US) | `3/5/2026` | ARL |
| `Hari, DD Bulan YYYY` | `Senin, 01 April 2024` | ARL, Farmasi |
| `Hari DD/MM/YYYY` | `Kamis, 19/09/2024` | Aktuaria |
| `Hari/DD Bulan YYYY` | `Kamis/06 Oktober 2022` | Geologi |
| `DD Bulan YYYY HH.MM - HH.MM` | `8 Januari 2025 10.00 - 12.00` | Geologi |
| `Hari, DD Bulan YYYY (Pukul ...)` | `Rabu, 13 Juli 2022 (Pukul 09:00 s.d Selesai)` | Geologi |

**Indonesian Month Maps:**
```javascript
const BULAN = {
  'januari':0, 'februari':1, 'febuari':1, 'maret':2, 'april':3,
  'mei':4, 'juni':5, 'juli':6, 'agustus':7, 'september':8,
  'oktober':9, 'october':9, 'november':10, 'nopember':10,
  'desember':11, 'december':11
};
```

### 6.3 Format Jam yang Didukung

| Format | Contoh | Digunakan Oleh |
|--------|--------|----------------|
| `HH.MM-HH.MM` | `09.00-10.40` | Semua |
| `HH:MM-HH:MM` | `10:00-11:00` | Biologi, ARL |
| `HH.MM` (tunggal) | `13.30` | Aktuaria |
| `H:MM` (single digit) | `8:00` | Aktuaria |
| `HH . MM` (spasi) | `13 . 30` | Aktuaria |
| `H:MM:SS AM/PM` | `1:00:00 PM` | ARL |
| `Pukul HH:MM s.d Selesai` | `Pukul 09:00 s.d Selesai` | Geologi |
| `HH.MM WIB` | `13.30 WIB` | Sains Data |
| Embedded in jadwal | (multiline cell) | Farmasi |

**Default Duration (jika hanya start time):**

| Program | Default |
|---------|---------|
| Sains Data | 2 jam |
| Biologi | 2 jam |
| Teknik Geologi | 2 jam |
| Sains Aktuaria | 1 jam |
| Arsitektur Lanskap | 1 jam |
| Farmasi | 1 jam |

### 6.4 Fitur Khusus Per-Program

| Fitur | Program | Fungsi |
|-------|---------|--------|
| `parseHariTanggal()` | Aktuaria, ARL | Parse combined "Hari, DD/MM/YYYY" |
| `parseHariTanggalWaktu()` | Geologi | Parse hari + tanggal + time dari 1-2 kolom |
| `parseJadwal()` | Farmasi | Parse combined jadwal (bisa multiline) |
| `cleanHari()` | Aktuaria, Geologi | Normalisasi "Jum,at" → "Jumat" |
| `extractNimFromName()` | Geologi | NIM dari `"Nama (118150047)"` |
| `cleanName()` | Geologi | Bersihkan nama dari NIM/marker |
| `isTimeFormat()` | Farmasi | Deteksi apakah string adalah format waktu |
| Multi-row parsing | Geologi | Two-pass: main row + continuation rows |
| NIP skip | Geologi | Skip baris yang berisi NIP dosen |
| AM/PM parsing | ARL | Handle `1:00:00 PM` format |
| US date parsing | ARL | Handle `M/D/YYYY` format |

---

## 7. Sistem Idempotency (Anti-Duplikasi)

### 7.1 Mekanisme Hashing

Setiap event di-hash menggunakan **FNV-1a** (Fowler-Noll-Vo) hash:

```javascript
function eventHash(str) {
  let h = 0x811c9dc5;  // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);  // FNV prime
    h = h >>> 0;                  // Force unsigned 32-bit
  }
  return 'evt_' + h.toString(16).padStart(8, '0');
}
```

**Input hash**: `{seminarType}|{NIM}|{start_datetime_ISO}`

**Contoh:**
```
Input:  "Seminar Hasil|122450032|2024-03-30T09:00:00+07:00"
Output: "evt_4fd758a6"
```

**Prefix `evt_`**: Mencegah Google Sheets mengubah hash hex ke scientific notation (misalnya `4fd758a6` → `4.68E+07`).

### 7.2 State Sheet Schema

File `state-sheet-template.csv` mendefinisikan 20 kolom:

| # | Kolom | Tipe | Deskripsi |
|---|-------|------|-----------|
| 1 | `event_hash_id` | string | Hash unik event (PK) |
| 2 | `program` | string | Nama program studi |
| 3 | `seminar_type` | string | Jenis seminar |
| 4 | `nim` | string | NIM mahasiswa |
| 5 | `nama` | string | Nama mahasiswa |
| 6 | `judul` | string | Judul tugas akhir |
| 7 | `hari` | string | Nama hari |
| 8 | `tanggal` | string | Tanggal (readable) |
| 9 | `jam` | string | Jam (raw from CSV) |
| 10 | `ruangan` | string | Ruangan/lokasi |
| 11 | `pembimbing1` | string | Pembimbing 1 |
| 12 | `pembimbing2` | string | Pembimbing 2 |
| 13 | `pembimbing3` | string | Pembimbing 3 (Farmasi) |
| 14 | `penguji1` | string | Penguji 1 |
| 15 | `penguji2` | string | Penguji 2 |
| 16 | `link` | string | Link meeting (jika ada) |
| 17 | `start_datetime` | string | ISO 8601 start time |
| 18 | `end_datetime` | string | ISO 8601 end time |
| 19 | `calendar_link` | string | Google Calendar htmlLink |
| 20 | `processed_at` | string | Timestamp pemrosesan |

> **Penting**: State sheet adalah **SHARED** — semua program workflow menulis ke sheet yang sama. Ini memungkinkan unified reminder workflow membaca semua event.

### 7.3 SQL Merge Query

```sql
SELECT input1.*
FROM input1
LEFT JOIN input2
  ON input1.event_hash_id = input2.event_hash_id
WHERE input2.event_hash_id IS NULL
```

- `input1`: Data baru dari parser (semua event di spreadsheet)
- `input2`: Data dari state sheet (event yang sudah diproses)
- **Result**: Hanya event yang **belum pernah** di-broadcast

---

## 8. Integrasi Eksternal

### 8.1 Google Spreadsheet (Sumber Data)

| Credential | Google Sheets OAuth2 |
|------------|---------------------|
| **Scope** | Read-only (untuk fetch CSV) |
| **Method** | HTTP GET ke `/export?format=csv&gid=` |
| **Format** | Raw CSV text |

Setiap program studi memiliki spreadsheet sendiri dengan tab (gid) berbeda untuk setiap jenis seminar.

### 8.2 Google Calendar

| Credential | Google Calendar OAuth2 |
|------------|----------------------|
| **Operation** | Create Event |
| **Calendar** | `eggi.122450032@student.itera.ac.id` |
| **Retry** | 3× dengan jeda 5000ms |
| **Error Handling** | `continueRegularOutput` |

Event yang dibuat:
- **Summary**: `[Seminar Hasil] Nama Mahasiswa - NIM`
- **Location**: Ruangan atau "TBA"
- **Description**: Judul, NIM, Pembimbing, Penguji, Link
- **Start/End**: ISO 8601 format dengan `+07:00`

### 8.3 Telegram Bot

| Credential | Telegram Bot API |
|------------|-----------------|
| **Chat ID** | `1404670948` |
| **Parse Mode** | HTML |
| **Retry** | 3× dengan jeda 5000ms |

Pesan menggunakan HTML formatting (`<b>`, `<i>`, `<a href>`) untuk tampilan bersih tanpa backslash escaping.

### 8.4 Google Sheets (State Sheet)

| Credential | Google Sheets OAuth2 |
|------------|---------------------|
| **Spreadsheet ID** | `1yl-IpOrB5xSCUODvvOPCD_4HxrpdK9f77Q1qT5XjV2I` |
| **Sheet Name** | `state-sheet` |
| **Operation Read** | Read all rows (untuk idempotency check) |
| **Operation Write** | Append (menambah row baru) |

---

## 9. Template Pesan Telegram

### 9.1 Broadcast (New Event)

**Format standar** (Sains Data, Aktuaria, Biologi, Geologi):
```
📢 JADWAL SEMINAR HASIL

👤 Nama: John Doe
🆔 NIM: 122450032
📝 Judul: Implementasi Machine Learning untuk...

📅 Hari/Tanggal: Sabtu, 30 Maret 2024
🕐 Jam: 09.00-10.40 WIB
📍 Ruangan: GD 510

👨‍🏫 Penguji 1: Prof. Siti, Ph.D
👩‍🏫 Penguji 2: Dr. Dewi, M.T

👨‍💼 Pembimbing 1: Dr. Ahmad, M.Kom
👩‍💼 Pembimbing 2: Dr. Budi, M.Si

📎 Buka Undangan Google Calendar

Pesan otomatis via n8n
```

**Variasi per program:**

| Program | Variasi |
|---------|---------|
| **ARL** | Header: `JADWAL SEMINAR HASIL (Arsitektur Lanskap)`, Penguji → "Penguji", Penguji2 → "Moderator" |
| **Biologi** | Header: `JADWAL SEMINAR HASIL — BIOLOGI`, ada field Link jika tersedia |
| **Farmasi** | Header: `JADWAL SEMINAR HASIL — FARMASI`, ada KK dan Pembimbing 3 |
| **Geologi** | Header: `JADWAL SEMINAR HASIL` (seminar type bisa "Sidang Skripsi") |

### 9.2 Reminder (Morning)

```
⏰ REMINDER HARI INI — SEMINAR HASIL (Sains Data)

👤 Nama: John Doe
🆔 NIM: 122450032
📝 Judul: Implementasi Machine Learning untuk...

📅 Hari/Tanggal: Sabtu, 30 Maret 2024
🕐 Jam: 09.00-10.40 WIB
📍 Ruangan: GD 510

👨‍🏫 Penguji 1: Prof. Siti, Ph.D
👩‍🏫 Penguji 2: Dr. Dewi, M.T

👨‍💼 Pembimbing 1: Dr. Ahmad, M.Kom
👩‍💼 Pembimbing 2: Dr. Budi, M.Si

📎 Buka Google Calendar

⏰ Reminder otomatis via n8n
```

Reminder template adalah **universal** — mendukung semua field dari semua program (program name, pembimbing3, link, calendar_link).

---

## 10. Struktur File Proyek

```
seminar-sync-automation/
│
├── 📄 README.md                              # Dokumentasi ringkas (versi lama)
├── 📄 DOCUMENTATION.md                       # Dokumentasi lengkap (file ini)
├── 📄 state-sheet-template.csv               # Template header untuk State Sheet
│
├── 🔧 Builder Scripts (Sumber Kebenaran)
│   ├── build-workflow.js                      # Sains Data broadcast builder
│   ├── build-workflow-aktuaria.js             # Sains Aktuaria broadcast builder
│   ├── build-workflow-arl.js                  # Arsitektur Lanskap broadcast builder
│   ├── build-workflow-biologi.js              # Biologi broadcast builder
│   ├── build-workflow-farmasi.js              # Farmasi broadcast builder
│   ├── build-workflow-geologi.js              # Teknik Geologi broadcast builder
│   └── build-reminder-workflow-unified.js     # Unified reminder builder
│
└── 📦 Generated Outputs (Jangan edit manual!)
    ├── seminar-broadcast-workflow.json         # n8n workflow: Sains Data
    ├── seminar-broadcast-workflow-aktuaria.json
    ├── seminar-broadcast-workflow-arl.json
    ├── seminar-broadcast-workflow-biologi.json
    ├── seminar-broadcast-workflow-farmasi.json
    ├── seminar-broadcast-workflow-geologi.json
    └── seminar-reminder-workflow-unified.json
```

> ⚠️ **PENTING**: Selalu edit **builder scripts** (`.js`), kemudian jalankan `node build-*.js` untuk regenerate JSON. **Jangan pernah edit file JSON secara langsung.**

---

## 11. Panduan Setup & Deployment

### 11.1 Prerequisites

| Requirement | Detail |
|-------------|--------|
| **n8n** | Self-hosted atau cloud (versi ≥ 1.0) |
| **Node.js** | ≥ 16 (untuk menjalankan builder scripts) |
| **Google Cloud Project** | OAuth2 credentials untuk Sheets + Calendar |
| **Telegram Bot** | Dibuat via [@BotFather](https://t.me/BotFather) |
| **Google Spreadsheet** | Satu spreadsheet per program studi (sudah ada) |
| **State Sheet** | Satu Google Spreadsheet shared (perlu dibuat) |

### 11.2 Langkah Setup

#### Langkah 1: Clone Repository

```bash
git clone https://github.com/EgiStr/seminar-sync-automation.git
cd seminar-sync-automation
```

#### Langkah 2: Buat State Sheet

1. Buat Google Spreadsheet baru
2. Rename sheet pertama menjadi `state-sheet`
3. Import `state-sheet-template.csv` atau ketik header secara manual:

```
event_hash_id | program | seminar_type | nim | nama | judul | hari | tanggal | jam | ruangan | pembimbing1 | pembimbing2 | pembimbing3 | penguji1 | penguji2 | link | start_datetime | end_datetime | calendar_link | processed_at
```

4. Catat URL spreadsheet untuk konfigurasi nanti

#### Langkah 3: Generate Workflow JSON

```bash
# Generate semua workflow
node build-workflow.js
node build-workflow-aktuaria.js
node build-workflow-arl.js
node build-workflow-biologi.js
node build-workflow-farmasi.js
node build-workflow-geologi.js
node build-reminder-workflow-unified.js
```

Setiap script akan menampilkan verifikasi output:
```
✅ Workflow JSON generated: seminar-broadcast-workflow.json
Nodes: 13
Connections: 12
Parser has col.nim: true
...
✅ All checks passed!
```

#### Langkah 4: Import ke n8n

1. Buka n8n dashboard
2. Klik **Import** → pilih file JSON yang di-generate
3. Import semua 7 workflow (6 broadcast + 1 reminder)

### 11.3 Konfigurasi Credentials

Setelah import, konfigurasi credentials di setiap workflow:

| Credential | Digunakan Oleh | Caranya |
|------------|---------------|---------|
| **Google Sheets OAuth2** | Fetch CSV, Read State, Update State | Settings → Credentials → Google Sheets OAuth2 |
| **Google Calendar OAuth2** | Create Calendar Event | Settings → Credentials → Google Calendar OAuth2 |
| **Telegram Bot API** | Broadcast & Reminder | Settings → Credentials → Telegram Bot API |

#### Node yang perlu dikonfigurasi:

| Node | Parameter | Value |
|------|-----------|-------|
| `Fetch CSV (HTTP Request)` | Google Sheets OAuth2 credential | Pilih credential |
| `Read State Sheet` | Document URL, credential | URL State Sheet + credential |
| `Update State Sheet` | Document URL, credential | URL State Sheet + credential |
| `Create Google Calendar Event` | Calendar ID, credential | Calendar ID + credential |
| `Telegram Broadcast` | Chat ID, credential | Chat/Group ID + credential |

### 11.4 Deployment ke n8n

1. **Aktifkan** semua 7 workflow
2. **Test manual** satu workflow broadcast → cek output parsing, Calendar, Telegram, State Sheet
3. **Cek idempotency** — jalankan ulang, pastikan **tidak ada duplikat**
4. **Test reminder** — jalankan manual jika ada seminar hari ini
5. **Monitor** — cek execution log secara berkala

---

## 12. Panduan Menambah Program Studi Baru

### Langkah 1: Analisis Spreadsheet

1. Buka spreadsheet program studi baru
2. Identifikasi:
   - Format kolom (layout)
   - Format tanggal (Indonesian, DD/MM/YYYY, US, gabungan, dll.)
   - Format jam (24h, 12h AM/PM, range, tunggal, embedded)
   - Kolom khusus (KK, Moderator, Bentuk TA, dll.)
   - Jumlah penguji dan pembimbing
   - Ada tidaknya kolom link
   - Header/separator yang perlu di-skip

### Langkah 2: Copy Builder Script Terdekat

Pilih builder script yang paling mirip dengan layout baru:

| Jika Layout Mirip... | Copy Dari |
|----------------------|-----------|
| Standar (kolom terpisah) | `build-workflow-biologi.js` |
| Combined Hari/Tanggal | `build-workflow-aktuaria.js` |
| Google Forms format | `build-workflow-arl.js` |
| Combined Jadwal + multiline | `build-workflow-farmasi.js` |
| Multi-row entries | `build-workflow-geologi.js` |

```bash
cp build-workflow-biologi.js build-workflow-NEWPROGRAM.js
```

### Langkah 3: Modifikasi

1. **`configSourcesCode`**: Update URL, gid, column mapping
2. **`parseTransformCode`**: Sesuaikan format parser jika perlu
3. **`program` label**: Ganti ke nama program baru
4. **`telegramTemplate`**: Sesuaikan header dan field khusus
5. **Output filename**: Ganti di bagian `fs.writeFileSync()`

### Langkah 4: Build & Deploy

```bash
node build-workflow-NEWPROGRAM.js
# Import JSON ke n8n
# Konfigurasi credentials
# Test
```

---

## 13. Error Handling & Retry

### Retry Configuration

| Node | Max Tries | Wait Between | On Error |
|------|-----------|-------------|----------|
| Create Google Calendar Event | 3 | 5000ms | `continueRegularOutput` |
| Telegram Broadcast | 3 | 5000ms | `continueRegularOutput` |
| Telegram Reminder | 3 | 5000ms | `continueRegularOutput` |

### Error Scenarios & Behavior

| Scenario | Behavior |
|----------|----------|
| Google Sheets CSV fetch gagal | Workflow berhenti untuk source ini, lanjut ke source berikutnya |
| Parser tidak bisa parse tanggal | Row di-skip (continue loop) |
| Parser tidak bisa parse jam | Row di-skip (continue loop) |
| NIM tidak valid (bukan angka) | Row di-skip (continue loop) |
| Calendar API gagal 3× | Continue dengan empty calendar link |
| Telegram API gagal 3× | Continue, state sheet tetap terupdate |
| State Sheet write gagal | Event mungkin ter-broadcast ulang pada run berikutnya |

### Validation Rules

| Rule | Implementasi |
|------|-------------|
| NIM harus numerik | `/^\d+$/.test(nim)` |
| Nama wajib ada | `if (!nama) continue` |
| Tanggal wajib ter-parse | `if (!pd) continue` |
| Jam wajib ter-parse | `if (!pt) continue` |
| Minimum kolom per row | `if (c.length < 8) continue` |
| Skip header rows | Pattern matching pada cell pertama |
| Skip separator rows | Deteksi "Semester", bulan, dll. |

---

## 14. Troubleshooting

### ❌ Broadcast duplikat terkirim

| Penyebab | Solusi |
|----------|--------|
| Hash formula berubah | Clear semua row di State Sheet, lalu run ulang |
| State Sheet URL salah di salah satu node | Pastikan URL sama di Read State Sheet dan Update State Sheet |
| Google Sheets mengubah hash ke scientific notation | Hash sudah di-prefix `evt_` — seharusnya tidak terjadi |

### ❌ Telegram pesan menampilkan backslash

| Penyebab | Solusi |
|----------|--------|
| `parse_mode` tidak diset | Pastikan `additionalFields.parse_mode: "HTML"` |
| Template menggunakan Markdown escaping | Gunakan HTML entities (`&amp;`, `&lt;`, `&gt;`) |

### ❌ Kolom tertukar / field salah

| Penyebab | Solusi |
|----------|--------|
| Column mapping tidak sesuai | Buka CSV di browser, hitung indeks kolom (0-based), update Config Sources |
| Spreadsheet layout berubah | Update column mapping di builder script, rebuild, reimport |

### ❌ Calendar link tidak muncul di Telegram

| Penyebab | Solusi |
|----------|--------|
| Calendar node gagal / disabled | Cek credential, pastikan Calendar OAuth2 terhubung |
| Merge node tidak menerima data | Cek koneksi: Calendar → Merge → Telegram |

### ❌ Reminder tidak mengirim pesan

| Penyebab | Solusi |
|----------|--------|
| Tidak ada seminar hari ini | Normal — cek State Sheet manual |
| Main workflow belum broadcast | Jalankan broadcast workflow dulu |
| Timezone salah | Pastikan workflow settings `timezone: "Asia/Jakarta"` |
| State Sheet kosong | Broadcast workflow harus berjalan terlebih dahulu |

### ❌ Parser menghasilkan 0 results

| Penyebab | Solusi |
|----------|--------|
| CSV kosong / fetch gagal | Cek URL spreadsheet, pastikan accessible |
| Semua row gagal validasi | Cek format NIM, tanggal, jam di spreadsheet |
| Header di-skip terlalu agresif | Review skip conditions di parser |

---

## 15. Best Practices

### Pengembangan

1. ✅ **Selalu edit builder scripts** — Jangan edit JSON manual
2. ✅ **Run verifikasi** setelah build — Script otomatis mencetak check results
3. ✅ **Test di n8n** secara manual sebelum aktifkan schedule
4. ✅ **Gunakan column index `-1`** untuk kolom yang tidak ada (bukan `null` atau `undefined`)
5. ✅ **Prefix hash dengan `evt_`** untuk mencegah Google Sheets auto-formatting

### Operasional

6. ✅ **Monitor execution log** secara berkala di n8n
7. ✅ **Clear State Sheet** jika terjadi perubahan struktur hash
8. ✅ **Backup State Sheet** secara periodik
9. ✅ **Test reminder** pada hari yang ada seminar
10. ✅ **Sinkronkan credentials** di semua workflow

### Keamanan

11. ✅ **Jangan commit credential ID** yang sebenarnya ke repository
12. ✅ **Gunakan OAuth2** (bukan API key) untuk Google services
13. ✅ **Batasi akses** Telegram Bot ke group/channel yang ditentukan
14. ✅ **Gunakan environment variables** di n8n untuk credential management

---

## 16. Referensi Teknis

### Teknologi Stack

| Layer | Teknologi | Versi |
|-------|-----------|-------|
| Automation Platform | n8n | ≥ 1.0 |
| Builder Runtime | Node.js | ≥ 16 |
| Data Source | Google Sheets API | v4 |
| Calendar | Google Calendar API | v3 |
| Messaging | Telegram Bot API | Latest |
| Hash Algorithm | FNV-1a | 32-bit |

### n8n Node Types Digunakan

| Node Type | Versi | Fungsi |
|-----------|-------|--------|
| `n8n-nodes-base.scheduleTrigger` | 1.2 | Cron-like trigger |
| `n8n-nodes-base.code` | 2 | Custom JavaScript |
| `n8n-nodes-base.splitInBatches` | 3 | Loop processing |
| `n8n-nodes-base.httpRequest` | 4.2 | HTTP calls |
| `n8n-nodes-base.googleSheets` | 4.5 | Google Sheets R/W |
| `n8n-nodes-base.googleCalendar` | 1.2 | Calendar events |
| `n8n-nodes-base.telegram` | 1.2 | Telegram messaging |
| `n8n-nodes-base.merge` | 3 | SQL merge/join |
| `n8n-nodes-base.noOp` | 1 | No-operation placeholder |

### Timezone & Schedule

| Setting | Value |
|---------|-------|
| Workflow Timezone | `Asia/Jakarta` (UTC+7) |
| Broadcast Schedule | 06:00 WIB daily |
| Reminder Schedule | 05:30 WIB daily |
| ISO 8601 Offset | `+07:00` |

### Hash Space

| Property | Value |
|----------|-------|
| Algorithm | FNV-1a |
| Bit Width | 32-bit |
| Collision Probability | ~1 in 4 billion per unique input |
| Output Format | `evt_` + 8 hex chars |
| Example | `evt_4fd758a6` |

---

*Dokumen ini di-generate pada 1 Maret 2026. Untuk perubahan terbaru, lihat commit history di repository.*
