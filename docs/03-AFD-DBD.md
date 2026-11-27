# 03 - AFD: App Flow e-Karakter

Rujuk: PRD (F-xx, R-xx), TRD. Semua skrin berada dalam `/s/<slug>`; modul dipilih melalui pensuis pada header (`?m=karakter` untuk pautan terus).

## 1. Peta skrin

| ID | Skrin | Peranan | Feature |
|---|---|---|---|
| S-01 | Pensuis modul (OPR / e-Karakter) dan navigasi tab | R-01, R-02, R-03 | F-01 |
| S-02 | Borang Karakter | R-01, R-02, R-03 | F-05, F-06, F-07 |
| S-03 | Pratonton A4 (panel kanan di desktop, tab "Pratonton" di telefon) | R-01, R-02, R-03 | F-08 |
| S-04 | Modal Tandatangan | R-01, R-02, R-03 | F-07 |
| S-05 | Laporan (sub-tab "Saya" dan "Kelas Saya") | R-01, R-02, R-03 | F-09, F-10 |
| S-06 | Butiran Laporan (modal) | R-01, R-02, R-03 | F-09, F-10, F-08 |
| S-07 | Dashboard Karakter | R-01 | F-11, F-12 |
| S-08 | Setup Karakter (sub-tab: Kelas, Subjek, Teras, Guru Kelas, Tetapan, Struktur) | R-01 | F-02, F-03, F-04, F-13, F-01 |
| S-09 | Dokumen PDF Dashboard (output, A4 landskap) | R-01 | F-12 |
| S-10 | Panduan Mula Pantas (kali pertama admin) | R-01 | F-01, F-02, F-03, F-04 |

Tab navigasi mengikut peranan:

| Peranan | Tab e-Karakter yang kelihatan |
|---|---|
| R-02 Guru | Borang, Laporan (Saya) |
| R-03 Guru Kelas | Borang, Laporan (Saya, Kelas Saya) |
| R-01 Admin | Borang, Laporan (Saya), Dashboard, Setup |

## 2. Aliran pengguna

### 2.1 Admin: daripada daftar hingga guru boleh guna (R-01)

```
Daftar sekolah (OPR sedia ada) -> sambung Google -> Sheet dan folder dicipta
   -> buka pensuis "e-Karakter"
   -> [auto] naik taraf skema (TRD seksyen 4)
   -> S-10 Panduan Mula Pantas:
        1. Guru: tambah/tampal senarai guru (tab Guru OPR sedia ada, dikongsi)
        2. Kelas: tampal senarai kelas            (S-08 Kelas)
        3. Subjek: tampal senarai mata pelajaran  (S-08 Subjek)
        4. Guru kelas: pilih guru bagi setiap kelas (S-08 Guru Kelas, pilihan)
        5. Teras: semak empat teras lalai, tambah jika perlu (S-08 Teras)
        6. Tetapan: kod sekolah, nama dan jawatan pengesah (S-08 Tetapan)
   -> kongsi pautan /s/<slug> kepada guru
```

Langkah 1 dan 5 sudah ada nilai lalai. Admin boleh langkau dan kembali kemudian. Panduan menunjukkan tanda siap bagi setiap langkah.

### 2.2 Guru: hantar laporan (R-02, R-03, R-01)

```
Buka /s/<slug> -> Log masuk Google -> pensuis e-Karakter -> S-02 Borang
   -> tarikh dan masa (lalai: sekarang)
   -> pilih kelas, subjek (atau "Lain-lain" -> taip)
   -> tanda satu atau lebih teras
   -> tajuk aktiviti, catatan (butang "Cadangan Ayat" pilihan)
   -> tambah gambar (maksimum 4) -> kapsyen -> tanda akuan kebenaran
   -> S-03 Pratonton (semak)
   -> Tandatangan: S-04 (lukis / upload / guna tersimpan) 
   -> Hantar
        sah: simpan dalam KarakterRekod, audit
        gagal: mesej ralat, data borang kekal
   -> Pilihan: Muat Turun PDF (S-06), Isi borang baharu
```

Pilihan: Simpan sebagai draf tidak ada dalam versi ini. Borang kekal dalam browser jika halaman dimuat semula (draf setempat), dan dikosongkan selepas hantar.

### 2.3 Guru: lihat dan edit laporan sendiri

```
S-05 Laporan -> Saya -> cari/tapis -> klik baris -> S-06 Butiran
   -> Muat Turun PDF
   -> Edit  -> kembali ke S-02 dengan data terisi 
              (jika tandatangan wujud: amaran "Tandatangan akan dipadam, perlu tandatangan semula")
   -> Padam -> pengesahan -> soft delete
```

