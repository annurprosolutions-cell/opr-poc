# 00 - Keputusan yang mengatasi dokumen 01 hingga 05

Dokumen 01 hingga 05 ialah reka bentuk asal e-Karakter (26/11/2026). Keputusan di bawah dibuat selepas semakan dan **mengatasi** dokumen itu jika bercanggah. Baca fail ini dahulu.

## Keputusan 26-27/11/2026

| # | Perkara | Keputusan | Kesan pada dokumen |
|---|---|---|---|
| 1 | Lesen tamat vs PDF | Rekod baharu disekat. Muat naik PDF bagi rekod **sedia ada** dibenarkan walaupun lesen tamat | TRD 5 (Lesen), PRD F-14. Dibina pada Fasa 3 |
| 2 | Harga | e-Karakter termasuk dalam RM20/bulan atau RM200/tahun. Tiada caj tambahan | Tiada |
| 3 | Branch | Kerja terus di `main` (tiada branch `karakter`, tiada PR) | TRD 10, IPD 0.1 |
| 3b | Navigasi | **Bukan tab baharu.** Selepas log masuk di `/s/<slug>`, pengguna pilih modul pada skrin depan: dua kad "OPR" dan "Pembentukan Karakter". Pilihan terakhir diingat dalam browser, pautan "Tukar modul" di header, `?m=karakter` kekal sebagai pautan terus, demo turut papar dua kad | AFD S-01, DBD 3 (pensuis modul) |
| 4 | Laluan pemilik platform | Kekal `/pemilik` | PRD R-04 |
| 5 | Storan | Admin sekolah guna akaun edu (3 TB). Storan bukan kekangan | TRD 7 |
| 6 | Kuota Sheets API | Diterima; uji beban lebih awal jika perlu | TRD 7 |
| 7 | PDF landskap dashboard | Sahkan pada Fasa 5, sandaran dalam TRD | IPD 5.5 |
| 8 | Gambar | **Dimampat** di browser (maks 4, 900px) | TRD andaian 7 dibatalkan |
| 9 | Subjek/kelas "Lain-lain" | Admin boleh lihat nilai "Lain-lain" yang ditaip guru dan tambah ke senarai rasmi | Tambahan pada S-08 (Fasa 1) |
| 10 | Kolum `Sesi` | Dinamakan **`TahunSesi`** | BSD 2.1 kolum 19 |
| 11 | Chart.js | Salinan tempatan dalam `public/vendor/` | Tiada |
| 12 | Sasaran jualan | Tiada tarikh sasaran; jualan berterusan | IPD soalan terbuka 1 |
| 13 | Prototype Apps Script lama | Sudah ditutup oleh pemilik | IPD 6.9 selesai |
| 14 | **Pangkalan data asing** | e-Karakter guna **Google Sheet berasingan** daripada OPR (bukan tab tambahan dalam Sheet OPR) | BSD 1, 2, 9; TRD 2, 4; IPD Fasa 0 |

## Butiran keputusan 14 (Sheet asing)

- **Sheet OPR tidak disentuh.** Kekal `VERSI_SKEMA = 1`, tiada tab atau kategori baharu.
- **Sheet e-Karakter**: `Annur OPR - <sekolah> (e-Karakter)`, dalam folder sekolah bersebelahan Sheet OPR. Tab: `KarakterRekod`, `KarakterGuruKelas`, `KarakterTtd`, `Senarai` (kategori `KARAKTER_*`), `Tetapan` (kunci `KRK_*` dan `VERSI_SKEMA` sendiri, kini 1), `AuditLog` (tindakan `KARAKTER_*`).
- **Dikongsi, satu sumber dalam Sheet OPR:** tab `Guru` (peranan; nyahaktif guru berkuat kuasa untuk kedua-dua modul) dan identiti sekolah dalam `Tetapan` OPR (nama, alamat, logo).
- **Drive:** folder `e-Karakter` di bawah folder sekolah, dengan subfolder `PDF`, `Lampiran`, `Tandatangan`.
- **KV:** `school:<slug>.karakter = { folderId, subfolder: {PDF, LAMPIRAN, TTD}, sheetId, sheetDalamFolder, versiSkema, sediaPada }`. Kunci sementara `kunci:karakter:<slug>` (60 saat) semasa pemasangan.
- **Bila dicipta:**
  1. Sekolah baharu: semasa setup Drive, serentak dengan Sheet OPR. Jika gagal, OPR tetap siap.
  2. Sekolah sedia ada: automatik pada permintaan `/karakter/*` pertama oleh **admin**. Guru biasa mendapat 409 sehingga admin membuka modul sekali.
  3. Butang sandaran admin `POST /karakter/skema/pasang`: semak penuh, cipta semula tab yang dipadam, seed kategori atau kunci yang hilang tanpa menimpa suntingan.
