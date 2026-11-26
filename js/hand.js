// =====================================================================
// PENJEJAK TANGAN (gesture picit) melalui MediaPipe HandLandmarker,
// dijalankan pada video kamera BELAKANG yang sama digunakan oleh MindAR.
// Sumber sama seperti apps DidikARealiti (tasks-vision 0.10.14).
//
// API: load(), start(onFrame), stop(), state
//   state = { ready, visible, pinch, x, y }   (x, y = piksel skrin)
// Rangka tangan dilukis pada kanvas #hand-canvas.
// Ujian: ?testhand=1 membenarkan window.__fakeHand = {x, y, pinch}.
// =====================================================================
import * as AR from './ar.js';

const VER = '0.10.14';
const LIB = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}`;
const WASM = `${LIB}/wasm`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const TEST = new URLSearchParams(location.search).get('testhand') === '1';
// iPhone/iPad: elak konteks WebGL ketiga (MindAR + three.js sudah guna GPU); Safari boleh memuat semula halaman jika memori penuh
export const IS_IOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const PINCH_ON = 0.33;    // jarak ibu jari–telunjuk ÷ saiz tapak tangan
const PINCH_OFF = 0.48;   // histeresis supaya picitan tidak berkelip
const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];

export const state = { ready: false, failed: false, error: '', visible: false, pinch: false, x: 0, y: 0 };

let landmarker = null;
let loading = null;
let unhook = null;
let lastVideoTime = -1;
let canvas = null, ctx = null;
let onFrame = null;

export function load() {
  if (TEST) { state.ready = true; return Promise.resolve(true); }
  if (loading) return loading;
  loading = (async () => {
    try {
      const vision = await import(LIB);
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM);
      const make = (delegate) => vision.HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL, delegate },
        runningMode: 'VIDEO', numHands: 1,
        minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
      });
      if (IS_IOS) landmarker = await make('CPU');
      else { try { landmarker = await make('GPU'); } catch { landmarker = await make('CPU'); } }
      state.ready = true;
      return true;
    } catch (e) {
      console.error('Hand landmarker gagal dimuat', e);
      state.failed = true;
      state.error = String(e?.message || e);
      return false;
    }
  })();
  return loading;
}

function ensureCanvas() {
  canvas = document.getElementById('hand-canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'hand-canvas';
    document.body.append(canvas);
  }
  ctx = canvas.getContext('2d');
  canvas.width = innerWidth * devicePixelRatio;
  canvas.height = innerHeight * devicePixelRatio;
  canvas.hidden = false;
}

export function start(cb) {
  onFrame = cb;
  ensureCanvas();
  if (unhook) unhook();
  let skip = false;
  unhook = AR.addFrameHook(() => {
    skip = !skip;                 // ~15 fps untuk mengurangkan beban
    if (TEST) { fakeFrame(); return; }
    if (skip || !landmarker) return;
    const video = AR.getVideo();
    if (!video || video.readyState < 2 || video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;
    let res;
    try { res = landmarker.detectForVideo(video, performance.now()); } catch { return; }
    const lm = res?.landmarks?.[0];
    if (!lm) { update(null); return; }
    // koordinat video (0..1) → piksel skrin, ikut kedudukan video yang dipaparkan
    const r = video.getBoundingClientRect();
    const pts = lm.map((p) => ({ x: r.left + p.x * r.width, y: r.top + p.y * r.height }));
    update(pts);
  });
}

function fakeFrame() {
  const f = window.__fakeHand;
  if (!f) { update(null); return; }
  // tangan palsu: hanya titik picitan, cukup untuk menguji logik seret
  state.visible = true;
  state.x = f.x; state.y = f.y;
  const was = state.pinch;
  state.pinch = !!f.pinch;
  draw(null);
  onFrame?.(state, was);
}

function update(pts) {
  const was = state.pinch;
  if (!pts) {
    state.visible = false;
    state.pinch = false;
    draw(null);
    onFrame?.(state, was);
    return;
  }
  const d = (a, b) => Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y);
  const palm = Math.max(d(0, 9), 1);
  const ratio = d(4, 8) / palm;
  state.visible = true;
  state.pinch = was ? ratio < PINCH_OFF : ratio < PINCH_ON;
  state.x = (pts[4].x + pts[8].x) / 2;
  state.y = (pts[4].y + pts[8].y) / 2;
  draw(pts);
  onFrame?.(state, was);
}

function draw(pts) {
  if (!ctx) return;
  const k = devicePixelRatio;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (pts) {
    ctx.lineWidth = 3 * k;
    ctx.strokeStyle = 'rgba(94, 234, 212, 0.9)';
    ctx.beginPath();
    for (const [a, b] of BONES) { ctx.moveTo(pts[a].x * k, pts[a].y * k); ctx.lineTo(pts[b].x * k, pts[b].y * k); }
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    for (const p of pts) { ctx.beginPath(); ctx.arc(p.x * k, p.y * k, 3 * k, 0, Math.PI * 2); ctx.fill(); }
  }
  if (state.visible) {
    ctx.beginPath();
    ctx.arc(state.x * k, state.y * k, (state.pinch ? 11 : 16) * k, 0, Math.PI * 2);
    ctx.lineWidth = 4 * k;
    ctx.strokeStyle = state.pinch ? '#ffd166' : '#ffffff';
    ctx.stroke();
    if (state.pinch) { ctx.fillStyle = 'rgba(255, 209, 102, 0.6)'; ctx.fill(); }
  }
}

export function stop() {
  if (unhook) unhook();
  unhook = null;
  onFrame = null;
  state.visible = false;
  state.pinch = false;
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (canvas) canvas.hidden = true;
}
