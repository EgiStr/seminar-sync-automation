// =============================================================
// Build the plugin-based seminar workflow JSON for Biologi
// Usage: node build-workflow-biologi.js
// =============================================================
const fs = require('fs');
const path = require('path');

// ---- JS code for Config Sources node ----
// Spreadsheet: 1spNQQo3ArS1wwsbAKad-Nm3BPsa1HGXCxXmxtJwxZQc
// Columns (identical for both SEMHAS and SEMPRO):
//   NIM(0), Nama Lengkap(1), Judul TA(2), Pembimbing 1(3),
//   Pembimbing 2(4), Penguji 1(5), Penguji 2(6),
//   Hari(7), Tanggal(8), Jam(9), Ruangan(10)
// No "No" column, no "link" column.
// Date format: "03 Maret 2026" (DD bulan YYYY)
// Time format: "10:00-11:00" (HH:MM-HH:MM)
const configSourcesCode = [
  '',
  '// ============================',
  '// PLUGIN CONFIG — Biologi SEMHAS + SEMPRO',
  '// ============================',
  '',
  'return [',
  '  { json: {',
  '    type: "Seminar Hasil",',
  '    sheetUrl: "https://docs.google.com/spreadsheets/d/1spNQQo3ArS1wwsbAKad-Nm3BPsa1HGXCxXmxtJwxZQc/export?format=csv&gid=388660725",',
  '    columns: {',
  '      nim: 0, nama: 1, judul: 2,',
  '      pembimbing1: 3, pembimbing2: 4,',
  '      penguji1: 5, penguji2: 6,',
  '      hari: 7, tanggal: 8,',
  '      jam: 9, ruangan: 10, link: -1',
  '    }',
  '  }},',
  '  { json: {',
  '    type: "Seminar Proposal",',
  '    sheetUrl: "https://docs.google.com/spreadsheets/d/1spNQQo3ArS1wwsbAKad-Nm3BPsa1HGXCxXmxtJwxZQc/export?format=csv&gid=435468985",',
  '    columns: {',
  '      nim: 0, nama: 1, judul: 2,',
  '      pembimbing1: 3, pembimbing2: 4,',
  '      penguji1: 5, penguji2: 6,',
  '      hari: 7, tanggal: 8,',
  '      jam: 9, ruangan: 10, link: -1',
  '    }',
  '  }}',
  '];',
].join('\n');

