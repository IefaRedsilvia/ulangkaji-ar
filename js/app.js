// =====================================================================
// PENGAWAL SESI
// Aliran setiap hari: Log masuk → (Hari 0: persetujuan + latihan) →
// Uji 15 soalan → Ulang Kaji subtopik yang belum 5/5 → jawab semula
// sehingga 5/5 → Paas → (Hari 7: NASA-TLX) → tamat.
// =====================================================================
import { CONFIG } from './config.js';
import * as Store from './store.js';
import * as AR from './ar.js';
import { ITEMS, TRAINING_ITEMS, SUBTOPICS } from './questions.js';
import { runItem } from './items.js';
import { showContent } from './content.js';
import { ActiveTimer, onVisibilityChange } from './timer.js';
import { el, shuffle, deviceInfo, nowStamp, formatDate, sleep } from './util.js';

const DAY_MS = 86400000;
const ui = () => document.getElementById('ui');

const S = {            // keadaan sesi semasa
  pid: null,
  participant: null,
  sessionNo: null,
  attempt: 1,
  sessionId: null,
  responses: [],
};

function screen(children, cls = '') {
  document.body.classList.add('screen-mode');
  ui().replaceChildren(el('section', { class: 'screen ' + cls }, children));
}
function overlayMode() { document.body.classList.remove('screen-mode'); }

function waitClick(btn) { return new Promise((r) => btn.addEventListener('click', r, { once: true })); }

function logEvent(data) {
  if (!S.sessionId) return;
  Store.addEvent({ pid: S.pid, session_id: S.sessionId, session_no: S.sessionNo, ...data });
}

onVisibilityChange((hidden) => logEvent({ type: hidden ? 'app_hidden' : 'app_visible' }));

// ------------------------------------------------------------- MULA
async function boot() {
  const banner = document.getElementById('mode-banner');
  screen([el('p', { text: 'Loading…' })]);
  try {
    await Store.init();
  } catch (e) {
    console.error(e);
    screen([el('h1', { text: 'Cannot connect' }), el('p', { text: 'Check your internet connection and reload the page.' }),
      el('pre', { class: 'small', text: String(e.message || e) })]);
    return;
  }
  const flags = [];
  if (CONFIG.DEV) flags.push('DEV MODE');
  if (Store.getMode() === 'local') flags.push('LOCAL MODE: data stays on this phone');
  if (flags.length) { banner.textContent = flags.join(' · '); banner.hidden = false; }
  loginScreen();
}

function loginScreen(msg = '') {
  const input = el('input', { type: 'text', id: 'pid', placeholder: 'Example: P07', autocomplete: 'off', autocapitalize: 'characters', inputmode: 'text' });
  const btn = el('button', { class: 'btn primary', type: 'button', text: 'Continue' });
  const err = el('p', { class: 'error', text: msg });
  screen([
    el('h1', { text: 'AR Review Study' }),
    el('p', { text: 'Activity Lifecycle (TK2323/TM2213 Mobile Programming)' }),
    el('label', { for: 'pid', text: 'Your participant ID' }),
    input, err, btn,
  ]);
  btn.onclick = async () => {
    const pid = input.value.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{2,12}$/.test(pid)) { err.textContent = 'Enter the participant ID given by the researcher.'; return; }
    btn.disabled = true;
    try { await enter(pid); } catch (e) { console.error(e); loginScreen('Error: ' + (e.message || e)); }
  };
}

