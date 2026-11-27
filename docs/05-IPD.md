# 06-IPD: Pelan Pelaksanaan e-Karakter

Rujuk: PRD (F-xx), TRD (peta fail), AFD (S-xx), DBD, BSD. Pelan ini berakhir dengan **e-Karakter hidup di `opr.annurpro.com`**, diuji dan didokumenkan. Bina satu fasa, uji, baru sambung fasa seterusnya. Setiap fasa ada ujian penerimaan yang mesti lulus.

Semua kerja dalam repo `opr-poc` pada branch `karakter`. Tiada pelanggan berbayar lagi (hanya percubaan), jadi risiko naik taraf skema rendah.

## Ringkasan fasa

| Fasa | Hasil | Feature | Milestone boleh diuji |
|---|---|---|---|
| 0 | Skema v2 dan fungsi persediaan | F-01, F-15 | Sekolah ujian dinaik taraf, jalan dua kali tiada pendua |
| 1 | Setup sekolah | F-02, F-03, F-04, F-13 | Admin siapkan kelas, subjek, teras, guru kelas, tetapan |
| 2 | Borang dan rekod | F-05, F-06, F-09 (asas) | Guru hantar laporan dengan gambar, rekod masuk Sheet |
| 3 | Tandatangan dan PDF | F-07, F-08 | PDF A4 satu muka bertandatangan |
| 4 | Laporan Saya dan Kelas | F-09, F-10 | Guru kelas nampak kelasnya sahaja |
| 5 | Dashboard dan eksport | F-11, F-12 | Dashboard, CSV, PDF dashboard |
| 6 | Demo, panduan, keselamatan, deploy | F-14, F-15 | Live, ujian keselamatan lulus |

## Fasa 0: Persediaan dan skema (F-01, F-15)

| # | Task | Fail | Siap bila |
|---|---|---|---|
| 0.1 | Cipta branch `karakter`. Jalankan `npm test` dan `npm run e2e` sebagai garis asas | repo | Semua lulus sebelum ubah apa-apa |
| 0.2 | Kemas kini `skema.js`: `VERSI_SKEMA=2`, tab, kolum, subfolder, seed, kunci `KRK_*` (BSD seksyen 2 hingga 4) | `src/skema.js` | Ujian unit baca konstanta |
| 0.3 | `tambahTab` dalam `google.js` (jika belum ada) | `src/google.js` | Ujian dengan Google palsu |
| 0.4 | `pasangSkemaKarakter()` + pencetus pada `/karakter/*` pertama + `POST /karakter/skema/pasang` | `src/karakter.js`, `src/worker.js` | Idempoten: dua kali tiada tab, baris seed atau folder berganda. Sekolah v1 menjadi v2 tanpa kehilangan data OPR |
| 0.5 | Sekolah baharu terus v2 dalam `sediakanDrive` | `src/worker.js` | Daftar sekolah baharu, tab e-Karakter wujud |
| 0.6 | Helper audit dan penolakan akses | `src/karakter.js` | Baris `KARAKTER_*` muncul dalam AuditLog |

Ujian: unit untuk 0.2 hingga 0.6, e2e naik taraf sekolah lama.

## Fasa 1: Setup sekolah (F-02, F-03, F-04, F-13)

| # | Task | Fail | Siap bila |
|---|---|---|---|
| 1.1 | `GET /karakter/config` (senarai aktif, tetapan awam, guruKelas, adaTtd) | `src/karakter.js` | Pulangkan data ikut peranan |
| 1.2 | Benarkan kategori `KARAKTER_*` pada `/senarai` dan `/senarai/padam` (admin sahaja) | `src/worker.js` | Guru biasa 403 |
| 1.3 | `GET/POST /karakter/gurukelas` dengan semakan: guru aktif, kelas wujud, tiada pendua | `src/karakter.js` | Pemetaan disimpan dan dibaca |
| 1.4 | `GET/POST /karakter/tetapan` (kunci `KRK_*` sahaja) dan `KRK_TERAS_HURAIAN` | `src/karakter.js` | Nilai berubah dan dipulangkan |
| 1.5 | UI pensuis modul dan tab (S-01) | `public/sekolah.html`, `public/sekolah.js` | Tab ikut peranan (AFD seksyen 1) |
| 1.6 | UI Setup (S-08): Kelas, Subjek, Teras (tampal pukal, nyahaktif, susun), Guru Kelas (jadual), Tetapan, Struktur | `public/karakter.js` | Admin selesaikan senarai tanpa Sheet |
| 1.7 | Panduan Mula Pantas (S-10) dengan tanda siap | `public/karakter.js` | Langkah bertanda bila data wujud |

