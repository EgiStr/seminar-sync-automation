// =============================================================
// Build the plugin-based seminar workflow JSON
// Usage: node build-workflow.js
// =============================================================
const fs = require('fs');
const path = require('path');

// ---- JS code for Config Sources node ----
const configSourcesCode = `
// ============================
// PLUGIN CONFIG — Edit this to add/remove seminar types
// ============================
// Each source defines:
//   type:     Display name (shown in Telegram & Calendar)
//   sheetUrl: Google Sheets CSV export URL (with gid)
//   columns:  Column index mapping (0-indexed)
// ============================

return [
  { json: {
    type: "Seminar Hasil",
    sheetUrl: "https://docs.google.com/spreadsheets/d/109HxAVZofGjyDlz-O8pfK4iqYPDXyX7H/export?format=csv&gid=1341055501",
    columns: {
      no: 0, nim: 1, nama: 2,
      pembimbing1: 3, pembimbing2: 4,
      penguji1: 5, penguji2: 6,
      judul: 7, tanggal: 8, hari: 9,
      jam: 10, link: 11, ruangan: 12
    }
  }},
  { json: {
    type: "Seminar Proposal",
    sheetUrl: "https://docs.google.com/spreadsheets/d/109HxAVZofGjyDlz-O8pfK4iqYPDXyX7H/export?format=csv&gid=1605122729",
    columns: {
      no: 0, nim: 1, nama: 2,
      pembimbing1: 3, pembimbing2: 4,
      penguji1: 5, penguji2: -1,
      judul: 6, tanggal: 7, hari: 8,
      jam: 9, link: 10, ruangan: 11
    }
  }}
];
`;

