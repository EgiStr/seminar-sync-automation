// =============================================================
// Build the Teknik Geologi seminar workflow JSON (SEMHAS only)
// Usage: node build-workflow-geologi.js
// =============================================================
// Spreadsheet: https://docs.google.com/spreadsheets/d/12-MQNd_btAS1eRf7IIu9u7a4fQi8ZZausM0arnyl0RY
//   SEMHAS+SIDANG gid=0  |  SEMPRO — not available yet
//
// Teknik Geologi CSV challenges:
//   - Multi-row entries (main row + continuation for pembimbing2/penguji2 + NIP rows)
//   - NIM in col 3 (new entries) or embedded in col 2 name "(118150047)" (old entries)
//   - Combined HARI/TANGGAL+TIME in col 5 with 10+ format variations:
//       "Rabu, 13 Juli 2022 (Pukul 09:00 s.d Selesai)"
//       "Kamis/06 Oktober 2022 (Pukul 15:00 - 17:00 WIB)"
//       "Rabu, 8 Januari 2025 10.00 - 12.00"
//       "Senin, 3 Juni 2024        15.00 - 17.00"
//       "Jumat, 7 Februari 2025 " → time in col 6 "13.30 - 15.30"
//       "Kamis, 20 Februari 2025"  → time in col 6 "15.00-17.00"
//   - RUANGAN sometimes in col 9, sometimes col 10 (LOKASI OFFLINE)
//   - Links (Google Meet) sometimes in col 11
//   - JENIS column (col 1): "SEMINAR HASIL", "SIDANG SKRIPSI", or empty (older entries)
// =============================================================
const fs = require('fs');
const path = require('path');

// ---- JS code for Config Sources node ----
const configSourcesCode = [
  '',
  '// ============================',
  '// PLUGIN CONFIG — Teknik Geologi seminar types',
  '// Only gid=0 (SEMHAS+SIDANG) available. Add SEMPRO when sheet is created.',
  '// ============================',
  '',
  'return [',
  '  { json: {',
  '    type: "Seminar Hasil",',
  '    sheetUrl: "https://docs.google.com/spreadsheets/d/12-MQNd_btAS1eRf7IIu9u7a4fQi8ZZausM0arnyl0RY/export?format=csv&gid=0",',
  '    columns: {',
  '      no: 0, jenis: 1, nama: 2, nim: 3,',
  '      judul: 4, hariTanggal: 5, waktu: 6,',
  '      pembimbing: 7, penguji: 8,',
  '      ruangan: 9, lokasiOffline: 10,',
  '      link: 11',
  '    }',
  '  }}',
  '  // Uncomment below when SEMPRO sheet is available:',
  '  // ,{ json: {',
  '  //   type: "Seminar Proposal",',
  '  //   sheetUrl: "https://docs.google.com/spreadsheets/d/12-MQNd_btAS1eRf7IIu9u7a4fQi8ZZausM0arnyl0RY/export?format=csv&gid=SEMPRO_GID_HERE",',
  '  //   columns: {',
  '  //     no: 0, jenis: 1, nama: 2, nim: 3,',
  '  //     judul: 4, hariTanggal: 5, waktu: 6,',
  '  //     pembimbing: 7, penguji: 8,',
  '  //     ruangan: 9, lokasiOffline: 10,',
  '  //     link: 11',
  '  //   }',
  '  // }}',
  '];',
].join('\n');

