/**
 * =====================================================================
 * PENERIMA DATA: Google Sheets untuk Prototaip Ulang Kaji AR
 * ---------------------------------------------------------------------
 * Tampal fail ini dalam Extensions > Apps Script bagi Google Sheet anda,
 * kemudian Deploy > New deployment > Web app
 *   (Execute as: Me, Who has access: Anyone).
 *
 * Tab yang dicipta secara automatik:
 *   participants, sessions, subtopic_results, item_responses, events
 *
 * Dua token:
 *   APP_TOKEN   : sama dengan js/sheets-config.js (bukan rahsia, ada dalam kod awam)
 *   ADMIN_TOKEN : RAHSIA. Hanya untuk muat turun semua data (op=export).
 *                 Jangan letak dalam apps atau GitHub.
 * =====================================================================
 */

const APP_TOKEN = 'TUKAR-token-apps';
const ADMIN_TOKEN = 'TUKAR-token-admin-rahsia-yang-panjang';

const COLLECTIONS = ['participants', 'sessions', 'subtopic_results', 'item_responses', 'events'];
const UPSERT = { participants: true, sessions: true, subtopic_results: true };   // lain-lain: tambah baris sahaja
const MAX_RECORDS_PER_REQUEST = 50;

// ------------------------------------------------------------------ GET
function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.op === 'participant') {
      if (p.token !== APP_TOKEN) return json({ ok: false, error: 'token' });
      if (!/^[A-Z0-9_-]{2,12}$/.test(String(p.pid || ''))) return json({ ok: false, error: 'pid' });
      return json({ ok: true, participant: findRecord('participants', p.pid) });
    }
    if (p.op === 'export') {
      if (p.token !== ADMIN_TOKEN || ADMIN_TOKEN.indexOf('TUKAR') === 0) return json({ ok: false, error: 'token' });
      const out = {};
      COLLECTIONS.forEach(function (c) { out[c] = readAll(c); });
      return json(out);
    }
    return json({ ok: true, message: 'Penerima data aktif', time: new Date().toISOString() });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// ----------------------------------------------------------------- POST
function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, error: 'json' });
  }
  if (body.token !== APP_TOKEN) return json({ ok: false, error: 'token' });
  const records = Array.isArray(body.records) ? body.records : [];
  if (!records.length || records.length > MAX_RECORDS_PER_REQUEST) return json({ ok: false, error: 'records' });

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    return json({ ok: false, error: 'busy' });
  }
  try {
    const appends = {};
    records.forEach(function (r) {
      if (COLLECTIONS.indexOf(r.collection) < 0 || !r.data || typeof r.data !== 'object') return;
      const data = Object.assign({}, r.data, { server_time: new Date().toISOString() });
      if (UPSERT[r.collection]) {
        upsert(r.collection, String(r.id), data, r.merge !== false);
      } else {
        (appends[r.collection] = appends[r.collection] || []).push(Object.assign({ id: r.id || Utilities.getUuid() }, data));
      }
    });
    Object.keys(appends).forEach(function (c) { appendRows(c, appends[c]); });
    return json({ ok: true, n: records.length });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// ------------------------------------------------------------- PEMBANTU
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sheetFor(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1).setValue('id');
    sh.setFrozenRows(1);
  }
  return sh;
}

function headersOf(sh) {
  const n = Math.max(sh.getLastColumn(), 1);
  return sh.getRange(1, 1, 1, n).getValues()[0].map(String);
}

// Tambah lajur baharu jika rekod ada medan yang belum wujud
function ensureHeaders(sh, keys) {
  const headers = headersOf(sh);
  const missing = keys.filter(function (k) { return headers.indexOf(k) < 0; });
  if (missing.length) {
    sh.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
    return headers.concat(missing);
  }
  return headers;
}

function toCell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  // Elak teks dibaca sebagai formula (contohnya jawapan yang ditaip bermula dengan "=")
  if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v;
  return v;
}

function fromCell(v) {
  if (v instanceof Date) return v.toISOString();   // Sheets menukar teks ISO kepada tarikh
  if (typeof v === 'string' && (v.charAt(0) === '{' || v.charAt(0) === '[')) {
    try { return JSON.parse(v); } catch (err) { return v; }
  }
  if (v === '') return null;
  return v;
}

function rowIndexById(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) return i + 2;
  return -1;
}

function upsert(collection, id, data, merge) {
  const sh = sheetFor(collection);
  const record = Object.assign({ id: id }, data);
  const headers = ensureHeaders(sh, Object.keys(record));
  const row = rowIndexById(sh, id);
  let values;
  if (row > 0 && merge) {
    values = sh.getRange(row, 1, 1, headers.length).getValues()[0];
  } else {
    values = headers.map(function () { return ''; });
  }
  headers.forEach(function (h, i) { if (h in record) values[i] = toCell(record[h]); });
  const target = row > 0 ? row : sh.getLastRow() + 1;
  sh.getRange(target, 1, 1, headers.length).setValues([values]);
}

function appendRows(collection, records) {
  const sh = sheetFor(collection);
  const keys = [];
  records.forEach(function (r) { Object.keys(r).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); }); });
  const headers = ensureHeaders(sh, keys);
  const rows = records.map(function (r) { return headers.map(function (h) { return h in r ? toCell(r[h]) : ''; }); });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
}

function rowToObject(headers, values) {
  const o = {};
  headers.forEach(function (h, i) { const v = fromCell(values[i]); if (v !== null) o[h] = v; });
  return o;
}

function findRecord(collection, id) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(collection);
  if (!sh) return null;
  const row = rowIndexById(sh, String(id));
  if (row < 0) return null;
  const headers = headersOf(sh);
  return rowToObject(headers, sh.getRange(row, 1, 1, headers.length).getValues()[0]);
}

function readAll(collection) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(collection);
  const out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  const headers = headersOf(sh);
  const values = sh.getRange(2, 1, sh.getLastRow() - 1, headers.length).getValues();
  values.forEach(function (v) { const o = rowToObject(headers, v); out[String(o.id)] = o; });
  return out;
}

// Jalankan sekali dari editor (pilih "testSetup" > Run) untuk memberi kebenaran
// dan mencipta semua tab.
function testSetup() {
  COLLECTIONS.forEach(sheetFor);
  Logger.log('Tab dicipta. Sekarang Deploy > New deployment > Web app.');
}