### 2.4 Guru kelas: laporan kelas (R-03)

```
S-05 Laporan -> Kelas Saya -> pilih kelas (hanya kelas dipetakan)
   -> ringkasan kelas (bil. laporan, teras terbanyak, guru yang melapor)
   -> senarai laporan semua guru bagi kelas itu -> S-06 Butiran (baca sahaja) -> PDF
```

### 2.5 Admin: dashboard (R-01)

```
S-07 Dashboard -> tetapkan tapisan (julat tarikh, kelas, subjek, guru, teras, carian)
   -> KPI, carta teras, carta kelas/subjek, top 5 guru, jadual berhalaman
   -> klik baris -> S-06 Butiran
   -> Eksport CSV | Muat Turun PDF Dashboard (S-09), kedua-duanya ikut tapisan aktif
```

### 2.6 Tandatangan (F-07)

```
S-04 Modal Tandatangan
  Tab "Lukis":   kanvas -> Padam -> Guna
  Tab "Upload":  pilih imej -> auto trim dan kecilkan -> Guna
  Tab "Tersimpan" (jika ada): pratonton -> Guna
  Kotak: "Simpan untuk laporan akan datang" (lalai: ya)
  Guna -> tandatangan dipaparkan dalam S-03 -> dihantar bersama laporan
```

## 3. Kandungan skrin

### S-02 Borang Karakter
Medan: Tarikh (F-05), Masa (F-05), Kelas (dropdown + Lain-lain) (F-05), Mata Pelajaran (dropdown + Lain-lain) (F-05), Guru Pelaksana (papar sahaja, daripada akaun) (F-05), Elemen Teras (kad boleh tanda) (F-03, F-05), Tajuk Aktiviti (F-05), Huraian dan Impak (F-05), Gambar dan kapsyen (F-06), Akuan kebenaran (F-06), Tandatangan (F-07), butang Hantar (selepas itu PDF dijana dan disimpan automatik dengan penunjuk "Menjana PDF..." kemudian "PDF disimpan"), butang Muat Turun PDF, butang Jana Semula jika PDF gagal.
Pelayan menolak hantar jika: tiada teras, tiada catatan, tarikh akan datang, tandatangan wajib tetapi tiada (jika F-13 ditetapkan), lesen tamat.

### S-03 Pratonton A4
Kepala surat (logo, nama, alamat, kod sekolah, tajuk dokumen), jadual maklumat (tarikh dan hari, masa, kelas, subjek, guru), kotak teras (bertanda), catatan, grid gambar 1 hingga 4, blok tandatangan: kiri "Disediakan oleh" dengan imej tandatangan guru, nama, jawatan "Guru Pelaksana", tarikh. Kanan "Disahkan oleh" dengan nama dan jawatan daripada Tetapan, ruang cap rasmi. Pengaki: rujukan laporan dan cap jari kandungan.

### S-05 Laporan
Carian, tapis (tarikh, kelas, subjek, teras), senarai kad (telefon) atau jadual (desktop), halaman 20 baris. Lencana: bilangan gambar, ada tandatangan.

### S-07 Dashboard Karakter
Empat KPI, carta donat teras, carta bar (butang tukar Kelas / Subjek), panel Top 5 guru, bar tapisan, jadual (ID dan tarikh, kelas dan subjek, guru, teras, tajuk, gambar, tindakan), butang eksport.

### S-08 Setup Karakter
Sub-tab Kelas, Subjek, Teras (senarai boleh tambah, ubah, nyahaktif, tampal pukal, susun), Guru Kelas (jadual guru x kelas dengan pilihan berbilang), Tetapan (F-13), Struktur (status versi skema, butang pasang semula).

## 4. Keadaan khas

| Keadaan | Paparan |
|---|---|
| Belum log masuk | Butang "Log masuk dengan Google" (OPR sedia ada) |
| Akaun tiada atau dinyahaktif | Mesej OPR sedia ada |
| Lesen tamat atau percubaan tamat | Notis OPR sedia ada. Borang, tandatangan dan setup dikunci. Laporan, butiran, PDF dan eksport kekal |
| Skema sedang dinaik taraf | "Menyediakan e-Karakter untuk sekolah anda..." sekali, kemudian terus |
| Kelas tiada dalam senarai | Guru pilih "Lain-lain" dan taip |
| Tiada guru kelas dipetakan | Tab "Kelas Saya" tidak dipaparkan |
| Rangkaian putus semasa hantar | Mesej ralat, data kekal, butang cuba semula |

