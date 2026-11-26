// =====================================================================
// PAPARAN SOALAN mengikut bentuk (form) dan pengukuran modaliti.
// Setiap fungsi memulangkan Promise -> { answer, correct, rt_ms,
// input_mode, metrics }. Tiada maklum balas betul/salah per soalan.
// =====================================================================
import { CONFIG } from './config.js';
import { ActiveTimer } from './timer.js';
import * as AR from './ar.js';
import { el, shuffle, normaliseSpeech } from './util.js';

const ui = () => document.getElementById('ui');

function header(ctx, text) {
  return [
    el('div', { class: 'q-meta', text: ctx.training ? 'Practice' : `Question ${ctx.position} of ${ctx.total}` }),
    el('p', { class: 'q-text', text }),
  ];
}

export function runItem(item, ctx) {
  const text = item.versions[ctx.versionIndex] ?? item.versions[0];
  if (CONFIG.DEV) window.__item = { item, ctx };   // untuk ujian automatik sahaja
  switch (item.form) {
    case 'gaze': return gazeItem(item, ctx, text);
    case 'order': return orderItem(item, ctx, text);
    case 'choice': return choiceItem(item, ctx, text);
    case 'speech': return speechItem(item, ctx, text);
    case 'classify': return classifyItem(item, ctx, text);
    default: throw new Error('Unknown question form: ' + item.form);
  }
}

// --------------------------------------------------------------- GAZE
function gazeItem(item, ctx, text) {
  return new Promise((resolve) => {
    AR.clearHighlights();
    AR.showDiagram(true);
    AR.setCrosshair(true);
    const status = el('p', { class: 'q-help', text: AR.mode() === 'ar'
      ? 'Point the + in the centre of the screen at your answer and hold until it is selected.'
      : 'Press and hold the answer node.' });
    const panel = el('section', { class: 'panel panel-gaze' }, [...header(ctx, text), status]);
    ui().replaceChildren(panel);

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
        if (p >= 1) return finish(cur);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    function finish(sel) {
      cancelAnimationFrame(raf);
      rt.stop();
      AR.setCrosshair(false);
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
      ...header(ctx, text),
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
    ui().replaceChildren(el('section', { class: 'panel panel-full' }, [...header(ctx, text), list, submit]));
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
      ...header(ctx, text),
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
      const accept = item.accept.map(normaliseSpeech);
      const correct = cands.some((c) => accept.some((a) => c === a || c.replace(/ /g, '') === a.replace(/ /g, '')));
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
        },
      });
    };

    ui().replaceChildren(el('section', { class: 'panel panel-full' }, [
      ...header(ctx, text), status, micBtn, heard, typed, el('div', { class: 'row' }, [retry, submit]),
    ]));
    if (inputMode === 'typed') useTyped(CONFIG.DEV ? 'DEV MODE: type the answer.' : 'Speech recognition is not supported here. Type your answer.');
    else status.textContent = 'Tap the button and say your answer.';
    rt.start();
  });
}
