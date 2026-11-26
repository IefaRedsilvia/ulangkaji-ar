// =====================================================================
// KONFIGURASI GOOGLE SHEETS
// ---------------------------------------------------------------------
// SHEETS_URL : URL Web app daripada Apps Script (berakhir dengan /exec)
// APP_TOKEN  : sama dengan APP_TOKEN dalam google-apps-script/Code.gs
//
// Jika SHEETS_URL diisi, apps menghantar data ke Google Sheets.
// Jika kosong, apps cuba Firebase (js/firebase-config.js), dan jika itu
// juga kosong, apps berjalan dalam MOD TEMPATAN.
// =====================================================================
export const sheetsConfig = {
  SHEETS_URL: 'https://script.google.com/macros/s/XXXX/exec',
  APP_TOKEN: 'ulangkaji2026',
};
