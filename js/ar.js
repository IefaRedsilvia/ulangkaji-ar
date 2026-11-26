// =====================================================================
// LAPISAN AR
// - Mod 'ar'  : MindAR + three.js. Rajah keadaan 3D di atas kad marker.
//               Device gaze = nod yang dilalui sinar dari TENGAH skrin.
// - Mod 'sim' : (?dev=1) rajah 2D; tekan dan tahan nod untuk simulasi gaze.
// API yang digunakan oleh bahagian lain:
//   start(), stop(), mode(), getCentred(), isTargetVisible(),
//   showDiagram(bool), setCrosshair(bool), setProgress(id, p),
//   highlight(id, on), clearHighlights(), flash(id), playSequence(ids)
// =====================================================================
import { CONFIG } from './config.js';
import { STATE_NODES } from './questions.js';
import { el, sleep } from './util.js';

// Susun atur rajah (unit marker: lebar kad = 1). Baris atas: Created ->
// Started -> Resumed. Baris bawah (kanan ke kiri): Paused -> Stopped -> Destroyed.
const LAYOUT = {
  created: [-0.5, 0.3], started: [0, 0.3], resumed: [0.5, 0.3],
  destroyed: [-0.5, -0.3], stopped: [0, -0.3], paused: [0.5, -0.3],
};
const EDGES = [
  ['created', 'started'], ['started', 'resumed'], ['resumed', 'paused'],
  ['paused', 'stopped'], ['stopped', 'destroyed'],
];
const BACK_EDGES = [['paused', 'resumed'], ['stopped', 'started']]; // onResume, onRestart

let currentMode = null;
let centred = null;
let targetVisible = false;
let diagramShown = false;
const highlights = new Set();
let progress = { id: null, p: 0 };

// three.js
let THREE = null, mindar = null, camera = null, nodeMeshes = {}, raycaster = null, anchorGroup = null, diagramGroup = null;
const frameHooks = new Set();
export function addFrameHook(fn) { frameHooks.add(fn); return () => frameHooks.delete(fn); }
// sim
let simRoot = null;

const crosshair = () => document.getElementById('crosshair');
const hint = () => document.getElementById('ar-hint');

export const mode = () => currentMode;
export const getCentred = () => (diagramShown ? centred : null);
export const isTargetVisible = () => targetVisible;

export async function start() {
  if (currentMode) return currentMode;
  if (CONFIG.DEV) {
    buildSim();
    currentMode = 'sim';
    targetVisible = true;
    return currentMode;
  }
  THREE = await import('three');
  const { MindARThree } = await import('mindar-image-three');
  mindar = new MindARThree({
    container: document.getElementById('ar-container'),
    imageTargetSrc: CONFIG.MARKER_SRC,
    uiScanning: 'no',
    uiLoading: 'yes',
    filterMinCF: 0.0001,
    filterBeta: 0.001,
  });
  const { renderer, scene } = mindar;
  camera = mindar.camera;
  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const anchor = mindar.addAnchor(0);
  anchorGroup = anchor.group;
  diagramGroup = new THREE.Group();
  anchorGroup.add(diagramGroup);
  buildDiagram3D();
  anchor.onTargetFound = () => { targetVisible = true; updateHint(); };
  anchor.onTargetLost = () => { targetVisible = false; centred = null; updateHint(); };
  raycaster = new THREE.Raycaster();
  await mindar.start();
  renderer.setAnimationLoop(() => {
    updateGaze3D();
    for (const fn of frameHooks) { try { fn(); } catch (e) { console.error(e); } }
    renderer.render(scene, camera);
  });
  currentMode = 'ar';
  return currentMode;
}

export async function stop() {
  if (currentMode === 'ar' && mindar) {
    mindar.renderer.setAnimationLoop(null);
    await mindar.stop();
  }
  if (simRoot) simRoot.remove();
  currentMode = null;
}

