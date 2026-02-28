// =============================================================
// Build the Arsitektur Lanskap (ARL) seminar workflow JSON
// Usage: node build-workflow-arl.js
// =============================================================
// Spreadsheet: https://docs.google.com/spreadsheets/d/1LmT0TTOHwSwSEPFZfsTdE-KZrQEZgaX51s1oSF3FNt0
//   SEMHAS gid=1098398615  |  SEMPRO gid=1747146599
//
// Column layout (Google Forms response format):
//   SEMPRO: Timestamp | NIM | NAMA | JUDUL | Pembimbing1 | Pembimbing2 |
//           Penguji | Moderator | Hari+Tanggal | Jam | Ruang | files...
//   SEMHAS: Timestamp | NIM | NAMA | BentukTA | JUDUL | Pembimbing1 |
//           Pembimbing2 | Penguji | Moderator | Hari+Tanggal | Jam | Ruang | files...
//
// Date format quirks:
//   - "Senin, 01 April 2024" (with comma)
//   - "Selasa 14 Mei 2024" (without comma)
//   - "3/5/2026" (M/D/YYYY — US date from Google Sheets)
// Time format quirks:
//   - "09.00-10.00", "10:00-11.00" (standard)
//   - "1:00:00 PM", "3:00:00 PM" (12-hour with seconds)
//   - "09.00-10.00 " (trailing spaces)
//
// ARL has single PENGUJI + MODERATOR (moderator → penguji2 slot)
// =============================================================
const fs = require('fs');
const path = require('path');

// ---- JS code for Config Sources node ----
const configSourcesCode = [
  '',
  '// ============================',
  '// PLUGIN CONFIG — Arsitektur Lanskap (ARL) seminar types',
  '// ============================',
  '',
  'return [',
  '  { json: {',
  '    type: "Seminar Hasil",',
  '    sheetUrl: "https://docs.google.com/spreadsheets/d/1LmT0TTOHwSwSEPFZfsTdE-KZrQEZgaX51s1oSF3FNt0/export?format=csv&gid=1098398615",',
  '    columns: {',
  '      timestamp: 0, nim: 1, nama: 2,',
  '      bentukTA: 3, judul: 4,',
  '      pembimbing1: 5, pembimbing2: 6,',
  '      penguji1: 7, penguji2: 8,',
  '      hariTanggal: 9, jam: 10, ruangan: 11,',
  '      link: -1',
  '    }',
  '  }},',
  '  { json: {',
  '    type: "Seminar Proposal",',
  '    sheetUrl: "https://docs.google.com/spreadsheets/d/1LmT0TTOHwSwSEPFZfsTdE-KZrQEZgaX51s1oSF3FNt0/export?format=csv&gid=1747146599",',
  '    columns: {',
  '      timestamp: 0, nim: 1, nama: 2,',
  '      bentukTA: -1, judul: 3,',
  '      pembimbing1: 4, pembimbing2: 5,',
  '      penguji1: 6, penguji2: 7,',
  '      hariTanggal: 8, jam: 9, ruangan: 10,',
  '      link: -1',
  '    }',
  '  }}',
  '];',
].join('\n');

