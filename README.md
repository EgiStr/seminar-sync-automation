# 📢 Seminar Sync Automation

> Config-driven n8n workflow yang otomatis broadcast jadwal seminar (Hasil, Proposal, KP, dll.) ke Telegram dan Google Calendar dari Google Spreadsheet.

## ✨ Fitur

- **Plugin System** — Tambah/hapus jenis seminar cukup dari satu node config
- **Multi-Source** — Satu workflow memproses banyak spreadsheet sekaligus
- **Flexible Column Mapping** — Setiap source bisa punya layout kolom berbeda
- **Idempotency** — Tidak pernah kirim broadcast duplikat (State Sheet tracking)
- **Parallel Processing** — Calendar, Telegram, dan State Sheet berjalan paralel
- **Auto-Retry** — Calendar & Telegram retry otomatis 3× jika gagal
- **Smart Parser** — Handle format tanggal/jam Indonesia, quoted CSV fields, multi-semester headers

## 🏗️ Arsitektur

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
                    ┌───────────────┼───────────────┐                      │
                    ▼               ▼               ▼                      │
          ┌──────────────┐ ┌──────────────┐ ┌──────────────┐               │
          │ 📅 Calendar  │ │ 💬 Telegram  │ │ 📊 Update    │               │
          │ (retry 3×)   │ │ (retry 3×)   │ │ State Sheet  │               │
          └──────┬───────┘ └──────┬───────┘ └──────┬───────┘               │
                 │                │                │                       │
                 └────────────────┼────────────────┘                       │
                                  ▼                                        │
                        ┌──────────────────┐                               │
                        │  ✅ Done         │───────────────────────────────┘
                        │  (Loop Back)     │
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

### 4. Broadcast Paralel

Calendar, Telegram, dan State Sheet berjalan **paralel** (bukan sequential):
- Jika Calendar gagal, Telegram tetap jalan
- Jika Telegram gagal, State Sheet tetap update
- Masing-masing retry 3× dengan jeda 18 detik

## 🚀 Setup Guide

### Prerequisites

- [n8n](https://n8n.io/) instance (self-hosted atau cloud)
- Google Cloud Project dengan OAuth2 credentials
- Telegram Bot (via [@BotFather](https://t.me/BotFather))
- Node.js (untuk rebuild workflow)

### Step 1: Buat State Sheet

Buat Google Spreadsheet baru dengan sheet bernama `state-sheet` dan header berikut:

```
event_hash_id | seminar_type | nim | nama | tanggal | processed_at
```

Atau import file `state-sheet-template.csv`.

### Step 2: Setup Credentials di n8n

1. **Google Sheets OAuth2** — untuk baca spreadsheet dan tulis state
2. **Google Calendar OAuth2** — untuk buat event calendar
3. **Telegram Bot API** — masukkan bot token

### Step 3: Import Workflow

```bash
# Generate workflow JSON dari builder script
node build-workflow.js
```

Import `seminar-broadcast-workflow.json` ke n8n.

### Step 4: Konfigurasi

1. **Config Sources** — Edit URL spreadsheet dan column mapping
2. **Read State Sheet** — Set URL state sheet
3. **Update State Sheet** — Set URL state sheet (sama)
4. **Create Google Calendar Event** — Pilih calendar
5. **Telegram Broadcast** — Set Chat ID grup/channel
6. **Credentials** — Hubungkan semua credential

### Step 5: Test

1. Jalankan workflow secara manual
2. Cek output "Parse & Transform Data" — pastikan semua record ter-parse
3. Cek Telegram — pastikan pesan terkirim dengan format benar
4. Cek State Sheet — pastikan hash tersimpan
5. Jalankan ulang — pastikan **tidak ada duplikat**

## 📁 Struktur File

```
├── build-workflow.js                  # Builder script (sumber kebenaran)
├── seminar-broadcast-workflow.json    # Generated n8n workflow (jangan edit manual)
├── state-sheet-template.csv           # Template untuk State Sheet
└── README.md                          # Dokumentasi ini
```

> **Penting**: Selalu edit `build-workflow.js` lalu run `node build-workflow.js` untuk regenerate workflow JSON. Jangan edit workflow JSON secara manual — escaping JSON/JS sangat rawan error.

## ⚠️ Troubleshooting

### Hash duplikat / broadcast berulang
- **Penyebab**: Google Sheets mengubah hash hex ke scientific notation
- **Solusi**: Hash sudah di-prefix `evt_` — jika masih terjadi, clear State Sheet

### Telegram pesan kosong
- **Penyebab**: `$json` mereferensi node yang salah setelah Calendar
- **Solusi**: Pastikan Telegram & State Sheet berjalan paralel dari IF node (bukan sequential dari Calendar)

### Kolom tertukar / field salah
- **Penyebab**: Column mapping tidak sesuai dengan layout spreadsheet
- **Solusi**: Buka CSV, hitung indeks kolom (0-indexed), update `columns` di Config Sources

### Parse gagal (0 record)
- **Penyebab 1**: JSON escaping error (`\\\\n` vs `\\n`)
- **Penyebab 2**: Quote stripping di CSV line splitter
- **Solusi**: Gunakan `build-workflow.js` — `JSON.stringify()` handles escaping otomatis

## 🔧 Menambah Seminar Baru

1. Buka `build-workflow.js`
2. Tambahkan entry baru di `configSourcesCode`:

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

3. Run `node build-workflow.js`
4. Re-import ke n8n

## 📝 Best Practices

1. **Jangan edit JSON manual** — Selalu gunakan `build-workflow.js`
2. **Prefix hash** — Gunakan prefix non-numerik (`evt_`) agar Google Sheets tidak mengubah format
3. **Parallel, bukan sequential** — Calendar & Telegram harus paralel untuk resilience
4. **Retry dengan jeda** — Set `waitBetweenTries` ke 18+ detik untuk menghindari rate limiting
5. **State Sheet terpisah** — Gunakan spreadsheet khusus untuk state, bukan di sheet data
6. **Column mapping fleksibel** — Gunakan `-1` untuk kolom yang tidak ada
7. **Normalized hash input** — Hash dari parsed ISO datetime, bukan raw text
8. **FNV-1a hash** — Gunakan `Math.imul()` + `>>> 0` untuk deterministic 32-bit hash
9. **Test lokal dulu** — Gunakan `node test-parser.js` sebelum deploy ke n8n
10. **Clear state saat ganti hash** — Jika formula hash berubah, clear State Sheet

## 📄 License

MIT