// ---- JS code for Parse & Transform node ----
const parseTransformCode = `// =============================================================
// CSV Parse + Transform + Validate + Hash  (v3 — plugin system)
// =============================================================
// Config-driven: reads column mapping from Config Sources node.
// Handles:
//   - Multiple semester sections with repeated headers
//   - Indonesian dates (30 Maret 2024) AND DD-Mon-YYYY (5-Jan-2026)
//   - Time ranges (09.00-10.40) AND single start times (13.30)
//   - Missing ruangan or '-' ruangan
// =============================================================

// ---- Read config from upstream ----
const config = $('Loop Over Sources').item.json;
const col = config.columns;
const seminarType = config.type;

// ---- FNV-1a hash (deterministic, no sign ambiguity) ----
// Prefixed with 'evt_' to prevent Google Sheets from
// interpreting hex hashes as scientific notation (e.g. 932e7800 → 9.32E+78)
function eventHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
    h = h >>> 0;
  }
  return 'evt_' + h.toString(16).padStart(8, '0');
}

// ---- CSV Parser (handles quoted fields with commas) ----
function parseCsvToArrays(csvText) {
  const lines = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    if (ch === '"') {
      current += ch;  // PRESERVE quotes for field parser
      if (inQuotes && csvText[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === '\\n' && !inQuotes) {
      lines.push(current); current = '';
    } else if (ch === '\\r' && !inQuotes) {
      /* skip */
    } else { current += ch; }
  }
  if (current.length > 0) lines.push(current);

  return lines.map(line => {
    const fields = []; let field = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { field += '"'; i++; }
        else { inQ = !inQ; }
      } else if (ch === ',' && !inQ) {
        fields.push(field.trim()); field = '';
      } else { field += ch; }
    }
    fields.push(field.trim());
    return fields;
  });
}

// ---- Month maps ----
const BULAN = {
  'januari':0,'februari':1,'maret':2,'april':3,'mei':4,'juni':5,
  'juli':6,'agustus':7,'september':8,'oktober':9,'october':9,
  'november':10,'desember':11,'december':11
};
const BULAN_SHORT = {
  'jan':0,'feb':1,'mar':2,'apr':3,'may':4,'jun':5,
  'jul':6,'aug':7,'sep':8,'oct':9,'nov':10,'dec':11
};

function parseDate(s) {
  if (!s) return null;
  const t = s.trim();
  const dashMatch = t.match(/^(\\d{1,2})-(\\w+)-(\\d{4})$/);
  if (dashMatch) {
    const d = parseInt(dashMatch[1]);
    const mKey = dashMatch[2].toLowerCase().substring(0, 3);
    const m = BULAN_SHORT[mKey];
    const y = parseInt(dashMatch[3]);
    if (!isNaN(d) && m !== undefined && !isNaN(y)) return { year: y, month: m, day: d };
  }
  const p = t.split(/\\s+/);
  if (p.length >= 3) {
    const d = parseInt(p[0]);
    const mLower = p[1].toLowerCase();
    const m = BULAN[mLower] !== undefined ? BULAN[mLower] : BULAN_SHORT[mLower.substring(0, 3)];
    const y = parseInt(p[2]);
    if (!isNaN(d) && m !== undefined && !isNaN(y)) return { year: y, month: m, day: d };
  }
  return null;
}

function parseTimeRange(s) {
  if (!s) return null;
  const cleaned = s.replace(/\\s*(WIB|WITA|WIT)\\s*/gi, '').trim();
  const norm = cleaned.replace(/[\\s,\\-]+$/, '');
  const parts = norm.split(/\\s*-\\s*/);
  const parse = t => {
    const m = t.trim().match(/^(\\d{1,2})[.:](\\d{2})$/);
    return m ? { h: parseInt(m[1]), m: parseInt(m[2]) } : null;
  };
  const start = parse(parts[0]);
  if (!start) return null;
  if (parts.length >= 2 && parts[1]) {
    const end = parse(parts[1]);
    if (end) return { sh: start.h, sm: start.m, eh: end.h, em: end.m };
  }
  let eh = start.h + 2, em = start.m;
  if (eh >= 24) eh -= 24;
  return { sh: start.h, sm: start.m, eh, em };
}

function toISO(y, mo, d, h, mi) {
  const pad = n => String(n).padStart(2, '0');
  return \`\${y}-\${pad(mo+1)}-\${pad(d)}T\${pad(h)}:\${pad(mi)}:00+07:00\`;
}

// ===== MAIN =====
const raw = $input.first().json['data'];
if (!raw) return [];

const allRows = parseCsvToArrays(raw);
if (allRows.length < 2) return [];

const results = [];

for (let i = 0; i < allRows.length; i++) {
  const c = allRows[i];

  const firstCell = (c[0] || '').trim().toLowerCase();
  if (c.length < 8) continue;
  if (firstCell.startsWith('semester')) continue;
  if (firstCell === 'no' || firstCell === 'fy') continue;

  const nim = (c[col.nim] || '').trim();
  if (!nim || !/^\\d+$/.test(nim)) continue;

  const nama        = (c[col.nama]        || '').trim();
  const pembimbing1 = (c[col.pembimbing1] || '').trim();
  const pembimbing2 = (c[col.pembimbing2] || '').trim();
  const penguji1    = (c[col.penguji1]    || '').trim();
  const penguji2    = col.penguji2 >= 0 ? (c[col.penguji2] || '').trim() : '';
  const judul       = (c[col.judul]       || '').trim();
  const tanggal     = (c[col.tanggal]     || '').trim();
  const hari        = (c[col.hari]        || '').trim();
  const jam         = (c[col.jam]         || '').trim();
  const link        = (c[col.link]        || '').trim();
  let   ruangan     = (c[col.ruangan]     || '').trim();
  if (ruangan === '-') ruangan = '';

  if (!nama || !tanggal || !jam) continue;

  const pd = parseDate(tanggal);
  if (!pd) continue;
  const pt = parseTimeRange(jam);
  if (!pt) continue;

  const startDt = toISO(pd.year, pd.month, pd.day, pt.sh, pt.sm);
  const endDt   = toISO(pd.year, pd.month, pd.day, pt.eh, pt.em);
  const eventHashId = eventHash(\`\${seminarType}|\${nim}|\${startDt}\`);

  results.push({ json: {
    seminar_type: seminarType,
    nim, nama, tanggal, hari, jam, ruangan, judul, link,
    pembimbing1, pembimbing2, penguji1, penguji2,
    start_datetime: startDt,
    end_datetime: endDt,
    event_hash_id: eventHashId,
    calendar_summary: \`[\${seminarType}] \${nama} - \${nim}\`,
    calendar_location: ruangan ? \`Ruangan \${ruangan}\` : 'TBA',
    calendar_description: \`Judul: \${judul}\\nNIM: \${nim}\\nPembimbing 1: \${pembimbing1}\\nPembimbing 2: \${pembimbing2}\\nPenguji 1: \${penguji1}\${penguji2 ? '\\nPenguji 2: ' + penguji2 : ''}\${link ? '\\nLink: ' + link : ''}\`
  }});
}

return results;`;