async function enter(pid) {
  S.pid = pid;
  let p = await Store.getParticipant(pid);
  if (!p) {
    const ok = await consentScreen();
    if (!ok) { loginScreen(); return; }
    const dev = deviceInfo();
    p = {
      pid, consent_version: CONFIG.CONSENT_VERSION, consent_ts: nowStamp().client_iso,
      sessions_completed: 0, attempts: {}, day0_user_agent: dev.user_agent,
      device_model: dev.device_model, os: dev.os, browser: dev.browser, app_version: CONFIG.APP_VERSION,
    };
    await Store.saveParticipant(pid, p, false);
  }
  S.participant = p;
  S.sessionNo = p.sessions_completed || 0;

  if (S.sessionNo >= CONFIG.SESSION_DAYS.length) {
    screen([el('h1', { text: 'All sessions completed' }), el('p', { text: 'Thank you for taking part.' })]);
    return;
  }
  // Sekatan jarak minimum antara sesi
  const gap = CONFIG.MIN_GAP_DAYS[S.sessionNo];
  if (gap && p.last_completed_start_ms) {
    const opensAt = p.last_completed_start_ms + gap * DAY_MS;
    if (Date.now() < opensAt) {
      screen([
        el('h1', { text: 'Your next session is not open yet' }),
        el('p', { text: `The Day ${CONFIG.SESSION_DAYS[S.sessionNo]} session opens on ${formatDate(opensAt)}, ${new Date(opensAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.` }),
      ]);
      return;
    }
  }
  await sessionIntro();
}

function consentScreen() {
  return new Promise((resolve) => {
    const box = el('input', { type: 'checkbox', id: 'agree' });
    const btn = el('button', { class: 'btn primary', type: 'button', text: 'Agree and continue', disabled: true });
    box.onchange = () => { btn.disabled = !box.checked; };
    screen([
      el('h1', { text: 'Participant consent' }),
      el('div', { class: 'consent' }, [
        el('p', { text: 'This study looks at how students review using AR. You will answer questions about the Activity Lifecycle in three sessions (Day 0, Day 1 and Day 7), each taking about 20 to 45 minutes.' }),
        el('p', { text: 'The app records your answers, response times, camera direction (gaze), touches and spoken answers. Camera video is not stored. Speech recognition uses your browser service (Google or Apple), which may process the audio on their servers. Only the text of your answer is stored.' }),
        el('p', { text: 'Data is identified by participant ID only, not by name or matric number. Taking part is voluntary, and you may withdraw at any time with no effect on your course marks.' }),
        el('p', { class: 'small', text: '[Researcher: replace this text with the consent text approved by the UKM ethics committee.]' }),
      ]),
      el('label', { class: 'check' }, [box, ' I understand and agree to take part in this study.']),
      btn,
      el('button', { class: 'btn', type: 'button', text: 'Back', onclick: () => resolve(false) }),
    ]);
    btn.onclick = () => resolve(true);
  });
}

async function sessionIntro() {
  const day = CONFIG.SESSION_DAYS[S.sessionNo];
  const btn = el('button', { class: 'btn primary', type: 'button', text: 'Open camera and start' });
  const err = el('p', { class: 'error' });
  screen([
    el('h1', { text: `Day ${day} session` }),
    el('p', { text: `ID: ${S.pid}` }),
    el('ul', {}, [
      el('li', { text: 'Place the printed marker card on the table.' }),
      el('li', { text: 'Make sure the room is well lit and your battery is charged.' }),
      el('li', { text: 'Do not open notes or other apps during the session.' }),
      el('li', { text: 'Allow camera and microphone access when asked.' }),
    ]),
    err, btn,
  ]);
  await waitClick(btn);
  btn.disabled = true;
  btn.textContent = 'Opening camera…';
  try {
    await AR.start();
  } catch (e) {
    console.error(e);
    err.textContent = 'The camera could not be opened. Allow camera access in your browser settings, then reload the page.';
    btn.hidden = true;
    return;
  }
  await runSession();
}

