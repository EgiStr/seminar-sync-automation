# 📢 Seminar Sync Automation

> Config-driven n8n workflow yang otomatis broadcast jadwal seminar (Hasil, Proposal, KP, dll.) ke Telegram dan Google Calendar dari Google Spreadsheet.

## ✨ Fitur

- **Plugin System** — Tambah/hapus jenis seminar cukup dari satu node config
- **Multi-Source** — Satu workflow memproses banyak spreadsheet sekaligus
- **Flexible Column Mapping** — Setiap source bisa punya layout kolom berbeda
- **Idempotency** — Tidak pernah kirim broadcast duplikat (State Sheet tracking)
- **Google Calendar + Invite Link** — Buat event Calendar dan sertakan link undangan di pesan Telegram
- **Morning Reminder** — Workflow terpisah broadcast pengingat untuk seminar hari ini
- **Auto-Retry** — Calendar & Telegram retry otomatis 3× jika gagal
- **Smart Parser** — Handle format tanggal/jam Indonesia, quoted CSV fields, multi-semester headers
- **HTML Parse Mode** — Pesan Telegram bersih tanpa backslash escaping

## 🏗️ Arsitektur

### Workflow Utama (Broadcast New Events)

```
┌──────────────┐    ┌─────────────────┐    ┌──────────────────┐
│  ⏰ Schedule  │───▶│  ⚙️ Config       │───▶│  🔄 Loop Sources │
│  (06:00 WIB) │    │  Sources        │    │  (SplitInBatches)│
└──────────────┘    └─────────────────┘    └────────┬─────────┘
                                                    │
                              ┌──────────────────────┼──────────────────────┐
                              ▼                      ▼                      │
                    ┌─────────────────┐    ┌─────────────────┐              │
                    │  📥 Fetch CSV   │    │  📊 Read State  │              │
                    │  (HTTP Request) │    │  Sheet          │              │
                    └────────┬────────┘    └────────┬────────┘              │
                             ▼                      │                      │
                    ┌─────────────────┐              │                      │
                    │  🔧 Parse &     │              │                      │
                    │  Transform Data │              │                      │
                    └────────┬────────┘              │                      │
                             │                      │                      │
                             ▼                      ▼                      │
                    ┌────────────────────────────────────────┐              │
                    │  🔍 Idempotency Filter (SQL Merge)     │              │
                    │  SELECT new WHERE NOT IN state_sheet   │              │
                    └────────────────┬───────────────────────┘              │
                                     ▼                                     │
                           ┌──────────────────┐                            │
                           │  ❓ Has New       │──── false ──▶ ⏭️ Skip ────┤
                           │  Events?         │                            │
                           └────────┬─────────┘                            │
                                    │ true                                 │
                    ┌───────────────┴───────────────┐                      │
                    ▼                               ▼                      │
          ┌──────────────┐                ┌──────────────┐                 │
          │ 📅 Calendar  │                │ 📊 Update    │                 │
          │ (create evt) │                │ State Sheet  │───────────┐     │
          └──────┬───────┘                └──────────────┘           │     │
                 ▼                                                  │     │
          ┌──────────────┐                                          │     │
          │ 🔗 Merge     │                                          │     │
          │ Cal + Data   │                                          │     │
          └──────┬───────┘                                          │     │
                 ▼                                                  │     │
          ┌──────────────┐                                          │     │
          │ 💬 Telegram  │                                          │     │
          │ (with link)  │                                          │     │
          └──────┬───────┘                                          │     │
                 ▼                                                  │     │
          ┌──────────────┐                                          │     │
          │ 📊 Update    │                                          │     │
          │ Cal Link     │                                          │     │
          └──────┬───────┘                                          │     │
                 └──────────────────────┬───────────────────────────┘     │
                                        ▼                                 │
                              ┌──────────────────┐                        │
                              │  ✅ Done         │────────────────────────┘
                              │  (Loop Back)     │
                              └──────────────────┘
```

### Workflow Reminder (Morning Reminder)

```
┌──────────────┐    ┌─────────────────┐    ┌──────────────────┐
│  ⏰ Schedule  │───▶│  ⚙️ Config       │───▶│  🔄 Loop Sources │
│  (06:00 WIB) │    │  Sources        │    │  (SplitInBatches)│
└──────────────┘    └─────────────────┘    └────────┬─────────┘
                                                    │
                              ┌──────────────────────┼──────────────┐
                              ▼                      ▼              │
                    ┌─────────────────┐    ┌─────────────────┐      │
                    │  📥 Fetch CSV   │    │  📊 Read State  │      │
                    │  (HTTP Request) │    │  Sheet          │      │
                    └────────┬────────┘    └────────┬────────┘      │
                             ▼                      │               │
                    ┌─────────────────┐              │               │
                    │  🔧 Parse &     │              │               │
                    │  Transform      │              │               │
                    └────────┬────────┘              │               │
                             ▼                      ▼               │
                    ┌────────────────────────────────────┐           │
                    │  🔍 Filter Today + Already Sent    │           │
                    │  INNER JOIN state + WHERE today    │           │
                    └────────────────┬───────────────────┘           │
                                     ▼                              │
                           ┌──────────────────┐                     │
                           │  ❓ Has Today     │── false ──▶ Skip ──┤
                           │  Events?         │                     │
                           └────────┬─────────┘                     │
                                    │ true                          │
                                    ▼                               │
                          ┌──────────────┐                          │
                          │ 🔔 Telegram  │                          │
                          │ Reminder     │                          │
                          └──────┬───────┘                          │
                                 ▼                                  │
                       ┌──────────────────┐                         │
                       │  ✅ Done         │─────────────────────────┘
                       └──────────────────┘
```