// ---- Telegram template (IIFE with MarkdownV2 escaping) ----
const telegramTemplate = `={{ 
(function() {
  function escMd2(str) {
    if (!str) return '';
    return String(str).replace(/([_*\\[\\]()~\`>#+\\-=|{}.!\\\\])/g, '\\\\$1');
  }
  const seminarType = escMd2($json.seminar_type);
  const nama = escMd2($json.nama);
  const nim = escMd2($json.nim);
  const judul = escMd2($json.judul);
  const hari = escMd2($json.hari);
  const tanggal = escMd2($json.tanggal);
  const jam = escMd2($json.jam);
  const ruangan = escMd2($json.ruangan);
  const penguji1 = escMd2($json.penguji1);
  const penguji2 = escMd2($json.penguji2);
  
  let msg = \`📢 *JADWAL \${seminarType.toUpperCase()}*\\n\\n\` +
    \`👤 *Nama:* \${nama}\\n\` +
    \`🆔 *NIM:* \${nim}\\n\` +
    \`📝 *Judul:* \${judul}\\n\\n\` +
    \`📅 *Hari/Tanggal:* \${hari}, \${tanggal}\\n\` +
    \`🕐 *Jam:* \${jam} WIB\\n\` +
    \`📍 *Ruangan:* \${ruangan}\\n\\n\` +
    \`👨‍🏫 *Penguji 1:* \${penguji1}\\n\`;
  if (penguji2) msg += \`👩‍🏫 *Penguji 2:* \${penguji2}\\n\`;
  msg += \`\\nThis message was sent automatically with n8n\`;
  return msg;
})()
}}`;