Ujian penerimaan: admin tampal 12 kelas dan 10 subjek, tambah teras kelima, petakan dua guru kepada kelas, ubah kod sekolah. Guru biasa tidak boleh buka S-08 (403 di server).

## Fasa 2: Borang dan rekod (F-05, F-06, F-09 asas)

| # | Task | Fail | Siap bila |
|---|---|---|---|
| 2.1 | Baca `terimaFail`/`hantarFail`, lanjutkan untuk `lampiran` karakter dan `ttd`. Pastikan OPR tidak terjejas | `src/worker.js` | Ujian OPR sedia ada kekal lulus |
| 2.2 | `POST /karakter/rekod`: pengesahan penuh (BSD seksyen 8, TRD seksyen 5), ID, hash, `Sesi`, audit | `src/karakter.js` | Semua kes tolak diuji (tiada teras, tarikh masa depan, teras tak sah, >4 gambar, input panjang) |
| 2.3 | `GET /karakter/rekod/<id>` dan `?skop=saya` berhalaman | `src/karakter.js` | Hanya rekod sendiri |
| 2.4 | `POST /karakter/rekod/<id>/padam` (soft delete) | `src/karakter.js` | Hilang daripada senarai, kekal dalam Sheet |
| 2.5 | `GET /karakter/fail/<fileId>?rekod=<id>` dengan semakan akses | `src/karakter.js` | Guru lain 403 |
| 2.6 | UI Borang (S-02): medan, kad teras, "Lain-lain", mampatan gambar (maks 4, 900px), kapsyen, akuan, draf setempat | `public/karakter.js` | Hantar daripada telefon sebenar |
| 2.7 | Cadangan Ayat (templat catatan) | `public/karakter.js` | Sisip teks ikut kelas, subjek, teras |

Ujian penerimaan: guru hantar laporan dengan 2 gambar, baris muncul dalam `KarakterRekod` dengan `PemilikEmail` betul walau klien cuba hantar nama lain. Guru B tidak boleh buka rekod Guru A.

## Fasa 3: Tandatangan dan PDF (F-07, F-08)

| # | Task | Fail | Siap bila |
|---|---|---|---|
| 3.1 | Kanvas tandatangan: Pointer Events, lukis, padam, trim ruang kosong, kecilkan maks 800x300, eksport PNG telus | `public/tandatangan.js` | Berfungsi pada jari (iOS, Android) dan tetikus |
| 3.2 | Tab Upload (imej -> trim -> PNG) dan tab Tersimpan (S-04) | `public/tandatangan.js` | Tiga cara berfungsi |
| 3.3 | `GET/POST/DELETE /karakter/ttd`: semak PNG (magic bytes, 150KB), simpan dalam `Tandatangan`, kemas `KarakterTtd` | `src/karakter.js` | Hanya milik sendiri |
| 3.4 | Lekat tandatangan semasa hantar: sahkan fail milik sesi, isi `TtdFileId`, `TtdPada`, hash. Edit kandungan memadam tandatangan | `src/karakter.js` | Admin tak boleh tandatangan untuk guru lain. Edit memadam tandatangan |
| 3.5 | Pratonton A4 (S-03) mengikut DBD seksyen 5.1 | `public/karakter-dokumen.js` | Sepadan visual dengan laporan sedia ada, tandatangan kelihatan |
| 3.6 | Jana PDF satu muka (html2pdf tempatan), nama fail `Laporan_Karakter_<Kelas>_<Tarikh>.pdf` | `public/karakter-dokumen.js` | 0, 1, 2, 3, 4 gambar semua muat satu muka |
| 3.7 | Butang Muat Turun PDF pada S-06 dan S-02 | `public/karakter.js` | PDF bagi rekod sendiri dan, bagi R-03, rekod kelas |
| 3.9 | Selepas Hantar: jana PDF di pelayar, muat naik ke `/karakter/rekod/<id>/pdf`, Worker simpan dalam subfolder `PDF`, isi `PdfFileId` dan `PdfPada`. Edit atau tandatangan semula menimpa fail sama | `public/karakter-dokumen.js`, `src/karakter.js` | Selepas Hantar, PDF muncul dalam Drive tanpa tindakan guru. Tiada fail pendua selepas 3 kali edit |
| 3.10 | Status "PDF belum siap" dan butang Jana Semula (pemilik dan admin). Muat turun PDF baca terus fail Drive melalui Worker | `public/karakter.js`, `src/karakter.js` | Putuskan rangkaian ketika muat naik: rekod kekal, butang Jana Semula berfungsi |
| 3.8 | Tetapan `KRK_WAJIB_TTD` dikuatkuasakan di server | `src/karakter.js` | Hantar tanpa tandatangan ditolak jika `YA` |