## 📋 Cara Kerja

### 1. Config Sources (Plugin System)

Node ini mendefinisikan semua sumber data. Cukup edit node ini untuk menambah jenis seminar baru:

```javascript
return [
  { json: {
    type: "Seminar Hasil",
    sheetUrl: "https://docs.google.com/spreadsheets/d/.../export?format=csv&gid=1341055501",
    columns: {
      no: 0, nim: 1, nama: 2,
      pembimbing1: 3, pembimbing2: 4,
      penguji1: 5, penguji2: 6,        // gunakan -1 jika tidak ada
      judul: 7, tanggal: 8, hari: 9,
      jam: 10, link: 11, ruangan: 12
    }
  }},
  { json: {
    type: "Seminar Proposal",
    sheetUrl: "https://docs.google.com/spreadsheets/d/.../export?format=csv&gid=1605122729",
    columns: {
      no: 0, nim: 1, nama: 2,
      pembimbing1: 3, pembimbing2: 4,
      penguji1: 5, penguji2: -1,       // Proposal hanya 1 penguji
      judul: 6, tanggal: 7, hari: 8,   // kolom bergeser
      jam: 9, link: 10, ruangan: 11
    }
  }}
];
```

### 2. CSV Parser

Parser menangani berbagai format data:

| Format | Contoh | Didukung |
|--------|--------|----------|
| Tanggal Indonesia | `30 Maret 2024` | ✅ |
| Tanggal DD-Mon-YYYY | `5-Jan-2026` | ✅ |
| Jam range | `09.00-10.40` | ✅ |
| Jam tunggal | `13.30 WIB` | ✅ (+2 jam otomatis) |
| Dosen dengan koma | `"Achmad Syaiful, S.tat.,M.Si"` | ✅ (quoted CSV) |
| Ruangan kosong/dash | ` ` atau `-` | ✅ → "TBA" |
| Multi-semester headers | `Semester Ganjil 2024/2025` | ✅ (di-skip) |

### 3. Idempotency (Anti-Duplikasi)

Setiap event di-hash berdasarkan `seminarType + NIM + parsed datetime`:

```
evt_4fd758a6  ← prefix "evt_" mencegah Google Sheets mengubah ke scientific notation
```

State Sheet menyimpan hash yang sudah diproses. SQL merge memfilter:

```sql
SELECT input1.*
FROM input1
LEFT JOIN input2 ON input1.event_hash_id = input2.event_hash_id
WHERE input2.event_hash_id IS NULL
```

### 4. Sequential Calendar → Telegram

Alur baru:
1. **Google Calendar** — Buat event, dapatkan `htmlLink`
2. **Merge Calendar + Data** — Gabungkan data asli dengan calendar link
3. **Telegram Broadcast** — Kirim pesan dengan link undangan Google Calendar
4. **Update Calendar Link** — Simpan link ke State Sheet untuk reminder

State Sheet juga diupdate **paralel** dengan alur di atas.

### 5. Morning Reminder (Workflow Terpisah)

Workflow ini berjalan setiap pagi dan:
1. Fetch semua data dari spreadsheet yang sama
2. Parse dan filter hanya seminar **hari ini**
3. INNER JOIN dengan State Sheet — hanya kirim reminder untuk seminar yang **sudah pernah di-broadcast**
4. Kirim pesan Telegram dengan format `🔔 REMINDER: SEMINAR HARI INI`

## 🚀 Setup Guide

### Prerequisites

