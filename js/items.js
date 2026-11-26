// =====================================================================
// PAPARAN SOALAN mengikut bentuk (form) dan pengukuran modaliti.
// Setiap fungsi memulangkan Promise -> { answer, correct, rt_ms,
// input_mode, metrics }. Tiada maklum balas betul/salah per soalan.
// =====================================================================
import { CONFIG } from './config.js';
import { ActiveTimer } from './timer.js';
import * as AR from './ar.js';
import * as Hand from './hand.js';
import { SUBTOPICS } from './questions.js';
import { el, shuffle, normaliseSpeech } from './util.js';

const ui = () => document.getElementById('ui');

export const SUB_COLORS = { S1: '#534AB7', S2: '#0F6E56', S3: '#D85A30' };

function header(ctx, text, item) {
  const sub = item?.subtopic;
  const bar = el('div', { class: 'progress' });
  if (!ctx.training && ctx.total) {
    for (let i = 1; i <= ctx.total; i++) bar.append(el('span', { class: i < ctx.position ? 'done' : i === ctx.position ? 'now' : '' }));
  }
  return [
    el('div', { class: 'q-head' }, [
      el('span', { class: 'sub-pill', text: ctx.training ? 'Practice' : sub ? `${sub} · ${SUBTOPICS[sub]}` : '' }),
      el('span', { class: 'q-count', text: ctx.training ? '' : `${ctx.position} / ${ctx.total}` }),
    ]),
    ctx.training ? null : bar,
    el('p', { class: 'q-text', text }),
  ];
}

function setSubtopic(item) {
  document.body.dataset.sub = item?.subtopic || 'none';
}

export function runItem(item, ctx) {
  const text = item.versions[ctx.versionIndex] ?? item.versions[0];
  if (CONFIG.DEV || CONFIG.TEST) window.__item = { item, ctx };   // untuk ujian automatik sahaja
  setSubtopic(item);
  const inAR = AR.mode() === 'ar';
  switch (item.form) {
    case 'gaze': return gazeItem(item, ctx, text);
    case 'order': return inAR ? boardItem(item, ctx, text, 'touch') : orderItem(item, ctx, text);
    case 'choice': return choiceItem(item, ctx, text);
    case 'speech': return speechItem(item, ctx, text);
    case 'classify': return inAR ? boardItem(item, ctx, text, 'gesture') : classifyItem(item, ctx, text);
    default: throw new Error('Unknown question form: ' + item.form);
  }
}