// ------------------------------------------------------------ SESI
async function runSession() {
  const p = S.participant;
  const attempts = { ...(p.attempts || {}) };
  S.attempt = (attempts[S.sessionNo] || 0) + 1;
  attempts[S.sessionNo] = S.attempt;
  S.sessionId = `${S.pid}_s${S.sessionNo}_a${S.attempt}`;
  const start = nowStamp();
  const dev = deviceInfo();
  await Store.saveParticipant(S.pid, { attempts });
  await Store.saveSession(S.sessionId, {
    pid: S.pid, session_no: S.sessionNo, day: CONFIG.SESSION_DAYS[S.sessionNo], attempt: S.attempt,
    start_ms: start.client_ms, start_iso: start.client_iso, complete: false,
    device_model: dev.device_model, os: dev.os, browser: dev.browser, user_agent: dev.user_agent,
    device_match: S.sessionNo === 0 ? true : dev.user_agent === p.day0_user_agent,
    ar_mode: AR.mode(), store_mode: Store.getMode(), app_version: CONFIG.APP_VERSION,
    gaze_dwell_threshold_ms: CONFIG.GAZE_DWELL_MS,
  }, false);
  logEvent({ type: 'session_start' });

  if (S.sessionNo === 0) await training();

  // ---------------- UJI ----------------
  await message(S.sessionNo === 0 ? 'The test begins' : 'Test your memory',
    S.sessionNo === 0
      ? ['Answer 15 questions without looking at any notes. You may not know some of the answers yet, and that is normal. Give your best answer.', 'No score is shown after each question.']
      : ['Answer 15 questions without looking at any notes. Give your best answer.', 'No score is shown after each question.'],
    'Start');
  overlayMode();
  const ujiResults = await runRound(shuffle(ITEMS), 0);

  const bySub = {};
  for (const sub of Object.keys(SUBTOPICS)) {
    const rs = ujiResults.filter((r) => r.item.subtopic === sub);
    const score = rs.filter((r) => r.result.correct).length;
    bySub[sub] = { score, wrong: rs.filter((r) => !r.result.correct) };
    await Store.saveSubtopicResult(`${S.sessionId}_${sub}`, {
      pid: S.pid, session_id: S.sessionId, session_no: S.sessionNo, attempt: S.attempt, subtopic: sub,
      uji_score: score,
      uji_mean_rt_ms: Math.round(rs.reduce((a, r) => a + r.result.rt_ms, 0) / rs.length),
      passed_at_uji: score >= CONFIG.CRITERION,
      relearn_active_s: score >= CONFIG.CRITERION ? 0 : null,
      rounds_to_criterion: score >= CONFIG.CRITERION ? 0 : null,
      criterion_met: score >= CONFIG.CRITERION,
    }, false);
  }

  // ---------------- ULANG KAJI ----------------
  const toReview = Object.keys(SUBTOPICS).filter((s) => bySub[s].score < CONFIG.CRITERION);
  if (toReview.length) {
    await message('Review', [
      `You need to review: ${toReview.map((s) => SUBTOPICS[s]).join(', ')}.`,
      'For each part, read the content and use the AR. When you are ready, answer the 5 questions for that part. Repeat until all 5 are correct. Take as much time as you need.',
    ], 'Start review');
    for (const sub of toReview) await relearn(sub, bySub[sub].wrong);
  }

  // ---------------- PAAS / NASA-TLX ----------------
  AR.showDiagram(false);
  const paas = await paasScreen();
  const end = nowStamp();
  const sessionUpdate = { paas, end_ms: end.client_ms, end_iso: end.client_iso };
  if (S.sessionNo === CONFIG.SESSION_DAYS.length - 1) sessionUpdate.nasa_tlx = await tlxScreen();
  sessionUpdate.complete = true;
  sessionUpdate.write_errors = Store.getWriteErrors();
  await Store.saveSession(S.sessionId, sessionUpdate);
  logEvent({ type: 'session_end' });

  const pUpdate = { sessions_completed: S.sessionNo + 1, last_completed_start_ms: start.client_ms };
  if (S.sessionNo === 0) pUpdate.day0_start_ms = start.client_ms;
  await Store.saveParticipant(S.pid, pUpdate);
  await AR.stop();
  if (Store.getMode() === 'sheets') {
    const status = el('p', { text: 'Sending data…' });
    screen([el('h1', { text: 'Saving' }), status, el('p', { class: 'small', text: 'Do not close this page.' })]);
    await Store.drain(45000, (n) => { status.textContent = `Sending data… (${n} records left)`; });
  }
  finishScreen(S.sessionNo === 0 ? start.client_ms : (p.day0_start_ms || start.client_ms));
}

