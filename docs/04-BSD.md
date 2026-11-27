# 05 - BSD: Backend Schema e-Karakter

Rujuk: PRD (F-xx, R-xx), TRD seksyen 4. Pangkalan data = Google Sheet setiap sekolah (dalam Drive admin) + KV Cloudflare. Skema naik kepada **VERSI_SKEMA = 2**. Peraturan: kolum baharu hanya di hujung.

## 1. Tab sedia ada yang digunakan semula

| Tab | Guna oleh e-Karakter | Perubahan |
|---|---|---|
| `Guru` (Email, Nama, Peranan, Aktif, Ditambah, DitambahOleh) | Sumber peranan R-01/R-02 dan nama guru pada laporan | Tiada. Peranan `admin` atau `guru` kekal. R-03 dikira daripada `KarakterGuruKelas` |
| `Senarai` (Kategori, Nilai, Susunan, Aktif) | Kelas, subjek, teras | Kategori baharu: `KARAKTER_KELAS`, `KARAKTER_SUBJEK`, `KARAKTER_TERAS` (F-02, F-03). Endpoint `/senarai` dibenarkan untuk kategori ini |
| `Tetapan` (Kunci, Nilai) | Tetapan e-Karakter, logo, nama sekolah | Kunci baharu (seksyen 3) |
| `AuditLog` (Masa, Email, Peranan, Tindakan, Sasaran, Status, Nota) | F-15 | Tindakan baharu (seksyen 5) |

## 2. Tab baharu

### 2.1 `KarakterRekod` (F-05, F-06, F-07, F-09, F-10, F-11, F-12)

| # | Kolum | Jenis | Catatan |
|---|---|---|---|
| 1 | ID | teks | `KRK-YYYYMMDD-XXXXX` (huruf besar dan nombor rawak), unik |
| 2 | Timestamp | ISO | Masa cipta (UTC) |
| 3 | DikemaskiniPada | ISO | |
| 4 | PemilikEmail | teks | Huruf kecil. Diisi Worker daripada sesi |
| 5 | NamaGuru | teks | Diisi Worker daripada tab Guru |
| 6 | TarikhISO | `YYYY-MM-DD` | Tarikh pelaksanaan. Kunci penapis |
| 7 | Masa | `HH:MM` | 24 jam |
| 8 | Kelas | teks (<=60) | Daripada senarai atau "Lain-lain" |
| 9 | Subjek | teks (<=60) | Sama |
| 10 | Teras | teks | Nama teras dipisah `, ` (mesti wujud dalam `KARAKTER_TERAS` semasa simpan) |
| 11 | Tajuk | teks (<=150) | |
| 12 | Catatan | teks (<=3000) | |
| 13 | BilGambar | nombor | 0 hingga 4 |
| 14 | GambarIds | teks | ID fail Drive dipisah `,` |
| 15 | Kapsyen | teks | JSON array ringkas selari `GambarIds` (setiap <=80 aksara) |
| 16 | TtdFileId | teks | ID fail tandatangan pada masa tandatangan. Kosong jika tiada |
| 17 | TtdPada | ISO | Masa tandatangan |
| 18 | KandunganHash | teks | SHA-256 heksa. Dikira di Worker daripada: PemilikEmail, TarikhISO, Masa, Kelas, Subjek, Teras (disusun), Tajuk, Catatan, GambarIds, TtdFileId |
| 19 | Sesi | teks | Tahun sesi (`TAHUN_SESI` semasa simpan). Untuk arkib kemudian |
| 20 | Dipadam | `YA` / kosong | Soft delete |
| 21 | DipadamPada | ISO | |
| 22 | AkuanGambar | `YA` / kosong | Akuan kebenaran dipersetujui bila ada gambar |
| 23 | PdfFileId | teks | ID fail PDF dalam subfolder `PDF`. Kosong jika belum dijana atau gagal. Fail yang sama ditimpa bila laporan diedit atau ditandatangan semula |
| 24 | PdfPada | ISO | Masa PDF terakhir dijana. Dibanding dengan `DikemaskiniPada` untuk tahu PDF sudah lapuk |

Indeks: tiada (Sheets). Penapisan dibuat di Worker selepas satu bacaan julat.

### 2.2 `KarakterGuruKelas` (F-04, F-10)

| # | Kolum | Jenis | Catatan |
|---|---|---|---|
| 1 | Kelas | teks | Mesti sepadan dengan nilai `KARAKTER_KELAS` |
| 2 | Email | teks | Huruf kecil, mesti wujud dalam tab `Guru` dan aktif |
| 3 | Ditambah | ISO | |
| 4 | DitambahOleh | teks | Emel admin |

Kunci unik logik: (Kelas, Email). Worker menolak pendua.

### 2.3 `KarakterTtd` (F-07)

| # | Kolum | Jenis | Catatan |
|---|---|---|---|
| 1 | Email | teks | Satu baris setiap guru |
| 2 | FileId | teks | Fail PNG dalam subfolder `Tandatangan` |
| 3 | DikemaskiniPada | ISO | |

