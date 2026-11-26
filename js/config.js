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
  // Untuk ujian automatik dalam mod AR sahaja (tidak mengubah data)
  TEST: params.get('test') === '1' || params.get('testhand') === '1',

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

  // Kriteria 5/5 setiap subtopik. Peraturan uji cuba: jika purata sesi Hari 0
  // melebihi 45 minit, tukar kepada 4 (80%) SEBELUM pilot sebenar, bukan di tengahnya.
  CRITERION: 5,
  CONSENT_VERSION: 'v1-2026-11',
  APP_VERSION: '1.3.0',
};

if (CONFIG.DEV) CONFIG.MIN_GAP_DAYS = [null, 0, 0];
