# OPR PoC: drive.file + Picker (tanpa Apps Script)

PoC ini dihos di **Cloudflare Workers (static assets)**, bukan localhost. Hanya folder `public/` yang diterbitkan; README ini dan `wrangler.jsonc` kekal tidak awam.

Tujuan: sahkan tiga andaian sebelum bina OPR v3.

| # | Andaian | Ujian |
|---|---------|-------|
| 1 | Guru (bukan pemilik) boleh tulis baris ke Sheet admin selepas Picker | G1, G2 |
| 2 | Guru boleh muat naik gambar ke folder admin selepas Picker | G1, G3 |
| 3 | Admin boleh buka/lihat fail yang guru muat naik | A3, A4, A5 |

Jangkaan untuk #3: admin TIDAK nampak fail guru melalui API tanpa Picker. Itu bukan kegagalan, cuma menentukan sama ada pratonton PDF dalam app admin boleh dibuat, atau admin buka melalui pautan Drive.

## 1. Terbitkan ke Cloudflare dahulu (supaya dapat URL tetap)

URL ini diperlukan untuk Google Cloud di langkah 2, jadi buat langkah ini dulu.

1. Buka https://dash.cloudflare.com > **Workers & Pages** > **Create** > **Import a repository** (Connect to Git). Pilih repo `opr-poc`.
2. Isi seperti berikut:
   - **Project name / Worker name**: `opr-poc` (mesti sama dengan `name` dalam `wrangler.jsonc`)
   - **Production branch**: `main`
   - **Root directory**: kosongkan (repo ini khas untuk PoC, fail berada di akar)
   - **Build command**: kosongkan
   - **Deploy command**: `npx wrangler deploy`
3. Klik **Save and Deploy**. Selepas siap, Cloudflare tunjuk URL seperti `https://opr-poc.<subdomain-kau>.workers.dev`. **Salin URL ini.**

Setiap push ke `main` auto deploy dalam lebih kurang 30 saat.

Alternatif tanpa Git: `npx wrangler deploy` dari akar repo ini.

Domain sendiri tidak perlu untuk PoC. Untuk versi sebenar, tambah Custom Domain pada Worker dan tambah origin baharu di Google Cloud.

### Jika build gagal
- `root directory not found`: Root directory mesti kosong. Folder `poc` tidak wujud dalam repo ini.
- Build menarik repo atau branch lama: semak **Settings > Builds** bahawa repo ialah `opr-poc` dan production branch ialah `main`.

## 2. Sediakan Google Cloud (sekali sahaja, guna projek baru khas untuk OPR)

1. Buka https://console.cloud.google.com , klik **Select a project** > **New Project**, nama `OPR PoC`.
2. Catat **Project Number** (Dashboard > Project info). Ini untuk ruangan App ID.
3. **APIs & Services > Library**, enable tiga: **Google Drive API**, **Google Sheets API**, **Google Picker API**.
4. **Google Auth Platform** (atau OAuth consent screen) > **External**. Isi nama app dan emel sokongan. Di **Data Access / Scopes** tambah `.../auth/drive.file`, `openid`, `email`.
5. Di **Audience / Test users** tambah emel admin DAN emel guru yang akan diuji (termasuk satu akaun `@moe-dl.edu.my` jika ada). Mod Testing cukup untuk PoC.
6. **Credentials > Create credentials > OAuth client ID > Web application**. Di **Authorized JavaScript origins** letak URL Cloudflare tadi, contoh `https://opr-poc.<subdomain-kau>.workers.dev` (tanpa `/` di hujung dan tanpa path). Salin **Client ID**.
7. **Credentials > Create credentials > API key**. Klik **Restrict key**: API restrictions pilih **Google Picker API** sahaja, Application restrictions pilih **Websites** dan letak `https://opr-poc.<subdomain-kau>.workers.dev/*`.

Perubahan origin di Google kadang ambil beberapa minit hingga sejam untuk berkuat kuasa. Jika log masuk beri ralat `origin_mismatch`, tunggu dahulu sebelum semak semula.

Client ID dan API key tidak rahsia untuk PoC, tapi jangan tampal dalam chat. Isi terus dalam halaman PoC.

## 3. Turutan ujian

Buka URL Cloudflare dalam **dua profil pelayar berbeza** (contoh Chrome Profile Admin dan Chrome Profile Guru, atau Chrome dan Edge). Telefon pun boleh untuk profil Guru.

**Profil Admin**
1. Isi Client ID, API Key, Project Number, klik **Simpan tetapan**, kemudian **Log masuk Google**.
2. Isi emel guru, klik **A1**. Salin "Pautan untuk guru".

**Profil Guru**
3. Isi tetapan yang sama, **Log masuk Google**.
4. Tampal pautan dalam ruangan "Pautan dari Admin". Klik **G1**, Picker akan terbuka. Pilih Sheet dan Folder `OPR PoC` (tahan Ctrl untuk pilih dua-dua).
5. Klik **G2** (tulis baris), **G3** (muat naik gambar), **G4** (baca baris), **G5** (senarai folder).
6. ID fail dari G3 disalin ke clipboard dan dipaparkan dalam log.

**Profil Admin semula**
7. Tampal ID fail guru dalam ruangan "ID fail yang guru muat naik".
8. **A2** (baca baris), **A3** (buka fail guru tanpa Picker), **A4** (senarai folder tanpa Picker).
9. **A5**: pilih folder dengan Picker, ujian A3 dan A4 diulang automatik.
10. **A6**: admin muat naik fail ke folder (mewakili salinan bertandatangan).

Klik **Salin keputusan** dalam setiap profil dan tampal dalam chat. Log tidak mengandungi token.

## 4. Yang perlu diuji pada dua jenis akaun

Ulang seluruh turutan dengan:
- Admin Gmail + Guru Gmail
- Admin `@moe-dl.edu.my` + Guru `@moe-dl.edu.my` (jika "Access blocked" muncul semasa log masuk, rekod mesej penuh itu)

Ujian ini juga mengesahkan hos `workers.dev` tidak disekat oleh rangkaian sekolah. Jika halaman PoC sendiri tak boleh dibuka di rangkaian sekolah, itu juga satu keputusan penting (kita perlu custom domain).

## 5. Nota pemilikan fail

Fail yang guru cipta dalam folder admin dimiliki oleh **guru**, dan menggunakan kuota Drive guru. Folder berada dalam Drive admin, tapi fail itu sendiri tidak bertukar milik. Jika akaun guru dipadam atau berpindah sekolah, fail boleh hilang. G3 akan menunjukkan pemilik sebenar. Keputusan ini menentukan sama ada kita perlu langkah arkib (admin salin fail ke miliknya) atau Shared Drive.

## 6. Selepas PoC

Padam Worker `opr-poc` dan projek Google Cloud PoC jika tidak diteruskan. Data ujian hanya satu Sheet dan satu folder kecil dalam Drive admin.