- [n8n](https://n8n.io/) instance (self-hosted atau cloud)
- Google Cloud Project dengan OAuth2 credentials
- Telegram Bot (via [@BotFather](https://t.me/BotFather))
- Node.js (untuk rebuild workflow)

### Step 1: Buat State Sheet

Buat Google Spreadsheet baru dengan sheet bernama `state-sheet` dan header berikut:

```
event_hash_id | seminar_type | nim | nama | tanggal | jam | start_datetime | calendar_link | processed_at
```

Atau import file `state-sheet-template.csv`.

### Step 2: Setup Credentials di n8n

1. **Google Sheets OAuth2** — untuk baca spreadsheet dan tulis state
2. **Google Calendar OAuth2** — untuk buat event calendar
3. **Telegram Bot API** — masukkan bot token

### Step 3: Import Workflows

```bash
# Generate workflow JSON dari builder scripts
node build-workflow.js              # Main broadcast workflow
node build-reminder-workflow.js     # Morning reminder workflow
```

Import kedua file JSON ke n8n:
- `seminar-broadcast-workflow.json` — Broadcast new events
- `seminar-reminder-workflow.json` — Morning reminder

### Step 4: Konfigurasi

#### Main Workflow:
1. **Config Sources** — Edit URL spreadsheet dan column mapping
2. **Read State Sheet** — Set URL state sheet
3. **Update State Sheet** — Set URL state sheet (sama)
4. **Update Calendar Link in State** — Set URL state sheet (sama)
5. **Create Google Calendar Event** — Pilih calendar + set attendees
6. **Telegram Broadcast** — Set Chat ID grup/channel
7. **Credentials** — Hubungkan semua credential

#### Reminder Workflow:
1. **Schedule Trigger** — Set jam reminder (default 06:00)
2. **Read State Sheet** — Set URL state sheet (sama dengan main)
3. **Telegram Reminder** — Set Chat ID (sama dengan main)
4. **Credentials** — Hubungkan credential Google Sheets & Telegram

### Step 5: Test

1. Jalankan **main workflow** secara manual
2. Cek output "Parse & Transform Data" — pastikan semua record ter-parse
3. Cek Google Calendar — pastikan event terbuat
4. Cek Telegram — pastikan pesan terkirim dengan format bersih + link Calendar
5. Cek State Sheet — pastikan hash + calendar_link tersimpan
6. Jalankan ulang — pastikan **tidak ada duplikat**
7. Jalankan **reminder workflow** — pastikan hanya seminar hari ini yang muncul

## 📁 Struktur File

```
├── build-workflow.js                  # Builder script utama (sumber kebenaran)
├── build-reminder-workflow.js         # Builder script reminder
├── seminar-broadcast-workflow.json    # Generated: n8n main workflow
├── seminar-reminder-workflow.json     # Generated: n8n reminder workflow
├── state-sheet-template.csv           # Template untuk State Sheet
└── README.md                          # Dokumentasi ini
```

> **Penting**: Selalu edit `build-workflow.js` / `build-reminder-workflow.js` lalu run `node build-*.js` untuk regenerate. Jangan edit workflow JSON secara manual.

## 🔧 Menambah Seminar Baru

1. Buka `build-workflow.js` **DAN** `build-reminder-workflow.js`
2. Tambahkan entry baru di `configSourcesCode` di **kedua file**:

```javascript
,{ json: {
  type: "Seminar KP",
  sheetUrl: "https://docs.google.com/.../export?format=csv&gid=XXXXX",
  columns: {
    no: 0, nim: 1, nama: 2,
    pembimbing1: 3, pembimbing2: 4,
    penguji1: 5, penguji2: -1,    // -1 jika tidak ada
    judul: 6, tanggal: 7, hari: 8,
    jam: 9, link: 10, ruangan: 11
  }
}}
```

3. Run `node build-workflow.js && node build-reminder-workflow.js`
4. Re-import ke n8n

## ⚠️ Troubleshooting

### Hash duplikat / broadcast berulang
- **Penyebab**: Google Sheets mengubah hash hex ke scientific notation
- **Solusi**: Hash sudah di-prefix `evt_` — jika masih terjadi, clear State Sheet

### Telegram pesan dengan backslash
- **Penyebab**: parse_mode tidak diset ke HTML
- **Solusi**: Pastikan Telegram node punya `additionalFields.parse_mode: "HTML"`

### Kolom tertukar / field salah
- **Penyebab**: Column mapping tidak sesuai dengan layout spreadsheet
- **Solusi**: Buka CSV, hitung indeks kolom (0-indexed), update `columns` di Config Sources

### Calendar link tidak muncul di Telegram
- **Penyebab**: Calendar node gagal atau disabled
- **Solusi**: Pastikan Calendar node enabled dan credentials terhubung

### Reminder tidak kirim pesan
- **Penyebab 1**: Tidak ada seminar hari ini
- **Penyebab 2**: Seminar belum di-broadcast oleh main workflow
- **Solusi**: Jalankan main workflow dulu, lalu reminder

## 📝 Best Practices

1. **Jangan edit JSON manual** — Selalu gunakan `build-*.js`
2. **Sinkronkan config** — Config Sources harus sama di kedua workflow
3. **State Sheet terpisah** — Gunakan spreadsheet khusus untuk state
4. **Test lokal dulu** — Jalankan builder scripts sebelum import ke n8n
5. **Clear state saat ganti hash** — Jika formula hash berubah, clear State Sheet

## 📄 License

MIT