async function training() {
  await message('Practice', [
    'Before you start, try the five question types: pointing the phone (gaze), arranging cards, choosing an answer, saying an answer and placing cards in boxes.',
    'Practice is not timed or marked. Repeat it until you feel comfortable.',
  ], 'Start practice');
  overlayMode();
  let again = true;
  while (again) {
    for (const item of TRAINING_ITEMS) {
      await runItem(item, { versionIndex: 0, position: 0, total: 0, training: true });
    }
    AR.showDiagram(false);
    const choice = await choose('Practice complete', ['Are you comfortable with how to answer?'], ['Yes, continue', 'Repeat practice']);
    overlayMode();
    again = choice === 1;
  }
  logEvent({ type: 'training_done' });
  await Store.saveSession(S.sessionId, { training_done: true });
}

async function runRound(items, round) {
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const versionIndex = Math.floor(Math.random() * item.versions.length);
    const result = await runItem(item, { versionIndex, position: i + 1, total: items.length, round });
    out.push({ item, versionIndex, result });
    Store.addItemResponse({
      pid: S.pid, session_id: S.sessionId, session_no: S.sessionNo, attempt: S.attempt,
      item_id: item.id, subtopic: item.subtopic, version_id: versionIndex, modality: item.modality, form: item.form,
      round, position: i + 1, answer: result.answer, correct: result.correct, rt_ms: result.rt_ms,
      input_mode: result.input_mode, ...result.metrics,
    });
    await interstitial();
  }
  return out;
}

async function interstitial() {
  AR.showDiagram(false);
  ui().replaceChildren(el('section', { class: 'panel panel-tiny' }, [el('p', { text: 'Answer recorded.' })]));
  await sleep(350);
}

async function relearn(sub, wrongFromUji) {
  const timer = new ActiveTimer();
  timer.start();
  logEvent({ type: 'relearn_start', section: sub });
  let round = 0;
  let wrong = wrongFromUji;
  for (;;) {
    overlayMode();
    await showContent(sub, {
      wrongItems: wrong.map((w) => w.item.versions[w.versionIndex]),
      round, logEvent,
    });
    round++;
    const results = await runRound(shuffle(ITEMS.filter((it) => it.subtopic === sub)), round);
    const score = results.filter((r) => r.result.correct).length;
    if (score >= CONFIG.CRITERION) break;
    wrong = results.filter((r) => !r.result.correct);
    await message('Try again', [`${wrong.length} question(s) not yet correct. Review the content again, then try once more.`], 'Review');
  }
  const ms = timer.stop();
  logEvent({ type: 'relearn_end', section: sub, rounds: round, active_ms: Math.round(ms) });
  await Store.saveSubtopicResult(`${S.sessionId}_${sub}`, {
    relearn_active_s: Math.round(ms / 100) / 10,
    rounds_to_criterion: round,
    criterion_met: true,
  });
  await message('Part complete', [`All ${SUBTOPICS[sub]} questions are correct.`], 'Continue');
}

// ------------------------------------------------------ PAPARAN UMUM
function message(title, paras, btnText) {
  AR.showDiagram(false);
  const btn = el('button', { class: 'btn primary', type: 'button', text: btnText });
  screen([el('h1', { text: title }), ...paras.map((t) => el('p', { text: t })), btn]);
  return waitClick(btn);
}

function choose(title, paras, options) {
  return new Promise((resolve) => {
    screen([el('h1', { text: title }), ...paras.map((t) => el('p', { text: t })),
      ...options.map((o, i) => el('button', { class: 'btn' + (i === 0 ? ' primary' : ''), type: 'button', text: o, onclick: () => resolve(i) }))]);
  });
}

// Skala Paas (1992), 9 mata
const PAAS_LABELS = ['Very, very low mental effort', 'Very low mental effort', 'Low mental effort', 'Rather low mental effort', 'Neither low nor high mental effort', 'Rather high mental effort', 'High mental effort', 'Very high mental effort', 'Very, very high mental effort'];