Apabila guru simpan tandatangan baharu, baris dikemas kini dan fail lama dibuang daripada Drive. Rekod lama yang sudah menyimpan `TtdFileId` lama **kekal merujuk fail lama**, jadi fail lama tidak dibuang jika masih dirujuk oleh `KarakterRekod` (Worker semak sebelum buang; jika dirujuk, fail dikekalkan).

## 3. Kunci `Tetapan` baharu (F-13)

| Kunci | Lalai | Catatan |
|---|---|---|
| `KRK_KOD_SEKOLAH` | kosong | Papar dalam PDF |
| `KRK_TAJUK_DOKUMEN` | `Laporan Pelaksanaan Pembentukan Karakter` | |
| `KRK_NAMA_PENGESAH` | kosong | |
| `KRK_JAWATAN_PENGESAH` | `Guru Besar / Pengetua` | |
| `KRK_WAJIB_TTD` | `TIDAK` | `YA` memaksa tandatangan sebelum hantar |
| `KRK_TERAS_HURAIAN` | JSON `{ "Penyayang": "Empati, hormat-menghormati, prihatin dan budi bahasa.", ... }` | Huraian ringkas empat teras lalai |
| `KRK_HAD_MUNDUR_HARI` | `30` | Had mundur tarikh bagi guru |
| `KRK_AKTIF` | `YA` | Penanda e-Karakter diaktifkan |
| `VERSI_SKEMA` | `2` | Dikemas kini oleh `pasangSkemaKarakter` |

Kunci awam yang dihantar ke guru melalui `/karakter/config`: semua `KRK_*` kecuali tiada. Tiada kunci sensitif dalam Tetapan.

## 4. Seed (dijalankan oleh `pasangSkemaKarakter`, F-01)

`Senarai`:
- `KARAKTER_TERAS`: Penyayang, Berdaya Tahan, Berupaya Memimpin, Warganegara Aktif
- `KARAKTER_KELAS`: contoh SK (`1 Arif`, `2 Bestari`, `3 Cemerlang`, `4 Al-Farabi`, `5 Ibnu Sina`, `6 Al-Khawarizmi`) dan contoh SMK (`1 Amanah`, `2 Bestari`, `3 Cemerlang`, `4 Sains`, `5 Sains`). Ditandakan contoh, admin ganti semasa setup (S-10)
- `KARAKTER_SUBJEK`: Bahasa Melayu, Bahasa Inggeris, Matematik, Sains, Pendidikan Islam, Pendidikan Moral, Sejarah, Geografi, Reka Bentuk dan Teknologi, Pendidikan Jasmani dan Kesihatan, Pendidikan Seni Visual, Bahasa Arab

Seed hanya ditulis jika kategori itu belum ada langsung (supaya tidak menimpa suntingan admin). Subfolder Drive: `Tandatangan` dan `PDF` (di bawah folder sekolah).

## 5. Tindakan AuditLog baharu (F-15)

`KARAKTER_SEDIAKAN`, `KARAKTER_SIMPAN`, `KARAKTER_PADAM`, `KARAKTER_TANDATANGAN`, `KARAKTER_TTD_SIMPAN`, `KARAKTER_GURUKELAS`, `KARAKTER_TETAPAN`, `KARAKTER_EKSPORT`, `KARAKTER_AKSES_DITOLAK` (status `DITOLAK`, nota nyatakan laluan dan sebab).

## 6. KV (`OPR_KV`)

| Kunci | Nilai | Tamat |
|---|---|---|
| `school:<slug>` | Rekod sekolah sedia ada. Tambah `versiSkema` dan `subfolder.TTD` | kekal |
| `upload:<slug>:<fileId>` | `{email, jenis}` dengan `jenis` baharu `ttd` dan `pdf`. Sedia ada untuk `lampiran` | 1 hari |
| `rl:<slug>:<sesiId>:<minit>` | Kiraan tulis seminit | 2 minit |
| `lesen:<slug>`, `trial:`, `bcl:` dll. | Tiada perubahan | |

## 7. Jadual akses (R-xx x laluan)

`kenalPasti` memberi R-01 (admin), R-02 (guru), atau tiada/tidak_aktif. R-03 = R-02 dengan sekurang-kurangnya satu baris dalam `KarakterGuruKelas`. R-04 tiada akses kepada laluan ini.