Ujian penerimaan: guru lukis tandatangan di telefon, hantar, PDF muncul sendiri dalam Drive sekolah, muat turun PDF, tandatangan muncul atas nama guru. Edit tajuk, tandatangan hilang dan guru perlu tandatangan semula.

## Fasa 4: Laporan Saya dan Laporan Kelas (F-09, F-10)

| # | Task | Fail | Siap bila |
|---|---|---|---|
| 4.1 | `?skop=kelas`: tapis di server mengikut kelas dipetakan. `?skop=semua` admin sahaja | `src/karakter.js` | Kelas luar pemetaan tidak pernah dipulangkan, walau parameter dimanipulasi |
| 4.2 | `statistik?skop=kelas` (ringkasan kelas) | `src/karakter.js` | Angka betul untuk kelas dipetakan |
| 4.3 | UI Laporan (S-05) sub-tab Saya dan Kelas Saya, carian dan tapis | `public/karakter.js` | Telefon dan desktop |
| 4.4 | Butiran (S-06): baca sahaja untuk laporan guru lain, edit dan padam hanya milik sendiri (admin boleh padam mana-mana) | `public/karakter.js`, `src/karakter.js` | Butang ikut peranan dan server menguatkuasa |
| 4.5 | Edit: muat rekod ke S-02, amaran tandatangan | `public/karakter.js` | |

Ujian penerimaan: Cikgu A (guru kelas 5 Ibnu Sina) nampak laporan 3 guru bagi 5 Ibnu Sina dan tiada laporan kelas lain. Admin tukar pemetaan, perubahan berkuat kuasa pada permintaan seterusnya.

## Fasa 5: Dashboard dan eksport (F-11, F-12)

| # | Task | Fail | Siap bila |
|---|---|---|---|
| 5.1 | Salin Chart.js 4.4.1 ke `public/vendor/chart.umd.min.js` (npm, bukan CDN) | `public/vendor/` | Tiada permintaan hos luar dalam e2e |
| 5.2 | `GET /karakter/statistik` (KPI, pecahan teras, ikut kelas dan subjek, top 5 guru, jumlah) dengan tapisan tarikh, kelas, subjek, guru, teras, carian | `src/karakter.js` | Jumlah sepadan dengan jadual ditapis |
| 5.3 | UI Dashboard (S-07): KPI, carta, top guru, penapis, jadual berhalaman, butiran | `public/karakter.js` | Admin sahaja. Guru 403 |
| 5.4 | `GET /karakter/eksport` CSV: UTF-8 BOM, sanitasi `= + - @`, ikut tapisan, tanpa rekod dipadam | `src/karakter.js` | Ujian sel berbahaya dineutralkan |
| 5.5 | PDF Dashboard landskap (S-09): muka 1 KPI dan carta, muka 2+ jadual, pengaki muka surat, blok pengesahan | `public/karakter-dokumen.js` | Tiada limpahan pada 1, 30 dan 300 rekod. Sahkan keupayaan landskap html2pdf, jika tidak guna sandaran TRD |
| 5.6 | Ujian beban kasar: 8,000 baris `KarakterRekod` palsu, ukur masa dashboard dan senarai | `tools/` | Dashboard kurang 4 saat, jika tidak aktifkan cache KV 30 saat (TRD seksyen 7) |

