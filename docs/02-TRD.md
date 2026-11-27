# 02 - TRD: Keperluan Teknikal e-Karakter

Rujuk: `01-PRD.md` (F-01 hingga F-15, R-01 hingga R-04). Repo asas: `annurprosolutions-cell/opr-poc` (Worker `annur-opr`).

## 1. Keputusan stack

e-Karakter **bukan app berasingan**. Ia lanjutan kepada Worker `annur-opr` yang sedia ada, jadi stack sama dengan OPR dan tiada apa baharu untuk dihosting atau dibayar.

| Lapisan | Pilihan | Sebab |
|---|---|---|
| Frontend | Vanilla HTML/CSS/JS modul ES, tiada bundler, dalam `public/` | Sama dengan OPR. Deploy = git push |
| Backend | Cloudflare Worker `src/worker.js` (+ fail baharu `src/karakter.js`) | Sudah ada sesi, akses Google admin, lesen, audit |
| Database | Google Sheet sekolah dalam Drive admin (tab baharu) | Sama dengan OPR. AnnurPro tidak simpan data sekolah |
| Fail | Google Drive admin sekolah (subfolder `Lampiran`, `Tandatangan`, `PDF`) | Gambar dan tandatangan dihidang melalui Worker selepas semak akses |
| KV | `OPR_KV` sedia ada | Sesi, sekolah, lesen, rekod muat naik tergantung |
| PDF | `html2pdf.bundle.min.js` (sudah dalam `public/vendor/`). Dijana di pelayar guru, dimuat naik ke Worker, Worker simpan ke Drive | Tiada CDN. Worker tidak boleh jana PDF sendiri (tiada pelayar dalam Worker). Alternatif Cloudflare Browser Rendering ditolak kerana berbayar |
| Carta | Chart.js 4.4.1 disalin ke `public/vendor/chart.umd.min.js` | Prototype lama sudah guna, kod boleh dipakai semula. Tiada CDN |
| Hosting | Cloudflare Workers, `opr.annurpro.com` | Tiada domain baharu |
| Pembayaran | BCL sedia ada (borang Annur OPR, `BCL_FORM_ID` 21187) | Lesen kongsi |

**Apps Script tidak digunakan.** Prototype lama guna Apps Script terbuka kepada "Anyone", itu punca isu keselamatan utama. Worker menggantikannya sepenuhnya.

## 2. Perubahan pada repo (peta fail)

| Fail | Perubahan | Feature |
|---|---|---|
| `src/skema.js` | `VERSI_SKEMA = 2`. Tambah `TAB.KRK_REKOD`, `TAB.KRK_GURUKELAS`, `TAB.KRK_TTD`, `KOLUM` bagi tiga tab itu, `SUBFOLDER.TTD`, seed `SENARAI_KARAKTER` (kelas, subjek, teras), kunci `Tetapan` baharu | F-01, F-02, F-03, F-13 |
| `src/karakter.js` (baharu) | Semua logik e-Karakter: pasang skema, config, rekod, tandatangan, statistik, eksport, guru kelas, tetapan | F-01 hingga F-13, F-15 |
| `src/worker.js` | Daftar laluan `/karakter/*` dalam router `apiSekolah` (selepas `kenalPasti`). Lanjut `terimaFail` untuk `jenis=ttd`. Benarkan kategori `KARAKTER_*` dalam `/senarai` | F-01, F-06, F-07 |
| `src/google.js` | Tambah `tambahTab` (batchUpdate addSheet) jika belum ada | F-01 |
| `public/sekolah.html`, `public/sekolah.js` | Pensuis modul, tab e-Karakter, muat `karakter.js` | F-01 |
| `public/karakter.js` (baharu) | UI borang, laporan, dashboard, setup | F-02 hingga F-13 |
| `public/tandatangan.js` (baharu) | Kanvas tandatangan (lukis, upload, trim, eksport PNG) | F-07 |
| `public/karakter-dokumen.js` (baharu) | Pratonton A4 dan PDF laporan serta PDF dashboard | F-08, F-12 |
| `public/vendor/chart.umd.min.js` | Salinan tempatan | F-11 |
| `public/demo.js`, `public/demo-data.json` | Pintasan fetch dan data contoh untuk `/karakter/*` | F-14 |
| `public/index.html` | Seksyen e-Karakter pada sale page | F-14 |
| `tests/*`, `tests/palsu.js` | Ujian unit dan e2e untuk laluan baharu | Semua |
| `tools/*` | Tangkap skrin, manual dan video e-Karakter | F-14 |

## 3. Aliran akses data

```
Guru (browser) -> Worker /api/s/<slug>/karakter/*
   1. Semak sesi (kuki) dan lesen
   2. kenalPasti(): baca tab Guru -> peranan (admin / guru / tiada / tidak_aktif)
   3. Baca KarakterGuruKelas -> adakah guru kelas, bagi kelas apa
   4. Semak kebenaran ikut jadual akses (BSD seksyen 4)
   5. Panggil Google Sheets/Drive atas nama admin sekolah
```