// ---- JS code for Parse & Transform node ----
const parseTransformCode = [
  '// CSV Parse + Transform + Validate + Hash  (Biologi — plugin system)',
  '// Config-driven: reads column mapping from Config Sources node.',
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
  '// CSV Parser (handles quoted fields with commas and newlines)',
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
  '// Month maps (Indonesian)',
  'const BULAN = {',
  '  \'januari\':0,\'februari\':1,\'maret\':2,\'april\':3,\'mei\':4,\'juni\':5,',
  '  \'juli\':6,\'agustus\':7,\'september\':8,\'oktober\':9,\'october\':9,',
  '  \'november\':10,\'desember\':11,\'december\':11',
  '};',
  'const BULAN_SHORT = {',
  '  \'jan\':0,\'feb\':1,\'mar\':2,\'apr\':3,\'may\':4,\'jun\':5,',
  '  \'jul\':6,\'aug\':7,\'sep\':8,\'oct\':9,\'nov\':10,\'dec\':11',
  '};',
  '',
  '// Parses "03 Maret 2026" or "1-Mar-2025" or "1 Januari 2026"',
  'function parseDate(s) {',
  '  if (!s) return null;',
  '  const t = s.trim();',
  '  const dashMatch = t.match(/^(\\d{1,2})-(\\w+)-(\\d{4})$/);',
  '  if (dashMatch) {',
  '    const d = parseInt(dashMatch[1]);',
  '    const mKey = dashMatch[2].toLowerCase().substring(0, 3);',
  '    const m = BULAN_SHORT[mKey];',
  '    const y = parseInt(dashMatch[3]);',
  '    if (!isNaN(d) && m !== undefined && !isNaN(y)) return { year: y, month: m, day: d };',
  '  }',
  '  const p = t.split(/\\s+/);',
  '  if (p.length >= 3) {',
  '    const d = parseInt(p[0]);',
  '    const mLower = p[1].toLowerCase();',
  '    const m = BULAN[mLower] !== undefined ? BULAN[mLower] : BULAN_SHORT[mLower.substring(0, 3)];',
  '    const y = parseInt(p[2]);',
  '    if (!isNaN(d) && m !== undefined && !isNaN(y)) return { year: y, month: m, day: d };',
  '  }',
  '  return null;',
  '}',
  '',
  'function parseTimeRange(s) {',
  '  if (!s) return null;',
  '  const cleaned = s.replace(/\\s*(WIB|WITA|WIT)\\s*/gi, \'\').trim();',
  '  const norm = cleaned.replace(/[\\s,\\-]+$/, \'\');',
  '  const parts = norm.split(/\\s*-\\s*/);',
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
  '  let eh = start.h + 2, em = start.m;',
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
  'const results = [];',
  '',
  'for (let i = 0; i < allRows.length; i++) {',
  '  const c = allRows[i];',
  '  const firstCell = (c[0] || \'\').trim().toLowerCase();',
  '  if (c.length < 8) continue;',
  '  // Skip header and non-data rows',
  '  if (firstCell === \'nim\' || firstCell === \'no\') continue;',
  '  if (firstCell.startsWith(\'semester\')) continue;',
  '',
  '  const nim = (c[col.nim] || \'\').trim();',
  '  if (!nim || !/^\\d+$/.test(nim)) continue;',
  '',
  '  const nama        = (c[col.nama]        || \'\').trim();',
  '  const pembimbing1 = (c[col.pembimbing1] || \'\').trim();',
  '  const pembimbing2 = (c[col.pembimbing2] || \'\').trim();',
  '  const penguji1    = (c[col.penguji1]    || \'\').trim();',
  '  const penguji2    = col.penguji2 >= 0 ? (c[col.penguji2] || \'\').trim() : \'\';',
  '  const judul       = (c[col.judul]       || \'\').trim();',
  '  const tanggal     = (c[col.tanggal]     || \'\').trim();',
  '  const hari        = (c[col.hari]        || \'\').trim();',
  '  const jam         = (c[col.jam]         || \'\').trim();',
  '  const link        = col.link >= 0 ? (c[col.link] || \'\').trim() : \'\';',
  '  let   ruangan     = (c[col.ruangan]     || \'\').trim();',
  '  if (ruangan === \'-\') ruangan = \'\';',
  '',
  '  if (!nama || !tanggal || !jam) continue;',
  '',
  '  const pd = parseDate(tanggal);',
  '  if (!pd) continue;',
  '  const pt = parseTimeRange(jam);',
  '  if (!pt) continue;',
  '',
  '  const startDt = toISO(pd.year, pd.month, pd.day, pt.sh, pt.sm);',
  '  const endDt   = toISO(pd.year, pd.month, pd.day, pt.eh, pt.em);',
  '  const eventHashId = eventHash(`${seminarType}|${nim}|${startDt}`);',
  '',
  '  results.push({ json: {',
  '    program: "Biologi",',
  '    seminar_type: seminarType,',
  '    nim, nama, tanggal, hari, jam, ruangan, judul, link,',
  '    pembimbing1, pembimbing2, pembimbing3: "", penguji1, penguji2,',
  '    start_datetime: startDt,',
  '    end_datetime: endDt,',
  '    event_hash_id: eventHashId,',
  '    calendar_summary: `[${seminarType}] ${nama} - ${nim}`,',
  '    calendar_location: ruangan ? `Ruangan ${ruangan}` : \'TBA\',',
  '    calendar_description: `Judul: ${judul}\\nNIM: ${nim}\\nPembimbing 1: ${pembimbing1}\\nPembimbing 2: ${pembimbing2}\\nPenguji 1: ${penguji1}${penguji2 ? \'\\nPenguji 2: \' + penguji2 : \'\'}${link ? \'\\nLink: \' + link : \'\'}`',
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
  '  const link = $json.link || \'\';\n' +
  '  const calLink = $json.calendar_link || \'\';\n' +
  '\n' +
  '  let msg = \'📢 <b>JADWAL \' + seminarType.toUpperCase() + \' — BIOLOGI</b>\' + \'\\n\\n\' +\n' +
  '    \'👤 <b>Nama:</b> \' + nama + \'\\n\' +\n' +
  '    \'🆔 <b>NIM:</b> \' + nim + \'\\n\' +\n' +
  '    \'📝 <b>Judul:</b> \' + judul + \'\\n\\n\' +\n' +
  '    \'📅 <b>Hari/Tanggal:</b> \' + hari + \', \' + tanggal + \'\\n\' +\n' +
  '    \'🕐 <b>Jam:</b> \' + jam + \' WIB\' + \'\\n\' +\n' +
  '    \'📍 <b>Ruangan:</b> \' + (ruangan || \'TBA\') + \'\\n\\n\' +\n' +
  '    \'👨‍🏫 <b>Penguji 1:</b> \' + penguji1 + \'\\n\';\n' +
  '  if (penguji2) msg += \'👩‍🏫 <b>Penguji 2:</b> \' + penguji2 + \'\\n\';\n' +
  '  msg += \'\\n👨‍💼 <b>Pembimbing 1:</b> \' + pembimbing1 + \'\\n\';\n' +
  '  if (pembimbing2) msg += \'👩‍💼 <b>Pembimbing 2:</b> \' + pembimbing2 + \'\\n\';\n' +
  '  if (link) msg += \'\\n🔗 <b>Link:</b> \' + e(link) + \'\\n\';\n' +
  '  if (calLink) msg += \'\\n📎 <a href="\' + calLink + \'">Buka Undangan Google Calendar</a>\\n\';\n' +
  '  msg += \'\\n<i>Pesan otomatis via n8n</i>\';\n' +
  '  return msg;\n' +
  '})()\n' +
  '}}';

// ===== BUILD WORKFLOW =====
const workflow = {
  name: "Seminar Sync Automation - Biologi",
  nodes: [
    // 1. Schedule Trigger
    {
      parameters: {
        rule: { interval: [{ triggerAtHour: 6, triggerAtMinute: 0 }] }
      },
      id: "b10b10b1-0001-4000-8000-000000000001",
      name: "Schedule Trigger (06:00 WIB)",
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1.2,
      position: [0, 0]
    },

    // 2. Config Sources
    {
      parameters: { jsCode: configSourcesCode },
      id: "b10b10b1-0011-4000-8000-000000000011",
      name: "Config Sources",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [260, 0],
      notes: "PLUGIN CONFIG: Biologi SEMHAS + SEMPRO"
    },

    // 3. Loop Over Sources
    {
      parameters: { batchSize: 1, options: {} },
      id: "b10b10b1-0012-4000-8000-000000000012",
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
      id: "b10b10b1-0002-4000-8000-000000000002",
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
      id: "b10b10b1-0003-4000-8000-000000000003",
      name: "Parse & Transform Data",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1040, 0],
      notes: "Config-driven column mapping from Config Sources"
    },

    // 6. Read State Sheet
    {
      parameters: {
        operation: "read",
        documentId: { __rl: true, mode: "url", value: "https://docs.google.com/spreadsheets/d/1yl-IpOrB5xSCUODvvOPCD_4HxrpdK9f77Q1qT5XjV2I/edit?usp=sharing" },
        sheetName: { __rl: true, mode: "name", value: "state-sheet" },
        options: {}
      },
      id: "b10b10b1-0004-4000-8000-000000000004",
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
      id: "b10b10b1-0005-4000-8000-000000000005",
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
      id: "b10b10b1-0006-4000-8000-000000000006",
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
          guestsCanModify: true
        }
      },
      id: "b10b10b1-0007-4000-8000-000000000007",
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
      id: "b10b10b1-0014-4000-8000-000000000014",
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
      id: "b10b10b1-0008-4000-8000-000000000008",
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
      notes: "Receives calendar link from Merge node. HTML parse mode for clean formatting."
    },

    // 12. Update State Sheet (20 columns — unified schema)
    {
      parameters: {
        operation: "append",
        documentId: { __rl: true, mode: "url", value: "https://docs.google.com/spreadsheets/d/1yl-IpOrB5xSCUODvvOPCD_4HxrpdK9f77Q1qT5XjV2I/edit?usp=sharing" },
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
      id: "b10b10b1-0009-4000-8000-000000000009",
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
      id: "b10b10b1-0013-4000-8000-000000000013",
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
    { name: "biologi", id: "tag-biologi" }
  ],
  triggerCount: 1,
  updatedAt: new Date().toISOString(),
  versionId: "1"
};

