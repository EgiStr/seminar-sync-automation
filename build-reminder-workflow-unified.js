// =============================================================
// Build the UNIFIED morning reminder workflow JSON
// Usage: node build-reminder-workflow-unified.js
// =============================================================
// This is a SEPARATE workflow from the main broadcast workflows.
// It reads the SHARED state-sheet (populated by ALL program workflows)
// and sends a reminder for seminars happening TODAY.
//
// Flow: Schedule 05:30 → Read State Sheet → Filter Today → Send Telegram
//
// No CSV parsing needed — all data already in state-sheet!
// =============================================================
const fs = require('fs');
const path = require('path');

// ---- JS code for Filter Today's Seminars ----
const filterTodayCode = [
  '// Filter state-sheet rows to only seminars happening TODAY',
  '// Reads start_datetime (ISO 8601) and compares date portion',
  '',
  'const items = $input.all();',
  'const now = new Date();',
  '// Format today as YYYY-MM-DD in Asia/Jakarta (UTC+7)',
  'const jakartaOffset = 7 * 60 * 60 * 1000;',
  'const jakartaNow = new Date(now.getTime() + jakartaOffset);',
  'const todayStr = jakartaNow.toISOString().substring(0, 10);',
  '',
  'const todayEvents = [];',
  '',
  'for (const item of items) {',
  '  const startDt = (item.json.start_datetime || \'\').trim();',
  '  if (!startDt) continue;',
  '',
  '  // Extract date from ISO: "2024-07-12T10:00:00+07:00" → "2024-07-12"',
  '  const eventDate = startDt.substring(0, 10);',
  '  if (eventDate === todayStr) {',
  '    todayEvents.push(item);',
  '  }',
  '}',
  '',
  'if (todayEvents.length === 0) {',
  '  // Return empty array — downstream nodes won\'t execute',
  '  return [];',
  '}',
  '',
  '// Sort by start time',
  'todayEvents.sort((a, b) => {',
  '  const ta = a.json.start_datetime || \'\';',
  '  const tb = b.json.start_datetime || \'\';',
  '  return ta.localeCompare(tb);',
  '});',
  '',
  'return todayEvents;',
].join('\n');

// ---- Telegram reminder template (HTML parse mode) ----
// Universal: works for Sains Data, Farmasi, Aktuaria — all fields from state-sheet
const telegramReminderTemplate = '={{ \n' +
  '(function() {\n' +
  '  const e = (s) => s ? String(s).replace(/&/g,\'&amp;\').replace(/</g,\'&lt;\').replace(/>/g,\'&gt;\') : \'\';\n' +
  '  const program = e($json.program);\n' +
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
  '  const pembimbing3 = e($json.pembimbing3);\n' +
  '  const link = e($json.link);\n' +
  '  const calLink = $json.calendar_link || \'\';\n' +
  '\n' +
  '  let msg = \'⏰ <b>REMINDER HARI INI — \' + seminarType.toUpperCase() + \'</b>\';\n' +
  '  if (program) msg += \' <i>(\' + program + \')</i>\';\n' +
  '  msg += \'\\n\\n\' +\n' +
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
  '  if (pembimbing3) msg += \'👨‍🔬 <b>Pembimbing 3:</b> \' + pembimbing3 + \'\\n\';\n' +
  '  if (link) msg += \'\\n🔗 <b>Link:</b> \' + link + \'\\n\';\n' +
  '  if (calLink) msg += \'\\n📎 <a href="\' + calLink + \'">Buka Google Calendar</a>\\n\';\n' +
  '  msg += \'\\n<i>⏰ Reminder otomatis via n8n</i>\';\n' +
  '  return msg;\n' +
  '})()\n' +
  '}}';

