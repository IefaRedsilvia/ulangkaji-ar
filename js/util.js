// Pembantu umum

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function nowStamp() {
  const ms = Date.now();
  return { client_ms: ms, client_iso: new Date(ms).toISOString() };
}

export function deviceInfo() {
  const ua = navigator.userAgent;
  let os = 'lain';
  if (/android/i.test(ua)) os = 'Android';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  let browser = 'lain';
  if (/crios/i.test(ua)) browser = 'Chrome iOS';
  else if (/samsungbrowser/i.test(ua)) browser = 'Samsung Internet';
  else if (/edg/i.test(ua)) browser = 'Edge';
  else if (/chrome/i.test(ua)) browser = 'Chrome';
  else if (/safari/i.test(ua)) browser = 'Safari';
  else if (/firefox/i.test(ua)) browser = 'Firefox';
  const model = (ua.match(/\(([^)]+)\)/) || [])[1] || '';
  return {
    user_agent: ua,
    device_model: model,
    os,
    browser,
    screen_w: screen.width,
    screen_h: screen.height,
    dpr: window.devicePixelRatio || 1,
  };
}

export function normaliseSpeech(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\(\)/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatDate(ms) {
  return new Date(ms).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}