- Risiko diterima: jika Sheet OPR dipadam, kedua-dua modul terjejas kerana peranan guru berada di situ (sama seperti OPR sekarang).

## Status fasa

| Fasa | Status |
|---|---|
| 0 Sheet asing dan pemasangan | Siap 27/11/2026 |
| 1 Setup sekolah dan skrin pilihan modul | Siap 27/11/2026 |
| 2 Borang dan rekod | Siap 27/11/2026 |
| 3 Tandatangan dan PDF | Siap 27/11/2026 |
| 4 Laporan Saya dan Kelas | Siap 27/11/2026 |
| 5 Dashboard dan eksport | Siap 27/11/2026 (lihat risiko CPU di bawah) |
| 6 Demo, panduan, keselamatan | Siap 27/11/2026, kecuali 6.8 (ujian sekolah pilot) |

## Nota pelaksanaan Fasa 1

- **Laluan:** `GET /karakter/config` (semua peranan), `GET /karakter/setup` (admin, satu bacaan untuk Setup dan Panduan), `POST /karakter/senarai`, `POST /karakter/gurukelas`, `POST /karakter/tetapan` (admin). Senarai e-Karakter guna laluan sendiri `/karakter/senarai` (bukan `/senarai` OPR) kerana disimpan dalam Sheet e-Karakter.
- **Senarai disimpan seluruh kategori sekaligus** (susunan = susunan dihantar). Item dinyahaktif kekal dengan `Aktif = TIDAK`. Pendua (huruf besar/kecil) dibuang. Had: kelas dan subjek 60 aksara, maksimum 200; teras 40 aksara, maksimum 12, sekurang-kurangnya satu aktif.
- **Huraian teras** disimpan bersama senarai teras (satu permintaan) dalam `KRK_TERAS_HURAIAN`.
- **Panduan Mula Pantas** dikira di server. Penanda dalaman `KRK_SIAP_KELAS`, `KRK_SIAP_SUBJEK`, `KRK_SIAP_TERAS`, `KRK_SIAP_TETAPAN` (tidak dihantar kepada guru).
- **Pemetaan guru kelas** disimpan sekaligus; guru mesti aktif dalam tab Guru OPR, kelas mesti aktif. Pemetaan yatim dipaparkan sebagai amaran.
- **Pilihan modul dipapar kepada admin sahaja buat masa ini.** Guru terus ke OPR sehingga borang e-Karakter siap (Fasa 2), supaya sekolah percubaan tidak nampak modul separuh siap. `KRK_AKTIF` akan dikuatkuasakan untuk guru pada Fasa 2. Demo `/s/demo` belum ada e-Karakter (Fasa 6).
- **Keputusan 9 (nilai "Lain-lain")** dipindah ke Fasa 2, kerana nilai itu hanya wujud selepas guru menghantar laporan.
- Video tutorial OPR 01 (daftar sekolah) belum menunjukkan skrin pilihan modul. Rakam semula dengan `npm run video 01` bila perlu.

## Nota pelaksanaan Fasa 2