Peranan dibaca daripada Sheet pada setiap permintaan (tiada cache), jadi guru yang dinyahaktif hilang akses serta-merta. Peraturan ini diteruskan daripada OPR.

## 4. Naik taraf skema (pengganti `setupSystem()`)

Pemilik sudah biasa dengan konsep "run setup dahulu". Dalam Worker, ini berlaku **automatik dan tanpa klik**, tetapi ada butang sandaran.

- Fungsi `pasangSkemaKarakter(g, sek)`: semak tajuk tab dalam Sheet (satu panggilan metadata), tambah tab `KarakterRekod`, `KarakterGuruKelas`, `KarakterTtd` jika tiada, tulis header, seed `Senarai` kategori `KARAKTER_KELAS`, `KARAKTER_SUBJEK`, `KARAKTER_TERAS`, seed kunci `Tetapan` baharu, cipta subfolder `Tandatangan` dan `PDF`, simpan `versiSkema = 2` dalam rekod sekolah (KV) dan `Tetapan.VERSI_SKEMA`.
- **Idempoten**: jalan berulang kali tidak menduplikasi tab, baris seed atau folder. Tab sedia ada tidak disentuh.
- **Pencetus**: pada permintaan `/karakter/*` pertama untuk sekolah yang `versiSkema < 2`. Sekolah baharu mendapat skema 2 terus semasa `sediakanDrive`.
- **Sandaran**: admin tekan "Semak / pasang semula struktur e-Karakter" (S-08) yang memanggil `POST /karakter/skema/pasang`.
- Kolum baharu pada versi akan datang hanya ditambah di **hujung** header dan `VERSI_SKEMA` dinaikkan.

## 5. Keselamatan (wajib)

| Kawalan | Pelaksanaan |
|---|---|
| Autentikasi | Sesi Google OAuth sedia ada (PKCE, kuki HttpOnly Secure SameSite=Lax) |
| Kebenaran di server | Setiap laluan `/karakter/*` semak peranan dan pemilikan. Tiada kepercayaan pada medan daripada klien (`PemilikEmail`, `NamaGuru` diisi oleh Worker) |
| Penapisan data | Skop `saya` / `kelas` / `semua` dikuatkuasakan di server. Guru kelas: tapis `Kelas` dalam senarai pemetaannya, di server |
| Tiada rahsia di frontend | `GOOGLE_CLIENT_SECRET`, `APP_SECRET`, token BCL kekal secret Cloudflare |
| Pengesahan input | Panjang maksimum, senarai putih untuk teras (mesti wujud dalam `KARAKTER_TERAS`), tarikh ISO dan julat, kelas dan subjek 60 aksara, tajuk 150, catatan 3,000, gambar maksimum 4 |
| Formula injection | Tulis ke Sheet guna `valueInputOption=RAW` (sedia ada). Eksport CSV: sel bermula `= + - @ TAB CR` diawali `'` |
| XSS | Guna pembantu `el()` (text node). Tiada `innerHTML` untuk data pengguna |
| Fail | Gambar: JPEG/PNG/WEBP, 10MB (had sedia ada). Tandatangan: PNG sahaja, semak magic bytes, maksimum 150KB dan 800x300px. Fail dirujuk melalui ID yang dimuat naik oleh pengguna sama (corak `upload:<slug>:<id>` sedia ada) |
| Hidang fail | `GET /karakter/fail/<fileId>?rekod=<id>`: Worker semak pengguna boleh baca rekod itu, kemudian stream daripada Drive. Tiada `ANYONE_WITH_LINK` |
| Tandatangan | Hanya `PemilikEmail == sesi.email` boleh melekat tandatangan miliknya. Admin tidak boleh tandatangan bagi pihak guru |
| Integriti | `KandunganHash` (SHA-256) dikira di Worker semasa simpan dan tandatangan |
| Rate limit | Had saiz badan, had 120 permintaan tulis seminit setiap sesi (KV counter ringkas) |
| Audit | Setiap tulis dan setiap penolakan akses direkod dalam `AuditLog` (F-15) |
| Lesen | Pengawal sedia ada menyekat semua POST bila lesen tamat. Baca, PDF dan eksport kekal |
| Header | Teruskan `_headers` sedia ada. Pastikan `connect-src 'self'` dan `img-src 'self' data: blob:` |

Perlu dijalankan sebelum go-live: `cybersecurity-pdpa-checklist` dan `pentest-checklist` (Fasa 6).

## 6. PDPA

- Data dikumpul: nama guru, emel, kelas, subjek, catatan aktiviti, gambar (mungkin memaparkan murid), tandatangan. Tiada IC, telefon atau alamat murid.
- Pengawal data ialah sekolah. Data berada dalam Drive admin sekolah. AnnurPro hanya menyimpan metadata sekolah, lesen dan token tersulit (sedia ada).
- Teks akuan (`CONSENT_TEXT` sedia ada) dipaparkan dan kotak akuan wajib bila ada gambar.
- Pemadaman: admin sekolah boleh padam laporan (soft delete) dan boleh buang baris atau fail secara manual dalam Drive. Pemadaman automatik di luar skop.

