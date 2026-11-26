// =====================================================================
// PAPAN SKRIN untuk soalan GESTURE
// Kad dan kotak terapung di atas paparan kamera langsung (tidak terikat
// pada kad marker), supaya tangan pelajar tidak menutup marker dan
// menghilangkan kad. API sama seperti AR.createBoard():
//   grab(x, y) → move(x, y) → release(), assignment(), complete(),
//   stats(), on(fn), setPointerEnabled(bool), destroy()
// =====================================================================
import { el } from './util.js';
import { CONFIG } from './config.js';

export function createScreenBoard(spec) {
  const accent = spec.accent || '#185FA5';
  const root = el('div', { id: 'screen-board', style: `--acc:${accent}` });
  const pool = el('div', { class: 'sb-pool' });
  const boxesWrap = el('div', { class: 'sb-boxes', style: `grid-template-columns: repeat(${spec.targets.length}, minmax(0, 1fr))` });
  root.append(pool, boxesWrap);
  document.body.append(root);

  const cardEls = {};
  for (const c of spec.cards) {
    const e = el('div', { class: 'sb-card' + (spec.mono ? ' mono' : ''), 'data-card': c.id, text: c.label });
    cardEls[c.id] = e;
    pool.append(e);
  }
  const boxEls = {};
  for (const t of spec.targets) {
    const inner = el('div', { class: 'sb-box-cards' });
    const b = el('div', { class: 'sb-box', 'data-target': t.id }, [el('div', { class: 'sb-box-label', text: t.label }), inner]);
    b._inner = inner;
    boxEls[t.id] = b;
    boxesWrap.append(b);
  }

  const assign = {};
  let dragging = null;     // { id, dx, dy, from }
  const listeners = new Set();
  const stats = { grabs: 0, drops_on_target: 0, drops_outside: 0, removals: 0, retargets: 0 };
  const emit = (type, id) => { for (const fn of listeners) fn(type, id); };

  function cardAt(x, y) {
    for (const [id, e] of Object.entries(cardEls)) {
      const r = e.getBoundingClientRect();
      const pad = 14;   // sasaran picitan lebih besar sedikit
      if (x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad) return id;
    }
    return null;
  }
  function boxAt(x, y) {
    for (const [id, b] of Object.entries(boxEls)) {
      const r = b.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return id;
    }
    return null;
  }
  function placeHome(id) {
    const e = cardEls[id];
    e.classList.remove('dragging');
    e.style.left = ''; e.style.top = ''; e.style.width = '';
    if (assign[id]) boxEls[assign[id]]._inner.append(e);
    else pool.append(e);
  }

  const api = {
    grab(x, y) {
      if (dragging) return false;
      const id = cardAt(x, y);
      if (!id) return false;
      const e = cardEls[id];
      const r = e.getBoundingClientRect();
      dragging = { id, dx: r.left + r.width / 2 - x, dy: r.top + r.height / 2 - y, from: assign[id] || null };
      e.style.width = r.width + 'px';
      e.classList.add('dragging');
      root.append(e);
      api.move(x, y);
      stats.grabs++;
      emit('grab', id);
      return true;
    },
    move(x, y) {
      if (!dragging) return;
      const e = cardEls[dragging.id];
      e.style.left = (x + dragging.dx) + 'px';
      e.style.top = (y + dragging.dy) + 'px';
      const over = boxAt(x + dragging.dx, y + dragging.dy);
      for (const [tid, b] of Object.entries(boxEls)) b.classList.toggle('over', tid === over);
    },
    release() {
      if (!dragging) return;
      const { id, from } = dragging;
      const r = cardEls[id].getBoundingClientRect();
      const over = boxAt(r.left + r.width / 2, r.top + r.height / 2);
      dragging = null;
      for (const b of Object.values(boxEls)) b.classList.remove('over');
      if (over) {
        assign[id] = over;
        stats.drops_on_target++;
        if (from && from !== over) stats.retargets++;
      } else if (from) {
        delete assign[id];
        stats.removals++;
      } else {
        stats.drops_outside++;
      }
      placeHome(id);
      emit('change');
    },
    cancel() { if (dragging) { const id = dragging.id; dragging = null; placeHome(id); } },
    isDragging: () => !!dragging,
    assignment: () => ({ ...assign }),
    complete: () => spec.cards.every((c) => assign[c.id]),
    stats: () => ({ ...stats }),
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    setPointerEnabled(on) { pointerEnabled = on; root.classList.toggle('touchable', on); },
    destroy() {
      root.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      root.remove();
    },
  };

  // sandaran sentuhan (hanya bila dibenarkan)
  let pointerEnabled = false, activePointer = null;
  const onDown = (e) => {
    if (!pointerEnabled || activePointer !== null) return;
    if (api.grab(e.clientX, e.clientY)) { activePointer = e.pointerId; e.preventDefault(); emit('touch'); }
  };
  const onMove = (e) => { if (e.pointerId === activePointer) { api.move(e.clientX, e.clientY); e.preventDefault(); } };
  const onUp = (e) => { if (e.pointerId === activePointer) { activePointer = null; api.release(); } };
  root.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  if (CONFIG.TEST) {
    window.__board = {
      api,
      screenOf(id) {
        const e = cardEls[id] || boxEls[id];
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      },
    };
  }
  return api;
}