## 5. Semakan ID

Setiap F-01 hingga F-15 muncul dalam sekurang-kurangnya satu skrin atau aliran di atas, kecuali F-14 (lesen, demo, sale page, panduan) dan F-15 (audit, keselamatan) yang bukan skrin dan dibina dalam IPD seksyen Fasa 6 dan sepanjang fasa.

## Andaian

1. Admin yang juga mengajar nampak Borang dan Laporan (Saya) sebagai guru biasa, serta Dashboard dan Setup.
2. Tiada draf pelayan. Draf setempat dalam browser sahaja.

## Soalan terbuka

1. Perlukah guru kelas dapat eksport senarai laporan kelas ke CSV? Lalai: tidak, PDF sahaja.

---

# Bahagian 2: Design Brief (DBD)

# 04 - DBD: Design Brief e-Karakter

Rujuk: AFD (S-01 hingga S-10). Prinsip: **kekal sama dengan rupa Annur OPR** supaya guru tidak rasa dua sistem. Jangan cipta tema baharu.

## 1. Token (guna sedia ada daripada `public/app.css`)

| Token | Cerah | Gelap | Guna |
|---|---|---|---|
| `--bg` | #f4f6fb | #0b1020 | Latar |
| `--kad` | #ffffff | #141a2e | Kad, panel |
| `--teks` | #0f172a | #e6e9f2 | Teks utama |
| `--redup` | #5b6478 | #9aa3b8 | Teks sekunder |
| `--garis` | #e2e6ef | #26304a | Sempadan |
| `--utama` | #312e81 | #818cf8 | Butang utama, tab aktif |
| `--aksen` | #0f766e | #2dd4bf | Aksen, kejayaan |
| `--ok` `--amaran` `--bahaya` | #047857 / #b45309 / #b91c1c | dalam app.css | Status |
| `--jejari` | 14px | | Bucu kad |

Warna sekolah (`WARNA_1`, `WARNA_2`, `WARNA_AKSEN` dalam Tetapan) hanya digunakan **dalam dokumen PDF**, seperti OPR. Skrin app kekal token di atas.

Font: ikut stack font app.css (tiada Google Fonts). Rujuk TRD soalan terbuka tentang Inter.

## 2. Warna elemen teras

Digunakan pada kad teras (borang), lencana (jadual), donat dan legenda (dashboard). Warna lalai empat teras diambil daripada prototype lama supaya pengguna yang pernah lihat tak keliru.

| Teras | Hex | Ikon |
|---|---|---|
| Penyayang | #e11d48 | hati |
| Berdaya Tahan | #d97706 | perisai |
| Berupaya Memimpin | #4f46e5 | kompas |
| Warganegara Aktif | #059669 | glob |

Teras tambahan (urutan): #0891b2, #9333ea, #db2777, #65a30d, #ea580c, #0d9488, #7c3aed, #ca8a04. Ikon lalai: bintang. Jangan bergantung pada warna sahaja: sentiasa paparkan nama teras sebagai teks.

Ikon: inline SVG kecil (tiada Font Awesome CDN).

## 3. Komponen

| Komponen | Spesifikasi | Skrin |
|---|---|---|
| Tab navigasi | Gaya `.tab` OPR, `aria-selected`. Pensuis modul di atasnya: dua butang segmen (OPR, e-Karakter) | S-01 |
| Kad teras | Kotak 2 lajur (1 lajur di bawah 480px), sempadan 2px, tanda pilih dengan warna teras, tajuk tebal, huraian 11px `--redup`. Saiz sentuh minimum 44px | S-02 |
| Medan borang | Label di atas, input 44px tinggi, `--garis`, fokus cincin `--utama` | S-02, S-08 |
| Kawasan gambar | Kotak garis putus, butang kamera, senarai kecil 64x56 dengan kapsyen dan buang | S-02 |
| Kanvas tandatangan | Kawasan 100% lebar x 160px, latar putih, garis dasar halus, hint "Tandatangan di sini". Butang: Padam, Guna. Tiga tab: Lukis, Upload, Tersimpan | S-04 |
| Butang | `.butang` (utama), `.butang.sekunder`, bahaya untuk padam. Lebar penuh di telefon | Semua |
| KPI | Kad 4 lajur (2 lajur telefon): label huruf besar kecil, nombor 28px, sub-teks | S-07 |
| Carta | Chart.js: donat (potongan 62%), bar (maksimum ketebalan 38px, bucu 6px), tiada animasi panjang. Warna ikut seksyen 2 | S-07 |
| Jadual | Pengepala `--redup` huruf besar, baris berselang, lencana teras. Telefon: bertukar kepada kad bertindan | S-05, S-07 |
| Modal | Pengepala gelap dengan ID rujukan, badan boleh skrol, tindakan di bawah | S-06 |
| Toast/mesej | Gaya `mesej()` OPR sedia ada (ok, amaran, bahaya) | Semua |
| Panduan mula pantas | Senarai semak 6 langkah dengan tanda siap dan butang "Buka" | S-10 |