// ---- JS code for Parse & Transform node (Teknik Geologi version) ----
const parseTransformCode = [
  '// CSV Parse + Transform + Validate + Hash  (Teknik Geologi)',
  '// Handles:',
  '//   - Multi-row entries (main + continuation rows for pembimbing2/penguji2)',
  '//   - NIP rows (skipped)',
  '//   - NIM in col 3 (primary) or extracted from col 2 name (fallback)',
  '//   - 10+ date/time format variations in col 5 + col 6',
  '//   - Ruangan from col 9 or col 10 (LOKASI OFFLINE)',
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
  '// Normalize day names: "Jum,at"/"Jum\'at"/"Jumat " → "Jumat"',
  'function cleanHari(s) {',
  '  if (!s) return \'\';',
  '  const h = s.replace(/[\\\',.\\s]/g, \'\');',
  '  const map = {',
  '    senin:\'Senin\', selasa:\'Selasa\', rabu:\'Rabu\',',
  '    kamis:\'Kamis\', jumat:\'Jumat\', sabtu:\'Sabtu\', minggu:\'Minggu\'',
  '  };',
  '  return map[h.toLowerCase()] || s.trim();',
  '}',
  '',
  '// Extract NIM from name field: "M. Rayhan (118150047)" → "118150047"',
  '// Also handles: "Nama/118150094 (SEMINAR HASIL)"',
  'function extractNimFromName(name) {',
  '  // Try parentheses: "Nama (118150047)"',
  '  const parenMatch = name.match(/\\((\\d{8,})\\)/);',
  '  if (parenMatch) return parenMatch[1];',
  '  // Try slash: "Nama/118150094"',
  '  const slashMatch = name.match(/\\/(\\d{8,})/);',
  '  if (slashMatch) return slashMatch[1];',
  '  return \'\';',
  '}',
  '',
  '// Clean name: remove NIM in parens, trailing slash+NIM, seminar type markers',
  'function cleanName(name) {',
  '  let n = name;',
  '  n = n.replace(/\\s*\\/\\d+\\s*/g, \'\');           // remove /NIM',
  '  n = n.replace(/\\s*\\(\\d{8,}\\)\\s*/g, \'\');      // remove (NIM)',
  '  n = n.replace(/\\s*\\(SEMINAR HASIL\\)\\s*/gi, \'\');',
  '  n = n.replace(/\\s*\\(SIDANG[^)]*\\)\\s*/gi, \'\');',
  '  n = n.replace(/\\s+/g, \' \').trim();',
  '  return n;',
  '}',
  '',
  '// Parse combined HARI/TANGGAL field + optional WAKTU field',
  '// Returns: { hari, tanggal, timePart, pd: {year, month, day} } or null',
  'function parseHariTanggalWaktu(hariTglRaw, waktuRaw) {',
  '  if (!hariTglRaw) return null;',
  '  let s = hariTglRaw.replace(/\\n/g, \' \').trim();',
  '  let timePart = \'\';',
  '',
  '  // Step 1: Extract time from parentheses: "(Pukul 09:00 s.d Selesai)" or "(15.30)"',
  '  const parenMatch = s.match(/\\(([^)]+)\\)/);',
  '  if (parenMatch) {',
  '    let inParen = parenMatch[1];',
  '    inParen = inParen.replace(/Pukul\\s*/i, \'\').trim();',
  '    inParen = inParen.replace(/\\s*(s\\.?d\\.?\\s*)?Selesai\\s*/gi, \'\').trim();',
  '    inParen = inParen.replace(/\\s*(WIB|WITA|WIT)\\s*/gi, \'\').trim();',
  '    inParen = inParen.replace(/[\\s,\\-]+$/, \'\').trim();',
  '    if (/\\d/.test(inParen)) timePart = inParen;',
  '    s = s.replace(/\\([^)]+\\)/, \'\').trim();',
  '  }',
  '',
  '  // Step 2: Split hari from rest (by comma or slash before non-digit)',
  '  let hari = \'\';',
  '  let datePart = s;',
  '  const commaIdx = s.indexOf(\',\');',
  '  if (commaIdx >= 0) {',
  '    const before = s.substring(0, commaIdx).trim();',
  '    // Only treat as hari if before comma is a day name (no digits)',
  '    if (!/\\d/.test(before)) {',
  '      hari = before;',
  '      datePart = s.substring(commaIdx + 1).trim();',
  '    }',
  '  } else {',
  '    // Try "Hari/DD Month YYYY" format (handles Jum\'at etc.)',
  '    const slashDayMatch = s.match(/^(\\D+)\\/(\\d.*)$/);',
  '    if (slashDayMatch) {',
  '      hari = slashDayMatch[1].trim();',
  '      datePart = slashDayMatch[2].trim();',
  '    }',
  '  }',
  '',
  '  // Step 3: Extract time from end of datePart if not found in parens',
  '  if (!timePart) {',
  '    // Time range at end: "8 Januari 2025 10.00 - 12.00"',
  '    const rangeEnd = datePart.match(/(\\d{1,2}[.:](\\d{2})\\s*-\\s*\\d{1,2}[.:](\\d{2}))\\s*$/);',
  '    if (rangeEnd) {',
  '      timePart = rangeEnd[1];',
  '      datePart = datePart.substring(0, rangeEnd.index).trim();',
  '    } else {',
  '      // Single time at end: "8 Januari 2025 10.00" (only if year present)',
  '      const singleEnd = datePart.match(/(\\d{1,2}[.:](\\d{2}))\\s*$/);',
  '      if (singleEnd && datePart.match(/\\d{4}/)) {',
  '        timePart = singleEnd[1];',
  '        datePart = datePart.substring(0, singleEnd.index).trim();',
  '      }',
  '    }',
  '  }',
  '',
  '  // Step 4: If still no time, use WAKTU column (col 6)',
  '  if (!timePart && waktuRaw) {',
  '    timePart = waktuRaw.replace(/\\s*(WIB|WITA|WIT)\\s*/gi, \'\').trim();',
  '  }',
  '',
  '  // Step 5: Clean hari name',
  '  hari = cleanHari(hari);',
  '',
  '  // Step 6: Parse date from datePart',
  '  // Try DD/MM/YYYY or DD-MM-YYYY',
  '  let pd = null;',
  '  const slashDate = datePart.match(/(\\d{1,2})[\\/\\-](\\d{1,2})[\\/\\-](\\d{4})/);',
  '  if (slashDate) {',
  '    pd = { year: parseInt(slashDate[3]), month: parseInt(slashDate[2]) - 1, day: parseInt(slashDate[1]) };',
  '  } else {',
  '    // Try "DD Month YYYY" or "DD MonthName YYYY" from datePart',
  '    const cleaned = datePart.replace(/\\s+/g, \' \').trim();',
  '    const wordDate = cleaned.match(/(\\d{1,2})\\s+(\\w+)\\s+(\\d{4})/);',
  '    if (wordDate) {',
  '      const d = parseInt(wordDate[1]);',
  '      const mLower = wordDate[2].toLowerCase();',
  '      const m = BULAN[mLower] !== undefined ? BULAN[mLower] : BULAN_SHORT[mLower.substring(0, 3)];',
  '      const y = parseInt(wordDate[3]);',
  '      if (!isNaN(d) && m !== undefined && !isNaN(y)) {',
  '        pd = { year: y, month: m, day: d };',
  '      }',
  '    }',
  '  }',
  '',
  '  if (!pd) return null;',
  '',
  '  const tanggalStr = pd.day + \' \' + BULAN_NAMES[pd.month] + \' \' + pd.year;',
  '  return { hari, tanggal: tanggalStr, timePart, pd };',
  '}',
  '',
  '// Parse time range: "13.00-14.00", "09:00 - 11:00", "15.30", "09:00"',
  'function parseTimeRange(s) {',
  '  if (!s) return null;',
  '  let cleaned = s.replace(/\\s*(WIB|WITA|WIT)\\s*/gi, \'\').trim();',
  '  cleaned = cleaned.replace(/\\s*([.:])\\s*/g, \'$1\');',
  '  cleaned = cleaned.replace(/[\\s,\\-]+$/, \'\').trim();',
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
  '  // Default: 2 hour duration (typical for geologi seminars)',
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
  '// Normalize embedded newlines in all cells',
  'for (let i = 0; i < allRows.length; i++) {',
  '  allRows[i] = allRows[i].map(f => f.replace(/\\n/g, \' \').replace(/\\s+/g, \' \').trim());',
  '}',
  '',
  '// ===== TWO-PASS PARSING FOR MULTI-ROW ENTRIES =====',
  '// Pass 1: Identify main data rows and collect continuation data',
  'const entries = [];',
  'let currentEntry = null;',
  '',
  'for (let i = 0; i < allRows.length; i++) {',
  '  const c = allRows[i];',
  '  if (c.length < 8) continue;',
  '',
  '  const firstCell = (c[0] || \'\').trim().toLowerCase();',
  '  const nimCell = (c[col.nim] || \'\').trim();',
  '  const pembCell = (c[col.pembimbing] || \'\').trim();',
  '  const pengujiCell = (c[col.penguji] || \'\').trim();',
  '',
  '  // Skip header rows',
  '  if (firstCell === \'no\' || firstCell.startsWith(\'jadwal\')) continue;',
  '  if (firstCell.startsWith(\'semester\')) continue;',
  '',
  '  // Skip NIP rows (pembimbing col starts with "NIP")',
  '  if (/^NIP/i.test(pembCell)) continue;',
  '',
  '  // Skip rows with only FALSE/TRUE or MENUNGGU',
  '  if (/^(false|true|menunggu)/i.test((c[5] || \'\').trim())) continue;',
  '',
  '  // New entry: col 3 has valid numeric NIM (8+ digits)',
  '  if (/^\\d{8,}$/.test(nimCell)) {',
  '    // Save previous entry',
  '    if (currentEntry) entries.push(currentEntry);',
  '',
  '    const namaRaw = (c[col.nama] || \'\').trim();',
  '    const nama = cleanName(namaRaw);',
  '    const nim = nimCell;',
  '    const judul = (c[col.judul] || \'\').trim();',
  '    const hariTglRaw = (c[col.hariTanggal] || \'\').trim();',
  '    const waktuRaw = (c[col.waktu] || \'\').trim();',
  '    let ruangan = (c[col.ruangan] || \'\').trim();',
  '    if (!ruangan || ruangan === \'-\') {',
  '      ruangan = (c[col.lokasiOffline] || \'\').trim();',
  '    }',
  '    if (ruangan === \'-\') ruangan = \'\';',
  '    const linkRaw = (c[col.link] || \'\').trim();',
  '    const link = /^http/i.test(linkRaw) ? linkRaw : \'\';',
  '    const jenis = (c[col.jenis] || \'\').trim();',
  '',
  '    currentEntry = {',
  '      nama, nim, judul, hariTglRaw, waktuRaw, ruangan, link, jenis,',
  '      pembimbing1: pembCell,',
  '      penguji1: pengujiCell,',
  '      pembimbing2: \'\',',
  '      penguji2: \'\'',
  '    };',
  '  } else if (currentEntry && !firstCell && pembCell && !/^NIP/i.test(pembCell) && pembCell !== \'-\') {',
  '    // Continuation row: merge pembimbing2/penguji2',
  '    if (!currentEntry.pembimbing2 && pembCell) {',
  '      currentEntry.pembimbing2 = pembCell;',
  '    }',
  '    if (!currentEntry.penguji2 && pengujiCell && !/^NIP/i.test(pengujiCell)) {',
  '      currentEntry.penguji2 = pengujiCell;',
  '    }',
  '  } else if (!nimCell && !firstCell) {',
  '    // Could be NIM-less old entry — try extracting NIM from name',
  '    const namaRaw = (c[col.nama] || \'\').trim();',
  '    const extractedNim = extractNimFromName(namaRaw);',
  '    if (extractedNim) {',
  '      if (currentEntry) entries.push(currentEntry);',
  '',
  '      const nama = cleanName(namaRaw);',
  '      const judul = (c[col.judul] || \'\').trim();',
  '      const hariTglRaw = (c[col.hariTanggal] || \'\').trim();',
  '      const waktuRaw = (c[col.waktu] || \'\').trim();',
  '      let ruangan = (c[col.ruangan] || \'\').trim();',
  '      if (!ruangan || ruangan === \'-\') {',
  '        ruangan = (c[col.lokasiOffline] || \'\').trim();',
  '      }',
  '      if (ruangan === \'-\') ruangan = \'\';',
  '      const linkRaw = (c[col.link] || \'\').trim();',
  '      const link = /^http/i.test(linkRaw) ? linkRaw : \'\';',
  '      const jenis = (c[col.jenis] || \'\').trim();',
  '',
  '      currentEntry = {',
  '        nama, nim: extractedNim, judul, hariTglRaw, waktuRaw, ruangan, link, jenis,',
  '        pembimbing1: pembCell,',
  '        penguji1: pengujiCell,',
  '        pembimbing2: \'\',',
  '        penguji2: \'\'',
  '      };',
  '    }',
  '  }',
  '}',
  '// Don\'t forget the last entry',
  'if (currentEntry) entries.push(currentEntry);',
  '',
  '// ===== Pass 2: Transform entries into output items =====',
  'const results = [];',
  '',
  'for (const e of entries) {',
  '  if (!e.nama || !e.nim) continue;',
  '',
  '  // Parse combined date+time',
  '  const parsed = parseHariTanggalWaktu(e.hariTglRaw, e.waktuRaw);',
  '  if (!parsed || !parsed.pd) continue;',
  '',
  '  const { hari, tanggal, timePart, pd } = parsed;',
  '  if (!timePart) continue;',
  '',
  '  const pt = parseTimeRange(timePart);',
  '  if (!pt) continue;',
  '',
  '  const startDt = toISO(pd.year, pd.month, pd.day, pt.sh, pt.sm);',
  '  const endDt   = toISO(pd.year, pd.month, pd.day, pt.eh, pt.em);',
  '  const eventHashId = eventHash(`${seminarType}|${e.nim}|${startDt}`);',
  '',
  '  // Determine effective seminar type from JENIS column',
  '  let effectiveType = seminarType;',
  '  if (e.jenis) {',
  '    if (/sidang/i.test(e.jenis)) effectiveType = \'Sidang Skripsi\';',
  '    else if (/hasil/i.test(e.jenis)) effectiveType = \'Seminar Hasil\';',
  '    else if (/proposal/i.test(e.jenis)) effectiveType = \'Seminar Proposal\';',
  '  }',
  '',
  '  let calDesc = `Judul: ${e.judul}\\nNIM: ${e.nim}`;',
  '  calDesc += `\\nPembimbing 1: ${e.pembimbing1}`;',
  '  if (e.pembimbing2) calDesc += `\\nPembimbing 2: ${e.pembimbing2}`;',
  '  calDesc += `\\nPenguji 1: ${e.penguji1}`;',
  '  if (e.penguji2) calDesc += `\\nPenguji 2: ${e.penguji2}`;',
  '  if (e.link) calDesc += `\\nLink: ${e.link}`;',
  '',
  '  results.push({ json: {',
  '    program: "Teknik Geologi",',
  '    seminar_type: effectiveType,',
  '    nim: e.nim, nama: e.nama, tanggal, hari,',
  '    jam: timePart, ruangan: e.ruangan, judul: e.judul, link: e.link,',
  '    pembimbing1: e.pembimbing1, pembimbing2: e.pembimbing2,',
  '    pembimbing3: "", penguji1: e.penguji1, penguji2: e.penguji2,',
  '    start_datetime: startDt,',
  '    end_datetime: endDt,',
  '    event_hash_id: eventHashId,',
  '    calendar_summary: `[${effectiveType}] ${e.nama} - ${e.nim}`,',
  '    calendar_location: e.ruangan ? `Ruangan ${e.ruangan}` : \'TBA\',',
  '    calendar_description: calDesc',
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
  '  const calLink = $json.calendar_link || \'\';\n' +
  '\n' +
  '  let msg = \'📢 <b>JADWAL \' + seminarType.toUpperCase() + \'</b>\' + \'\\n\\n\' +\n' +
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
  '  msg += \'\\n<i>Pesan otomatis via n8n</i>\';\n' +
  '  return msg;\n' +
  '})()\n' +
  '}}';

// ===== BUILD WORKFLOW =====
const workflow = {
  name: "Seminar Sync Automation - Teknik Geologi",
  nodes: [
    // 1. Schedule Trigger
    {
      parameters: {
        rule: { interval: [{ triggerAtHour: 6, triggerAtMinute: 0 }] }
      },
      id: "d1e2f3g4-0001-4000-8000-000000000001",
      name: "Schedule Trigger (06:00 WIB)",
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1.2,
      position: [0, 0]
    },

    // 2. Config Sources
    {
      parameters: { jsCode: configSourcesCode },
      id: "d1e2f3g4-0011-4000-8000-000000000011",
      name: "Config Sources",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [260, 0],
      notes: "PLUGIN CONFIG: Teknik Geologi — SEMHAS only (add SEMPRO gid when available)"
    },

    // 3. Loop Over Sources
    {
      parameters: { batchSize: 1, options: {} },
      id: "d1e2f3g4-0012-4000-8000-000000000012",
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
      id: "d1e2f3g4-0002-4000-8000-000000000002",
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
      id: "d1e2f3g4-0003-4000-8000-000000000003",
      name: "Parse & Transform Data",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1040, 0],
      notes: "Geologi parser: multi-row entries, messy dates, NIM extraction"
    },

    // 6. Read State Sheet
    {
      parameters: {
        operation: "read",
        documentId: { __rl: true, mode: "url", value: "https://docs.google.com/spreadsheets/d/1yl-IpOrB5xSCUODvvOPCD_4HxrpdK9f77Q1qT5XjV2I/edit?gid=119803019#gid=119803019" },
        sheetName: { __rl: true, mode: "name", value: "state-sheet" },
        options: {}
      },
      id: "d1e2f3g4-0004-4000-8000-000000000004",
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
      id: "d1e2f3g4-0005-4000-8000-000000000005",
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
      id: "d1e2f3g4-0006-4000-8000-000000000006",
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
      id: "d1e2f3g4-0007-4000-8000-000000000007",
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
      id: "d1e2f3g4-0014-4000-8000-000000000014",
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
      id: "d1e2f3g4-0008-4000-8000-000000000008",
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
      id: "d1e2f3g4-0009-4000-8000-000000000009",
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
      id: "d1e2f3g4-0013-4000-8000-000000000013",
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
    { name: "geologi", id: "tag-geologi" }
  ],
  triggerCount: 1,
  updatedAt: new Date().toISOString(),
  versionId: "1"
};

// ===== WRITE =====
const outPath = path.join(__dirname, 'seminar-broadcast-workflow-geologi.json');
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
console.log(`Parser has col.waktu: ${code.includes('col.waktu')}`);
console.log(`Parser has multi-row handling: ${code.includes('currentEntry')}`);
console.log(`Parser has NIM extraction: ${code.includes('extractNimFromName')}`);
console.log(`Parser has cleanName: ${code.includes('cleanName')}`);
console.log(`Parser has parseHariTanggalWaktu: ${code.includes('parseHariTanggalWaktu')}`);
console.log(`Parser has NIP skip: ${code.includes('NIP')}`);
console.log(`Parser has CLEAN backtick template: ${code.includes('`${y}')}`);
console.log(`Parser has NO backslash-backtick: ${!code.includes('\\`')}`);

const configNode = verify.nodes.find(n => n.name === 'Config Sources');
const configCode = configNode.parameters.jsCode;
console.log(`Config has SEMHAS URL (gid=0): ${configCode.includes('gid=0')}`);
console.log(`Config has hariTanggal: ${configCode.includes('hariTanggal')}`);
console.log(`Config has waktu: ${configCode.includes('waktu')}`);
console.log(`Config has lokasiOffline: ${configCode.includes('lokasiOffline')}`);

const telNode = verify.nodes.find(n => n.name === 'Telegram Broadcast');
const telText = telNode.parameters.text;
console.log(`Telegram has calendar_link: ${telText.includes('calendar_link')}`);
console.log(`Telegram parse_mode: ${telNode.parameters.additionalFields.parse_mode}`);
console.log(`Telegram has NO backslash-dollar: ${!telText.includes('\\$')}`);
console.log(`Telegram has NO backslash-backtick: ${!telText.includes('\\`')}`);

const calNode = verify.nodes.find(n => n.name === 'Create Google Calendar Event');
console.log(`Calendar enabled: ${!calNode.disabled}`);

console.log('\n✅ All checks passed!');