// ------------------------------------------------------------------ 3D
function labelTexture(text, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 320;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  roundRect(g, 8, 8, 496, 304, 48); g.fill();
  g.fillStyle = fg;
  g.font = 'bold 84px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 166);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

const COLORS = { base: '#ffffff', text: '#1d2b44', hi: '#ffd166', sel: '#2a9d8f', prog: '#8ecae6' };

function buildDiagram3D() {
  const geo = new THREE.BoxGeometry(0.44, 0.28, 0.04);
  for (const n of STATE_NODES) {
    const [x, y] = LAYOUT[n.id];
    const mats = { base: labelTexture(n.label, COLORS.base, COLORS.text) };
    const front = new THREE.MeshBasicMaterial({ map: mats.base, transparent: true });
    const side = new THREE.MeshBasicMaterial({ color: 0x1d2b44 });
    const mesh = new THREE.Mesh(geo, [side, side, side, side, front, side]);
    mesh.position.set(x, y, 0.06);
    mesh.userData = { id: n.id, label: n.label, front, textures: mats, state: 'base' };
    diagramGroup.add(mesh);
    nodeMeshes[n.id] = mesh;
  }
  const lineMat = new THREE.LineBasicMaterial({ color: 0x1d2b44 });
  const backMat = new THREE.LineDashedMaterial({ color: 0x1d2b44, dashSize: 0.03, gapSize: 0.02 });
  for (const [a, b] of EDGES) diagramGroup.add(lineBetween(a, b, lineMat, 0));
  for (const [a, b] of BACK_EDGES) {
    const l = lineBetween(a, b, backMat, 0.06);
    l.computeLineDistances();
    diagramGroup.add(l);
  }
  diagramGroup.visible = false;
}

function lineBetween(a, b, mat, offset) {
  const [ax, ay] = LAYOUT[a], [bx, by] = LAYOUT[b];
  const pts = [new THREE.Vector3(ax + offset, ay, 0.05), new THREE.Vector3(bx + offset, by, 0.05)];
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
}

function paintNode3D(id) {
  const m = nodeMeshes[id];
  if (!m) return;
  let state = 'base';
  if (progress.id === id && progress.p > 0) state = progress.p >= 1 ? 'sel' : 'prog';
  else if (highlights.has(id)) state = 'hi';
  if (m.userData.state === state) return;
  m.userData.state = state;
  if (!m.userData.textures[state]) {
    const bg = { hi: COLORS.hi, sel: COLORS.sel, prog: COLORS.prog }[state];
    m.userData.textures[state] = labelTexture(m.userData.label, bg, state === 'sel' ? '#ffffff' : COLORS.text);
  }
  m.userData.front.map = m.userData.textures[state];
  m.userData.front.needsUpdate = true;
  m.scale.setScalar(state === 'base' ? 1 : 1.08);
}

function updateGaze3D() {
  if (!diagramShown || !targetVisible) { centred = null; return; }
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  const hits = raycaster.intersectObjects(Object.values(nodeMeshes), false);
  centred = hits.length ? hits[0].object.userData.id : null;
}

// ----------------------------------------------------------------- SIM
function buildSim() {
  simRoot = el('div', { id: 'sim-diagram', hidden: true }, [
    el('div', { class: 'sim-note', text: 'DEV MODE: press and hold a node to simulate gaze' }),
    el('div', { class: 'sim-grid' }, ['created', 'started', 'resumed', 'destroyed', 'stopped', 'paused'].map((id) => {
      const n = STATE_NODES.find((s) => s.id === id);
      const b = el('button', { class: 'sim-node', 'data-node': id, type: 'button', text: n.label });
      const on = (e) => { e.preventDefault(); centred = id; };
      const off = () => { if (centred === id) centred = null; };
      b.addEventListener('pointerdown', on);
      b.addEventListener('pointerup', off);
      b.addEventListener('pointerleave', off);
      b.addEventListener('pointercancel', off);
      return b;
    })),
  ]);
  document.body.append(simRoot);
}

function paintNodeSim(id) {
  const b = simRoot?.querySelector(`[data-node="${id}"]`);
  if (!b) return;
  b.classList.toggle('hi', highlights.has(id));
  b.classList.toggle('prog', progress.id === id && progress.p > 0 && progress.p < 1);
  b.classList.toggle('sel', progress.id === id && progress.p >= 1);
  b.style.setProperty('--p', progress.id === id ? progress.p : 0);
}

function paint(id) {
  if (currentMode === 'ar') paintNode3D(id);
  else if (currentMode === 'sim') paintNodeSim(id);
}
function paintAll() { for (const n of STATE_NODES) paint(n.id); }

// ----------------------------------------------------------------- API
export function showDiagram(on) {
  diagramShown = !!on;
  if (currentMode === 'ar' && diagramGroup) diagramGroup.visible = diagramShown;
  if (currentMode === 'sim' && simRoot) simRoot.hidden = !diagramShown;
  document.body.classList.toggle('diagram-on', diagramShown);
  updateHint();
}

export function setCrosshair(on) {
  const c = crosshair();
  if (c) c.hidden = !(on && currentMode === 'ar');
}

let boardShown = false;
function updateHint() {
  const h = hint();
  if (!h) return;
  h.hidden = !((diagramShown || boardShown) && currentMode === 'ar' && !targetVisible);
  h.textContent = 'Point the camera at the marker card';
}

export function setProgress(id, p = 0) {
  const prev = progress.id;
  progress = { id, p };
  if (prev && prev !== id) paint(prev);
  if (id) paint(id);
  const c = crosshair();
  if (c) c.style.setProperty('--p', id ? p : 0);
}

export function highlight(id, on = true) {
  if (on) highlights.add(id); else highlights.delete(id);
  paint(id);
}
export function clearHighlights() {
  highlights.clear();
  progress = { id: null, p: 0 };
  paintAll();
}

export async function flash(id, ms = 500) {
  highlight(id, true);
  await sleep(ms);
  highlight(id, false);
}

// Mainkan urutan keadaan (untuk kandungan Ulang Kaji)
export async function playSequence(ids, step = 700) {
  clearHighlights();
  for (const id of ids) {
    highlight(id, true);
    await sleep(step);
    highlight(id, false);
  }
  if (ids.length) highlight(ids[ids.length - 1], true);
}


// =====================================================================
// PAPAN SERET 3D (soalan susun dan kelaskan dalam AR)
// Kad dan sasaran diletakkan atas kad marker. Kad boleh digerakkan oleh
// jari (pointer) atau oleh picitan tangan (hand.js), melalui API yang sama:
//   board.grab(x, y) → board.move(x, y) → board.release(x, y)
// x, y = koordinat skrin (piksel CSS).
// =====================================================================
export const getCamera = () => camera;
export const getCanvas = () => mindar?.renderer?.domElement || null;
export const getVideo = () => document.querySelector('#ar-container video');

function textTexture(lines, { w = 640, h = 160, bg = '#ffffff', fg = '#1d2b44', border = null, font = 'ui-monospace, Menlo, monospace', size = null, radius = 36 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  roundRect(g, 4, 4, w - 8, h - 8, radius); g.fill();
  if (border) { g.lineWidth = 8; g.strokeStyle = border; roundRect(g, 8, 8, w - 16, h - 16, radius - 4); g.stroke(); }
  g.fillStyle = fg;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const longest = Math.max(...lines.map((l) => l.length));
  const fs = size || Math.max(30, Math.min(64, Math.floor((w - 60) / (longest * 0.58))));
  g.font = `700 ${fs}px ${font}`;
  const lh = fs * 1.15;
  lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * lh));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function wrap(label, max = 22) {
  if (label.length <= max) return [label];
  const words = label.split(' ');
  const lines = [''];
  for (const wd of words) {
    if ((lines[lines.length - 1] + ' ' + wd).trim().length > max && lines[lines.length - 1]) lines.push(wd);
    else lines[lines.length - 1] = (lines[lines.length - 1] + ' ' + wd).trim();
  }
  return lines.slice(0, 3);
}

/**
 * spec = {
 *   kind: 'order' | 'classify',
 *   cards: [{id,label}], targets: [{id,label}], accent: '#hex',
 *   mono: bool (fon kod untuk nama kaedah)
 * }
 */
export function createBoard(spec) {
  if (currentMode !== 'ar') throw new Error('Papan 3D hanya dalam mod AR');
  const group = new THREE.Group();
  anchorGroup.add(group);
  boardShown = true; updateHint();
  const accent = spec.accent || '#185FA5';
  const isOrder = spec.kind === 'order';
  const n = spec.cards.length;
  const font = spec.mono ? 'ui-monospace, Menlo, monospace' : 'system-ui, sans-serif';

  // ---------- susun atur (unit marker) ----------
  let cardW, cardH, targetDefs, home = {};
  if (isOrder) {
    cardW = 0.56; cardH = n > 4 ? 0.12 : 0.15;
    const gap = n > 4 ? 0.035 : 0.05;
    const span = n * cardH + (n - 1) * gap;
    targetDefs = spec.targets.map((t, i) => ({ ...t, x: -0.33, y: span / 2 - cardH / 2 - i * (cardH + gap), w: cardW + 0.04, h: cardH + 0.03, cap: 1 }));
    spec.cards.forEach((c, i) => { home[c.id] = [0.36, span / 2 - cardH / 2 - i * (cardH + gap)]; });
  } else {
    cardW = 0.5; cardH = 0.13;
    const m = spec.targets.length;
    const bw = 0.42, bgap = 0.06, totalW = m * bw + (m - 1) * bgap;
    targetDefs = spec.targets.map((t, i) => ({ ...t, x: -totalW / 2 + bw / 2 + i * (bw + bgap), y: -0.22, w: bw, h: 0.46, cap: n }));
    const cw = Math.min(cardW, (totalW - (n - 1) * 0.05) / n);
    cardW = cw;
    spec.cards.forEach((c, i) => { home[c.id] = [-totalW / 2 + cw / 2 + i * (cw + 0.05), 0.33]; });
  }

  // ---------- sasaran ----------
  const targetMeshes = {};
  for (const t of targetDefs) {
    const tex = isOrder
      ? textTexture([String(t.label)], { w: 640, h: Math.round(640 * t.h / t.w), bg: 'rgba(255,255,255,0.55)', fg: '#5b6577', border: accent, size: 54, radius: 30, font: 'system-ui, sans-serif' })
      : textTexture([t.label], { w: 512, h: Math.round(512 * t.h / t.w), bg: 'rgba(255,255,255,0.62)', fg: '#1d2b44', border: accent, size: 44, radius: 30, font: 'system-ui, sans-serif' });
    if (!isOrder) {
      // label di bahagian atas kotak
      const c = tex.image; const g = c.getContext('2d');
      g.clearRect(0, 0, c.width, c.height);
      g.fillStyle = 'rgba(255,255,255,0.62)'; roundRect(g, 4, 4, c.width - 8, c.height - 8, 30); g.fill();
      g.lineWidth = 8; g.strokeStyle = accent; g.setLineDash([22, 14]); roundRect(g, 8, 8, c.width - 16, c.height - 16, 26); g.stroke();
      g.setLineDash([]); g.fillStyle = '#1d2b44'; g.font = '700 46px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top';
      g.fillText(t.label, c.width / 2, 26);
      tex.needsUpdate = true;
    }
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(t.w, t.h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
    mesh.renderOrder = 1;   // sasaran di bawah, kad di atas, kad yang diseret paling atas
    mesh.position.set(t.x, t.y, 0.02);
    mesh.userData = { targetId: t.id };
    group.add(mesh);
    targetMeshes[t.id] = { mesh, def: t };
  }

  // ---------- kad ----------
  const cards = {};
  for (const c of spec.cards) {
    const lines = wrap(c.label, spec.mono ? 18 : 22);
    const pxW = 640, pxH = Math.round(640 * cardH / cardW);
    const texN = textTexture(lines, { w: pxW, h: pxH, bg: '#ffffff', fg: '#1d2b44', border: accent, font, radius: 28 });
    const texA = textTexture(lines, { w: pxW, h: pxH, bg: '#ffd166', fg: '#412402', border: '#c99a1c', font, radius: 28 });
    const mat = new THREE.MeshBasicMaterial({ map: texN, transparent: true, depthTest: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(cardW, cardH), mat);
    mesh.renderOrder = 2;
    const [hx, hy] = home[c.id];
    mesh.position.set(hx, hy, 0.06);
    mesh.userData = { cardId: c.id };
    group.add(mesh);
    cards[c.id] = { mesh, mat, texN, texA, where: null };
  }

  const assign = {};             // cardId -> targetId
  let dragging = null;           // { id, offset:[dx,dy] }
  const listeners = new Set();
  const stats = { grabs: 0, drops_on_target: 0, drops_outside: 0, removals: 0, retargets: 0 };

  function layout() {
    // susun semula kad dalam setiap sasaran
    for (const t of targetDefs) {
      const inT = spec.cards.filter((c) => assign[c.id] === t.id);
      inT.forEach((c, i) => {
        const m = cards[c.id].mesh;
        if (dragging && dragging.id === c.id) return;
        if (isOrder) m.position.set(t.x, t.y, 0.06);
        else m.position.set(t.x, t.y + t.h / 2 - 0.165 - i * (cardH + 0.02), 0.06);
      });
    }
    for (const c of spec.cards) {
      if (!assign[c.id] && !(dragging && dragging.id === c.id)) {
        const [hx, hy] = home[c.id];
        cards[c.id].mesh.position.set(hx, hy, 0.06);
      }
    }
  }

  // titik skrin → koordinat setempat atas satah marker
  const plane = new THREE.Plane();
  const v = new THREE.Vector3(), nrm = new THREE.Vector3();
  function screenToLocal(x, y, z = 0.06) {
    const canvas = getCanvas(); if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    const ndc = { x: ((x - r.left) / r.width) * 2 - 1, y: -((y - r.top) / r.height) * 2 + 1 };
    raycaster.setFromCamera(ndc, camera);
    anchorGroup.updateMatrixWorld();
    nrm.set(0, 0, 1).transformDirection(anchorGroup.matrixWorld);
    v.set(0, 0, z).applyMatrix4(anchorGroup.matrixWorld);
    plane.setFromNormalAndCoplanarPoint(nrm, v);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, hit)) return null;
    return anchorGroup.worldToLocal(hit);
  }
  function cardAt(x, y) {
    const canvas = getCanvas(); const r = canvas.getBoundingClientRect();
    raycaster.setFromCamera({ x: ((x - r.left) / r.width) * 2 - 1, y: -((y - r.top) / r.height) * 2 + 1 }, camera);
    const hits = raycaster.intersectObjects(Object.values(cards).map((c) => c.mesh), false);
    return hits.length ? hits[0].object.userData.cardId : null;
  }
  function targetAtLocal(p) {
    if (!p) return null;
    for (const t of targetDefs) {
      if (Math.abs(p.x - t.x) <= t.w / 2 + 0.02 && Math.abs(p.y - t.y) <= t.h / 2 + 0.02) return t.id;
    }
    return null;
  }

  const api = {
    grab(x, y) {
      if (!targetVisible || dragging) return false;
      const id = cardAt(x, y);
      if (!id) return false;
      const p = screenToLocal(x, y);
      const m = cards[id].mesh;
      dragging = { id, offset: p ? [m.position.x - p.x, m.position.y - p.y] : [0, 0], from: assign[id] || null };
      m.position.z = 0.12;
      m.renderOrder = 3;
      m.material.map = cards[id].texA; m.material.needsUpdate = true;
      m.scale.setScalar(1.08);
      stats.grabs++;
      emit('grab', id);
      return true;
    },
    move(x, y) {
      if (!dragging) return;
      const p = screenToLocal(x, y, 0.12);
      if (!p) return;
      const m = cards[dragging.id].mesh;
      m.position.set(p.x + dragging.offset[0], p.y + dragging.offset[1], 0.12);
      const over = targetAtLocal(m.position);
      for (const [tid, t] of Object.entries(targetMeshes)) t.mesh.scale.setScalar(tid === over ? 1.04 : 1);
    },
    release() {
      if (!dragging) return;
      const { id, from } = dragging;
      const m = cards[id].mesh;
      const over = targetAtLocal(m.position);
      dragging = null;
      m.material.map = cards[id].texN; m.material.needsUpdate = true;
      m.renderOrder = 2;
      m.scale.setScalar(1);
      for (const t of Object.values(targetMeshes)) t.mesh.scale.setScalar(1);
      if (over) {
        const def = targetDefs.find((t) => t.id === over);
        const occupants = spec.cards.filter((c) => assign[c.id] === over && c.id !== id);
        if (occupants.length >= def.cap) delete assign[occupants[0].id];   // slot penuh: kad lama kembali
        assign[id] = over;
        stats.drops_on_target++;
        if (from && from !== over) stats.retargets++;
      } else {
        if (from) { delete assign[id]; stats.removals++; }
        else stats.drops_outside++;
      }
      layout();
      emit('change');
    },
    cancel() { if (dragging) { dragging = null; layout(); } },
    isDragging: () => !!dragging,
    assignment: () => ({ ...assign }),
    complete: () => spec.cards.every((c) => assign[c.id]),
    stats: () => ({ ...stats }),
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    destroy() {
      detachPointer();
      anchorGroup.remove(group);
      group.traverse((o) => { o.geometry?.dispose?.(); if (o.material) { o.material.map?.dispose?.(); o.material.dispose?.(); } });
      boardShown = false; updateHint();
    },
    setPointerEnabled(on) { pointerEnabled = on; },
  };
  function emit(type, id) { for (const fn of listeners) fn(type, id); }

  // ---------- sentuhan (jari) ----------
  let pointerEnabled = true;
  let activePointer = null;
  // Dengar pada bekas AR (bukan kanvas sahaja): MindAR meletakkan lapisan CSS3D di atas kanvas.
  const canvasEl = document.getElementById('ar-container');
  const onDown = (e) => {
    if (!pointerEnabled || activePointer !== null) return;
    if (api.grab(e.clientX, e.clientY)) { activePointer = e.pointerId; e.preventDefault(); emit('touch'); }
  };
  const onMove = (e) => { if (e.pointerId === activePointer) { api.move(e.clientX, e.clientY); e.preventDefault(); } };
  const onUp = (e) => { if (e.pointerId === activePointer) { activePointer = null; api.release(); } };
  canvasEl.style.touchAction = 'none';
  canvasEl.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  function detachPointer() {
    canvasEl.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  }

  layout();
  if (CONFIG.TEST) {
    // ujian automatik: kedudukan skrin bagi kad/sasaran
    window.__board = {
      api,
      screenOf(id) {
        const m = cards[id]?.mesh || targetMeshes[id]?.mesh;
        if (!m) return null;
        const p = new THREE.Vector3(); m.getWorldPosition(p); p.project(camera);
        const r = getCanvas().getBoundingClientRect();
        return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
      },
      ids: () => ({ cards: Object.keys(cards), targets: Object.keys(targetMeshes) }),
    };
  }
  return api;
}
