# Annur OPR

Sistem One Page Report (OPR) untuk sekolah, dijual sebagai langganan.
URL: `https://opr.annurpro.com`, setiap sekolah: `https://opr.annurpro.com/s/<slug>`.

## Seni bina

```
Cloudflare Worker "annur-opr"  (repo ini, deploy automatik setiap push ke main)
 ├─ public/            halaman statik (tiada build step, tiada CDN luar)
 ├─ src/worker.js      /auth/*, /api/*, /s/*
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
| 2 | Wizard cipta Sheet + folder dalam Drive admin | |
| 3 | Senarai guru, borang OPR + PDF (dari v2), senarai laporan, semakan | |
| 4 | Licence, percubaan, BCL | |
| 5 | Sale page, pengesahan Google, manual, video | |

## Ujian

```bash
npm test
```

Google, KV dan aset dipalsukan sepenuhnya; tiada akaun sebenar disentuh.

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