function paasScreen() {
  return new Promise((resolve) => {
    let val = null;
    const btn = el('button', { class: 'btn primary', type: 'button', text: 'Submit', disabled: true });
    const list = el('div', { class: 'scale' });
    const render = () => list.replaceChildren(...PAAS_LABELS.map((l, i) => el('button', {
      class: 'option' + (val === i + 1 ? ' selected' : ''), type: 'button', text: `${i + 1}. ${l}`,
      onclick: () => { val = i + 1; btn.disabled = false; render(); },
    })));
    render();
    screen([el('h1', { text: 'Mental effort' }), el('p', { text: 'How much mental effort did you invest in this session?' }), list, btn]);
    btn.onclick = () => resolve(val);
  });
}

const TLX = [
  // Teks rasmi NASA-TLX (Hart & Staveland, 1988)
  ['mental', 'Mental Demand', 'How mentally demanding was the task?', 'Very low', 'Very high'],
  ['physical', 'Physical Demand', 'How physically demanding was the task?', 'Very low', 'Very high'],
  ['temporal', 'Temporal Demand', 'How hurried or rushed was the pace of the task?', 'Very low', 'Very high'],
  ['performance', 'Performance', 'How successful were you in accomplishing what you were asked to do?', 'Perfect', 'Failure'],
  ['effort', 'Effort', 'How hard did you have to work to accomplish your level of performance?', 'Very low', 'Very high'],
  ['frustration', 'Frustration', 'How insecure, discouraged, irritated, stressed, and annoyed were you?', 'Very low', 'Very high'],
];

function tlxScreen() {
  return new Promise((resolve) => {
    const vals = {};
    const btn = el('button', { class: 'btn primary', type: 'button', text: 'Submit', disabled: true });
    const rows = TLX.map(([key, name, q, lo, hi]) => {
      const out = el('span', { class: 'tlx-val', text: '–' });
      const range = el('input', { type: 'range', min: 0, max: 100, step: 5, value: 50, 'aria-label': name });
      range.addEventListener('input', () => {
        vals[key] = Number(range.value); out.textContent = range.value;
        btn.disabled = Object.keys(vals).length < TLX.length;
      });
      return el('div', { class: 'tlx' }, [el('strong', { text: name }), out, el('p', { class: 'small', text: q }), range,
        el('div', { class: 'tlx-ends' }, [el('span', { text: lo }), el('span', { text: hi })])]);
    });
    screen([el('h1', { text: 'Workload (NASA-TLX)' }), el('p', { text: "Move each slider to rate today's whole session." }), ...rows, btn]);
    btn.onclick = () => resolve(vals);
  });
}

function finishScreen(day0Ms) {
  const next = S.sessionNo + 1;
  const parts = [el('h1', { text: 'Session complete. Thank you!' })];
  if (next < CONFIG.SESSION_DAYS.length) {
    const due = day0Ms + CONFIG.SESSION_DAYS[next] * DAY_MS;
    parts.push(el('p', { text: `Next session: Day ${CONFIG.SESSION_DAYS[next]}, ${formatDate(due)}. You will receive a reminder.` }));
  } else {
    parts.push(el('p', { text: 'You have completed all study sessions.' }));
  }
  const pending = Store.getMode() === 'sheets' ? Store.pendingCount() : 0;
  const fbErrors = Store.getMode() === 'firebase' && Store.getWriteErrors() > 0;
  if (Store.getMode() === 'local' || pending > 0 || fbErrors) {
    parts.push(el('p', { class: 'small', text: Store.getMode() === 'local'
      ? 'Local mode: download your data and give it to the researcher.'
      : `Some data has not been sent yet${pending ? ` (${pending} records)` : ''}. It will be sent automatically the next time you open this app with internet. To be safe, download a backup and give it to the researcher.` }));
    parts.push(el('button', { class: 'btn', type: 'button', text: 'Download data (JSON)', onclick: Store.exportBackup }));
  }
  screen(parts);
}

window.addEventListener('error', (e) => logEvent({ type: 'js_error', message: String(e.message).slice(0, 300) }));
boot();