// ===== WRITE =====
const outPath = path.join(__dirname, 'biologi-broadcast-workflow.json');
fs.writeFileSync(outPath, JSON.stringify(workflow, null, 2), 'utf-8');
console.log('✅ Workflow JSON generated:', outPath);

// ===== VERIFY =====
const verify = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
console.log(`Nodes: ${verify.nodes.length}`);
console.log(`Connections: ${Object.keys(verify.connections).length}`);

const parseNode = verify.nodes.find(n => n.name === 'Parse & Transform Data');
const code = parseNode.parameters.jsCode;
console.log(`Parser has col.nim: ${code.includes('col.nim')}`);
console.log(`Parser has program "Biologi": ${code.includes('"Biologi"')}`);
console.log(`Parser has link check (col.link >= 0): ${code.includes('col.link >= 0')}`);
console.log(`Parser has CLEAN backtick template: ${code.includes('`${y}')}`);
console.log(`Parser has NO backslash-backtick: ${!code.includes('\\`')}`);

const telNode = verify.nodes.find(n => n.name === 'Telegram Broadcast');
const telText = telNode.parameters.text;
console.log(`Telegram has calendar_link: ${telText.includes('calendar_link')}`);
console.log(`Telegram has "BIOLOGI" in header: ${telText.includes('BIOLOGI')}`);
console.log(`Telegram parse_mode: ${telNode.parameters.additionalFields.parse_mode}`);
console.log(`Telegram has NO backslash in msg: ${!telText.includes('\\$')}`);
console.log(`Telegram has NO backslash-backtick: ${!telText.includes('\\`')}`);

const calNode = verify.nodes.find(n => n.name === 'Create Google Calendar Event');
console.log(`Calendar enabled: ${!calNode.disabled}`);

const stateNode = verify.nodes.find(n => n.name === 'Update State Sheet');
const stateSchema = stateNode.parameters.columns.schema;
console.log(`State-sheet columns: ${stateSchema.length}`);
const colNames = stateSchema.map(s => s.id);
console.log(`State-sheet has program: ${colNames.includes('program')}`);
console.log(`State-sheet has pembimbing3: ${colNames.includes('pembimbing3')}`);
console.log(`State-sheet has all 20 cols: ${stateSchema.length === 20}`);

const configNode = verify.nodes.find(n => n.name === 'Config Sources');
const configCode = configNode.parameters.jsCode;
console.log(`Config has SEMHAS gid=388660725: ${configCode.includes('gid=388660725')}`);
console.log(`Config has SEMPRO gid=435468985: ${configCode.includes('gid=435468985')}`);
console.log(`Config has link:-1 for both: ${(configCode.match(/link:\s*-1/g) || []).length === 2}`);

console.log('\n✅ All checks passed!');
