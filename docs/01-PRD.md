# 01 - PRD: Modul e-Karakter dalam Annur OPR

Versi 1.0 | 26/11/2026 | Pemilik produk: Dr. Ruz (AnnurPro Solutions)

## 1. Ringkasan

e-Karakter ialah modul tambahan dalam **Annur OPR** (`opr.annurpro.com/s/<slug>`) untuk merekod pelaksanaan pembentukan karakter murid dalam setiap sesi PdP. Guru isi borang ringkas (kelas, subjek, elemen teras, catatan, gambar), tandatangan secara digital, dan jana PDF A4 satu muka. Admin sekolah nampak dashboard keseluruhan. Guru kelas nampak laporan kelasnya sahaja.

Tiada produk, domain atau lesen baharu. Sekolah yang melanggan Annur OPR (RM10/bulan atau RM100/tahun mulai 27/11/2026) terus dapat OPR dan e-Karakter sekali. Data setiap sekolah kekal dalam Google Drive admin sekolah itu sendiri, sama seperti OPR.

Ini menggantikan prototype e-Karakter lama (satu `index.html` + Apps Script untuk satu sekolah).

## 2. Masalah yang diselesaikan

| Sekarang (prototype lama) | Sasaran |
|---|---|
| Hardcode satu sekolah (SK Seri Perdana) | Banyak sekolah, setiap satu ada Sheet dan Drive sendiri |
| URL Apps Script terbuka: sesiapa boleh baca dan hantar data | Log masuk Google, akses ikut peranan, semakan di server |
| Guru boleh pilih nama guru lain | Nama guru diambil daripada akaun yang log masuk |
| Satu dashboard untuk semua orang | Admin: dashboard penuh. Guru kelas: kelasnya sahaja. Guru: laporan sendiri |
| Gambar murid dikongsi "anyone with link" | Gambar disimpan dalam Drive sekolah, dihidang melalui Worker selepas semakan akses |
| Tiada tandatangan guru | Tandatangan digital guru atas laporan dan PDF |
| Tarikh disimpan sebagai teks | Tarikh ISO, boleh tapis ikut julat |

## 3. Pengguna dan peranan

| ID | Peranan | Siapa | Boleh buat |
|---|---|---|---|
| R-01 | Admin Sekolah | Admin utama (pemilik) dan admin yang dilantik dalam tab Guru | Setup kelas, subjek, teras, guru kelas, tetapan. Dashboard, semua laporan, eksport |
| R-02 | Guru | Akaun aktif dalam tab Guru | Isi dan hantar laporan, tandatangan, lihat dan edit laporan sendiri, jana PDF |
| R-03 | Guru Kelas | Guru yang admin petakan kepada satu atau lebih kelas | Semua R-02, tambah baca sahaja laporan semua guru bagi kelas yang dipetakan |
| R-04 | Pemilik Platform | AnnurPro (`/pemilik`) | Urus lesen sahaja. Tiada akses kepada data laporan karakter |

R-03 bukan nilai baharu dalam tab Guru. Ia dikira daripada pemetaan guru kepada kelas (F-04).

## 4. Skop

### Dalam skop
Semua F-01 hingga F-15 di bawah.

### Luar skop (versi ini)
- Tandatangan pengesah/pentadbir secara digital (ruang pengesah dalam PDF dibiar untuk cap dan tandatangan basah)
- Tandatangan digital berperakuan (PKI, MyKad). Yang dibina ialah tandatangan elektronik visual dengan jejak audit
- Notifikasi emel atau WhatsApp
- Import data daripada Sheet e-Karakter lama
- Arkib tahunan automatik dan polisi pemadaman automatik
- Mod luar talian
- Laporan berkala automatik (mingguan, bulanan)

## 5. Feature

Setiap feature ada ID yang dirujuk oleh AFD, BSD dan IPD.

