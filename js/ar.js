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
let THREE = null, mindar = null, camera = null, nodeMeshes = {}, raycaster = null, anchorGroup = null;
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
  buildDiagram3D();
  anchor.onTargetFound = () => { targetVisible = true; updateHint(); };
  anchor.onTargetLost = () => { targetVisible = false; centred = null; updateHint(); };
  raycaster = new THREE.Raycaster();
  await mindar.start();
  renderer.setAnimationLoop(() => {
    updateGaze3D();
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
    anchorGroup.add(mesh);
    nodeMeshes[n.id] = mesh;
  }
  const lineMat = new THREE.LineBasicMaterial({ color: 0x1d2b44 });
  const backMat = new THREE.LineDashedMaterial({ color: 0x1d2b44, dashSize: 0.03, gapSize: 0.02 });
  for (const [a, b] of EDGES) anchorGroup.add(lineBetween(a, b, lineMat, 0));
  for (const [a, b] of BACK_EDGES) {
    const l = lineBetween(a, b, backMat, 0.06);
    l.computeLineDistances();
    anchorGroup.add(l);
  }
  anchorGroup.visible = false;
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
  if (currentMode === 'ar' && anchorGroup) anchorGroup.visible = diagramShown;
  if (currentMode === 'sim' && simRoot) simRoot.hidden = !diagramShown;
  document.body.classList.toggle('diagram-on', diagramShown);
  updateHint();
}

export function setCrosshair(on) {
  const c = crosshair();
  if (c) c.hidden = !(on && currentMode === 'ar');
}

function updateHint() {
  const h = hint();
  if (!h) return;
  h.hidden = !(diagramShown && currentMode === 'ar' && !targetVisible);
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
