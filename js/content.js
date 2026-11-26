// =====================================================================
// KANDUNGAN ULANG KAJI (sama setiap hari, diambil daripada Lecture 6)
// Memulangkan Promise yang selesai bila pelajar tekan "Saya sedia diuji".
// Setiap bahagian merekod peristiwa content_open / content_close /
// virtual_button (data penerokaan).
// =====================================================================
import * as AR from './ar.js';
import { el } from './util.js';
import { SUBTOPICS, STATE_NODES } from './questions.js';

const ui = () => document.getElementById('ui');

const STATE_INFO = {
  created: { cb: 'onCreate()', text: 'Initial setup of the activity. Followed by onStart().' },
  started: { cb: 'onStart()', text: 'The activity becomes visible. Followed by onResume() or onStop().' },
  resumed: { cb: 'onResume()', text: 'The activity is in the foreground and the user can interact with it. Followed by onPause().' },
  paused: { cb: 'onPause()', text: 'The activity loses focus but may still be visible. Followed by onResume() or onStop().' },
  stopped: { cb: 'onStop()', text: 'The activity is no longer visible. May be followed by onRestart() or onDestroy().' },
  destroyed: { cb: 'onDestroy()', text: 'The final call before the activity is destroyed and its resources are released.' },
};

// Mesin keadaan ringkas untuk telefon maya (S2), ikut slaid Dessert Clicker
const SCENARIOS = {
  open: { label: 'Open app', from: ['none', 'destroyed'], calls: ['onCreate', 'onStart', 'onResume'], path: ['created', 'started', 'resumed'] },
  home: { label: 'Press Home', from: ['resumed'], calls: ['onPause', 'onStop'], path: ['paused', 'stopped'] },
  recents: { label: 'Return from Recents', from: ['stopped'], calls: ['onRestart', 'onStart', 'onResume'], path: ['started', 'resumed'] },
  share: { label: 'Open Share dialog', from: ['resumed'], calls: ['onPause'], path: ['paused'] },
  closeShare: { label: 'Close Share dialog', from: ['paused'], calls: ['onResume'], path: ['resumed'] },
  back: { label: 'Press Back', from: ['resumed'], calls: ['onPause', 'onStop', 'onDestroy'], path: ['paused', 'stopped', 'destroyed'] },
};

export function showContent(subtopic, { wrongItems = [], round = 0, logEvent }) {
  return new Promise((resolve) => {
    AR.clearHighlights();
    const opened = performance.now();
    logEvent({ type: 'content_open', section: subtopic, round });
    const done = () => {
      logEvent({ type: 'content_close', section: subtopic, round, duration_ms: Math.round(performance.now() - opened) });
      AR.clearHighlights();
      resolve();
    };

    const wrongBox = wrongItems.length
      ? el('div', { class: 'wrong-box' }, [
        el('strong', { text: 'Questions not yet correct:' }),
        el('ul', {}, wrongItems.map((t) => el('li', { text: t }))),
      ])
      : null;

    const body = { S1: s1, S2: s2, S3: s3 }[subtopic]((type, extra) => logEvent({ type, section: subtopic, round, ...extra }));
    ui().replaceChildren(el('section', { class: 'panel panel-content' }, [
      el('div', { class: 'q-meta', text: `Review: ${SUBTOPICS[subtopic]}` }),
      wrongBox,
      body,
      el('button', { class: 'btn primary', type: 'button', text: "I'm ready for the questions", onclick: done }),
    ]));
  });
}

// ------------------------------------------------------------------ S1
function s1(log) {
  AR.showDiagram(true);
  const info = el('div', { class: 'info-card', text: 'Tap a state to see its description. The AR diagram will highlight it.' });
  const chips = el('div', { class: 'chips' }, STATE_NODES.map((n) => el('button', {
    class: 'chip', type: 'button', text: n.label,
    onclick: () => {
      AR.clearHighlights();
      AR.highlight(n.id, true);
      const s = STATE_INFO[n.id];
      info.replaceChildren(el('strong', { text: `${n.label} · ${s.cb}` }), el('p', { text: s.text }));
      log('virtual_button', { control: `state_${n.id}` });
    },
  })));
  return el('div', {}, [
    el('p', { text: 'Every activity goes through these states: Created, Started, Resumed, Paused, Stopped and Destroyed. Android keeps only one activity active at a time to save battery and memory.' }),
    chips,
    info,
    el('p', { class: 'small', text: 'onRestart() is called before onStart() if the activity was stopped.' }),
  ]);
}