| ID | Feature | Peranan | Kriteria penerimaan |
|---|---|---|---|
| F-01 | **Modul e-Karakter dalam app OPR.** Pensuis "OPR / e-Karakter" pada header. Struktur Sheet dinaik taraf automatik bagi sekolah sedia ada | R-01, R-02, R-03 | Sekolah OPR sedia ada boleh buka e-Karakter tanpa langkah manual. Naik taraf boleh diulang tanpa merosakkan data. OPR tidak terjejas |
| F-02 | **Senarai Kelas dan Mata Pelajaran.** Admin tambah, ubah, nyahaktif, tampal pukal. Seed contoh SK dan SMK | R-01 | Dropdown borang hanya tunjuk item aktif. Item dinyahaktif tidak hilang daripada laporan lama |
| F-03 | **Elemen Teras.** Empat teras lalai (Penyayang, Berdaya Tahan, Berupaya Memimpin, Warganegara Aktif). Admin boleh tambah, ubah nama, nyahaktif, dan tulis huraian ringkas | R-01 | Teras baharu muncul dalam borang, dashboard dan PDF. Laporan lama kekal dengan nama teras asal |
| F-04 | **Pemetaan Guru Kelas.** Admin pilih guru dan kelas. Satu guru boleh pegang beberapa kelas, satu kelas boleh ada lebih daripada satu guru kelas | R-01 | Guru yang dipetakan nampak tab Laporan Kelas, terhad kepada kelasnya. Tukar pemetaan berkuat kuasa serta-merta |
| F-05 | **Borang Laporan Karakter.** Tarikh, masa, kelas, subjek (bebas pilih mana-mana, ada "Lain-lain" untuk taip sendiri), satu atau lebih teras, tajuk, catatan. Nama guru automatik daripada akaun | R-02, R-03, R-01 | Hantar berjaya hanya bila medan wajib lengkap. Nama guru tidak boleh diubah. Tarikh tidak boleh melebihi hari ini |
| F-06 | **Lampiran gambar.** Maksimum 4, mampat di browser, kapsyen pilihan, akuan kebenaran ibu bapa/penjaga | R-02, R-03, R-01 | Gambar tersimpan dalam Drive sekolah. Tiada pautan awam. Kotak akuan wajib bila ada gambar |
| F-07 | **Tandatangan digital guru.** Lukis dengan jari atau tetikus, atau muat naik imej. Boleh simpan sekali dan guna semula. Tandatangan dilekat semasa hantar | R-02, R-03, R-01 | Hanya pemilik laporan boleh tandatangan. Edit kandungan selepas tandatangan memadam tandatangan, guru perlu tandatangan semula. Tandatangan muncul dalam pratonton dan PDF |
| F-08 | **Pratonton A4 dan PDF satu muka, disimpan dalam Drive.** Susun atur sama seperti laporan sedia ada (kepala surat sekolah, jadual maklumat, teras, catatan, gambar, tandatangan). Sebaik guru tekan Hantar, sistem jana PDF dan simpan dalam Drive sekolah. Edit atau tandatangan semula menggantikan PDF lama (fail sama) | R-02, R-03, R-01 | PDF A4 portrait satu muka walau 0 hingga 4 gambar. Logo, nama dan kod sekolah ikut Tetapan. Selepas Hantar, PDF muncul dalam folder `PDF` Drive tanpa guru buat apa-apa. Jika penjanaan gagal, laporan tetap tersimpan, status "PDF belum siap" dan butang Jana Semula keluar |
| F-09 | **Laporan Saya.** Senarai, cari, tapis, buka butiran, edit, padam sendiri (soft delete), muat turun PDF | R-02, R-03, R-01 | Guru hanya nampak laporan sendiri. Padam tidak membuang data daripada Sheet |
| F-10 | **Laporan Kelas.** Senarai dan ringkasan laporan semua guru bagi kelas dipetakan. Baca sahaja, boleh muat turun PDF | R-03 | Guru kelas tidak boleh nampak kelas lain. Tidak boleh edit atau padam laporan guru lain |
| F-11 | **Dashboard Admin.** KPI (jumlah laporan, kelas terlibat, guru aktif, teras tertinggi), carta pecahan teras, carta ikut kelas atau subjek, top 5 guru, penapis (julat tarikh, kelas, subjek, guru, teras, carian), jadual berhalaman, butiran | R-01 | Angka sepadan dengan jadual selepas tapisan. Guru biasa dan guru kelas mendapat 403 jika cuba akses |
| F-12 | **Eksport.** CSV mengikut tapisan aktif dan PDF Dashboard landskap (muka 1 carta dan KPI, muka seterusnya jadual) | R-01 | CSV buka betul dalam Excel (UTF-8 BOM) dan sel berbahaya dineutralkan. PDF mengikut tapisan aktif |
| F-13 | **Tetapan e-Karakter.** Kod sekolah, tajuk dokumen, nama dan jawatan pengesah, wajib tandatangan (ya/tidak), huraian teras | R-01 | Perubahan terpakai pada pratonton dan PDF seterusnya |
| F-14 | **Lesen, demo, sale page, panduan.** Guna lesen OPR sedia ada. Mod demo `/s/demo` ada e-Karakter. Seksyen e-Karakter pada sale page. Manual dan video | R-01, R-04 | Lesen tamat menyekat tulis tetapi baca dan PDF kekal. Demo berfungsi tanpa log masuk |
| F-15 | **Audit dan keselamatan.** Setiap tulis direkod dalam AuditLog. Semakan akses di server pada setiap permintaan | Semua | Percubaan akses tanpa kebenaran ditolak dan direkod |