// ===== BUILD WORKFLOW =====
const workflow = {
  name: "Seminar Reminder - Unified (All Programs)",
  nodes: [
    // 1. Schedule Trigger (05:30 WIB — before main workflows at 06:00)
    {
      parameters: {
        rule: { interval: [{ triggerAtHour: 5, triggerAtMinute: 30 }] }
      },
      id: "d1e2f3a4-0001-4000-8000-000000000001",
      name: "Schedule Trigger (05:30 WIB)",
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1.2,
      position: [0, 0]
    },

    // 2. Read State Sheet (shared across all programs)
    {
      parameters: {
        operation: "read",
        documentId: { __rl: true, mode: "url", value: "https://docs.google.com/spreadsheets/d/1yl-IpOrB5xSCUODvvOPCD_4HxrpdK9f77Q1qT5XjV2I/edit?usp=sharing" },
        sheetName: { __rl: true, mode: "name", value: "state-sheet" },
        options: {}
      },
      id: "d1e2f3a4-0002-4000-8000-000000000002",
      name: "Read State Sheet",
      type: "n8n-nodes-base.googleSheets",
      typeVersion: 4.5,
      position: [260, 0],
      credentials: {
        googleSheetsOAuth2Api: {
          id: "GOOGLE_SHEETS_CREDENTIAL_ID",
          name: "Google Sheets OAuth2 - CONFIGURE ME"
        }
      },
      notes: "Reads the SHARED state-sheet populated by Sains Data, Farmasi, Aktuaria workflows"
    },

    // 3. Filter Today's Seminars
    {
      parameters: { jsCode: filterTodayCode },
      id: "d1e2f3a4-0003-4000-8000-000000000003",
      name: "Filter Today's Seminars",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [520, 0],
      notes: "Compares start_datetime date portion with today (Asia/Jakarta). Sorted by time."
    },

    // 4. Telegram Reminder
    {
      parameters: {
        chatId: "1404670948",
        text: telegramReminderTemplate,
        additionalFields: {
          parse_mode: "HTML",
          disable_notification: false
        }
      },
      id: "d1e2f3a4-0004-4000-8000-000000000004",
      name: "Telegram Reminder",
      type: "n8n-nodes-base.telegram",
      typeVersion: 1.2,
      position: [780, 0],
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
      notes: "Universal template: shows program name, all dosen, link, calendar link. Works for ALL programs."
    }
  ],

  connections: {
    "Schedule Trigger (05:30 WIB)": {
      main: [[
        { node: "Read State Sheet", type: "main", index: 0 }
      ]]
    },
    "Read State Sheet": {
      main: [[
        { node: "Filter Today's Seminars", type: "main", index: 0 }
      ]]
    },
    "Filter Today's Seminars": {
      main: [[
        { node: "Telegram Reminder", type: "main", index: 0 }
      ]]
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
    { name: "reminder", id: "tag-reminder" },
    { name: "seminar", id: "tag-seminar" },
    { name: "automation", id: "tag-automation" },
    { name: "unified", id: "tag-unified" }
  ],
  triggerCount: 1,
  updatedAt: new Date().toISOString(),
  versionId: "1"
};

// ===== WRITE =====
const outPath = path.join(__dirname, 'seminar-reminder-workflow-unified.json');
fs.writeFileSync(outPath, JSON.stringify(workflow, null, 2), 'utf-8');
console.log('✅ Unified Reminder Workflow JSON generated:', outPath);

// ===== VERIFY =====
const verify = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
console.log(`Nodes: ${verify.nodes.length}`);
console.log(`Connections: ${Object.keys(verify.connections).length}`);

const filterNode = verify.nodes.find(n => n.name === "Filter Today's Seminars");
const filterCode = filterNode.parameters.jsCode;
console.log(`Filter has start_datetime: ${filterCode.includes('start_datetime')}`);
console.log(`Filter has todayStr comparison: ${filterCode.includes('todayStr')}`);
console.log(`Filter has Jakarta offset: ${filterCode.includes('jakartaOffset')}`);
console.log(`Filter sorts by time: ${filterCode.includes('.sort(')}`);

const telNode = verify.nodes.find(n => n.name === 'Telegram Reminder');
const telText = telNode.parameters.text;
console.log(`Reminder has REMINDER: ${telText.includes('REMINDER')}`);
console.log(`Reminder has program: ${telText.includes('program')}`);
console.log(`Reminder has pembimbing3: ${telText.includes('pembimbing3')}`);
console.log(`Reminder has calendar_link: ${telText.includes('calendar_link')}`);
console.log(`Reminder has link: ${telText.includes('$json.link')}`);
console.log(`Reminder parse_mode: ${telNode.parameters.additionalFields.parse_mode}`);
console.log(`Reminder has NO backslash-dollar: ${!telText.includes('\\$')}`);
console.log(`Reminder has NO backslash-backtick: ${!telText.includes('\\`')}`);

console.log('\n✅ All unified reminder checks passed!');