- **Laluan:** `POST /karakter/fail?jenis=lampiran` (gambar ke `e-Karakter/Lampiran`, jenis disemak melalui bait sebenar, rekod tergantung `upload:<slug>:<id>` jenis `krk-lampiran` 1 hari), `POST /karakter/rekod` (cipta/kemas kini), `GET /karakter/rekod?skop=saya|semua&halaman&cari&kelas&subjek&teras&dari&hingga` (20 sebaris halaman; `semua` admin sahaja), `GET /karakter/rekod/<id>`, `POST /karakter/rekod/<id>/padam` (soft delete), `GET /karakter/fail/<fileId>?rekod=<id>`.
- **Akses baca rekod (Fasa 2):** pemilik dan admin. Guru kelas bagi kelasnya ditambah pada Fasa 4.
- **Edit:** pemilik sahaja; admin tidak mengedit laporan guru lain tetapi boleh memadam. Edit memadam `TtdFileId`/`TtdPada` dan mengira semula `KandunganHash`. Gambar yang dibuang semasa edit dihantar ke Tong Sampah selepas baris disimpan.
- **ID:** `KRK-<tarikh hari ini MYT>-<5 aksara>` (tanpa aksara keliru seperti O/0, I/1).
- **TahunSesi** dibaca daripada `TAHUN_SESI` dalam Tetapan OPR (sandaran: tahun tarikh laporan).
- **Had mundur tarikh** dikenakan pada cipta dan edit oleh guru (laporan lebih lama daripada had tidak boleh diedit oleh guru). Admin tiada had.
- **Kelas/subjek "Lain-lain"** diterima sebagai teks bebas (maks 60 aksara). Admin nampak senarai nilai ini dengan bilangan laporan dalam Setup > Kelas / Mata Pelajaran dan boleh menambahnya ke senarai rasmi (keputusan 9).
- **Draf setempat:** teks borang disimpan dalam browser (bukan gambar) dan dipulihkan selepas muat semula; dikosongkan selepas hantar.
- **Akses guru kepada modul masih ditutup** (pilihan modul hanya untuk admin). Admin boleh menguji borang sepenuhnya. Dibuka kepada guru pada Fasa 3 bila tandatangan dan PDF siap, supaya guru tidak menghantar laporan tanpa PDF. `KRK_AKTIF = TIDAK` sudah dikuatkuasakan di server (guru tidak boleh hantar).
- Ikon SVG pada kad teras (DBD 2) belum dibuat; kad guna warna teras dan nama sahaja.

## Nota pelaksanaan Fasa 3

- **Modul kini dibuka kepada guru.** Guru nampak skrin pilihan modul bila admin sudah membuka e-Karakter sekali (Sheet wujud) dan `KRK_AKTIF` bukan `TIDAK`. Jika tidak, guru terus ke OPR.
- **Laluan:** `POST /karakter/fail?jenis=ttd` (PNG sahaja, semak bait, maks 150KB dan 800x300, ke `e-Karakter/Tandatangan`), `GET /karakter/ttd`, `POST /karakter/ttd {fileId}` (simpan untuk guna semula), `POST /karakter/ttd/padam`, `GET /karakter/ttd/gambar` (milik sendiri sahaja), `POST|GET /karakter/rekod/<id>/pdf`.
- **Tandatangan pada laporan:** `ttdFileId` dalam `POST /karakter/rekod` mesti tandatangan tersimpan pengguna itu sendiri atau fail tandatangan yang baru dimuat naiknya. Admin tidak boleh menandatangani bagi pihak guru (tiada laluan untuk mengedit laporan orang lain). Edit tanpa tandatangan semula memadam tandatangan.
- **Tandatangan tersimpan diganti/dipadam:** fail lama dibuang ke Tong Sampah hanya jika tiada laporan merujuknya (BSD 2.3).
- **PDF:** dijana oleh pelayar selepas Hantar dan dimuat naik (maks 2MB, semak `%PDF-`) ke `e-Karakter/PDF` dengan nama `Laporan_Karakter_<Kelas>_<Tarikh>_<ID>.pdf`. Jana semula menimpa kandungan fail yang SAMA (Drive `uploadType=media`), bukan fail baharu. Pemilik atau admin boleh jana semula.
- **Status PDF:** `tiada`, `siap`, `lapuk`. Edit laporan mengosongkan `PdfPada` (fail PDF kekal) supaya status `lapuk` tidak bergantung pada jam; PDF dijana semula sejurus selepas edit disimpan.
- **Keputusan 1 dilaksanakan:** `POST /karakter/rekod/<id>/pdf` dibenarkan walaupun lesen tamat; laporan baharu disekat (402).
- **Susun atur PDF:** A4 potret 794 x 1122 px, satu muka untuk 0 hingga 4 gambar (diuji dengan 12 teras dan catatan panjang). Catatan yang tidak muat dipotong dengan "..." dalam PDF sahaja. Dengan 3 hingga 4 gambar dan banyak teras, ruang catatan dalam PDF hanya kira-kira 3 baris.
- **Logo** diambil daripada Logo 1 modul OPR; nama, alamat, telefon dan warna kotak (`WARNA_2`) daripada Tetapan OPR.