## 6. Keperluan bukan fungsi

- **Telefon dahulu.** Guru isi borang dan tandatangan di telefon. Semua skrin boleh digunakan pada 360px.
- **Kelajuan.** Borang terbuka dalam kurang 2 saat pada 4G. Hantar laporan (4 gambar) kurang 10 saat. Dashboard dimuat kurang 4 saat bagi 5,000 rekod (perlu disahkan melalui ujian beban).
- **Privasi (PDPA).** Data murid dan gambar hanya dalam Drive admin sekolah. Teks akuan persetujuan dipaparkan. Tiada data dihantar ke pihak ketiga.
- **Kos.** Kekal dalam pelan percuma Cloudflare dan Google selagi boleh. Tiada CDN luar.
- **Bahasa.** Bahasa Melayu.

## 7. Metrik kejayaan

- Sekolah yang melanggan OPR dan mengaktifkan e-Karakter tanpa bantuan: sasaran 8 daripada 10
- Masa daripada "buka borang" ke "PDF siap": kurang 3 minit
- Tiada insiden akses merentas sekolah atau merentas guru dalam ujian keselamatan

## 8. Andaian

1. Satu laporan mewakili satu sesi PdP (satu kelas, satu subjek, satu tarikh). Guru boleh hantar banyak laporan.
2. Anggaran beban untuk reka bentuk: sekolah sehingga 80 guru, sehingga 8,000 laporan setahun. **Perlu disahkan** dengan sekolah pertama.
3. Nama dan jawatan pengesah ditetapkan sekali oleh admin dalam Tetapan, bukan ditaip setiap laporan.
4. Guru boleh pilih "Lain-lain" dan taip kelas atau subjek sendiri. Nilai ini tidak masuk senarai rasmi.
5. Guru boleh mundurkan tarikh sehingga 30 hari. Tidak boleh tarikh akan datang. Admin tiada had.
6. Tandatangan ialah tandatangan elektronik visual dengan jejak audit (emel, masa, cap jari kandungan). Bukan tandatangan digital berperakuan.
7. Edit laporan selepas ditandatangani memadam tandatangan, guru perlu tandatangan semula.
8. PDF dijana oleh pelayar guru sebaik laporan dihantar dan disimpan automatik dalam Drive sekolah (subfolder `PDF`). Disahkan Dr. Ruz pada 26/11/2026.
9. Satu guru boleh jadi guru kelas untuk beberapa kelas, dan satu kelas boleh ada beberapa guru kelas.
10. Guru kelas nampak laporan semua guru bagi kelasnya, bukan laporannya sahaja.
11. Tiada migrasi data prototype lama (data dalam Sheet ujian ialah data cubaan).
12. Elemen teras tiada format rasmi. Empat teras ialah lalai yang boleh diubah.

## 9. Soalan terbuka

1. Berapa kerap guru biasanya hantar laporan (setiap kelas, setiap hari, atau mingguan)? Ini mengubah anggaran beban dan keperluan arkib.
2. Pengesah (Guru Besar, Pengetua) mahu tandatangan digital juga dalam versi seterusnya?
3. Adakah sekolah pertama mahu data prototype lama diimport?
4. Had mundur tarikh 30 hari sesuai, atau mahu lebih panjang?

## Changelog

- 26/11/2026 (2): PDF kini wajib disimpan dalam Drive secara automatik selepas Hantar (andaian 8 diubah). Andaian 1 hingga 4 disahkan.
- 26/11/2026: draf pertama berdasarkan jawapan Dr. Ruz (add-on dalam Annur OPR, akses ikut peranan, tandatangan guru, SK dan SMK, harga sama).