// ---- JS code for Parse & Transform node ----
const parseTransformCode = [
  '// CSV Parse + Transform + Validate + Hash  (Arsitektur Lanskap / ARL)',
  '// Config-driven: reads column mapping from Config Sources node.',
  '// Handles: Google Forms timestamp rows, combined Hari+Tanggal field,',
  '//          mixed date formats (Indonesian text / US MM/DD/YYYY),',
  '//          mixed time formats (24h dot/colon / 12h AM/PM with seconds),',
  '//          single Penguji + Moderator mapped as penguji1 + penguji2',
  '',
  'const config = $(\'Loop Over Sources\').item.json;',
  'const col = config.columns;',
  'const seminarType = config.type;',
  '',
  '// FNV-1a hash',
  'function eventHash(str) {',
  '  let h = 0x811c9dc5;',
  '  for (let i = 0; i < str.length; i++) {',
  '    h ^= str.charCodeAt(i);',
  '    h = Math.imul(h, 16777619);',
  '    h = h >>> 0;',
  '  }',
  '  return \'evt_\' + h.toString(16).padStart(8, \'0\');',
  '}',
  '',
  '// CSV Parser (handles quoted fields with commas and embedded newlines)',
  'function parseCsvToArrays(csvText) {',
  '  const lines = [];',
  '  let current = \'\';',
  '  let inQuotes = false;',
  '  for (let i = 0; i < csvText.length; i++) {',
  '    const ch = csvText[i];',
  '    if (ch === \'"\') {',
  '      current += ch;',
  '      if (inQuotes && csvText[i + 1] === \'"\') { current += \'"\'; i++; }',
  '      else { inQuotes = !inQuotes; }',
  '    } else if (ch === \'\\n\' && !inQuotes) {',
  '      lines.push(current); current = \'\';',
  '    } else if (ch === \'\\r\' && !inQuotes) {',
  '      /* skip */',
  '    } else { current += ch; }',
  '  }',
  '  if (current.length > 0) lines.push(current);',
  '',
  '  return lines.map(line => {',
  '    const fields = []; let field = \'\'; let inQ = false;',
  '    for (let i = 0; i < line.length; i++) {',
  '      const ch = line[i];',
  '      if (ch === \'"\') {',
  '        if (inQ && line[i + 1] === \'"\') { field += \'"\'; i++; }',
  '        else { inQ = !inQ; }',
  '      } else if (ch === \',\' && !inQ) {',
  '        fields.push(field.trim()); field = \'\';',
  '      } else { field += ch; }',
  '    }',
  '    fields.push(field.trim());',
  '    return fields;',
  '  });',
  '}',
  '',
  '// Month maps (Indonesian + English + common typos)',
  'const BULAN = {',
  '  \'januari\':0,\'februari\':1,\'febuari\':1,\'maret\':2,\'april\':3,\'mei\':4,\'juni\':5,',
  '  \'juli\':6,\'agustus\':7,\'september\':8,\'oktober\':9,\'october\':9,',
  '  \'november\':10,\'nopember\':10,\'desember\':11,\'december\':11',
  '};',
  'const BULAN_SHORT = {',
  '  \'jan\':0,\'feb\':1,\'mar\':2,\'apr\':3,\'may\':4,\'jun\':5,',
  '  \'jul\':6,\'aug\':7,\'sep\':8,\'oct\':9,\'nov\':10,\'dec\':11,\'des\':11',
  '};',
  'const BULAN_NAMES = [\'Januari\',\'Februari\',\'Maret\',\'April\',\'Mei\',\'Juni\',',
  '  \'Juli\',\'Agustus\',\'September\',\'Oktober\',\'November\',\'Desember\'];',
  '',
  '// Day name map for normalization',
  'const HARI_MAP = {',
  '  senin:\'Senin\', selasa:\'Selasa\', rabu:\'Rabu\',',
  '  kamis:\'Kamis\', jumat:\'Jumat\', sabtu:\'Sabtu\', minggu:\'Minggu\'',
  '};',
  '',
  '// Parse combined "Hari, DD Month YYYY" or "Hari DD Month YYYY" or "M/D/YYYY"',
  'function parseHariTanggal(s) {',
  '  if (!s) return null;',
  '  const t = s.replace(/\\n/g, \' \').trim();',
  '',
  '  // Try US date: M/D/YYYY (from Google Sheets auto-format)',
  '  const usMatch = t.match(/^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})$/);',
  '  if (usMatch) {',
  '    const m = parseInt(usMatch[1]) - 1;',
  '    const d = parseInt(usMatch[2]);',
  '    const y = parseInt(usMatch[3]);',
  '    return { year: y, month: m, day: d, hari: \'\' };',
  '  }',
  '',
  '  // Try "Hari, DD MonthName YYYY" or "Hari DD MonthName YYYY"',
  '  const wordMatch = t.match(/(\\d{1,2})\\s+(\\w+)\\s+(\\d{4})/);',
  '  if (wordMatch) {',
  '    const d = parseInt(wordMatch[1]);',
  '    const mLower = wordMatch[2].toLowerCase();',
  '    const m = BULAN[mLower] !== undefined ? BULAN[mLower] : BULAN_SHORT[mLower.substring(0,3)];',
  '    const y = parseInt(wordMatch[3]);',
  '    if (m !== undefined) {',
  '      const before = t.substring(0, t.indexOf(wordMatch[0])).replace(/[,\\s]+$/, \'\').trim();',
  '      const hariClean = before ? (HARI_MAP[before.toLowerCase().replace(/[^a-z]/g,\'\')] || before) : \'\';',
  '      return { year: y, month: m, day: d, hari: hariClean };',
  '    }',
  '  }',
  '',
  '  return null;',
  '}',
  '',
  '// Parse time range — handles many ARL formats:',
  '// "09.00-10.00", "10:00-11.00", "13:00-14:00", "9.00-10.00"',
  '// "1:00:00 PM", "3:00:00 PM" (12-hour with seconds from Google Sheets)',
  '// "09.00-10.00 " (trailing spaces)',
  'function parseTimeRange(s) {',
  '  if (!s) return null;',
  '  let cleaned = s.replace(/\\s*(WIB|WITA|WIT)\\s*/gi, \'\').trim();',
  '',
  '  // Handle 12-hour format: "1:00:00 PM" or "9:00:00 AM"',
  '  const ampmMatch = cleaned.match(/^(\\d{1,2}):(\\d{2})(?::\\d{2})?\\s*(AM|PM)$/i);',
  '  if (ampmMatch) {',
  '    let h = parseInt(ampmMatch[1]);',
  '    const mi = parseInt(ampmMatch[2]);',
  '    const isPM = ampmMatch[3].toUpperCase() === \'PM\';',
  '    if (isPM && h !== 12) h += 12;',
  '    if (!isPM && h === 12) h = 0;',
  '    let eh = h + 1;',
  '    if (eh >= 24) eh -= 24;',
  '    return { sh: h, sm: mi, eh, em: mi };',
  '  }',
  '',
  '  // Normalize spaces around dots/colons',
  '  cleaned = cleaned.replace(/\\s*([.:])\\s*/g, \'$1\');',
  '  cleaned = cleaned.replace(/[\\s,\\-]+$/, \'\');',
  '',
  '  const parts = cleaned.split(/\\s*-\\s*/);',
  '  const parse = t => {',
  '    const m = t.trim().match(/^(\\d{1,2})[.:](\\d{2})$/);',
  '    return m ? { h: parseInt(m[1]), m: parseInt(m[2]) } : null;',
  '  };',
  '  const start = parse(parts[0]);',
  '  if (!start) return null;',
  '  if (parts.length >= 2 && parts[1]) {',
  '    const end = parse(parts[1]);',
  '    if (end) return { sh: start.h, sm: start.m, eh: end.h, em: end.m };',
  '  }',
  '  // Default: 1 hour duration',
  '  let eh = start.h + 1, em = start.m;',
  '  if (eh >= 24) eh -= 24;',
  '  return { sh: start.h, sm: start.m, eh, em };',
  '}',
  '',
  'function toISO(y, mo, d, h, mi) {',
  '  const pad = n => String(n).padStart(2, \'0\');',
  '  return `${y}-${pad(mo+1)}-${pad(d)}T${pad(h)}:${pad(mi)}:00+07:00`;',
  '}',
  '',
  '// ===== MAIN =====',
  'const raw = $input.first().json[\'data\'];',
  'if (!raw) return [];',
  '',
  'const allRows = parseCsvToArrays(raw);',
  'if (allRows.length < 2) return [];',
  '',
  '// Normalize all fields (remove embedded newlines from quoted CSV cells)',
  'for (let i = 0; i < allRows.length; i++) {',
  '  allRows[i] = allRows[i].map(f => f.replace(/\\n/g, \' \').replace(/\\s+/g, \' \').trim());',
  '}',
  '',
  'const results = [];',
  '',
  'for (let i = 0; i < allRows.length; i++) {',
  '  const c = allRows[i];',
  '',
  '  // Skip header row and short rows',
  '  if (c.length < 8) continue;',
  '  const firstCell = (c[0] || \'\').trim().toLowerCase();',
  '  if (firstCell.startsWith(\'timestamp\') || firstCell === \'no\') continue;',
  '',
  '  // NIM validation (primary filter — catches all non-data rows)',
  '  const nim = (c[col.nim] || \'\').trim();',
  '  if (!nim || !/^\\d+$/.test(nim)) continue;',
  '',
  '  const nama        = (c[col.nama]        || \'\').trim();',
  '  const pembimbing1 = (c[col.pembimbing1] || \'\').trim();',
  '  let   pembimbing2 = (c[col.pembimbing2] || \'\').trim();',
  '  const penguji1    = (c[col.penguji1]    || \'\').trim();',
  '  const penguji2    = col.penguji2 >= 0 ? (c[col.penguji2] || \'\').trim() : \'\';',
  '  const judul       = col.judul >= 0 ? (c[col.judul] || \'\').trim() : \'\';',
  '  const link        = col.link >= 0 ? (c[col.link] || \'\').trim() : \'\';',
  '  let   ruangan     = (c[col.ruangan]     || \'\').trim();',
  '',
  '  // Clean up placeholder values',
  '  if (pembimbing2 === \'-\') pembimbing2 = \'\';',
  '  if (ruangan === \'-\') ruangan = \'\';',
  '',
  '  // Parse date from combined hariTanggal field',
  '  const rawHT = (c[col.hariTanggal] || \'\').trim();',
  '  const parsed = parseHariTanggal(rawHT);',
  '  if (!parsed) continue;',
  '  const pd = { year: parsed.year, month: parsed.month, day: parsed.day };',
  '  const hari = parsed.hari;',
  '  const tanggal = parsed.day + \' \' + BULAN_NAMES[parsed.month] + \' \' + parsed.year;',
  '',
  '  // Parse time',
  '  const jam = (c[col.jam] || \'\').trim();',
  '  if (!nama || !jam) continue;',
  '  const pt = parseTimeRange(jam);',
  '  if (!pt) continue;',
  '',
  '  const startDt = toISO(pd.year, pd.month, pd.day, pt.sh, pt.sm);',
  '  const endDt   = toISO(pd.year, pd.month, pd.day, pt.eh, pt.em);',
  '  const eventHashId = eventHash(`${seminarType}|${nim}|${startDt}`);',
  '',
  '  results.push({ json: {',
  '    program: "Arsitektur Lanskap",',
  '    seminar_type: seminarType,',
  '    nim, nama, tanggal, hari, jam, ruangan, judul, link,',
  '    pembimbing1, pembimbing2, pembimbing3: "", penguji1, penguji2,',
  '    start_datetime: startDt,',
  '    end_datetime: endDt,',
  '    event_hash_id: eventHashId,',
  '    calendar_summary: `[${seminarType}] ${nama} - ${nim}`,',
  '    calendar_location: ruangan ? `Ruangan ${ruangan}` : \'TBA\',',
  '    calendar_description: `Judul: ${judul}\\nNIM: ${nim}\\nPembimbing 1: ${pembimbing1}${pembimbing2 ? \'\\nPembimbing 2: \' + pembimbing2 : \'\'}\\nPenguji: ${penguji1}${penguji2 ? \'\\nModerator: \' + penguji2 : \'\'}${link ? \'\\nLink: \' + link : \'\'}`',
  '  }});',
  '}',
  '',
  'return results;',
].join('\n');

