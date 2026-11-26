// =====================================================================
// TETAPAN KAJIAN
// =====================================================================
const params = new URLSearchParams(location.search);

export const CONFIG = {
  // Mod pembangun (?dev=1): tiada kamera, gaze disimulasi dengan sentuhan,
  // speech ditaip, tiada sekatan jarak antara sesi. JANGAN guna untuk data sebenar.
  DEV: params.get('dev') === '1',
  // Untuk ujian sahaja: ?dev=1&devbackend=1 membenarkan mod dev menghantar data ke Sheets/Firebase
  DEV_BACKEND: params.get('devbackend') === '1',

  // Fail sasaran MindAR (kad marker). Cetak assets/card.png.
  MARKER_SRC: 'assets/card.mind',

  // Berapa lama (ms) nod perlu berada di tengah skrin untuk dikira sebagai
  // jawapan gaze. PERKARA TERBUKA dalam spesifikasi: tetapkan selepas uji cuba.
  GAZE_DWELL_MS: 1500,

  // Jadual: Hari 0, 1, 7. Jarak minimum (hari) sebelum sesi seterusnya dibuka.
  SESSION_DAYS: [0, 1, 7],
  // Hari 1 dibuka 12 jam selepas Hari 0; Hari 7 dibuka 4.5 hari selepas Hari 1
  // (tetingkap Hari 7 dalam spesifikasi: Hari 6 hingga 9).
  MIN_GAP_DAYS: [null, 0.5, 4.5],

  CRITERION: 5,                    // 5/5 setiap subtopik
  CONSENT_VERSION: 'v1-2026-11',
  APP_VERSION: '1.2.0',
};

if (CONFIG.DEV) CONFIG.MIN_GAP_DAYS = [null, 0, 0];