// ------------------------------------------------------------------ S2
function s2(log) {
  AR.showDiagram(true);
  let state = 'none';
  const logcat = el('pre', { class: 'logcat', text: 'Logcat (TAG = MainActivity)\n' });
  const stateLabel = el('div', { class: 'phone-state' });
  const btns = el('div', { class: 'phone-buttons' });
  let busy = false;

  function render() {
    stateLabel.textContent = state === 'none' ? 'App not opened yet' : `State: ${STATE_NODES.find((n) => n.id === state).label}`;
    btns.replaceChildren(...Object.entries(SCENARIOS).map(([key, sc]) => el('button', {
      class: 'btn small', type: 'button', text: sc.label, disabled: busy || !sc.from.includes(state),
      onclick: async () => {
        busy = true; render();
        log('virtual_button', { control: key });
        logcat.textContent += `\n# ${sc.label}\n`;
        sc.calls.forEach((c) => { logcat.textContent += `D/MainActivity: ${c} Called\n`; });
        logcat.scrollTop = logcat.scrollHeight;
        await AR.playSequence(sc.path);
        state = sc.path[sc.path.length - 1];
        busy = false; render();
      },
    })));
  }
  render();
  return el('div', {}, [
    el('p', { text: 'Use this virtual phone. Watch the methods called in Logcat and the states highlighted on the AR diagram.' }),
    el('div', { class: 'phone' }, [stateLabel, btns]),
    logcat,
    el('p', { class: 'small', text: 'A Share dialog covers only part of the screen, so only onPause() is called, without onStop().' }),
  ]);
}

// ------------------------------------------------------------------ S3
function s3(log) {
  AR.showDiagram(true);
  let countA = 0, countB = 0, rotated = false, busy = false;
  const a = el('div', { class: 'mini-phone' });
  const b = el('div', { class: 'mini-phone' });
  const note = el('p', { class: 'small' });

  function render() {
    a.replaceChildren(el('div', { class: 'mp-title', text: 'Without ViewModel' }), el('div', { class: 'mp-count', text: `Desserts: ${countA}` }));
    b.replaceChildren(el('div', { class: 'mp-title', text: 'With ViewModel' }), el('div', { class: 'mp-count', text: `Desserts: ${countB}` }),
      el('div', { class: 'vm-box', text: 'ViewModel' }));
    a.classList.toggle('rotated', rotated);
    b.classList.toggle('rotated', rotated);
  }
  const tap = el('button', { class: 'btn small', type: 'button', text: 'Tap dessert', onclick: () => {
    countA++; countB++; log('virtual_button', { control: 'tap_dessert' }); render();
  } });
  const rotate = el('button', { class: 'btn small', type: 'button', text: 'Rotate screen', onclick: async () => {
    if (busy) return;
    busy = true;
    log('virtual_button', { control: 'rotate' });
    rotated = !rotated;
    note.textContent = 'Screen rotation: onPause → onStop → onDestroy → onCreate → onStart → onResume. The activity is recreated.';
    await AR.playSequence(['paused', 'stopped', 'destroyed', 'created', 'started', 'resumed'], 450);
    countA = 0;
    render();
    note.textContent = 'The count without a ViewModel is lost because the activity is recreated. The ViewModel keeps data across configuration changes.';
    busy = false;
  } });
  render();

  return el('div', {}, [
    el('div', { class: 'mini-phones' }, [a, b]),
    el('div', { class: 'row' }, [tap, rotate]),
    note,
    el('div', { class: 'info-card' }, [
      el('strong', { text: 'Layered architecture and UDF' }),
      el('p', { text: 'The UI layer handles user interaction. The Data layer manages app data. The ViewModel stores the data the UI uses, even when the activity is recreated.' }),
      el('p', { text: 'Unidirectional data flow (UDF): the user acts → the UI sends an event → the ViewModel updates the data → the UI displays the new data.' }),
    ]),
  ]);
}
