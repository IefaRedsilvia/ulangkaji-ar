// =====================================================================
// LAPISAN DATA
// Keutamaan: Google Sheets (js/sheets-config.js) → Firebase
// (js/firebase-config.js) → MOD TEMPATAN (localStorage).
// Setiap rekod juga disalin ke sandaran tempatan supaya boleh dimuat
// turun jika rangkaian gagal.
// =====================================================================
import { firebaseConfig } from './firebase-config.js';
import { sheetsConfig } from './sheets-config.js';
import { nowStamp, sleep } from './util.js';
import { CONFIG } from './config.js';

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
const BACKUP_KEY = 'didik_backup_v1';
const LOCAL_PARTICIPANTS = 'didik_participants_v1';
const OUTBOX_KEY = 'didik_outbox_v1';
const BATCH = 25;

let fs = null;       // modul firestore
let db = null;
let uid = 'local';
let mode = 'local';  // 'sheets' | 'firebase' | 'local'
let writeErrors = 0;

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.warn('localStorage penuh?', e); }
}

function backup(collection, id, data, merge = false) {
  const b = readJSON(BACKUP_KEY, {});
  b[collection] = b[collection] || {};
  const key = id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  b[collection][key] = merge ? { ...(b[collection][key] || {}), ...data } : data;
  writeJSON(BACKUP_KEY, b);
  return key;
}

export function getMode() { return mode; }
export function getUid() { return uid; }
export function getWriteErrors() { return writeErrors; }

function localUid() {
  const id = readJSON('didik_local_uid', null) || `dev_${Math.random().toString(36).slice(2, 10)}`;
  writeJSON('didik_local_uid', id);
  return id;
}

export async function init() {
  const devLocal = CONFIG.DEV && !CONFIG.DEV_BACKEND;   // data mod dev tidak dihantar ke mana-mana
  if (!devLocal && sheetsConfig.SHEETS_URL) {
    mode = 'sheets';
    uid = localUid();
    window.addEventListener('online', () => flush());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) flush(); });
    flush();
    return mode;
  }
  if (devLocal || !firebaseConfig.apiKey) {
    mode = 'local';
    uid = localUid();
    return mode;
  }
  const appMod = await import(FB + 'firebase-app.js');
  const authMod = await import(FB + 'firebase-auth.js');
  fs = await import(FB + 'firebase-firestore.js');
  const app = appMod.initializeApp(firebaseConfig);
  try {
    db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache() });
  } catch {
    db = fs.getFirestore(app);
  }
  const auth = authMod.getAuth(app);
  const cred = await authMod.signInAnonymously(auth);
  uid = cred.user.uid;
  mode = 'firebase';
  return mode;
}

function stamp(data) {
  const s = nowStamp();
  const out = { ...data, uid, ...('client_ms' in data ? {} : s) };
  if (mode === 'firebase') out.server_ts = fs.serverTimestamp();
  return out;
}

// ------------------------------------------------ Google Sheets: outbox
// Rekod dimasukkan ke baris gilir dalam telefon dahulu, kemudian dihantar
// berkelompok mengikut urutan. Jika gagal (tiada internet), dicuba semula.
let flushing = false;
let backoff = 2000;

function enqueue(rec) {
  const box = readJSON(OUTBOX_KEY, []);
  box.push(rec);
  writeJSON(OUTBOX_KEY, box);
  flush();
}

export function pendingCount() { return readJSON(OUTBOX_KEY, []).length; }

async function flush() {
  if (mode !== 'sheets' || flushing) return;
  flushing = true;
  try {
    for (;;) {
      const box = readJSON(OUTBOX_KEY, []);
      if (!box.length) break;
      const batch = box.slice(0, BATCH);
      let ok = false;
      try {
        const res = await fetch(sheetsConfig.SHEETS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // elak CORS preflight
          body: JSON.stringify({ token: sheetsConfig.APP_TOKEN, records: batch }),
        });
        const out = await res.json();
        ok = !!out.ok;
        if (!ok) console.warn('Sheets menolak:', out);
      } catch (e) {
        console.warn('Sheets tidak dapat dihubungi', e);
      }
      if (!ok) {
        writeErrors++;
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 30000);
        if (!navigator.onLine) break;           // cuba semula bila 'online'
        continue;
      }
      backoff = 2000;
      const rest = readJSON(OUTBOX_KEY, []).slice(batch.length);
      writeJSON(OUTBOX_KEY, rest);
    }
  } finally {
    flushing = false;
  }
}