| Laluan (`/api/s/<slug>/karakter/...`) | Kaedah | R-01 | R-02 | R-03 | Peraturan |
|---|---|---|---|---|---|
| `config` | GET | Ya | Ya | Ya | Senarai aktif, tetapan awam, `guruKelas` untuk pengguna, `adaTtd` |
| `skema/pasang` | POST | Ya | Tidak | Tidak | Idempoten |
| `rekod` (cipta/kemas kini) | POST | Ya | Ya | Ya | Cipta: pemilik = sesi. Kemas kini: hanya pemilik rekod. Admin tidak mengedit rekod orang lain |
| `rekod?skop=saya` | GET | Ya | Ya | Ya | `PemilikEmail == sesi` |
| `rekod?skop=kelas` | GET | Tidak | Tidak | Ya | `Kelas` dalam kelas dipetakan, dipaksa di server |
| `rekod?skop=semua` | GET | Ya | Tidak | Tidak | 403 untuk selain admin |
| `rekod/<id>` | GET | Ya | Pemilik sahaja | Pemilik, atau kelas dipetakan | Selain itu 403 dan audit `KARAKTER_AKSES_DITOLAK` |
| `rekod/<id>/padam` | POST | Mana-mana rekod | Rekod sendiri | Rekod sendiri | Soft delete. Admin boleh padam mana-mana rekod |
| `fail?jenis=lampiran` | POST | Ya | Ya | Ya | Corak `/fail` sedia ada |
| `fail?jenis=ttd` | POST | Ya | Ya | Ya | PNG, 150KB, magic bytes |
| `fail/<fileId>?rekod=<id>` | GET | Ya | Pemilik | Pemilik atau kelas dipetakan | Fail mesti tersenarai dalam `GambarIds` atau `TtdFileId` rekod itu |
| rekod/<id>/pdf | GET/POST | Mana-mana rekod | Rekod sendiri | Rekod sendiri (POST), kelas dipetakan (GET) | POST: PDF sahaja, pemilik atau admin, timpa fail sedia ada. GET: hidang melalui Worker |
| `ttd` | GET/POST/DELETE | Diri sendiri | Diri sendiri | Diri sendiri | Tandatangan tersimpan milik sendiri sahaja |
| `statistik` | GET | Ya | Tidak | Tidak | Terima tapisan |
| `statistik?skop=kelas` | GET | Tidak | Tidak | Ya | Ringkasan kelas dipetakan (F-10) |
| `eksport` | GET | Ya | Tidak | Tidak | CSV disanitasi (F-12) |
| `gurukelas` | GET/POST | Ya | Tidak | Tidak | Set pemetaan (F-04) |
| `tetapan` | GET/POST | Ya | Tidak | Tidak | Kunci `KRK_*` sahaja (F-13) |
| `/senarai`, `/senarai/padam` | POST | Ya (kategori `KARAKTER_*`) | Tidak | Tidak | Senarai putih kategori |

Pengesahan pemilik rekod menggunakan `PemilikEmail`, bukan medan daripada klien. Penolakan merekod audit.

## 8. Peraturan integriti data

1. Hantar: `Teras` kosong ditolak. Teras mesti aktif dalam senarai semasa simpan. Nama teras disimpan sebagai teks supaya kekal walaupun diubah kemudian.
2. Nama kelas atau subjek dinyahaktif kekal pada laporan lama. Papar dalam dashboard dengan nama asal.
3. Ubah nama kelas dalam senarai tidak mengubah laporan lama. Pemetaan guru kelas yang merujuk nama lama menjadi yatim dan dipaparkan sebagai amaran dalam S-08.
4. Edit rekod bertandatangan: `TtdFileId`, `TtdPada` dikosongkan, `KandunganHash` dikira semula.
5. Nombor `BilGambar` mesti sama dengan bilangan `GambarIds`.
6. Soft delete: `Dipadam = YA`. Statistik dan senarai mengabaikan, eksport tidak menyertakan.

## 9. Fungsi persediaan (padanan `setupSystem()`)

Nama: `pasangSkemaKarakter(g, sek)` dalam `src/karakter.js`. Dipanggil automatik (TRD seksyen 4) dan melalui butang "Semak / pasang semula struktur e-Karakter" (S-08). Langkah:

1. Baca senarai tab sedia ada dalam Sheet sekolah.
2. Cipta tab `KarakterRekod`, `KarakterGuruKelas`, `KarakterTtd` jika tiada dan tulis header di baris 1 (format sama seperti tab lain, bekukan baris 1).
3. Cipta subfolder `Tandatangan` dan `PDF` jika tiada, simpan ID dalam `school:<slug>`.
4. Seed `Senarai` dan `Tetapan` seperti seksyen 3 dan 4, hanya jika belum ada.
5. Tulis `VERSI_SKEMA = 2`, `KRK_AKTIF = YA`. Audit `KARAKTER_SEDIAKAN`.
6. Pulangkan ringkasan: tab dicipta, tab sedia ada, seed ditulis atau dilangkau.

## Andaian

1. Satu bacaan tab `KarakterRekod` penuh setiap permintaan senarai adalah munasabah untuk sehingga kira-kira 8,000 baris (perlu disahkan melalui ujian beban).
2. Tab `KarakterRekod` tidak dikongsi dengan sesiapa selain admin sekolah. Guru tidak dibenarkan membuka Sheet itu secara langsung kerana Worker bertindak sebagai pintu masuk.

## Soalan terbuka

1. Perlukah kolum `Sesi` digunakan untuk memecahkan tab setiap tahun, atau cukup dengan penapis tarikh? Lalai: penapis tarikh sehingga ada keperluan arkib.
