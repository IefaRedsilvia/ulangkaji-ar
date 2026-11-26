# Prototaip Pengumpulan Data: Ulang Kaji AR (Activity Lifecycle)

Web AR mudah alih untuk mengumpul data pilot bagi model fuzzy (Sub-model A, B, C).
Rujuk dokumen *Spesifikasi Prototaip Pengumpulan Data* untuk reka bentuk penuh.

**Versi 1.2.0 (untuk uji cuba).** Antara muka pelajar dalam bahasa Inggeris. Data disimpan dalam **Google Sheets**. Firebase dan mod tempatan masih boleh digunakan sebagai pilihan lain.

---

## 1. Kandungan folder

| Fail | Fungsi |
| --- | --- |
| `index.html` | Halaman utama |
| `js/questions.js` | **Bank soalan (draf).** Edit di sini: ayat, versi, jawapan |
| `js/config.js` | Tetapan kajian: tempoh dwell gaze, jadual, jarak minimum antara sesi |
| `js/sheets-config.js` | **Tampal URL Web app dan APP_TOKEN di sini** |
| `google-apps-script/Code.gs` | **Skrip untuk ditampal dalam Google Sheets** |
| `js/app.js` | Pengawal sesi (aliran Uji → Ulang Kaji → Paas) |
| `js/items.js` | Paparan soalan dan pengukuran modaliti |
| `js/content.js` | Kandungan Ulang Kaji (S1, S2, S3) |
| `js/ar.js` | MindAR, rajah keadaan 3D, device gaze |
| `js/store.js` | Simpan data (Sheets / Firebase / tempatan) + sandaran dalam telefon |
| `assets/card.png` | **Kad marker untuk dicetak** |
| `assets/card.mind` | Fail sasaran MindAR bagi kad itu |
| `tools/derive.py` | Tukar data JSON kepada CSV dan jadual `fuzzy_rows.csv` (Δ, Savings %, input) |
| `js/firebase-config.js`, `firestore.rules`, `tools/export_firestore.py` | Hanya jika menggunakan Firebase (pilihan lain) |

---

## 2. Cuba dahulu di laptop (tanpa kamera, tanpa Sheets)

Modul JavaScript tidak berjalan jika `index.html` dibuka terus daripada fail. Gunakan pelayan tempatan:

```bash
cd folder-projek
python3 -m http.server 8000
```

Buka `http://localhost:8000/index.html?dev=1`.

**Mod dev (`?dev=1`):** tiada kamera; gaze disimulasi dengan menekan dan menahan nod; speech ditaip; tiada sekatan jarak antara sesi.
Data mod dev **tidak dihantar ke Sheets**, hanya disimpan dalam pelayar.
Untuk mengulang dari awal, padam data laman (DevTools > Application > Clear storage).

---

## 3. Sediakan Google Sheets (sekali sahaja, ~10 minit)

**A. Cipta Sheet dan tampal skrip**

1. Buka <https://sheets.google.com> dan cipta spreadsheet kosong. Namakan, contohnya, *Data Kajian Ulang Kaji AR*.
2. Menu **Extensions > Apps Script**. Tab baharu dibuka.
3. Padam semua kod dalam `Code.gs`, kemudian tampal **seluruh** isi fail `google-apps-script/Code.gs`.
4. Di bahagian atas skrip, tukar dua token:
   - `APP_TOKEN`: perkataan pendek tanpa ruang, contohnya `ulangkaji2026`. Token ini akan ada dalam kod awam.
   - `ADMIN_TOKEN`: rentetan **panjang dan rahsia**, contohnya 30 aksara rawak. Simpan di tempat selamat. Ia digunakan untuk memuat turun semua data.
5. Tekan ikon **Save** (cakera).

**B. Beri kebenaran dan cipta tab**

6. Di bar atas, pilih fungsi **`testSetup`**, tekan **Run**.
7. Tetingkap *Authorization required* muncul: **Review permissions** > pilih akaun > jika keluar *Google hasn't verified this app*, tekan **Advanced** > **Go to … (unsafe)** > **Allow**.
   (Ini normal untuk skrip milik sendiri.)
8. Kembali ke spreadsheet. Lima tab baharu wujud: `participants`, `sessions`, `subtopic_results`, `item_responses`, `events`.

**C. Terbitkan sebagai Web app**