// ===== BUILD WORKFLOW =====
const workflow = {
  name: "Seminar Sync Automation - Plugin System",
  nodes: [
    // 1. Schedule Trigger
    {
      parameters: {
        rule: { interval: [{ triggerAtHour: 6, triggerAtMinute: 0 }] }
      },
      id: "a1b2c3d4-0001-4000-8000-000000000001",
      name: "Schedule Trigger (06:00 WIB)",
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1.2,
      position: [0, 0]
    },

    // 2. Config Sources
    {
      parameters: { jsCode: configSourcesCode },
      id: "a1b2c3d4-0011-4000-8000-000000000011",
      name: "Config Sources",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [260, 0],
      notes: "PLUGIN CONFIG: Add/remove seminar types here"
    },

    // 3. Loop Over Sources
    {
      parameters: { batchSize: 1, options: {} },
      id: "a1b2c3d4-0012-4000-8000-000000000012",
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
      id: "a1b2c3d4-0002-4000-8000-000000000002",
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
      id: "a1b2c3d4-0003-4000-8000-000000000003",
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
        documentId: { __rl: true, mode: "url", value: "YOUR_STATE_SHEET_URL_HERE" },
        sheetName: { __rl: true, mode: "name", value: "State" },
        options: {}
      },
      id: "a1b2c3d4-0004-4000-8000-000000000004",
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
      id: "a1b2c3d4-0005-4000-8000-000000000005",
      name: "Idempotency Filter (New Events Only)",
      type: "n8n-nodes-base.merge",
      typeVersion: 3,
      position: [1300, 0],
      notes: "LEFT JOIN + WHERE NULL: only new events pass through"
    },

    // 8. Has New Events?
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
          conditions: [{
            id: "condition-check-has-data",
            leftValue: "={{ $input.all().length }}",
            rightValue: "0",
            operator: { type: "number", operation: "gt" }
          }],
          combinator: "and"
        },
        options: {}
      },
      id: "a1b2c3d4-0006-4000-8000-000000000006",
      name: "Has New Events?",
      type: "n8n-nodes-base.if",
      typeVersion: 2,
      position: [1560, 0],
      notes: "Routes to processing if there are new events"
    },

    // 9. Create Google Calendar Event
    {
      parameters: {
        calendar: { __rl: true, mode: "id", value: "primary" },
        start: "={{ $json.start_datetime }}",
        end: "={{ $json.end_datetime }}",
        additionalFields: {
          summary: "={{ $json.calendar_summary }}",
          location: "={{ $json.calendar_location }}",
          description: "={{ $json.calendar_description }}",
          conferenceDataVersion: 0,
          guestsCanModify: false
        },
        options: {}
      },
      id: "a1b2c3d4-0007-4000-8000-000000000007",
      name: "Create Google Calendar Event",
      type: "n8n-nodes-base.googleCalendar",
      typeVersion: 1.2,
      position: [1820, -200],
      onError: "continueRegularOutput",
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 18000,
      credentials: {
        googleCalendarOAuth2Api: {
          id: "GOOGLE_CALENDAR_CREDENTIAL_ID",
          name: "Google Calendar OAuth2 - CONFIGURE ME"
        }
      },
      notes: "Runs in parallel with Telegram. Retries 3x on failure."
    },

    // 10. Telegram Broadcast
    {
      parameters: {
        chatId: "YOUR_TELEGRAM_CHAT_ID_HERE",
        text: telegramTemplate,
        parse_mode: "MarkdownV2",
        additionalFields: { disable_notification: false }
      },
      id: "a1b2c3d4-0008-4000-8000-000000000008",
      name: "Telegram Broadcast",
      type: "n8n-nodes-base.telegram",
      typeVersion: 1.2,
      position: [1820, 0],
      onError: "continueRegularOutput",
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 18000,
      credentials: {
        telegramApi: {
          id: "TELEGRAM_CREDENTIAL_ID",
          name: "Telegram Bot API - CONFIGURE ME"
        }
      },
      notes: "Runs in parallel with Calendar. Dynamic seminar type header."
    },

    // 11. Update State Sheet
    {
      parameters: {
        operation: "append",
        documentId: { __rl: true, mode: "url", value: "YOUR_STATE_SHEET_URL_HERE" },
        sheetName: { __rl: true, mode: "name", value: "State" },
        columns: {
          mappingMode: "defineBelow",
          value: {
            event_hash_id: "={{ $json.event_hash_id }}",
            seminar_type: "={{ $json.seminar_type }}",
            nim: "={{ $json.nim }}",
            nama: "={{ $json.nama }}",
            tanggal: "={{ $json.tanggal }}",
            processed_at: "={{ $now.toISO() }}"
          },
          matchingColumns: [],
          schema: [
            { id: "event_hash_id", displayName: "event_hash_id", required: false, defaultMatch: false, canBeUsedToMatch: true, display: true, type: "string", removed: false },
            { id: "seminar_type", displayName: "seminar_type", required: false, defaultMatch: false, canBeUsedToMatch: false, display: true, type: "string", removed: false },
            { id: "nim", displayName: "nim", required: false, defaultMatch: false, canBeUsedToMatch: false, display: true, type: "string", removed: false },
            { id: "nama", displayName: "nama", required: false, defaultMatch: false, canBeUsedToMatch: false, display: true, type: "string", removed: false },
            { id: "tanggal", displayName: "tanggal", required: false, defaultMatch: false, canBeUsedToMatch: false, display: true, type: "string", removed: false },
            { id: "processed_at", displayName: "processed_at", required: false, defaultMatch: false, canBeUsedToMatch: false, display: true, type: "string", removed: false }
          ]
        },
        options: {}
      },
      id: "a1b2c3d4-0009-4000-8000-000000000009",
      name: "Update State Sheet",
      type: "n8n-nodes-base.googleSheets",
      typeVersion: 4.5,
      position: [1820, 200],
      credentials: {
        googleSheetsOAuth2Api: {
          id: "GOOGLE_SHEETS_CREDENTIAL_ID",
          name: "Google Sheets OAuth2 - CONFIGURE ME"
        }
      },
      notes: "SETUP: Set your State Sheet URL. Now includes seminar_type column."
    },

    // 12. No New Events (Skip) → loops back
    {
      parameters: {},
      id: "a1b2c3d4-0010-4000-8000-000000000010",
      name: "No New Events (Skip)",
      type: "n8n-nodes-base.noOp",
      typeVersion: 1,
      position: [1820, 400],
      notes: "All events already processed — loops back to next source"
    },

    // 13. Done (after parallel outputs) → loops back
    {
      parameters: {},
      id: "a1b2c3d4-0013-4000-8000-000000000013",
      name: "Done Processing Source",
      type: "n8n-nodes-base.noOp",
      typeVersion: 1,
      position: [2080, 0],
      notes: "Merges parallel outputs, loops back to next source"
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
        // Output 0: items to process
        [{ node: "Fetch CSV (HTTP Request)", type: "main", index: 0 },
         { node: "Read State Sheet", type: "main", index: 0 }],
        // Output 1: done (no more items)
        []
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
      main: [
        // True: parallel Calendar + Telegram + State Sheet
        [
          { node: "Create Google Calendar Event", type: "main", index: 0 },
          { node: "Telegram Broadcast", type: "main", index: 0 },
          { node: "Update State Sheet", type: "main", index: 0 }
        ],
        // False: skip
        [
          { node: "No New Events (Skip)", type: "main", index: 0 }
        ]
      ]
    },
    // Parallel outputs → Done → Loop back
    "Create Google Calendar Event": {
      main: [[{ node: "Done Processing Source", type: "main", index: 0 }]]
    },
    "Telegram Broadcast": {
      main: [[{ node: "Done Processing Source", type: "main", index: 0 }]]
    },
    "Update State Sheet": {
      main: [[{ node: "Done Processing Source", type: "main", index: 0 }]]
    },
    "No New Events (Skip)": {
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
    { name: "automation", id: "tag-automation" },
    { name: "plugin", id: "tag-plugin" }
  ],
  triggerCount: 1,
  updatedAt: new Date().toISOString(),
  versionId: "4"
};

