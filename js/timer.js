// Pemasa masa aktif: dijeda secara automatik bila apps ditinggalkan
// (tab ditutup, skrin dikunci, tukar apps).

const active = new Set();
const visibilityListeners = new Set();

export class ActiveTimer {
  constructor() {
    this.acc = 0;
    this.t0 = 0;
    this.running = false;
    this.paused = false;
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.paused = document.hidden;
    this.t0 = performance.now();
    active.add(this);
  }
  pause() {
    if (this.running && !this.paused) {
      this.acc += performance.now() - this.t0;
      this.paused = true;
    }
  }
  resume() {
    if (this.running && this.paused) {
      this.t0 = performance.now();
      this.paused = false;
    }
  }
  stop() {
    if (this.running) {
      if (!this.paused) this.acc += performance.now() - this.t0;
      this.running = false;
      active.delete(this);
    }
    return this.acc;
  }
  get ms() {
    return this.acc + (this.running && !this.paused ? performance.now() - this.t0 : 0);
  }
}

export function onVisibilityChange(fn) {
  visibilityListeners.add(fn);
  return () => visibilityListeners.delete(fn);
}

document.addEventListener('visibilitychange', () => {
  for (const t of active) (document.hidden ? t.pause() : t.resume());
  for (const fn of visibilityListeners) fn(document.hidden);
});