9. Dalam Apps Script: **Deploy > New deployment**.
10. Ikon gear di sebelah *Select type* > **Web app**.
11. Isi: *Description* `v1`; **Execute as: Me**; **Who has access: Anyone**. Tekan **Deploy**.
12. Salin **Web app URL** (berakhir dengan `/exec`).
13. Uji: tampal URL itu dalam pelayar. Mesti keluar `{"ok":true,"message":"Penerima data aktif",...}`.

> Jika pilihan **Anyone** tiada, akaun organisasi (contohnya akaun UKM) mungkin menyekatnya. Gunakan akaun Gmail peribadi untuk Sheet ini, atau tanya pentadbir IT.

**D. Sambungkan apps**

14. Buka `js/sheets-config.js` dan isi:
    ```js
    SHEETS_URL: 'https://script.google.com/macros/s/XXXX/exec',
    APP_TOKEN: 'ulangkaji2026',   // sama dengan APP_TOKEN dalam Code.gs
    ```

> **Penting:** jika anda mengubah `Code.gs` selepas ini, perubahan **tidak aktif** sehingga anda pergi ke
> **Deploy > Manage deployments > ikon pensel > Version: New version > Deploy**. URL kekal sama.

---

## 4. Terbitkan apps di GitHub Pages

1. Cipta repositori baharu di <https://github.com/new> (contohnya `ulangkaji-ar`, **Public**).
2. **Add file > Upload files**. Seret **isi** folder projek (bukan folder itu sendiri) supaya `index.html` berada di tahap teratas. **Commit changes**.
3. **Settings > Pages** > Source: *Deploy from a branch* > Branch: `main`, folder `/ (root)` > **Save**.
4. Selepas 1–2 minit, apps tersedia di `https://NAMA-PENGGUNA.github.io/ulangkaji-ar/`.

Kamera hanya berfungsi melalui **https**, jadi GitHub Pages memang sesuai.
Untuk mengemas kini apps kemudian: muat naik semula fail yang berubah (contohnya `js/questions.js`).

---

## 5. Kad marker