## Nota pelaksanaan Fasa 4

- **`GET /karakter/rekod?skop=kelas[&kelas=X]`**: hanya laporan bagi kelas yang dipetakan kepada pengguna dalam `KarakterGuruKelas`, dikuatkuasakan di server. `kelas` di luar pemetaan, atau pengguna tanpa pemetaan, mendapat 403 dan direkod `KARAKTER_AKSES_DITOLAK`. Respons turut memulangkan `kelasDipeta`.
- **`GET /karakter/statistik?skop=kelas[&kelas=X]`**: ringkasan setiap kelas dipetakan (bilangan laporan, teras mengikut kekerapan, guru yang melapor, tarikh terkini). Statistik penuh admin ialah Fasa 5.
- **Akses baca butiran, gambar, tandatangan dan PDF** kini: admin, pemilik, atau guru kelas bagi kelas laporan itu (`bacaSahaja: true`). Edit, padam dan jana semula PDF kekal pemilik (dan admin untuk padam/jana semula).
- **Pemetaan dibaca setiap permintaan** (tiada cache), jadi perubahan oleh admin berkuat kuasa serta-merta, termasuk menarik akses kelas lama.
- **Admin yang juga guru kelas** boleh guna sub-tab Kelas Saya (tidak merugikan; admin sudah nampak semua).
- **UI:** sub-tab Saya, Kelas Saya (jika dipetakan), Semua (admin), menggantikan pemilih skop admin.

## Nota pelaksanaan Fasa 5

- **Laluan (admin sahaja):** `GET /karakter/statistik` (KPI: jumlah, kelas terlibat, guru melapor, teras tertinggi; pecahan teras ikut susunan senarai rasmi; ikut kelas dan subjek; top 5 guru; pilihan penapis termasuk nilai Lain-lain), `GET /karakter/eksport` (CSV), `GET /karakter/rekod?skop=semua&saiz=semua` (maks 1000 baris untuk PDF). Penapis: `dari`, `hingga`, `kelas`, `subjek`, `guru` (emel), `teras`, `cari`.
- **Satu fungsi penapis (`tapisRekod`)** untuk senarai, statistik, eksport dan PDF, jadi angka KPI sentiasa sepadan dengan jadual (diuji untuk setiap jenis tapisan).
- **CSV:** UTF-8 BOM, sel bermula `= + - @ TAB CR` diawali `'`, tanpa laporan dipadam, direkod `KARAKTER_EKSPORT` dengan tapisan.
- **Chart.js 4.4.1** disalin daripada pakej npm ke `public/vendor/chart.umd.min.js` (tiada CDN), dimuat hanya bila Dashboard dibuka.
- **PDF Dashboard landskap:** muka 1 KPI, donat teras + legenda teks, bar kelas (10 teratas), top 5 guru; muka 2+ jadual 15 baris (tinggi baris tetap); blok pengesahan pada muka akhir atau muka baharu; nombor muka. Setiap muka dirakam berasingan (html2pdf menambah muka pada PDF sama) supaya tiada had tinggi kanvas. Diuji: 1 laporan = 2 muka, 30 = 4 muka, 300 = 22 muka (kira-kira 6.5MB, 14 saat).
- **Pengajaran:** html2canvas tidak melukis jadual yang melimpah keluar muka (`overflow:hidden`). Kandungan sel kini dibalut `div` bertinggi tetap.

### Ujian beban (IPD 5.6) dan RISIKO had CPU Cloudflare