const mergeCalendarDataCode = [
  '// Merge Calendar API responses with original event data',
  '// Uses index-based matching (Calendar processes items in same order)',
  'const calItems = $input.all();',
  'const originals = $(\'Has New Events?\').all();',
  'const results = [];',
  'for (let i = 0; i < calItems.length; i++) {',
  '  const calLink = calItems[i].json.htmlLink || \'\';',
  '  const orig = originals[i] ? originals[i].json : {};',
  '  results.push({ json: { ...orig, calendar_link: calLink } });',
  '}',
  'return results;',
].join('\n');

// ---- Telegram template (HTML parse mode — clean formatting) ----
// ARL has Penguji + Moderator (mapped as penguji1 + penguji2)
const telegramTemplate = '={{ \n' +
  '(function() {\n' +
  '  const e = (s) => s ? String(s).replace(/&/g,\'&amp;\').replace(/</g,\'&lt;\').replace(/>/g,\'&gt;\') : \'\';\n' +
  '  const seminarType = e($json.seminar_type);\n' +
  '  const nama = e($json.nama);\n' +
  '  const nim = e($json.nim);\n' +
  '  const judul = e($json.judul);\n' +
  '  const hari = e($json.hari);\n' +
  '  const tanggal = e($json.tanggal);\n' +
  '  const jam = e($json.jam);\n' +
  '  const ruangan = e($json.ruangan);\n' +
  '  const penguji1 = e($json.penguji1);\n' +
  '  const penguji2 = e($json.penguji2);\n' +
  '  const pembimbing1 = e($json.pembimbing1);\n' +
  '  const pembimbing2 = e($json.pembimbing2);\n' +
  '  const calLink = $json.calendar_link || \'\';\n' +
  '\n' +
  '  let msg = \'📢 <b>JADWAL \' + seminarType.toUpperCase() + \'</b> <i>(Arsitektur Lanskap)</i>\' + \'\\n\\n\' +\n' +
  '    \'👤 <b>Nama:</b> \' + nama + \'\\n\' +\n' +
  '    \'🆔 <b>NIM:</b> \' + nim + \'\\n\' +\n' +
  '    \'📝 <b>Judul:</b> \' + judul + \'\\n\\n\' +\n' +
  '    \'📅 <b>Hari/Tanggal:</b> \' + (hari ? hari + \', \' : \'\') + tanggal + \'\\n\' +\n' +
  '    \'🕐 <b>Jam:</b> \' + jam + \' WIB\' + \'\\n\' +\n' +
  '    \'📍 <b>Ruangan:</b> \' + (ruangan || \'TBA\') + \'\\n\\n\' +\n' +
  '    \'👨‍🏫 <b>Penguji:</b> \' + penguji1 + \'\\n\';\n' +
  '  if (penguji2) msg += \'🎙️ <b>Moderator:</b> \' + penguji2 + \'\\n\';\n' +
  '  msg += \'\\n👨‍💼 <b>Pembimbing 1:</b> \' + pembimbing1 + \'\\n\';\n' +
  '  if (pembimbing2) msg += \'👩‍💼 <b>Pembimbing 2:</b> \' + pembimbing2 + \'\\n\';\n' +
  '  if (calLink) msg += \'\\n📎 <a href="\' + calLink + \'">Buka Undangan Google Calendar</a>\\n\';\n' +
  '  msg += \'\\n<i>Pesan otomatis via n8n</i>\';\n' +
  '  return msg;\n' +
  '})()\n' +
  '}}';