- Cetak `assets/card.png` (saiz A5 atau lebih besar, kertas tidak berkilat).
- Ini kad contoh MindAR. Untuk kad sendiri: reka imej yang banyak tekstur dan kontras, kemudian jana fail `.mind` dengan
  [MindAR Image Targets Compiler](https://hiukim.github.io/mind-ar-js-doc/tools/compile). Ganti `assets/card.mind` dan cetak imej baharu.
- Rajah AR lebih lebar daripada kad. Pelajar perlu menjauhkan telefon sedikit supaya keenam-enam nod kelihatan.

---

## 6. Menjalankan pilot

1. Beri setiap pelajar satu **ID samaran** (P01 hingga P35). Simpan senarai padanan ID dengan nama **di luar** Sheet data (contohnya fail berasingan yang dilindungi kata laluan).
2. Hari 0: pelajar buka pautan, masukkan ID, beri persetujuan, buat latihan, kemudian sesi pertama.
3. Hari 1 dan Hari 7: pelajar buka pautan yang sama **pada telefon yang sama**, dan masukkan ID yang sama. Sistem tahu sesi ke berapa.
4. Sesi seterusnya dikunci sehingga jarak minimum (`MIN_GAP_DAYS` dalam `js/config.js`): Hari 1 dibuka 12 jam selepas Hari 0, Hari 7 dibuka 4.5 hari selepas Hari 1.
5. Jika pelajar meninggalkan sesi di tengah, sesi itu kekal `complete: false`, dan pelajar boleh mula semula (cubaan baharu, `attempt` = 2).

---

## 7. Mengambil data

**Lihat terus:** buka spreadsheet. Setiap tab ialah satu koleksi; setiap baris ialah satu rekod.
Medan bersarang (contohnya `gaze_dwell_ms`, `nasa_tlx`, `answer` bagi soalan susun) disimpan sebagai teks JSON.

**Untuk analisis:**

1. Dalam pelayar, buka: `URL_WEB_APP?op=export&token=ADMIN_TOKEN_ANDA`
2. Simpan halaman sebagai `data.json` (Ctrl+S / Cmd+S).
3. Jalankan:
   ```bash
   python3 tools/derive.py data.json hasil/
   ```

`hasil/fuzzy_rows.csv` mengandungi satu baris bagi setiap pelajar × subtopik × sesi (Hari 1 dan Hari 7):
`delta_days`, `original_s`, `relearn_s`, `savings_pct`, `uji_accuracy`, `uji_mean_rt_ms`, `paas`,
metrik gaze dan touch daripada Uji, serta bendera `flag_original_zero` dan `device_match`.
Data ini menjadi input untuk membina membership function dan rules Wang–Mendel.

Fail sandaran yang dimuat turun daripada telefon juga boleh terus diproses oleh `tools/derive.py`.

**Sebelum pilot sebenar:** padam baris ujian anda dalam setiap tab (kekalkan baris tajuk).

---

## 8. Bagaimana data dihantar

- Setiap rekod disimpan dalam telefon dahulu (baris gilir), kemudian dihantar ke Sheets berkelompok (25 rekod).
- Jika internet terputus, apps cuba semula secara automatik, dan menghantar baki bila apps dibuka semula.
- Pada akhir sesi, apps menunggu sehingga semua rekod dihantar. Jika masih ada baki, butang **Muat turun data (JSON)** muncul sebagai sandaran.
- Log masuk memerlukan internet (apps menyemak sesi ke berapa daripada tab `participants`).

**Keselamatan:** sesiapa yang tahu URL dan `APP_TOKEN` boleh menambah baris, tetapi **tidak boleh membaca** data kecuali rekod
`participants` (ID samaran dan kiraan sesi sahaja). Memuat turun semua data memerlukan `ADMIN_TOKEN`, yang tidak ada dalam apps.
Sheet itu sendiri hanya boleh dibuka oleh akaun anda.

---

## 9. Had versi 1 (perlu dinilai semasa uji cuba)

| Perkara | Status |
| --- | --- |
| Gesture | Soalan "letak kad ke kotak" dibuat dengan **sentuhan** (`input_mode: touch_v1`). Picitan MediaPipe dalam v2, jika uji cuba menunjukkan ia selesa sambil memegang telefon |
| Tempoh dwell gaze | 1500 ms (`GAZE_DWELL_MS`). Perkara terbuka; laraskan selepas uji cuba |
| Speech | Perlukan internet. Pengecaman dibuat oleh Google (Chrome) atau Apple (Safari). Jika tidak disokong, apps beralih kepada menaip (`input_mode: typed`) |
| Teks persetujuan | Draf. Ganti dengan teks yang diluluskan etika UKM (`consentScreen` dalam `js/app.js`) |
| Bank soalan | Draf. Perlu disemak oleh pensyarah kursus atau SV |
| Terjemahan Paas dan NASA-TLX | Terjemahan kerja; sahkan sebelum pilot |
| Masa ulang kaji | Termasuk masa menjawab semula (sengaja, mengikut spesifikasi) dan jeda 0.35 s selepas setiap jawapan |

Diuji secara automatik dalam Chromium (mod dev, tiga sesi penuh) dan dengan kamera palsu yang memaparkan kad marker
(MindAR menjejak kad dan gaze memilih nod). **Belum diuji pada telefon sebenar.**

**Ujian Google Sheets:** `Code.gs` diuji dengan pelayan simulasi Apps Script (tiga sesi penuh, dengan kegagalan rangkaian
disuntik setiap 7 permintaan). Semua 70 jawapan, 35 peristiwa dan 9 keputusan subtopik sampai, dan `fuzzy_rows.csv`
daripada Sheets sama dengan sandaran dalam telefon. **Belum diuji dengan Google Apps Script sebenar.**

---

## Lampiran: guna Firebase (pilihan lain)

Kosongkan `SHEETS_URL`, kemudian ikut langkah ini.

1. <https://console.firebase.google.com> > cipta projek.
2. **Authentication** > Sign-in method > aktifkan **Anonymous**.
3. **Firestore Database** > Create database > lokasi **asia-southeast1** > production mode.
4. Firestore > **Rules** > tampal `firestore.rules` > **Publish**.
5. Project settings > Your apps > Web (`</>`) > salin `firebaseConfig` ke `js/firebase-config.js`.
6. Authentication > Settings > **Authorized domains** > tambah `NAMA-PENGGUNA.github.io`.
7. Eksport: `pip install firebase-admin`, jana kunci akaun servis (simpan di luar repo), kemudian
   `python3 tools/export_firestore.py kunci.json data.json` dan `python3 tools/derive.py data.json hasil/`.