## 7. Prestasi dan had platform

- Setiap permintaan guru membuat sekurang-kurangnya dua bacaan Sheets (tab Guru, tab sasaran). **Perlu disahkan:** kuota semasa Sheets API ialah per pengguna (akaun admin) dan per projek. Sekolah besar dengan ramai guru hantar serentak mungkin menghampiri had per minit.
- Mitigasi: borang `config` dimuat sekali dan di-cache dalam browser. Senarai laporan berhalaman 20 baris. Statistik dikira dalam satu bacaan tab `KarakterRekod`. Jika ujian beban menunjukkan masalah, tambah cache KV 30 saat untuk bacaan tab `KarakterGuruKelas` dan `Senarai` (dibatalkan bila tulis).
- Anggaran 8,000 baris setahun, 24 kolum: jauh di bawah had 10 juta sel. Kolum `Sesi` memudahkan arkib kemudian.
- Hantar laporan: guru memuat naik gambar satu demi satu (`/fail`), kemudian satu POST rekod. Bukan satu badan besar.

## 8. Sokongan browser dan peranti

Chrome, Edge, Safari iOS 15+, Firefox semasa. Kanvas tandatangan guna Pointer Events (jari, stylus, tetikus) dan `touch-action: none` pada kanvas supaya skrol tidak mengganggu.

## 9. Pengujian

- Unit (`node --test tests/*.test.js`): `pasangSkemaKarakter` idempoten, jadual akses (setiap peranan x setiap laluan), pengesahan input, hash, sanitasi CSV, penapisan guru kelas.
- E2E (`npm run e2e`): Google dan KV palsu (`tests/palsu.js`), aliran: admin setup, guru hantar dengan tandatangan, guru kelas lihat, admin dashboard dan eksport, lesen tamat menyekat tulis.
- Pastikan semua hos luar disekat dalam e2e (tiada CDN).

## 10. Deploy

Branch `karakter` -> PR -> merge `main` -> Cloudflare Workers Builds deploy automatik. Tiada secret baharu, tiada KV baharu, tiada domain baharu. Naikkan versi cache aset jika ada. Kemas kini penerangan borang BCL kepada "Annur OPR (termasuk e-Karakter)".

## Andaian

1. Pelan percuma Cloudflare dan kuota Google cukup untuk fasa pilot.
2. `terimaFail` dan `hantarFail` dalam `worker.js` boleh dilanjutkan tanpa pecahkan OPR (akan disahkan membaca kodnya pada Fasa 2).
3. `html2pdf.bundle` sedia ada boleh jana PDF landskap berbilang muka. **Perlu disahkan** pada Fasa 5, sandaran: tangkap setiap muka kepada kanvas dan susun dengan jsPDF dalam bundle yang sama.

## Soalan terbuka

1. Adakah font Inter/Plus Jakarta dari prototype lama perlu dikekalkan dalam PDF? Jika ya, salin fail font ke `public/vendor/` (tiada Google Fonts). Lalai: guna stack font OPR.

## Aliran PDF automatik (kemas kini 26/11/2026)

1. Guru tekan Hantar. Worker simpan rekod dan pulangkan `id` serta data penuh.
2. Pelayar render templat A4 (S-03) di luar skrin, jana PDF dengan html2pdf, kemudian muat naik ke `/karakter/rekod/<id>/pdf` (POST, jenis `pdf`, PDF sahaja, magic bytes `%PDF`, maksimum 2MB).
3. Worker semak pemilik rekod, simpan dalam subfolder `PDF` (nama `Laporan_Karakter_<Kelas>_<Tarikh>_<ID>.pdf`), tulis `PdfFileId` dan `PdfPada`. Jika `PdfFileId` sudah ada, kandungan fail itu ditimpa (bukan fail baharu) supaya Drive tidak penuh dengan versi lama.
4. Edit laporan atau tandatangan semula: pelayar jana semula dan timpa.
5. Had yang perlu diterima: PDF hanya dijana bila guru buka app dan hantar. Jika tab ditutup sebelum muat naik siap, rekod tersimpan tetapi PDF belum ada. Sandaran: status "PDF belum siap" pada senarai, dan butang Jana Semula untuk pemilik. Admin boleh jana semula bagi mana-mana rekod yang `PdfPada` kosong atau lebih lama daripada `DikemaskiniPada`.
6. Baca PDF melalui Worker selepas semak akses (guru sendiri, guru kelas bagi kelasnya, admin). Tiada pautan awam.
7. Anggaran storan: 8,000 laporan x kira-kira 0.5 hingga 1MB = 4 hingga 8GB setahun. Fail disimpan dalam Drive akaun admin sekolah (bukan akaun guru), jadi kuota admin yang terpakai. Dr. Ruz sahkan storan bukan kekangan. Pemampatan gambar tidak lagi keutamaan.
