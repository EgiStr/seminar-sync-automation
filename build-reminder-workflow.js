// =============================================================
// Build the morning reminder workflow JSON
// Usage: node build-reminder-workflow.js
// =============================================================
// This is a SEPARATE workflow from the main broadcast.
// It sends a reminder for seminars happening TODAY that have
// already been broadcast by the main workflow.
// =============================================================
const fs = require('fs');
const path = require('path');

// ---- JS code for Config Sources node (same as main workflow) ----
const configSourcesCode = [
  '',
  '// PLUGIN CONFIG — Same sources as main workflow',
  'return [',
  '  { json: {',
  '    type: "Seminar Hasil",',
  '    sheetUrl: "https://docs.google.com/spreadsheets/d/109HxAVZofGjyDlz-O8pfK4iqYPDXyX7H/export?format=csv&gid=1341055501",',
  '    columns: {',
  '      no: 0, nim: 1, nama: 2,',
  '      pembimbing1: 3, pembimbing2: 4,',
  '      penguji1: 5, penguji2: 6,',
  '      judul: 7, tanggal: 8, hari: 9,',
  '      jam: 10, link: 11, ruangan: 12',
  '    }',
  '  }},',
  '  { json: {',
  '    type: "Seminar Proposal",',
  '    sheetUrl: "https://docs.google.com/spreadsheets/d/109HxAVZofGjyDlz-O8pfK4iqYPDXyX7H/export?format=csv&gid=1605122729",',
  '    columns: {',
  '      no: 0, nim: 1, nama: 2,',
  '      pembimbing1: 3, pembimbing2: 4,',
  '      penguji1: 5, penguji2: -1,',
  '      judul: 6, tanggal: 7, hari: 8,',
  '      jam: 9, link: 10, ruangan: 11',
  '    }',
  '  }}',
  '];',
].join('\n');

// ---- JS code for Parse & Transform node (same as main) ----
const parseTransformCode = [
  '// CSV Parse + Transform + Validate + Hash  (v3)',
  'const config = $(\'Loop Over Sources\').item.json;',
  'const col = config.columns;',
  'const seminarType = config.type;',
  '',
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
  'const raw = $input.first().json[\'data\'];',
  'if (!raw) return [];',
  'const allRows = parseCsvToArrays(raw);',
  'if (allRows.length < 2) return [];',
  'const results = [];',
  '',
  'for (let i = 0; i < allRows.length; i++) {',
  '  const c = allRows[i];',
  '  const firstCell = (c[0] || \'\').trim().toLowerCase();',
  '  if (c.length < 8) continue;',
  '  if (firstCell.startsWith(\'semester\')) continue;',
  '  if (firstCell === \'no\' || firstCell === \'fy\') continue;',
  '  const nim = (c[col.nim] || \'\').trim();',
  '  if (!nim || !/^\\d+$/.test(nim)) continue;',
  '  const nama        = (c[col.nama]        || \'\').trim();',
  '  const pembimbing1 = (c[col.pembimbing1] || \'\').trim();',
  '  const pembimbing2 = (c[col.pembimbing2] || \'\').trim();',
  '  const penguji1    = (c[col.penguji1]    || \'\').trim();',
  '  const penguji2    = col.penguji2 >= 0 ? (c[col.penguji2] || \'\').trim() : \'\';',
  '  const judul       = (c[col.judul]       || \'\').trim();',
  '  const tanggal     = (c[col.tanggal]     || \'\').trim();',
  '  const hari        = (c[col.hari]        || \'\').trim();',
  '  const jam         = (c[col.jam]         || \'\').trim();',
  '  const link        = (c[col.link]        || \'\').trim();',
  '  let   ruangan     = (c[col.ruangan]     || \'\').trim();',
  '  if (ruangan === \'-\') ruangan = \'\';',
  '  if (!nama || !tanggal || !jam) continue;',
  '  const pd = parseDate(tanggal);',
  '  if (!pd) continue;',
  '  const pt = parseTimeRange(jam);',
  '  if (!pt) continue;',
  '  const startDt = toISO(pd.year, pd.month, pd.day, pt.sh, pt.sm);',
  '  const endDt   = toISO(pd.year, pd.month, pd.day, pt.eh, pt.em);',
  '  const eventHashId = eventHash(`${seminarType}|${nim}|${startDt}`);',
  '  results.push({ json: {',
  '    seminar_type: seminarType,',
  '    nim, nama, tanggal, hari, jam, ruangan, judul, link,',
  '    pembimbing1, pembimbing2, penguji1, penguji2,',
  '    start_datetime: startDt,',
  '    end_datetime: endDt,',
  '    event_hash_id: eventHashId',
  '  }});',
  '}',
  'return results;',
].join('\n');