// ===== BUILD WORKFLOW =====
const workflow = {
  name: "Seminar Sync Automation - Arsitektur Lanskap",
  nodes: [
    // 1. Schedule Trigger
    {
      parameters: {
        rule: { interval: [{ triggerAtHour: 6, triggerAtMinute: 0 }] }
      },
      id: "e1f2a3b4-0001-4000-8000-000000000001",
      name: "Schedule Trigger (06:00 WIB)",
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1.2,
      position: [0, 0]
    },

    // 2. Config Sources
    {
      parameters: { jsCode: configSourcesCode },
      id: "e1f2a3b4-0011-4000-8000-000000000011",
      name: "Config Sources",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [260, 0],
      notes: "PLUGIN CONFIG: Arsitektur Lanskap — SEMHAS + SEMPRO"
    },

    // 3. Loop Over Sources
    {
      parameters: { batchSize: 1, options: {} },
      id: "e1f2a3b4-0012-4000-8000-000000000012",
      name: "Loop Over Sources",
      type: "n8n-nodes-base.splitInBatches",
      typeVersion: 3,
      position: [520, 0],
      notes: "Processes one source config at a time"
    },

    // 4. Fetch CSV (dynamic URL)
    {
      parameters: {
        method: "GET",
        url: "={{ $json.sheetUrl }}",
        authentication: "predefinedCredentialType",
        nodeCredentialType: "googleSheetsOAuth2Api",
        options: {
          response: { response: { responseFormat: "text" } }
        }
      },
      id: "e1f2a3b4-0002-4000-8000-000000000002",
      name: "Fetch CSV (HTTP Request)",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [780, 0],
      credentials: {
        googleSheetsOAuth2Api: {
          id: "GOOGLE_SHEETS_CREDENTIAL_ID",
          name: "Google Sheets OAuth2 - CONFIGURE ME"
        }
      },
      notes: "URL comes from Config Sources — no need to edit"
    },

    // 5. Parse & Transform Data
    {
      parameters: { jsCode: parseTransformCode },
      id: "e1f2a3b4-0003-4000-8000-000000000003",
      name: "Parse & Transform Data",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1040, 0],
      notes: "ARL parser: Google Forms format, mixed date/time, Penguji+Moderator"
    },

    // 6. Read State Sheet
    {
      parameters: {
        operation: "read",
        documentId: { __rl: true, mode: "url", value: "https://docs.google.com/spreadsheets/d/1yl-IpOrB5xSCUODvvOPCD_4HxrpdK9f77Q1qT5XjV2I/edit?gid=119803019#gid=119803019" },
        sheetName: { __rl: true, mode: "name", value: "state-sheet" },
        options: {}
      },
      id: "e1f2a3b4-0004-4000-8000-000000000004",
      name: "Read State Sheet",
      type: "n8n-nodes-base.googleSheets",
      typeVersion: 4.5,
      position: [1040, 240],
      credentials: {
        googleSheetsOAuth2Api: {
          id: "GOOGLE_SHEETS_CREDENTIAL_ID",
          name: "Google Sheets OAuth2 - CONFIGURE ME"
        }
      },
      notes: "SETUP: Set your State Sheet URL"
    },

    // 7. Idempotency Filter
    {
      parameters: {
        mode: "combineBySql",
        numberInputs: 2,
        query: "SELECT input1.*\nFROM input1\nLEFT JOIN input2 ON input1.event_hash_id = input2.event_hash_id\nWHERE input2.event_hash_id IS NULL",
        options: {}
      },
      id: "e1f2a3b4-0005-4000-8000-000000000005",
      name: "Idempotency Filter (New Events Only)",
      type: "n8n-nodes-base.merge",
      typeVersion: 3,
      position: [1300, 0],
      notes: "LEFT JOIN + WHERE NULL: only new events pass through"
    },

    // 8. Filter Valid Events
    {
      parameters: {
        jsCode: [
          '// Filter out empty items from SQL Merge (returns empty item when no matches)',
          'const items = $input.all();',
          'const valid = items.filter(item => {',
          '  const hash = (item.json.event_hash_id || \'\').trim();',
          '  return hash.length > 0;',
          '});',
          'return valid;',
        ].join('\n')
      },
      id: "e1f2a3b4-0006-4000-8000-000000000006",
      name: "Has New Events?",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1560, 0],
      notes: "Filters out empty items. If no valid items, downstream nodes won't execute."
    },

    // 9. Create Google Calendar Event
    {
      parameters: {
        calendar: { __rl: true, mode: "id", value: "eggi.122450032@student.itera.ac.id" },
        start: "={{ $json.start_datetime }}",
        end: "={{ $json.end_datetime }}",
        additionalFields: {
          summary: "={{ $json.calendar_summary }}",
          location: "={{ $json.calendar_location }}",
          description: "={{ $json.calendar_description }}",
          attendees: [],
          guestsCanModify: true
        }
      },
      id: "e1f2a3b4-0007-4000-8000-000000000007",
      name: "Create Google Calendar Event",
      type: "n8n-nodes-base.googleCalendar",
      typeVersion: 1.2,
      position: [1820, -100],
      onError: "continueRegularOutput",
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 5000,
      credentials: {
        googleCalendarOAuth2Api: {
          id: "GOOGLE_CALENDAR_CREDENTIAL_ID",
          name: "Google Calendar OAuth2 - CONFIGURE ME"
        }
      },
      notes: "Runs FIRST (before Telegram). Output provides htmlLink for Calendar invite."
    },

    // 10. Merge Calendar + Data
    {
      parameters: { jsCode: mergeCalendarDataCode },
      id: "e1f2a3b4-0014-4000-8000-000000000014",
      name: "Merge Calendar + Data",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [2080, -100],
      notes: "Combines original event data with Google Calendar htmlLink"
    },

    // 11. Telegram Broadcast
    {
      parameters: {
        chatId: "1404670948",
        text: telegramTemplate,
        additionalFields: {
          parse_mode: "HTML",
          disable_notification: false
        }
      },
      id: "e1f2a3b4-0008-4000-8000-000000000008",
      name: "Telegram Broadcast",
      type: "n8n-nodes-base.telegram",
      typeVersion: 1.2,
      position: [2340, -100],
      onError: "continueRegularOutput",
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 5000,
      credentials: {
        telegramApi: {
          id: "TELEGRAM_CREDENTIAL_ID",
          name: "Telegram Bot API - CONFIGURE ME"
        }
      },
      notes: "ARL template: Penguji + Moderator. HTML parse mode for clean formatting."
    },

    // 12. Update State Sheet
    {
      parameters: {
        operation: "append",
        documentId: { __rl: true, mode: "url", value: "https://docs.google.com/spreadsheets/d/1yl-IpOrB5xSCUODvvOPCD_4HxrpdK9f77Q1qT5XjV2I/edit?gid=119803019#gid=119803019" },
        sheetName: { __rl: true, mode: "name", value: "state-sheet" },
        columns: {
          mappingMode: "defineBelow",
          value: {
            event_hash_id: "={{ $json.event_hash_id }}",
            program: "={{ $json.program }}",
            seminar_type: "={{ $json.seminar_type }}",
            nim: "={{ $json.nim }}",
            nama: "={{ $json.nama }}",
            judul: "={{ $json.judul }}",
            hari: "={{ $json.hari }}",
            tanggal: "={{ $json.tanggal }}",
            jam: "={{ $json.jam }}",
            ruangan: "={{ $json.ruangan }}",
            pembimbing1: "={{ $json.pembimbing1 }}",
            pembimbing2: "={{ $json.pembimbing2 }}",
            pembimbing3: "={{ $json.pembimbing3 }}",
            penguji1: "={{ $json.penguji1 }}",
            penguji2: "={{ $json.penguji2 }}",
            link: "={{ $json.link }}",
            start_datetime: "={{ $json.start_datetime }}",
            end_datetime: "={{ $json.end_datetime }}",
            calendar_link: "={{ $json.calendar_link }}",
            processed_at: "={{ $now.toISO() }}"
          },
          matchingColumns: [],
          schema: [
            { id: "event_hash_id", displayName: "event_hash_id", required: false, defaultMatch: false, canBeUsedToMatch: true, display: true, type: "string", removed: false },
            { id: "program", displayName: "program", required: false, defaultMatch: false, canBeUsedToMatch: false, display: true, type: "string", removed: false },
            { id: "seminar_type", displayName: "seminar_type", required: false, defaultMatch: false, canBeUsedToMatch: false, display: true, type: "string", removed: false },
            { id: "nim", displayName: "nim", required: false, defaultMatch: false, canBeUsedToMatch: false, display: true, type: "string", removed: false },
            { id: "nama", displayName: "nama", required: false, defaultMatch: false, canBeUsedToMatch: false, display: true, type: "string", removed: false },
            { id: "judul", displayName: "judul", required: false, defaultMatch: false, canBeUsedToMatch: false, display: true, type: "string", removed: false },
            { id: "hari", displayName: "hari", required: false, defaultMatch: false, canBeUsedToMatch: false, display: true, type: "string", removed: false },
            { id: "tanggal", displayName: "tanggal", required: false, defaultMatch: false, canBeUsedToMatch: false, display: true, type: "string", removed: false },
            { id: "jam", displayName: "jam", required: false, defaultMatch: false, canBeUsedToMatch: false, display: true, type: "string", removed: false },
            { id: "ruangan", displayName: "ruangan", required: false, defaultMatch: false, canBeUsedToMatch: false, display: true, type: "string", removed: false },
            { id: "pembimbing1", displayName: "pembimbing1", required: false, defaultMatch: false, canBeUsedToMatch: false, display: true, type: "string", removed: false },
            { id: "pembimbing2", displayName: "pembimbing2", required: false, defaultMatch: false, canBeUsedToMatch: false, display: true, type: "string", removed: false },
            { id: "pembimbing3", displayName: "pembimbing3", required: false, defaultMatch: false, canBeUsedToMatch: false, display: true, type: "string", removed: false },
            { id: "penguji1", displayName: "penguji1", required: false, defaultMatch: false, canBeUsedToMatch: false, display: true, type: "string", removed: false },
            { id: "penguji2", displayName: "penguji2", required: false, defaultMatch: false, canBeUsedToMatch: false, display: true, type: "string", removed: false },
            { id: "link", displayName: "link", required: false, defaultMatch: false, canBeUsedToMatch: false, display: true, type: "string", removed: false },
            { id: "start_datetime", displayName: "start_datetime", required: false, defaultMatch: false, canBeUsedToMatch: false, display: true, type: "string", removed: false },
            { id: "end_datetime", displayName: "end_datetime", required: false, defaultMatch: false, canBeUsedToMatch: false, display: true, type: "string", removed: false },
            { id: "calendar_link", displayName: "calendar_link", required: false, defaultMatch: false, canBeUsedToMatch: false, display: true, type: "string", removed: false },
            { id: "processed_at", displayName: "processed_at", required: false, defaultMatch: false, canBeUsedToMatch: false, display: true, type: "string", removed: false }
          ]
        },
        options: {}
      },
      id: "e1f2a3b4-0009-4000-8000-000000000009",
      name: "Update State Sheet",
      type: "n8n-nodes-base.googleSheets",
      typeVersion: 4.5,
      position: [2600, -100],
      credentials: {
        googleSheetsOAuth2Api: {
          id: "GOOGLE_SHEETS_CREDENTIAL_ID",
          name: "Google Sheets OAuth2 - CONFIGURE ME"
        }
      },
      notes: "SETUP: Set your State Sheet URL. Runs after Telegram — has all data + calendar_link."
    },

    // 13. Done Processing Source
    {
      parameters: {},
      id: "e1f2a3b4-0013-4000-8000-000000000013",
      name: "Done Processing Source",
      type: "n8n-nodes-base.noOp",
      typeVersion: 1,
      position: [2860, 100],
      notes: "Loops back to next source"
    }
  ],

  connections: {
    "Schedule Trigger (06:00 WIB)": {
      main: [[
        { node: "Config Sources", type: "main", index: 0 }
      ]]
    },
    "Config Sources": {
      main: [[
        { node: "Loop Over Sources", type: "main", index: 0 }
      ]]
    },
    "Loop Over Sources": {
      main: [
        [],
        [{ node: "Fetch CSV (HTTP Request)", type: "main", index: 0 },
         { node: "Read State Sheet", type: "main", index: 0 }]
      ]
    },
    "Fetch CSV (HTTP Request)": {
      main: [[
        { node: "Parse & Transform Data", type: "main", index: 0 }
      ]]
    },
    "Parse & Transform Data": {
      main: [[
        { node: "Idempotency Filter (New Events Only)", type: "main", index: 0 }
      ]]
    },
    "Read State Sheet": {
      main: [[
        { node: "Idempotency Filter (New Events Only)", type: "main", index: 1 }
      ]]
    },
    "Idempotency Filter (New Events Only)": {
      main: [[
        { node: "Has New Events?", type: "main", index: 0 }
      ]]
    },
    "Has New Events?": {
      main: [[
        { node: "Create Google Calendar Event", type: "main", index: 0 }
      ]]
    },
    "Create Google Calendar Event": {
      main: [[{ node: "Merge Calendar + Data", type: "main", index: 0 }]]
    },
    "Merge Calendar + Data": {
      main: [[
        { node: "Telegram Broadcast", type: "main", index: 0 },
        { node: "Update State Sheet", type: "main", index: 0 }
      ]]
    },
    "Telegram Broadcast": {
      main: [[{ node: "Done Processing Source", type: "main", index: 0 }]]
    },
    "Update State Sheet": {
      main: [[{ node: "Done Processing Source", type: "main", index: 0 }]]
    },
    "Done Processing Source": {
      main: [[{ node: "Loop Over Sources", type: "main", index: 0 }]]
    }
  },

  pinData: {},
  settings: {
    executionOrder: "v1",
    saveManualExecutions: true,
    callerPolicy: "workflowsFromSameOwner",
    timezone: "Asia/Jakarta"
  },
  staticData: null,
  tags: [
    { name: "seminar", id: "tag-seminar" },
    { name: "automation", id: "tag-automation" },
    { name: "arl", id: "tag-arl" }
  ],
  triggerCount: 1,
  updatedAt: new Date().toISOString(),
  versionId: "1"
};