// ===== WRITE =====
const outPath = path.join(__dirname, 'seminar-broadcast-workflow.json');
fs.writeFileSync(outPath, JSON.stringify(workflow, null, 2), 'utf-8');
console.log('✅ Workflow JSON generated:', outPath);

// ===== VERIFY =====
const verify = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
console.log(`Nodes: ${verify.nodes.length}`);
console.log(`Connections: ${Object.keys(verify.connections).length}`);

// Check parser code
const parseNode = verify.nodes.find(n => n.name === 'Parse & Transform Data');
const code = parseNode.parameters.jsCode;
console.log(`Parser code lines: ${code.split('\n').length}`);
console.log(`Has col.nim reference: ${code.includes('col.nim')}`);
console.log(`Has seminarType: ${code.includes('seminarType')}`);
console.log(`Has PRESERVE quotes: ${code.includes('PRESERVE')}`);

// Check Telegram template
const telNode = verify.nodes.find(n => n.name === 'Telegram Broadcast');
const telText = telNode.parameters.text;
console.log(`Telegram has seminar_type: ${telText.includes('seminar_type')}`);

// Check State Sheet has seminar_type
const stateNode = verify.nodes.find(n => n.name === 'Update State Sheet');
console.log(`State Sheet has seminar_type: ${'seminar_type' in stateNode.parameters.columns.value}`);

console.log('\n✅ All checks passed!');