// Tunggu sehingga semua rekod dihantar (atau tamat masa)
export async function drain(timeoutMs = 30000, onProgress = () => {}) {
  if (mode !== 'sheets') return true;
  const t0 = Date.now();
  flush();
  while (pendingCount() > 0 && Date.now() - t0 < timeoutMs) {
    onProgress(pendingCount());
    await sleep(500);
    if (!flushing) flush();
  }
  return pendingCount() === 0;
}

// ------------------------------------------------------- tulis rekod
async function setDocument(collection, id, data, merge = false) {
  const payload = stamp(data);
  const { server_ts, ...plain } = payload;
  backup(collection, id, plain, merge);
  if (mode === 'sheets') { enqueue({ collection, id, data: plain, merge }); return; }
  if (mode !== 'firebase') return;
  try {
    await fs.setDoc(fs.doc(db, collection, id), payload, { merge });
  } catch (e) {
    writeErrors++;
    console.error('Firestore', collection, e);
  }
}

async function addDocument(collection, data) {
  const payload = stamp(data);
  const { server_ts, ...plain } = payload;
  const key = backup(collection, null, plain);
  if (mode === 'sheets') { enqueue({ collection, id: key, data: plain }); return; }
  if (mode !== 'firebase') return;
  try {
    await fs.addDoc(fs.collection(db, collection), payload);
  } catch (e) {
    writeErrors++;
    console.error('Firestore', collection, e);
  }
}

// ---------------- participants ----------------
function localParticipant(pid) { return readJSON(LOCAL_PARTICIPANTS, {})[pid] || null; }

export async function getParticipant(pid) {
  if (mode === 'firebase') {
    const snap = await fs.getDoc(fs.doc(db, 'participants', pid));
    return snap.exists() ? snap.data() : null;
  }
  if (mode === 'sheets') {
    const local = localParticipant(pid);
    try {
      const url = `${sheetsConfig.SHEETS_URL}?op=participant&pid=${encodeURIComponent(pid)}&token=${encodeURIComponent(sheetsConfig.APP_TOKEN)}`;
      let res, out;
      try {
        res = await fetch(url);
      } catch {
        throw new Error(navigator.onLine
          ? 'Cannot reach Google Sheets. Check SHEETS_URL in js/sheets-config.js and that the Web app access is "Anyone".'
          : 'No internet connection. Connect to the internet and try again.');
      }
      try {
        out = await res.json();
      } catch {
        throw new Error('Google Sheets did not return data (HTTP ' + res.status + '). Check that SHEETS_URL ends with /exec and the Web app access is "Anyone".');
      }
      if (!out.ok && out.error === 'token') throw new Error('APP_TOKEN does not match Code.gs. If you changed Code.gs, deploy a New version.');
      if (!out.ok) throw new Error('Google Sheets error: ' + (out.error || 'unknown'));
      const remote = out.participant;
      // Rekod tempatan mungkin lebih baharu jika ada data yang belum dihantar
      if (remote && local && (local.sessions_completed || 0) > (remote.sessions_completed || 0)) return local;
      return remote || local;
    } catch (e) {
      console.warn('Tidak dapat membaca peserta dari Sheets; guna salinan tempatan', e);
      if (local) return local;
      throw e;
    }
  }
  return localParticipant(pid);
}

export async function saveParticipant(pid, data, merge = true) {
  const all = readJSON(LOCAL_PARTICIPANTS, {});
  all[pid] = merge ? { ...(all[pid] || {}), ...data } : data;
  writeJSON(LOCAL_PARTICIPANTS, all);
  await setDocument('participants', pid, data, merge);
}

// ---------------- sessions / results / responses / events ----------------
export const saveSession = (id, data, merge = true) => setDocument('sessions', id, data, merge);
export const saveSubtopicResult = (id, data, merge = true) => setDocument('subtopic_results', id, data, merge);
export const addItemResponse = (data) => addDocument('item_responses', data);
export const addEvent = (data) => addDocument('events', data);

// ---------------- sandaran ----------------
export function exportBackup() {
  const blob = new Blob([JSON.stringify(readJSON(BACKUP_KEY, {}), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `data_kajian_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
  document.body.append(a);
  a.click();
  a.remove();
}

export function backupSnapshot() { return readJSON(BACKUP_KEY, {}); }
