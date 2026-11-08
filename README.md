# Annur OPR

Sistem One Page Report (OPR) untuk sekolah, dijual sebagai langganan.
URL: `https://opr.annurpro.com`, setiap sekolah: `https://opr.annurpro.com/s/<slug>`.

## Seni bina

```
Cloudflare Worker "annur-opr"  (repo ini, deploy automatik setiap push ke main)
 ├─ public/            halaman statik (tiada build step, tiada CDN luar)
 ├─ src/worker.js      /auth/*, /api/*, /s/*
 ├─ src/google.js      Drive + Sheets API (tiada carian ikut nama; semua ikut ID)
 ├─ src/skema.js       tab, kolum dan data asal Sheet sekolah
 ├─ src/laporan.js     normalisasi + rekod laporan (dari Code.gs v2)
 ├─ public/dokumen.js  enjin pratonton A4 + PDF (kod v2 verbatim + lapisan sambungan)
 ├─ public/vendor/     html2pdf 0.10.1, pdf.js 3.11.174 (salinan tempatan, bukan CDN)
 └─ KV OPR_KV          sekolah, sesi, token admin (tersulit)

Data laporan  ->  Google Drive ADMIN SEKOLAH (bukan pelayan AnnurPro)
```

- **Admin sekolah** sambung Google sekali (skop `drive.file`). Refresh token disimpan tersulit (AES-GCM, kunci daripada `APP_SECRET`).
- **Guru** log masuk Google dengan emel sahaja. Worker semak keahlian, kemudian baca/tulis Drive atas nama admin.
- **AnnurPro** tidak nampak data sekolah.

## Fasa

| Fasa | Isi | Status |
|---|---|---|
| 1 | Worker, log masuk Google (PKCE), sesi, pendaftaran sekolah `/s/<slug>`, ujian sambungan Drive | Siap |
| 2 | Folder + subfolder + Google Sheet (5 tab, 8 jenis laporan, 186 item senarai) dicipta automatik dalam Drive admin; penyediaan boleh disambung jika gagal; ujian tulis/baca | Siap |
| 3a | Peranan dari tab Guru (berkuat kuasa serta-merta), admin tambah guru (tampal senarai), hierarki admin, borang OPR 8 jenis, simpan/edit/padam laporan, cache token | Siap |
| 3b-1 | Pratonton A4 + jana PDF (enjin v2 verbatim, gaya Kotak/Poster), gambar ke Drive, lampiran PDF, "Sertakan", Rupa Dokumen, buka PDF | Siap |
| 3b-2 | Semakan + PDF bertandatangan, dashboard, tab Tetapan (logo, warna, jenis, senarai) | |
| 4 | Licence, percubaan, BCL | |
| 5 | Sale page, pengesahan Google, manual, video | |

## Ujian

```bash
npm test
```

Google, KV dan aset dipalsukan sepenuhnya; tiada akaun sebenar disentuh.

Ujian browser hujung-ke-hujung (Worker sebenar dalam proses, Google palsu, semua hos luar disekat):

```bash
npm run e2e
```

Jalankan setempat dalam runtime Cloudflare:

```bash
npx wrangler dev --local --var GOOGLE_CLIENT_ID:ujian --var BASE_URL:http://localhost:8787
```

## Konfigurasi

| Nama | Jenis | Di mana |
|---|---|---|
| `BASE_URL` | var | `wrangler.jsonc` |
| `GOOGLE_CLIENT_ID` | var (bukan rahsia) | `wrangler.jsonc` |
| `OPR_KV` id | KV | `wrangler.jsonc` |
| `GOOGLE_CLIENT_SECRET` | **secret** | Dashboard Cloudflare sahaja |
| `APP_SECRET` | **secret**, min 32 aksara | Dashboard Cloudflare sahaja |

Jangan sesekali commit secret ke repo ini. Jika `APP_SECRET` ditukar, semua admin perlu sambung semula Google.

## Setup pemilik (sekali sahaja)

Langkah penuh klik demi klik ada dalam chat projek. Ringkasan:

1. Cloudflare: cipta KV `annur-opr-kv`, masukkan id ke `wrangler.jsonc`.
2. Google Cloud: projek **Annur OPR**, enable Drive API + Sheets API, consent screen (External, Testing), OAuth client Web dengan redirect `https://opr.annurpro.com/auth/callback`.
3. Masukkan Client ID ke `wrangler.jsonc`.
4. Cloudflare: Import repo ini sebagai Worker `annur-opr`, root kosong, deploy command `npx wrangler deploy`.
5. Tambah secret `GOOGLE_CLIENT_SECRET` dan `APP_SECRET`.
6. Custom domain `opr.annurpro.com`.