// --------------------------------------------------------------- GAZE
function gazeItem(item, ctx, text) {
  return new Promise((resolve) => {
    AR.clearHighlights();
    AR.showDiagram(true);
    AR.setCrosshair(true);
    const helpText = AR.mode() === 'ar'
      ? 'Point the + in the centre of the screen at your answer and hold until it is selected.'
      : 'Press and hold the answer node.';
    const status = el('p', { class: 'q-help', text: helpText });
    const confirmRow = el('div', { class: 'row', hidden: true });
    const panel = el('section', { class: 'panel panel-gaze' }, [...header(ctx, text, item), status, confirmRow]);
    ui().replaceChildren(panel);
    let reselections = 0, firstSelectMs = null, selections = [];

    const rt = new ActiveTimer();
    rt.start();
    const dwell = {};
    let transitions = 0, lastNode = null, cur = null, curStart = 0, ttt = null, lostMs = 0;
    let lastTick = performance.now();
    let raf = 0;

    const loop = () => {
      const now = performance.now();
      const dt = document.hidden ? 0 : now - lastTick;
      lastTick = now;
      if (!AR.isTargetVisible()) lostMs += dt;
      const c = document.hidden ? null : AR.getCentred();
      if (c !== cur) {
        if (c && lastNode && c !== lastNode) transitions++;
        if (c) lastNode = c;
        cur = c;
        curStart = now;
        AR.setProgress(null);
      }
      if (cur) {
        dwell[cur] = (dwell[cur] || 0) + dt;
        if (cur === item.answer && ttt === null) ttt = rt.ms;
        const p = Math.min(1, (now - curStart) / CONFIG.GAZE_DWELL_MS);
        AR.setProgress(cur, p);
        if (p >= 1) return select(cur);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // Pengesahan: pilihan dipaparkan dahulu, pelajar sahkan atau pilih semula.
    // Ini melindungi daripada pilihan tidak sengaja (tangan bergoyang).
    function select(sel) {
      cancelAnimationFrame(raf);
      if (firstSelectMs === null) firstSelectMs = rt.ms;
      selections.push(sel);
      AR.setCrosshair(false);
      AR.clearHighlights();
      AR.highlight(sel, true);
      const label = sel.charAt(0).toUpperCase() + sel.slice(1);
      status.replaceChildren('Selected: ', el('strong', { text: label }));
      confirmRow.replaceChildren(
        el('button', { class: 'btn', type: 'button', text: 'Choose again', onclick: () => {
          reselections++;
          AR.clearHighlights();
          AR.setProgress(null);
          AR.setCrosshair(true);
          status.textContent = helpText;
          confirmRow.hidden = true;
          cur = null; lastTick = performance.now();
          raf = requestAnimationFrame(loop);
        } }),
        el('button', { class: 'btn primary', type: 'button', text: 'Confirm', onclick: () => finish(sel) }),
      );
      confirmRow.hidden = false;
    }

    function finish(sel) {
      cancelAnimationFrame(raf);
      rt.stop();
      AR.setCrosshair(false);
      AR.clearHighlights();
      setTimeout(() => { AR.setProgress(null); }, 400);
      const rounded = Object.fromEntries(Object.entries(dwell).map(([k, v]) => [k, Math.round(v)]));
      resolve({
        answer: sel,
        correct: sel === item.answer,
        rt_ms: Math.round(rt.ms),
        input_mode: AR.mode() === 'ar' ? 'device_gaze' : 'sim_gaze',
        metrics: {
          gaze_ttt_ms: ttt === null ? null : Math.round(ttt),
          gaze_dwell_ms: rounded,
          gaze_transitions: transitions,
          gaze_marker_lost_ms: Math.round(lostMs),
          gaze_dwell_threshold_ms: CONFIG.GAZE_DWELL_MS,
          gaze_first_select_ms: Math.round(firstSelectMs),
          gaze_reselections: reselections,
          gaze_selections: selections,
        },
      });
    }
  });
}

// -------------------------------------------------------------- ORDER
function orderItem(item, ctx, text) {
  return new Promise((resolve) => {
    AR.showDiagram(false);
    const n = item.cards.length;
    const slots = Array(n).fill(null);
    let pool = shuffle(item.cards);
    let moves = 0, corrections = 0;
    const rt = new ActiveTimer();

    const slotWrap = el('ol', { class: 'slots' });
    const poolWrap = el('div', { class: 'pool' });
    const submit = el('button', { class: 'btn primary', type: 'button', text: 'Submit', disabled: true });

    function render() {
      slotWrap.replaceChildren(...slots.map((c, i) => el('li', { class: 'slot' + (c ? ' filled' : '') }, [
        el('span', { class: 'slot-n', text: i + 1 }),
        c ? el('button', { class: 'card placed', type: 'button', text: c.label, onclick: () => {
          slots[i] = null; pool.push(c); corrections++; render();
        } }) : el('span', { class: 'slot-empty', text: 'tap a card below' }),
      ])));
      poolWrap.replaceChildren(...pool.map((c) => el('button', { class: 'card', type: 'button', text: c.label, onclick: () => {
        const i = slots.indexOf(null);
        if (i < 0) return;
        slots[i] = c; pool = pool.filter((p) => p !== c); moves++; render();
      } })));
      submit.disabled = slots.includes(null);
    }

    submit.onclick = () => {
      rt.stop();
      const answer = slots.map((c) => c.id);
      resolve({
        answer,
        correct: answer.join('|') === item.answer.join('|'),
        rt_ms: Math.round(rt.ms),
        input_mode: 'touch',
        metrics: { touch_moves: moves, touch_corrections: corrections },
      });
    };

    ui().replaceChildren(el('section', { class: 'panel panel-full' }, [
      ...header(ctx, text, item),
      el('p', { class: 'q-help', text: 'Tap the cards in order. Tap a placed card to remove it.' }),
      slotWrap, poolWrap, submit,
    ]));
    render();
    rt.start();
  });
}

// ------------------------------------------------------------- CHOICE
function choiceItem(item, ctx, text) {
  return new Promise((resolve) => {
    AR.showDiagram(false);
    let selected = null, changes = 0, taps = 0;
    const rt = new ActiveTimer();
    const opts = shuffle(item.options);
    const submit = el('button', { class: 'btn primary', type: 'button', text: 'Submit', disabled: true });
    const list = el('div', { class: 'options' });
    function render() {
      list.replaceChildren(...opts.map((o) => el('button', {
        class: 'option' + (selected === o.id ? ' selected' : ''), type: 'button', text: o.label,
        onclick: () => { taps++; if (selected && selected !== o.id) changes++; selected = o.id; render(); },
      })));
      submit.disabled = !selected;
    }
    submit.onclick = () => {
      rt.stop();
      resolve({
        answer: selected,
        correct: selected === item.answer,
        rt_ms: Math.round(rt.ms),
        input_mode: 'touch',
        metrics: { touch_moves: taps, touch_corrections: changes, option_order: opts.map((o) => o.id) },
      });
    };
    ui().replaceChildren(el('section', { class: 'panel panel-full' }, [...header(ctx, text, item), list, submit]));
    render();
    rt.start();
  });
}

// ----------------------------------------------------------- CLASSIFY
// v1: seret dilaksanakan sebagai "sentuh kad, kemudian sentuh kotak".
// v2 (selepas uji cuba): picit dengan MediaPipe Hands.
function classifyItem(item, ctx, text) {
  return new Promise((resolve) => {
    AR.showDiagram(false);
    const assign = {};
    let picked = null, moves = 0, corrections = 0;
    const rt = new ActiveTimer();
    const cards = shuffle(item.cards);
    const boxes = shuffle(item.boxes);
    const poolWrap = el('div', { class: 'pool' });
    const boxWrap = el('div', { class: 'boxes' });
    const submit = el('button', { class: 'btn primary', type: 'button', text: 'Submit', disabled: true });

    function render() {
      const unplaced = cards.filter((c) => !assign[c.id]);
      poolWrap.replaceChildren(...unplaced.map((c) => el('button', {
        class: 'card' + (picked === c.id ? ' picked' : ''), type: 'button', text: c.label,
        onclick: () => { picked = picked === c.id ? null : c.id; render(); },
      })));
      boxWrap.replaceChildren(...boxes.map((b) => el('div', {
        class: 'box' + (picked ? ' target' : ''),
        onclick: (e) => {
          if (!picked || e.target.closest('.card')) return;
          assign[picked] = b.id; picked = null; moves++; render();
        },
      }, [
        el('div', { class: 'box-label', text: b.label }),
        ...cards.filter((c) => assign[c.id] === b.id).map((c) => el('button', {
          class: 'card placed', type: 'button', text: c.label,
          onclick: () => { delete assign[c.id]; corrections++; render(); },
        })),
      ])));
      submit.disabled = cards.some((c) => !assign[c.id]);
    }
    submit.onclick = () => {
      rt.stop();
      const correct = item.cards.every((c) => assign[c.id] === item.answer[c.id]);
      resolve({
        answer: { ...assign },
        correct,
        rt_ms: Math.round(rt.ms),
        input_mode: 'touch_v1',
        metrics: { gesture_moves: moves, gesture_changes: corrections, gesture_latency_ms: null },
      });
    };
    ui().replaceChildren(el('section', { class: 'panel panel-full' }, [
      ...header(ctx, text, item),
      el('p', { class: 'q-help', text: 'Tap a card, then tap the correct box. Tap a card inside a box to remove it.' }),
      poolWrap, boxWrap, submit,
    ]));
    render();
    rt.start();
  });
}

// ------------------------------------------------------------- SPEECH
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

function speechItem(item, ctx, text) {
  return new Promise((resolve) => {
    AR.showDiagram(false);
    const rt = new ActiveTimer();
    const shownAt = performance.now();
    let firstSpeech = null, micPresses = 0, retries = 0, transcript = '', alternatives = [];
    let inputMode = SR && !CONFIG.DEV ? 'speech' : 'typed';
    const status = el('p', { class: 'q-help' });
    const heard = el('p', { class: 'heard' });
    const micBtn = el('button', { class: 'btn mic', type: 'button', text: 'Tap to speak' });
    const submit = el('button', { class: 'btn primary', type: 'button', text: 'Submit', disabled: true });
    const retry = el('button', { class: 'btn', type: 'button', text: 'Say it again', hidden: true });
    const typed = el('input', { class: 'typed', type: 'text', placeholder: 'Type your answer', autocomplete: 'off', autocapitalize: 'off', hidden: true });

    function useTyped(reason) {
      inputMode = 'typed';
      micBtn.hidden = true; retry.hidden = true; typed.hidden = false;
      status.textContent = reason || 'Type your answer.';
      typed.focus();
    }
    typed.addEventListener('input', () => { transcript = typed.value; submit.disabled = !typed.value.trim(); });

    let rec = null;
    function listen() {
      micPresses++;
      rec = new SR();
      rec.lang = 'en-US';
      rec.interimResults = false;
      rec.maxAlternatives = 3;
      micBtn.disabled = true;
      micBtn.textContent = 'Listening…';
      rec.onspeechstart = () => { if (firstSpeech === null) firstSpeech = performance.now() - shownAt; };
      rec.onresult = (e) => {
        const res = e.results[0];
        alternatives = Array.from(res).map((a) => a.transcript);
        transcript = alternatives[0] || '';
        heard.textContent = `Heard: "${transcript}"`;
        submit.disabled = !transcript;
        retry.hidden = false;
        micBtn.hidden = true;
      };
      rec.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') useTyped('Microphone access was not allowed. Type your answer.');
        else status.textContent = 'Could not hear you. Try again.';
      };
      rec.onend = () => { micBtn.disabled = false; micBtn.textContent = 'Tap to speak'; };
      try { rec.start(); } catch { useTyped(); }
    }
    micBtn.onclick = listen;
    retry.onclick = () => { retries++; heard.textContent = ''; submit.disabled = true; retry.hidden = true; micBtn.hidden = false; listen(); };

    submit.onclick = () => {
      rt.stop();
      try { rec && rec.abort(); } catch { /* abaikan */ }
      const cands = (inputMode === 'typed' ? [transcript] : alternatives).map(normaliseSpeech);
      const match = speechMatch(cands, item.accept);
      const correct = match !== 'none';
      resolve({
        answer: transcript,
        correct,
        rt_ms: Math.round(rt.ms),
        input_mode: inputMode,
        metrics: {
          speech_latency_ms: firstSpeech === null ? null : Math.round(firstSpeech),
          speech_transcript: transcript,
          speech_alternatives: alternatives,
          speech_mic_presses: micPresses,
          speech_retries: retries,
          speech_match: match,
        },
      });
    };

    ui().replaceChildren(el('section', { class: 'panel panel-full' }, [
      ...header(ctx, text, item), status, micBtn, heard, typed, el('div', { class: 'row' }, [retry, submit]),
    ]));
    if (inputMode === 'typed') useTyped(CONFIG.DEV ? 'DEV MODE: type the answer.' : 'Speech recognition is not supported here. Type your answer.');
    else status.textContent = 'Tap the button and say your answer.';
    rt.start();
  });
}


// Padanan speech yang longgar: abaikan ruang, dan terima beza kecil ejaan
// (contohnya "on rest art", "on restored" ≈ onRestart). Kaedah yang berbeza
// (onStart vs onRestart) tetap ditolak kerana bezanya lebih daripada had.
function lev(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[m][n];
}
export function speechMatch(candidates, accept) {
  const acc = accept.map((a) => normaliseSpeech(a).replace(/ /g, ''));
  const cs = candidates.map((c) => normaliseSpeech(c).replace(/ /g, '')).filter(Boolean);
  if (cs.some((c) => acc.includes(c))) return 'exact';
  for (const c of cs) {
    for (const a of acc) {
      if (a.length < 6) continue;
      const tol = Math.max(1, Math.floor(a.length * 0.15));
      if (lev(c, a) <= tol) return 'fuzzy';
      // jawapan terkandung dalam ayat panjang, contohnya "it is on restart"
      if (c.length > a.length && c.includes(a)) return 'fuzzy';
    }
  }
  return 'none';
}

// ------------------------------------------------- PAPAN 3D DALAM AR
// mode 'touch'  : soalan susun (order) — seret kad 3D dengan jari
// mode 'gesture': soalan kelaskan (classify) — picit kad 3D dengan tangan
//                 di hadapan kamera belakang. Sandaran sentuh tersedia dan direkod.
const FALLBACK_AFTER_MS = 25000;

function boardItem(item, ctx, text, modeName) {
  return new Promise((resolve) => {
    AR.showDiagram(false);
    AR.setCrosshair(false);
    const isGesture = modeName === 'gesture';
    const isOrder = item.form === 'order';
    const accent = SUB_COLORS[item.subtopic] || '#185FA5';
    const mono = item.cards.every((c) => /\(\)$/.test(c.label));
    const cards = shuffle(item.cards);
    const targets = isOrder ? item.cards.map((_, i) => ({ id: `slot${i + 1}`, label: String(i + 1) })) : shuffle(item.boxes);
    const board = AR.createBoard({ kind: isOrder ? 'order' : 'classify', cards, targets, accent, mono });

    const rt = new ActiveTimer();
    const shownAt = performance.now();
    let firstPinchMs = null, pinchGrabs = 0, touchGrabs = 0, handVisibleMs = 0, fallbackUsed = false;
    let lastTick = performance.now();

    const help = el('p', { class: 'q-help' });
    const submit = el('button', { class: 'btn primary', type: 'button', text: 'Submit', disabled: true });
    const fallbackBtn = el('button', { class: 'btn small ghost', type: 'button', text: 'Hand not working? Use touch instead', hidden: true });
    const handStatus = el('span', { class: 'hand-status' });
    ui().replaceChildren(el('section', { class: 'panel panel-gaze' }, [
      ...header(ctx, text, item), help, isGesture ? handStatus : null, submit, fallbackBtn,
    ]));

    if (isGesture) {
      help.textContent = 'Hold the phone with one hand. With your other hand in front of the camera, pinch a card (thumb + index finger), move it into a box, then open your fingers.';
      board.setPointerEnabled(false);
      Hand.load().then((ok) => { if (!ok) showFallback('Hand tracking could not load.'); });
      Hand.start((st, wasPinch) => {
        const now = performance.now();
        if (st.visible) handVisibleMs += now - lastTick;
        lastTick = now;
        handStatus.textContent = !Hand.state.ready ? 'Loading hand tracking…' : st.visible ? (st.pinch ? 'Pinching' : 'Hand detected') : 'Show your hand to the camera';
        handStatus.dataset.on = st.visible ? (st.pinch ? 'pinch' : 'yes') : 'no';
        if (st.pinch && !wasPinch) {
          if (firstPinchMs === null) firstPinchMs = now - shownAt;
          if (board.grab(st.x, st.y)) pinchGrabs++;
        } else if (st.pinch && wasPinch) {
          board.move(st.x, st.y);
        } else if (!st.pinch && wasPinch) {
          board.release();
        }
      });
      setTimeout(() => showFallback(), FALLBACK_AFTER_MS);
    } else {
      help.textContent = isOrder
        ? 'Drag each card on the marker into a numbered slot, in order. Drag a card out of a slot to remove it.'
        : 'Drag each card into the correct box.';
    }

    function showFallback(reason) {
      if (fallbackBtn.hidden === false || !isGesture) return;
      fallbackBtn.hidden = false;
      if (reason) help.textContent = reason + ' Use touch instead.';
    }
    fallbackBtn.onclick = () => {
      fallbackUsed = true;
      fallbackBtn.hidden = true;
      board.setPointerEnabled(true);
      help.textContent = 'Drag each card into the correct box with your finger.';
    };
    board.on((type) => {
      if (type === 'touch') touchGrabs++;
      if (type === 'change') submit.disabled = !board.complete();
    });

    submit.onclick = () => {
      rt.stop();
      if (isGesture) Hand.stop();
      const assign = board.assignment();
      const st = board.stats();
      board.destroy();
      let answer, correct;
      if (isOrder) {
        answer = targets.map((t) => Object.keys(assign).find((cid) => assign[cid] === t.id));
        correct = answer.join('|') === item.answer.join('|');
      } else {
        answer = assign;
        correct = item.cards.every((c) => assign[c.id] === item.answer[c.id]);
      }
      const metrics = isGesture
        ? {
          gesture_latency_ms: firstPinchMs === null ? null : Math.round(firstPinchMs),
          gesture_moves: st.drops_on_target, gesture_changes: st.removals + st.retargets,
          gesture_pinch_grabs: pinchGrabs, gesture_touch_grabs: touchGrabs,
          gesture_hand_visible_ms: Math.round(handVisibleMs), gesture_fallback: fallbackUsed,
          drag_drops_outside: st.drops_outside,
        }
        : {
          touch_moves: st.drops_on_target, touch_corrections: st.removals + st.retargets,
          touch_grabs: st.grabs, drag_drops_outside: st.drops_outside,
        };
      resolve({
        answer, correct, rt_ms: Math.round(rt.ms),
        input_mode: isGesture ? (fallbackUsed ? (pinchGrabs ? 'pinch+touch' : 'touch_fallback') : 'pinch') : 'touch_ar',
        metrics,
      });
    };
    rt.start();
  });
}