## Fasa 6: Demo, panduan, keselamatan, deploy (F-14, F-15)

| # | Task | Fail | Siap bila |
|---|---|---|---|
| 6.1 | Mod demo: pintasan `/karakter/*` dalam `demo.js`, data contoh 40 laporan, `?peranan=guru|gurukelas|admin` | `public/demo.js`, `public/demo-data.json`, `tools/bina-demo.mjs` | `/s/demo?m=karakter` berfungsi tanpa log masuk |
| 6.2 | Seksyen e-Karakter pada sale page dengan tangkapan skrin sebenar daripada demo (tanpa testimoni atau angka rekaan) | `public/index.html`, `tools/tangkap-skrin.mjs` | Tiada skrol mendatar 390px |
| 6.3 | Manual pengguna: bab e-Karakter (admin setup, guru hantar dan tandatangan, guru kelas, dashboard) HTML dan PDF | `public/panduan/`, `tools/bina-manual.cjs` | Dirakam daripada app sebenar |
| 6.4 | Video tutorial 1 minit: setup admin, guru hantar dan tandatangan, dashboard | `tools/rakam.mjs` | Tiada bahagian beku |
| 6.5 | Kemas kini penerangan borang BCL kepada "Annur OPR (termasuk e-Karakter)" dan teks harga pada app | BCL, `public/` | Harga RM20 sebulan atau RM200 setahun tidak berubah |
| 6.6 | Semakan `cybersecurity-pdpa-checklist` dan `pentest-checklist`: cuba akses laluan tanpa sesi, IDOR atas `rekod/<id>` dan `fail`, parameter `skop`, hantar nama guru palsu, upload bukan PNG sebagai tandatangan, formula dalam catatan, lesen tamat | repo | Semua dapatan tahap tinggi diselesaikan |
| 6.7 | `npm test` dan `npm run e2e` penuh. Gabung ke `main`, Workers Builds deploy | repo | Hijau, live |
| 6.8 | Ujian sebenar: satu sekolah pilot, satu admin, tiga guru, satu guru kelas, di telefon sebenar. Satu laporan sebenar daripada hantar hingga PDF | live | Tiada ralat. Maklum balas dicatat |
| 6.9 | Persara prototype lama (Apps Script dan `index.html`): tukar URL Apps Script kepada "Only myself" atau padam deployment supaya data ujian tidak terdedah | Apps Script | URL lama tidak lagi memulangkan data |

Item 6.9 mendesak: URL Apps Script lama dalam `index.html` kini terbuka kepada sesiapa. Boleh dilakukan **sekarang**, tidak perlu tunggu Fasa 6.

## Susunan kerja saranan dan anggaran

Bina Fasa 0 hingga 3 dahulu (laporan boleh dihantar, ditandatangan dan dicetak), kemudian Fasa 4 hingga 6. Anggaran usaha vibe coding: Fasa 0 dan 1 satu sesi, Fasa 2 satu sesi, Fasa 3 satu sesi, Fasa 4 dan 5 satu hingga dua sesi, Fasa 6 satu hingga dua sesi. Ini anggaran kasar, bukan komitmen.

## Cara arahkan Claude Code

Letak enam dokumen dalam `docs/` repo `opr-poc`, kemudian taip: *"Baca docs/01 hingga 05 dan kod sedia ada. Bina Fasa 0 sahaja. Jalankan ujian. Beritahu aku bila siap sebelum Fasa 1."* Ulang untuk setiap fasa.

## Andaian

1. Satu sekolah pilot tersedia untuk ujian Fasa 6.8 (anda boleh guna sekolah sendiri atau satu sekolah rakan).
2. Akaun Google ujian (admin dan beberapa guru) wujud, kerana OAuth masih mod Testing: tambah emel penguji dalam Google Cloud OAuth consent screen. Sebelum jualan awam, status OAuth dan pengesahan jenama perlu diselesaikan mengikut aliran OPR sedia ada.

## Soalan terbuka

1. Bilakah sasaran jualan (Nov-Dis untuk sesi 2027)? Ini menentukan sama ada Fasa 6.8 dan 6.3 hingga 6.4 perlu dipercepat.
2. Siapa sekolah pilot untuk ujian sebenar?