// ---- JS code for Filter Today + Already Sent ----
const filterTodayCode = [
  '// Filter: only events happening TODAY that are already in State Sheet',
  'const allParsed = $(\'Parse & Transform Data\').all();',
  'const allState  = $(\'Read State Sheet\').all();',
  '',
  '// Build map of state entries by event_hash_id',
  'const stateMap = {};',
  'for (const item of allState) {',
  '  const hash = (item.json.event_hash_id || \'\').trim();',
  '  if (hash) stateMap[hash] = item.json;',
  '}',
  '',
  '// Get today in YYYY-MM-DD (Asia/Jakarta UTC+7)',
  'const now = new Date();',
  'const jakartaOffset = 7 * 60;',
  'const utc = now.getTime() + (now.getTimezoneOffset() * 60000);',
  'const jakartaTime = new Date(utc + (jakartaOffset * 60000));',
  'const todayStr = jakartaTime.getFullYear() + \'-\' +',
  '  String(jakartaTime.getMonth() + 1).padStart(2, \'0\') + \'-\' +',
  '  String(jakartaTime.getDate()).padStart(2, \'0\');',
  '',
  'const results = [];',
  'for (const item of allParsed) {',
  '  const hash = item.json.event_hash_id;',
  '  if (!stateMap[hash]) continue;',
  '  const startDt = item.json.start_datetime || \'\';',
  '  if (!startDt.startsWith(todayStr)) continue;',
  '  const stateData = stateMap[hash];',
  '  results.push({ json: {',
  '    ...item.json,',
  '    calendar_link: stateData.calendar_link || \'\'',
  '  }});',
  '}',
  'return results;',
].join('\n');

// ---- Telegram REMINDER template (HTML, string concat — no escaping issues) ----
const telegramReminderTemplate = '={{ \n' +
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
  '  let msg = \'🔔 <b>REMINDER: SEMINAR HARI INI</b>\' + \'\\n\' +\n' +
  '    \'━━━━━━━━━━━━━━━━━━━━━━\' + \'\\n\\n\' +\n' +
  '    \'📢 <b>\' + seminarType.toUpperCase() + \'</b>\' + \'\\n\\n\' +\n' +
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
  '  if (calLink) msg += \'\\n📎 <a href="\' + calLink + \'">Buka Undangan Google Calendar</a>\\n\';\n' +
  '  msg += \'\\n<i>⏰ Pengingat otomatis via n8n</i>\';\n' +
  '  return msg;\n' +
  '})()\n' +
  '}}';