`npm run beban` (8,000 laporan, Google dipalsukan): pemprosesan Worker 40 hingga 140 ms setiap permintaan, jauh di bawah sasaran 4 saat. Masa rangkaian Google Sheets sebenar (membaca kira-kira 5.8MB untuk 8,000 laporan) belum diukur.

**Risiko yang perlu keputusan pemilik:** pelan percuma Cloudflare Workers memberi kira-kira 10 ms masa CPU setiap permintaan. Anggaran kos CPU untuk menghurai data `KarakterRekod`:

| Laporan | Data | CPU anggaran |
|---|---|---|
| 1,000 | 0.7 MB | ~4 ms |
| 2,000 | 1.3 MB | ~6 ms |
| 4,000 | 2.7 MB | ~15 ms |
| 8,000 | 5.3 MB | ~38 ms |

Melebihi kira-kira 2,500 laporan, permintaan senarai/dashboard/butiran mungkin ditolak oleh had CPU pelan percuma. Pilihan: (1) pelan Workers Paid (had CPU jauh lebih tinggi), (2) baca lajur tertentu sahaja dan cache ringkasan dalam KV, (3) pecahkan rekod ikut `TahunSesi`. Belum dilaksanakan; menunggu keputusan. (Angka CPU di atas diukur dalam Node pada mesin pembangunan, bukan dalam Cloudflare; perlu disahkan.)

## Nota pelaksanaan Fasa 6

- **6.1 Demo:** `public/demo-karakter.js` menjawab semua laluan `/karakter/*` dalam browser (40 laporan contoh). `/s/demo?m=karakter`, `&peranan=guru` atau `&peranan=gurukelas`.
- **6.2 Sale page:** seksyen e-Karakter dengan 5 tangkapan skrin sebenar daripada demo; harga menyebut OPR dan e-Karakter.
- **6.3 dan 6.4:** bab 16 manual (12 gambar), 4 video (setup admin, guru isi dan tandatangan, guru kelas, dashboard).
- **6.5:** tajuk borang BCL 21187 ditukar kepada "ANNUR OPR (termasuk e-Karakter)". Harga, item, webhook dan medan e-mel tidak diubah. Webhook mengesahkan ID borang, bukan tajuk.
- **6.6 Semakan keselamatan dan PDPA (7 Teknik):**
  - Lulus dan diuji: tiada fail atau Sheet dikongsi awam (tiada panggilan `permissions`); tiada kata laluan (log masuk Google); sesi rawak dalam KV, kuki `HttpOnly; Secure; SameSite=Lax`, log keluar memadam sesi di pelayan; akses dan skop dikuatkuasakan di pelayan; semakan `Origin` untuk POST; ID fail mesti milik rekod; jenis muat naik tidak boleh dikelirukan (gambar/tandatangan/OPR); tiada sink HTML (`innerHTML`) dalam UI e-Karakter; Sheets ditulis RAW dan CSV dineutralkan; lesen tamat menyekat tulis.
  - Diperbaiki: had 1MB untuk badan JSON (dahulu tiada had); polisi privasi kini menerangkan data e-Karakter, akses, tandatangan elektronik visual, tanggungjawab sekolah sebagai pengawal data dan pemindahan data ke luar Malaysia.
  - **Belum dibuat (dicatat):** (1) tiada Content-Security-Policy; skrip modul sebaris dalam `index.html` dan `daftar.html` serta Google Fonts perlu disusun semula dahulu. (2) Had kadar tulis 120 seminit (TRD) belum dibuat kerana setiap kiraan KV memakan kuota 1,000 tulisan sehari pelan percuma; buat selepas pelan berbayar. (3) Sesi 30 hari; pertimbang lebih pendek untuk admin. (4) Teks bermula `=` disimpan sebagai teks dalam Sheet; jika admin memuat turun Sheet sebagai CSV terus dari Google Sheets (bukan butang Eksport CSV), Excel mungkin mentafsirnya sebagai formula. (5) Tiada pemadaman automatik (retention) data murid; bergantung pada sekolah.
- **6.7:** semua ujian lulus dan di-deploy.
- **6.8 (pemilik):** ujian sebenar dengan satu sekolah pilot di telefon sebenar.