## 4. Reka letak

- **Desktop (>=1280px):** borang kiri 5/12, pratonton A4 kanan 7/12 (melekat). Dashboard: KPI, carta 5/12 + 7/12, top guru 4/12 + penapis 8/12, jadual.
- **Tablet dan telefon:** satu lajur. Tab "Isi" dan "Pratonton" untuk S-02/S-03. Butang Hantar melekat di bawah skrin.
- Telefon: input 16px untuk elak zum automatik iOS. Kanvas tandatangan `touch-action:none`.

## 5. Dokumen PDF

### 5.1 Laporan (S-03, A4 portrait, kandungan 794x1058px)
Susunan tetap, satu muka:
1. Kepala surat: logo (LOGO1), nama sekolah (huruf besar, tebal), kod sekolah (lencana gelap), alamat, garis, tajuk dokumen dan teks "DOKUMEN REKOD SEKOLAH"
2. Jadual maklumat 4 lajur: TARIKH & HARI, MASA, KELAS, MATAPELAJARAN, GURU PELAKSANA (rentang 3 lajur)
3. Kotak "Elemen Teras Pembentukan Karakter Yang Diterapkan": grid 2 lajur, semua teras disenaraikan, yang dipilih bertanda dan tebal, yang lain pudar
4. Kotak "Catatan Pelaksanaan Aktiviti & Impak Karakter": tajuk aktiviti huruf besar, catatan
5. Kotak "Lampiran Bergambar Pelaksanaan": 1 gambar (tengah, lebar maksimum), 2 hingga 4 gambar (grid 2 lajur), kapsyen di bawah setiap gambar. Tinggi sel mengikut bilangan (1: 208px, 2: 176px, 3 hingga 4: 144px)
6. Tandatangan dua lajur. Kiri: "Disediakan oleh:", imej tandatangan (maksimum 150x52px) di atas garis titik, NAMA GURU, "Guru Pelaksana Aktiviti", tarikh. Kanan: "Disahkan oleh:", ruang kosong, garis titik, nama pengesah, jawatan, "Cap Rasmi Sekolah:"
7. Pengaki kecil: "Dijana melalui Annur OPR (e-Karakter)", ID rujukan, "Semak: <8 aksara cap jari>"

Warna sekolah menggantikan biru gelap prototype untuk pengepala kotak. Teks hitam pada latar putih. Tiada kandungan boleh melimpah halaman; catatan melebihi ruang dipotong dengan "..." dalam PDF dan penuh dalam butiran.

### 5.2 Dashboard (S-09, A4 landskap 1100x778px)
Muka 1: kepala surat, 4 KPI, donat + legenda, bar, top 5 guru. Muka 2+: jadual 7 lajur (Bil, ID dan tarikh, Kelas dan subjek, Guru, Teras, Tajuk dan catatan ringkas 160 aksara, Gambar). Pengaki: nombor muka surat. Muka terakhir: blok tandatangan penyelaras dan pengesah (basah).

## 6. Kandungan teks

Bahasa Melayu, nada ringkas. Contoh: butang "Hantar Laporan", "Muat Turun PDF", "Tandatangan", mesej kosong "Belum ada laporan. Isi borang pertama anda." Ralat jelas dan beritahu langkah seterusnya.

## 7. Kebolehcapaian

Kontras teks sekurang-kurangnya 4.5:1. Kad teras boleh dicapai papan kekunci (checkbox sebenar tersembunyi secara visual). Kanvas tandatangan ada alternatif Upload untuk pengguna yang tidak boleh melukis. `prefers-reduced-motion` dihormati.

## Andaian

1. Tema gelap OPR kekal untuk skrin app, PDF sentiasa cerah.
2. Logo sekolah diambil daripada LOGO1 yang sudah ditetapkan dalam OPR (tiada muat naik berasingan).

## Soalan terbuka

1. Adakah sekolah mahu tema warna teras boleh diubah oleh admin? Lalai: tidak, warna ditetapkan mengikut urutan.