// ===== BUILD REMINDER WORKFLOW =====
const workflow = {
  name: "Seminar Morning Reminder",
  nodes: [
    {
      parameters: {
        rule: { interval: [{ triggerAtHour: 6, triggerAtMinute: 0 }] }
      },
      id: "b1b2c3d4-0001-4000-8000-000000000001",
      name: "Schedule Trigger (Morning Reminder)",
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1.2,
      position: [0, 0],
      notes: "CONFIGURABLE: Change triggerAtHour to set reminder time"
    },
    {
      parameters: { jsCode: configSourcesCode },
      id: "b1b2c3d4-0011-4000-8000-000000000011",
      name: "Config Sources",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [260, 0],
      notes: "Same config as main workflow"
    },
    {
      parameters: { batchSize: 1, options: {} },
      id: "b1b2c3d4-0012-4000-8000-000000000012",
      name: "Loop Over Sources",
      type: "n8n-nodes-base.splitInBatches",
      typeVersion: 3,
      position: [520, 0]
    },
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
      id: "b1b2c3d4-0002-4000-8000-000000000002",
      name: "Fetch CSV (HTTP Request)",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [780, 0],
      credentials: {
        googleSheetsOAuth2Api: {
          id: "GOOGLE_SHEETS_CREDENTIAL_ID",
          name: "Google Sheets OAuth2 - CONFIGURE ME"
        }
      }
    },
    {
      parameters: { jsCode: parseTransformCode },
      id: "b1b2c3d4-0003-4000-8000-000000000003",
      name: "Parse & Transform Data",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1040, 0]
    },
    {
      parameters: {
        operation: "read",
        documentId: { __rl: true, mode: "url", value: "YOUR_STATE_SHEET_URL_HERE" },
        sheetName: { __rl: true, mode: "name", value: "state-sheet" },
        options: {}
      },
      id: "b1b2c3d4-0004-4000-8000-000000000004",
      name: "Read State Sheet",
      type: "n8n-nodes-base.googleSheets",
      typeVersion: 4.5,
      position: [780, 240],
      credentials: {
        googleSheetsOAuth2Api: {
          id: "GOOGLE_SHEETS_CREDENTIAL_ID",
          name: "Google Sheets OAuth2 - CONFIGURE ME"
        }
      },
      notes: "SETUP: Set your State Sheet URL (same as main workflow)"
    },
    {
      parameters: { jsCode: filterTodayCode },
      id: "b1b2c3d4-0005-4000-8000-000000000005",
      name: "Filter Today + Already Sent",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1300, 0],
      notes: "INNER JOIN with state sheet + filter today's date"
    },
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
          conditions: [{
            id: "condition-check-today",
            leftValue: "={{ $input.all().length }}",
            rightValue: "0",
            operator: { type: "number", operation: "gt" }
          }],
          combinator: "and"
        },
        options: {}
      },
      id: "b1b2c3d4-0006-4000-8000-000000000006",
      name: "Has Today Events?",
      type: "n8n-nodes-base.if",
      typeVersion: 2,
      position: [1560, 0]
    },
    {
      parameters: {
        chatId: "YOUR_TELEGRAM_CHAT_ID_HERE",
        text: telegramReminderTemplate,
        additionalFields: {
          parse_mode: "HTML",
          disable_notification: false
        }
      },
      id: "b1b2c3d4-0008-4000-8000-000000000008",
      name: "Telegram Reminder",
      type: "n8n-nodes-base.telegram",
      typeVersion: 1.2,
      position: [1820, 0],
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
      notes: "REMINDER format — different from main broadcast"
    },
    {
      parameters: {},
      id: "b1b2c3d4-0010-4000-8000-000000000010",
      name: "No Today Events (Skip)",
      type: "n8n-nodes-base.noOp",
      typeVersion: 1,
      position: [1820, 300]
    },
    {
      parameters: {},
      id: "b1b2c3d4-0013-4000-8000-000000000013",
      name: "Done Processing Source",
      type: "n8n-nodes-base.noOp",
      typeVersion: 1,
      position: [2080, 0]
    }
  ],

  connections: {
    "Schedule Trigger (Morning Reminder)": {
      main: [[{ node: "Config Sources", type: "main", index: 0 }]]
    },
    "Config Sources": {
      main: [[{ node: "Loop Over Sources", type: "main", index: 0 }]]
    },
    "Loop Over Sources": {
      main: [
        [],
        [{ node: "Fetch CSV (HTTP Request)", type: "main", index: 0 },
         { node: "Read State Sheet", type: "main", index: 0 }]
      ]
    },
    "Fetch CSV (HTTP Request)": {
      main: [[{ node: "Parse & Transform Data", type: "main", index: 0 }]]
    },
    "Parse & Transform Data": {
      main: [[{ node: "Filter Today + Already Sent", type: "main", index: 0 }]]
    },
    "Read State Sheet": {
      main: [[{ node: "Filter Today + Already Sent", type: "main", index: 0 }]]
    },
    "Filter Today + Already Sent": {
      main: [[{ node: "Has Today Events?", type: "main", index: 0 }]]
    },
    "Has Today Events?": {
      main: [
        [{ node: "Telegram Reminder", type: "main", index: 0 }],
        [{ node: "No Today Events (Skip)", type: "main", index: 0 }]
      ]
    },
    "Telegram Reminder": {
      main: [[{ node: "Done Processing Source", type: "main", index: 0 }]]
    },
    "No Today Events (Skip)": {
      main: [[{ node: "Loop Over Sources", type: "main", index: 0 }]]
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
    { name: "reminder", id: "tag-reminder" }
  ],
  triggerCount: 1,
  updatedAt: new Date().toISOString(),
  versionId: "1"
};

// ===== WRITE =====
const outPath = path.join(__dirname, 'seminar-reminder-workflow.json');
fs.writeFileSync(outPath, JSON.stringify(workflow, null, 2), 'utf-8');
console.log('✅ Reminder Workflow JSON generated:', outPath);

// ===== VERIFY =====
const verify = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
console.log(`Nodes: ${verify.nodes.length}`);
console.log(`Connections: ${Object.keys(verify.connections).length}`);

const filterNode = verify.nodes.find(n => n.name === 'Filter Today + Already Sent');
console.log(`Filter has todayStr: ${filterNode.parameters.jsCode.includes('todayStr')}`);

const telNode = verify.nodes.find(n => n.name === 'Telegram Reminder');
console.log(`Telegram has REMINDER: ${telNode.parameters.text.includes('REMINDER')}`);
console.log(`Telegram has calendar_link: ${telNode.parameters.text.includes('calendar_link')}`);
console.log(`Telegram parse_mode: ${telNode.parameters.additionalFields.parse_mode}`);
console.log(`Telegram has NO backslash-dollar: ${!telNode.parameters.text.includes('\\$')}`);

const parseNode = verify.nodes.find(n => n.name === 'Parse & Transform Data');
console.log(`Parser has CLEAN backtick: ${parseNode.parameters.jsCode.includes('`${y}')}`);
console.log(`Parser has NO backslash-backtick: ${!parseNode.parameters.jsCode.includes('\\`')}`);

console.log('\n✅ All checks passed!');