// ===== WRITE =====
const outPath = path.join(__dirname, 'seminar-broadcast-workflow-arl.json');
fs.writeFileSync(outPath, JSON.stringify(workflow, null, 2), 'utf-8');
console.log('✅ Workflow JSON generated:', outPath);

// ===== VERIFY =====
const verify = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
console.log(`Nodes: ${verify.nodes.length}`);
console.log(`Connections: ${Object.keys(verify.connections).length}`);

const parseNode = verify.nodes.find(n => n.name === 'Parse & Transform Data');
const code = parseNode.parameters.jsCode;
console.log(`Parser has col.nim: ${code.includes('col.nim')}`);
console.log(`Parser has col.hariTanggal: ${code.includes('col.hariTanggal')}`);
console.log(`Parser has parseHariTanggal: ${code.includes('parseHariTanggal')}`);
console.log(`Parser has US date (M/D/YYYY): ${code.includes('usMatch')}`);
console.log(`Parser has 12h AM/PM: ${code.includes('ampmMatch')}`);
console.log(`Parser has BULAN_NAMES: ${code.includes('BULAN_NAMES')}`);
console.log(`Parser has CLEAN backtick template: ${code.includes('`${y}')}`);
console.log(`Parser has NO backslash-backtick: ${!code.includes('\\`')}`);

const configNode = verify.nodes.find(n => n.name === 'Config Sources');
const configCode = configNode.parameters.jsCode;
console.log(`Config has SEMHAS URL (gid=1098398615): ${configCode.includes('gid=1098398615')}`);
console.log(`Config has SEMPRO URL (gid=1747146599): ${configCode.includes('gid=1747146599')}`);
console.log(`Config has hariTanggal: ${configCode.includes('hariTanggal')}`);
console.log(`Config has bentukTA: ${configCode.includes('bentukTA')}`);

const telNode = verify.nodes.find(n => n.name === 'Telegram Broadcast');
const telText = telNode.parameters.text;
console.log(`Telegram has Arsitektur Lanskap: ${telText.includes('Arsitektur Lanskap')}`);
console.log(`Telegram has Moderator label: ${telText.includes('Moderator')}`);
console.log(`Telegram has calendar_link: ${telText.includes('calendar_link')}`);
console.log(`Telegram parse_mode: ${telNode.parameters.additionalFields.parse_mode}`);
console.log(`Telegram has NO backslash-dollar: ${!telText.includes('\\$')}`);
console.log(`Telegram has NO backslash-backtick: ${!telText.includes('\\`')}`);

const calNode = verify.nodes.find(n => n.name === 'Create Google Calendar Event');
console.log(`Calendar enabled: ${!calNode.disabled}`);

console.log('\n✅ All checks passed!');
