// Annur OPR - Worker utama (Fasa 1)
//
// Tanggungjawab Fasa 1:
//   - Log masuk Google (aliran authorization code + PKCE, di pelayan)
//   - Sesi 30 hari dalam KV (kuki HttpOnly)
//   - Admin sekolah sambung Google Drive sekali; refresh token disimpan tersulit
//   - Pendaftaran sekolah dengan slug: opr.annurpro.com/s/<slug>
//   - Ujian sambungan Drive admin (bukti Worker boleh bertindak bagi pihak admin)
//
// KV (binding OPR_KV):
//   state:<id>     -> { mode, slug, next, verifier }          TTL 10 minit
//   sess:<id>      -> { email, nama, gambar, dicipta }        TTL 30 hari
//   pending:<email>-> { tokenEnc, pada }                      TTL 1 hari
//   school:<slug>  -> rekod sekolah (lihat ciptaSekolah)
//   admin:<email>  -> slug sekolah yang ditadbir

import {
  randomId, sha256b64url, sulit, nyahsulit, bacaKuki, kuki,
  semakSlug, bersihNama, json, ralat, decodeJwtPayload
} from './lib.js';
import {
  RalatGoogle, ciptaFolder, ciptaSpreadsheet, pindahKeFolder, infoFail,
  tambahBaris, bacaObjek, bacaJadual, kemaskiniJulat, pautanSheet, pautanFolder, muatNaik, muatTurun, buangKeTong
} from './google.js';
import { VERSI_SKEMA, TAB, KOLUM, SUBFOLDER, tetapanAsal, barisSenaraiAsal, jenisLalai, JENIS_SAH } from './skema.js';
import { binaRekod, barisIkutTajuk, ringkasan, butiran, hurufLajur, STATUS } from './laporan.js';

const SKOP_GURU = 'openid email profile';
const SKOP_ADMIN = 'openid email profile https://www.googleapis.com/auth/drive.file';
const SKOP_DRIVE = 'https://www.googleapis.com/auth/drive.file';
const SESI_SAAT = 30 * 24 * 3600;
const KUKI_SESI = 'opr_sesi';
const KUKI_STATE = 'opr_state';
const PENERBIT_GOOGLE = ['https://accounts.google.com', 'accounts.google.com'];

const KESELAMATAN_HTML = {
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'cache-control': 'no-cache'
};

export default {
  fetch(req, env, ctx) {
    return handle(req, env, { fetch: (...a) => fetch(...a), now: () => Date.now() });
  }
};

export async function handle(req, env, deps = {}) {
  const f = deps.fetch || fetch;
  const now = deps.now || Date.now;
  const url = new URL(req.url);
  const p = url.pathname;

  try {
    if (p === '/auth/login' && req.method === 'GET') return await mulaLogin(req, env, url, now);
    if (p === '/auth/callback' && req.method === 'GET') return await callback(req, env, url, f, now);
    if (p === '/auth/logout' && req.method === 'POST') return await logout(req, env);

    if (p.startsWith('/api/')) {
      if (req.method !== 'GET' && !originSah(req, env, url)) return ralat('Permintaan ditolak (origin).', 403);
      return await api(req, env, url, f, now);
    }

    // /s/<slug> dan /s/<slug>/... -> halaman aplikasi sekolah
    if (/^\/s\/[^/]+\/?/.test(p)) return await halamanSekolah(req, env, url);

    return env.ASSETS.fetch(req);
  } catch (e) {
    console.error('Ralat tidak dijangka', p, e && e.stack || e);
    return ralat('Berlaku ralat pada pelayan. Sila cuba lagi.', 500);
  }
}

// ======================================================================
// Asas
// ======================================================================

function asasUrl(env, url) {
  return (env.BASE_URL || url.origin).replace(/\/+$/, '');
}

function originSah(req, env, url) {
  const o = req.headers.get('Origin');
  if (!o) return false;
  return o === asasUrl(env, url) || o === url.origin;
}

function nextSelamat(next, fallback = '/') {
  const n = String(next || '');
  return n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/\\') ? n : fallback;
}

function lencong(lokasi, kukiList = []) {
  const h = new Headers({ Location: lokasi, 'cache-control': 'no-store' });
  kukiList.forEach(k => h.append('Set-Cookie', k));
  return new Response(null, { status: 302, headers: h });
}

async function sesiSemasa(req, env) {
  const id = bacaKuki(req, KUKI_SESI);
  if (!id) return null;
  const s = await env.OPR_KV.get('sess:' + id, 'json');
  return s ? { ...s, id } : null;
}

// ======================================================================
// Log masuk Google
// ======================================================================

async function mulaLogin(req, env, url, now) {
  if (!env.GOOGLE_CLIENT_ID) return ralat('GOOGLE_CLIENT_ID belum ditetapkan dalam wrangler.jsonc.', 500);

  const mode = url.searchParams.get('mode') === 'admin' ? 'admin' : 'guru';
  const slugParam = url.searchParams.get('s') || '';
  const slug = slugParam ? semakSlug(slugParam).slug : '';
  const next = nextSelamat(url.searchParams.get('next'), slug ? '/s/' + slug : (mode === 'admin' ? '/daftar' : '/'));

  const state = randomId(24);
  const verifier = randomId(48);
  const challenge = await sha256b64url(verifier);
  await env.OPR_KV.put('state:' + state, JSON.stringify({ mode, slug, next, verifier, pada: now() }), { expirationTtl: 600 });

  const q = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: asasUrl(env, url) + '/auth/callback',
    response_type: 'code',
    scope: mode === 'admin' ? SKOP_ADMIN : SKOP_GURU,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: mode === 'admin' ? 'consent select_account' : 'select_account'
  });
  // Hanya admin perlukan refresh token (Worker bertindak bagi pihak admin).
  if (mode === 'admin') { q.set('access_type', 'offline'); q.set('include_granted_scopes', 'true'); }

  return lencong('https://accounts.google.com/o/oauth2/v2/auth?' + q, [kuki(KUKI_STATE, state, 600)]);
}

async function callback(req, env, url, f, now) {
  // butiran = kod ralat daripada Google (cth invalid_client); bukan rahsia, membantu diagnosis.
  const gagal = (kod, butiran, huraian) => lencong(
    '/?ralat=' + encodeURIComponent(kod)
      + (butiran ? '&d=' + encodeURIComponent(String(butiran).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40)) : '')
      + (huraian ? '&m=' + encodeURIComponent(String(huraian).replace(/[^a-zA-Z0-9 ._-]/g, '').slice(0, 80)) : ''),
    [kuki(KUKI_STATE, '', 0)]);

  if (url.searchParams.get('error')) return gagal(url.searchParams.get('error'));
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  if (!state || !code || bacaKuki(req, KUKI_STATE) !== state) return gagal('state_tidak_sepadan');

  const st = await env.OPR_KV.get('state:' + state, 'json');
  if (!st) return gagal('state_luput');
  await env.OPR_KV.delete('state:' + state);

  // Tukar code kepada token
  const res = await f('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET || '',
      redirect_uri: asasUrl(env, url) + '/auth/callback',
      grant_type: 'authorization_code',
      code_verifier: st.verifier
    })
  });
  const tok = await res.json().catch(() => ({}));
  if (!res.ok || !tok.id_token) {
    console.error('Tukar token gagal', res.status, tok.error, tok.error_description);
    return gagal('tukar_token_gagal', tok.error || ('http_' + res.status), tok.error_description);
  }

  // id_token diterima terus dari Google melalui TLS; semak tuntutan asas.
  let id;
  try { id = decodeJwtPayload(tok.id_token); } catch (e) { return gagal('id_token_rosak'); }
  const saatKini = Math.floor(now() / 1000);
  if (!PENERBIT_GOOGLE.includes(id.iss) || id.aud !== env.GOOGLE_CLIENT_ID || !(id.exp > saatKini)) return gagal('id_token_tidak_sah');
  if (!id.email || id.email_verified === false) return gagal('emel_tidak_disahkan');

  const email = String(id.email).toLowerCase();
  const sesiId = randomId(32);
  await env.OPR_KV.put('sess:' + sesiId, JSON.stringify({
    email, nama: bersihNama(id.name || email), gambar: String(id.picture || ''), dicipta: now()
  }), { expirationTtl: SESI_SAAT });
  const kukiList = [kuki(KUKI_SESI, sesiId, SESI_SAAT), kuki(KUKI_STATE, '', 0)];

  if (st.mode !== 'admin') return lencong(st.next, kukiList);

  // ---- Admin: perlukan kebenaran Drive + refresh token
  const skop = String(tok.scope || '').split(/\s+/);
  if (!skop.includes(SKOP_DRIVE)) return lencong('/daftar?ralat=drive_tidak_dibenarkan', kukiList);
  if (!tok.refresh_token) return lencong('/daftar?ralat=tiada_refresh_token', kukiList);

  const tokenEnc = await sulit(tok.refresh_token, env.APP_SECRET);
  const slugSedia = await env.OPR_KV.get('admin:' + email);
  if (slugSedia) {
    // Admin sedia ada menyambung semula Google (token lama dibatalkan/luput).
    const sek = await env.OPR_KV.get('school:' + slugSedia, 'json');
    if (sek) {
      sek.tokenEnc = tokenEnc;
      sek.statusToken = 'ok';
      sek.disambungPada = new Date(now()).toISOString();
      await env.OPR_KV.put('school:' + slugSedia, JSON.stringify(sek));
      await env.OPR_KV.delete('at:' + slugSedia);
      return lencong('/s/' + slugSedia + '?disambung=1', kukiList);
    }
  }
  await env.OPR_KV.put('pending:' + email, JSON.stringify({ tokenEnc, pada: now() }), { expirationTtl: 86400 });
  return lencong('/daftar', kukiList);
}

async function logout(req, env) {
  const id = bacaKuki(req, KUKI_SESI);
  if (id) await env.OPR_KV.delete('sess:' + id);
  return json({ ok: true }, 200, { 'Set-Cookie': kuki(KUKI_SESI, '', 0) });
}

// ======================================================================
// API
// ======================================================================

async function api(req, env, url, f, now) {
  const p = url.pathname;
  const sesi = await sesiSemasa(req, env);

  if (p === '/api/me' && req.method === 'GET') {
    if (!sesi) return ralat('Belum log masuk.', 401);
    const slugAdmin = await env.OPR_KV.get('admin:' + sesi.email);
    const pending = slugAdmin ? null : await env.OPR_KV.get('pending:' + sesi.email);
    return json({ ok: true, email: sesi.email, nama: sesi.nama, gambar: sesi.gambar,
      sekolahAdmin: slugAdmin || null, driveDisambung: !!pending });
  }

  let m = p.match(/^\/api\/slug\/([^/]+)$/);
  if (m && req.method === 'GET') {
    const s = semakSlug(decodeURIComponent(m[1]));
    if (!s.ok) return json({ ok: true, slug: s.slug, tersedia: false, sebab: s.sebab });
    const ada = await env.OPR_KV.get('school:' + s.slug);
    return json({ ok: true, slug: s.slug, tersedia: !ada, sebab: ada ? 'Nama ini sudah digunakan.' : '' });
  }

  if (p === '/api/schools' && req.method === 'POST') {
    if (!sesi) return ralat('Sila log masuk dahulu.', 401);
    return await ciptaSekolah(req, env, sesi, now, f);
  }

  m = p.match(/^\/api\/s\/([^/]+)(\/.*)?$/);
  if (m) {
    const s = semakSlug(decodeURIComponent(m[1]));
    const sek = s.ok ? await env.OPR_KV.get('school:' + s.slug, 'json') : null;
    if (!sek) return ralat('Sekolah tidak dijumpai.', 404);
    return await apiSekolah(req, env, url, sek, sesi, m[2] || '', f, now);
  }

  return ralat('Laluan tidak dijumpai.', 404);
}

async function ciptaSekolah(req, env, sesi, now, fGlobal) {
  let badan;
  try { badan = await req.json(); } catch (e) { return ralat('Data tidak sah.'); }

  const nama = bersihNama(badan.nama);
  if (nama.length < 3) return ralat('Sila isi nama sekolah (sekurang-kurangnya 3 aksara).');
  const s = semakSlug(badan.slug);
  if (!s.ok) return ralat(s.sebab);

  if (await env.OPR_KV.get('admin:' + sesi.email)) {
    return ralat('Akaun ini sudah mentadbir sebuah sekolah. Satu akaun Google untuk satu sekolah.', 409);
  }
  const pending = await env.OPR_KV.get('pending:' + sesi.email, 'json');
  if (!pending) return ralat('Sila sambung Google Drive sebagai admin dahulu.', 409, { perluSambung: true });
  if (await env.OPR_KV.get('school:' + s.slug)) return ralat('Nama pautan ini sudah digunakan. Sila pilih yang lain.', 409);

  const rekod = {
    slug: s.slug,
    nama,
    adminEmail: sesi.email,
    tokenEnc: pending.tokenEnc,
    statusToken: 'ok',
    dicipta: new Date(now()).toISOString(),
    // Diisi pada Fasa 2 (wizard cipta Sheet & folder dalam Drive admin)
    sheetId: '',
    folderId: ''
  };
  await env.OPR_KV.put('school:' + s.slug, JSON.stringify(rekod));
  await env.OPR_KV.put('admin:' + sesi.email, s.slug);
  await env.OPR_KV.delete('pending:' + sesi.email);

  // Sediakan folder + Sheet terus. Jika gagal, sekolah tetap berdaftar dan
  // admin boleh tekan "Sediakan Google Drive" semula (langkah boleh disambung).
  let sedia = false, ralatSedia = '';
  try {
    const r = await denganAkses(env, rekod, fGlobal, now, (g) => sediakanDrive(env, rekod, g, sesi, now));
    if (r.gagal) ralatSedia = r.gagal.perluSambung ? 'Sambungan Google tamat.' : (r.gagal.ralat || '');
    else sedia = true;
  } catch (e) { ralatSedia = mesejRalatGoogle(e); }
  return json({ ok: true, slug: s.slug, pautan: '/s/' + s.slug, sedia, ralatSedia });
}

// Dapatkan access token admin daripada refresh token tersulit.
// Access token di-cache (tersulit) dalam KV supaya tidak perlu tukar token
// dengan Google pada setiap permintaan guru.
export async function tokenAdmin(env, sek, f, now, { abaiCache = false } = {}) {
  if (sek.statusToken === 'perlu_sambung') {
    return { ok: false, perluSambung: true };
  }
  const kunciCache = 'at:' + sek.slug;
  if (!abaiCache) {
    const c = await env.OPR_KV.get(kunciCache);
    if (c) {
      try { return { ok: true, accessToken: await nyahsulit(c, env.APP_SECRET), skop: '' }; } catch (e) { /* ambil baharu */ }
    }
  }
  const refresh = await nyahsulit(sek.tokenEnc, env.APP_SECRET);
  const res = await f('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: refresh,
      grant_type: 'refresh_token'
    })
  });
  const t = await res.json().catch(() => ({}));
  if (!res.ok || !t.access_token) {
    if (t.error === 'invalid_grant') {
      sek.statusToken = 'perlu_sambung';
      sek.tokenGagalPada = new Date(now()).toISOString();
      await env.OPR_KV.put('school:' + sek.slug, JSON.stringify(sek));
      await env.OPR_KV.delete(kunciCache);
      return { ok: false, perluSambung: true };
    }
    return { ok: false, perluSambung: false, ralat: t.error || ('HTTP ' + res.status) };
  }
  const umur = Math.max(60, Math.min(3000, (Number(t.expires_in) || 3600) - 300));
  await env.OPR_KV.put(kunciCache, await sulit(t.access_token, env.APP_SECRET), { expirationTtl: umur });
  return { ok: true, accessToken: t.access_token, skop: String(t.scope || '') };
}

// ======================================================================
// Fasa 2: Sheet + folder dalam Drive admin
// ======================================================================

export function mesejRalatGoogle(e) {
  if (e instanceof RalatGoogle) {
    if (e.apiTidakAktif) return 'Google Drive API atau Google Sheets API belum diaktifkan dalam projek Google Cloud "Annur OPR". Hubungi AnnurPro.';
    if (e.status === 404) return 'Fail sekolah tidak dijumpai dalam Google Drive (mungkin telah dipadam).';
    if (e.status === 403) return 'Google menolak akses kepada fail sekolah (' + e.message + ').';
    if (e.status === 429) return 'Google sedang sibuk (had kadar). Cuba lagi sebentar.';
    return 'Ralat Google: ' + e.message;
  }
  return 'Ralat tidak dijangka: ' + (e && e.message || e);
}

async function simpanSekolah(env, sek) {
  await env.OPR_KV.put('school:' + sek.slug, JSON.stringify(sek));
}

// Idempotent: setiap langkah disimpan ke KV sebaik siap, jadi jika gagal di
// tengah jalan, panggilan seterusnya menyambung dari langkah yang belum siap
// dan tidak mencipta folder/Sheet pendua.
export async function sediakanDrive(env, sek, g, sesi, now) {
  const tajuk = 'Annur OPR - ' + sek.nama;

  if (!sek.folderId) {
    sek.folderId = await ciptaFolder(g, tajuk);
    await simpanSekolah(env, sek);
  }
  sek.subfolder = sek.subfolder || {};
  for (const [kunci, nama] of Object.entries(SUBFOLDER)) {
    if (!sek.subfolder[kunci]) {
      sek.subfolder[kunci] = await ciptaFolder(g, nama, sek.folderId);
      await simpanSekolah(env, sek);
    }
  }
  if (!sek.sheetId) {
    const masa = new Date(now()).toISOString();
    const tahun = new Date(now()).getUTCFullYear();
    const id = await ciptaSpreadsheet(g, tajuk + ' (Pangkalan Data)', [
      { nama: TAB.GURU, tajuk: KOLUM[TAB.GURU], baris: [[sek.adminEmail, sesi.nama || '', 'admin', 'YA', masa, 'sistem']] },
      { nama: TAB.LAPORAN, tajuk: KOLUM[TAB.LAPORAN] },
      { nama: TAB.SENARAI, tajuk: KOLUM[TAB.SENARAI], baris: barisSenaraiAsal() },
      { nama: TAB.TETAPAN, tajuk: KOLUM[TAB.TETAPAN], baris: tetapanAsal(sek.nama, tahun) },
      { nama: TAB.AUDIT, tajuk: KOLUM[TAB.AUDIT], baris: [[masa, sesi.email, 'admin', 'SEDIAKAN_SISTEM', sek.slug, 'BERJAYA', 'Versi skema ' + VERSI_SKEMA]] }
    ]);
    sek.sheetId = id;
    sek.sheetDalamFolder = false;
    await simpanSekolah(env, sek);
  }
  if (!sek.sheetDalamFolder) {
    await pindahKeFolder(g, sek.sheetId, sek.folderId);
    sek.sheetDalamFolder = true;
  }
  sek.versiSkema = VERSI_SKEMA;
  sek.sediaPada = sek.sediaPada || new Date(now()).toISOString();
  await simpanSekolah(env, sek);
  return sek;
}

async function jalanSediakan(env, sek, sesi, f, now) {
  try {
    const r = await denganAkses(env, sek, f, now, (g) => sediakanDrive(env, sek, g, sesi, now));
    if (r.gagal) return responsGagalToken(r.gagal, true);
  } catch (e) {
    console.error('Sediakan Drive gagal', sek.slug, e && e.message);
    return ralat(mesejRalatGoogle(e), 502);
  }
  return json({ ok: true, pautanSheet: pautanSheet(sek.sheetId), pautanFolder: pautanFolder(sek.folderId) });
}

// Ujian sebenar: tulis satu baris ke AuditLog dan baca semula Tetapan.
async function ujiDrive(env, sek, f, now) {
  if (!sek.sheetId) return ralat('Google Drive sekolah belum disediakan.', 409, { perluSedia: true });
  try {
    const r = await denganAkses(env, sek, f, now, async (g) => {
      const folder = await infoFail(g, sek.folderId);
      if (folder.trashed) return ralat('Folder "Annur OPR" sekolah berada dalam Tong Sampah Google Drive. Sila pulihkannya.', 409);
      await tambahBaris(g, sek.sheetId, TAB.AUDIT,
        [[new Date(now()).toISOString(), sek.adminEmail, 'admin', 'UJI_SAMBUNGAN', sek.slug, 'BERJAYA', '']]);
      const tetapan = await bacaTetapan(g, sek);
      return json({ ok: true, drive: true, tulis: true, baca: !!tetapan.NAMA_SEKOLAH, namaDalamSheet: tetapan.NAMA_SEKOLAH || '',
        pautanSheet: pautanSheet(sek.sheetId), pautanFolder: pautanFolder(sek.folderId) });
    });
    return r.gagal ? responsGagalToken(r.gagal, true) : r.hasil;
  } catch (e) {
    console.error('Uji Drive gagal', sek.slug, e && e.message);
    return ralat(mesejRalatGoogle(e), 502);
  }
}

// ======================================================================
// Fasa 3a: peranan, guru, tetapan borang, laporan
// ======================================================================

const EMEL_RE = /^[^\s@,;<>"']+@[^\s@,;<>"']+\.[^\s@,;<>"']{2,}$/;

// Jalankan operasi Google dengan token admin. Jika Google jawab 401 (token
// cache sudah dibatalkan), ambil token baharu dan cuba sekali lagi.
async function denganAkses(env, sek, f, now, fn) {
  let t = await tokenAdmin(env, sek, f, now);
  if (!t.ok) return { gagal: t };
  try {
    return { hasil: await fn({ at: t.accessToken, f }) };
  } catch (e) {
    if (!(e instanceof RalatGoogle) || !e.tiadaAkses) throw e;
    await env.OPR_KV.delete('at:' + sek.slug);
    t = await tokenAdmin(env, sek, f, now, { abaiCache: true });
    if (!t.ok) return { gagal: t };
    return { hasil: await fn({ at: t.accessToken, f }) };
  }
}

function responsGagalToken(t, pemilik) {
  if (t.perluSambung) {
    return pemilik
      ? ralat('Sambungan Google admin telah tamat atau dibatalkan. Sila sambung semula.', 409, { perluSambung: true })
      : ralat('Sistem sekolah perlu disambung semula oleh admin sekolah. Sila maklumkan admin.', 503);
  }
  return ralat('Google tidak memberi akses buat masa ini (' + t.ralat + '). Cuba lagi sebentar.', 502);
}

// Peranan dibaca daripada tab Guru setiap kali (tiada cache), supaya guru yang
// dinyahaktif atau diturunkan pangkat terus hilang akses.
async function kenalPasti(g, sek, email) {
  const jadual = await bacaJadual(g, sek.sheetId, TAB.GURU);
  const pemilik = email === sek.adminEmail;
  const baris = jadual.baris.find(r => String(r.Email).trim().toLowerCase() === email);
  if (pemilik) return { peranan: 'admin', pemilik: true, baris, jadual };
  if (!baris) return { peranan: 'tiada', pemilik: false, jadual };
  if (String(baris.Aktif).toUpperCase() !== 'YA') return { peranan: 'tidak_aktif', pemilik: false, baris, jadual };
  return { peranan: String(baris.Peranan).toLowerCase() === 'admin' ? 'admin' : 'guru', pemilik: false, baris, jadual };
}

async function audit(g, sek, sesi, peranan, tindakan, sasaran, status, nota) {
  try {
    await tambahBaris(g, sek.sheetId, TAB.AUDIT, [[new Date().toISOString(), sesi.email, peranan, tindakan, sasaran || '', status || 'BERJAYA', nota || '']]);
  } catch (e) { console.error('Audit gagal', e && e.message); }
}

async function bacaTetapan(g, sek) {
  const t = {};
  (await bacaObjek(g, sek.sheetId, TAB.TETAPAN)).forEach(r => { if (r.Kunci) t[String(r.Kunci).trim()] = String(r.Nilai ?? ''); });
  return t;
}

function jenisTetapan(t) {
  const asas = jenisLalai();
  let masuk = {};
  try { masuk = JSON.parse(t.JENIS_TETAPAN || '{}') || {}; } catch (e) { masuk = {}; }
  for (const k of JENIS_SAH) {
    const m = masuk[k];
    if (!m || typeof m !== 'object') continue;
    for (const kunci of ['nama', 'tajuk', 'penyemak', 'pengesah', 'slot', 'kategori']) {
      if (m[kunci] !== undefined && String(m[kunci]).trim()) asas[k][kunci] = String(m[kunci]).slice(0, 200);
    }
    if (m.aktif !== undefined) asas[k].aktif = m.aktif === true || String(m.aktif).toUpperCase() === 'YA';
  }
  if (!JENIS_SAH.some(k => asas[k].aktif)) asas.KOKURIKULUM.aktif = true;
  return asas;
}

const KUNCI_CONFIG_AWAM = ['NAMA_SEKOLAH', 'ALAMAT_SEKOLAH', 'NAMA_SISTEM', 'TAJUK_DOKUMEN', 'SINGKATAN',
  'TELEFON', 'FAKS', 'MOTO', 'WARNA_1', 'WARNA_2', 'WARNA_AKSEN', 'FOOTER_PDF', 'NAMA_PENGETUA',
  'JAWATAN_PENYEMAK', 'JAWATAN_PENGESAH', 'TAHUN_SESI', 'JENIS_DEFAULT', 'WAJIB_PDF', 'WAJIB_PDF_SEMAK',
  'WARNA_KERTAS', 'SUSUN_GAMBAR', 'GAYA_LAPORAN', 'CONSENT_TEXT', 'PREFIX_FAIL',
  'LOGO3_LABEL', 'LOGO4_LABEL', 'LOGO5_LABEL', 'LOGO6_LABEL', 'LOGO_FOOTER_ALIGN'];

async function bacaConfig(g, sek) {
  const t = await bacaTetapan(g, sek);
  const tetapan = {};
  KUNCI_CONFIG_AWAM.forEach(k => { tetapan[k] = t[k] || ''; });
  const senarai = {};
  (await bacaObjek(g, sek.sheetId, TAB.SENARAI)).forEach(r => {
    if (String(r.Aktif).toUpperCase() === 'TIDAK') return;
    const kat = String(r.Kategori || '').trim(), nilai = String(r.Nilai || '').trim();
    if (!kat || !nilai) return;
    (senarai[kat] = senarai[kat] || []).push({ nilai, susunan: Number(r.Susunan) || 999 });
  });
  for (const k of Object.keys(senarai)) senarai[k] = senarai[k].sort((a, b) => a.susunan - b.susunan).map(x => x.nilai);
  return { tetapan, jenis: jenisTetapan(t), senarai, mentah: t };
}

async function apiSekolah(req, env, url, sek, sesi, sub, f, now) {
  if (sub === '' && req.method === 'GET') return json({ ok: true, slug: sek.slug, nama: sek.nama });
  if (!sesi) return ralat('Belum log masuk.', 401);
  const pemilik = sesi.email === sek.adminEmail;
  const maklumatPemilik = () => ({ statusToken: sek.statusToken, sedia: !!sek.sheetId,
    pautanSheet: sek.sheetId ? pautanSheet(sek.sheetId) : '', pautanFolder: sek.folderId ? pautanFolder(sek.folderId) : '' });

  // Operasi khusus pemilik (sebelum Sheet wujud)
  if (sub === '/setup' && req.method === 'POST') {
    if (!pemilik) return ralat('Hanya admin utama sekolah ini.', 403);
    return await jalanSediakan(env, sek, sesi, f, now);
  }
  if (sub === '/health' && req.method === 'POST') {
    if (!pemilik) return ralat('Hanya admin utama sekolah ini.', 403);
    return await ujiDrive(env, sek, f, now);
  }

  if (!sek.sheetId) {
    if (sub === '/me' && req.method === 'GET') {
      return json({ ok: true, email: sesi.email, nama: sesi.nama, peranan: pemilik ? 'admin' : 'tiada', pemilik,
        belumSedia: true, ...(pemilik ? maklumatPemilik() : {}) });
    }
    return ralat('Sistem sekolah ini belum disediakan oleh admin.', 409, { perluSedia: true });
  }

  let badan = {}, bait = null;
  if (req.method === 'POST' && sub === '/fail') {
    const panjang = Number(req.headers.get('content-length') || 0);
    if (panjang > HAD_FAIL.pdf) return ralat('Fail terlalu besar.', 413);
    bait = new Uint8Array(await req.arrayBuffer());
  } else if (req.method === 'POST') {
    try { badan = await req.json(); } catch (e) { badan = {}; }
  }

  try {
    const r = await denganAkses(env, sek, f, now, async (g) => {
      const kenal = await kenalPasti(g, sek, sesi.email);
      if (sub === '/me' && req.method === 'GET') {
        return json({ ok: true, email: sesi.email, nama: sesi.nama, peranan: kenal.peranan, pemilik,
          ...(pemilik ? maklumatPemilik() : {}) });
      }
      if (kenal.peranan === 'tiada' || kenal.peranan === 'tidak_aktif') {
        return ralat(kenal.peranan === 'tidak_aktif' ? 'Akaun anda telah dinyahaktifkan oleh admin sekolah.' : 'Akaun anda belum didaftarkan dalam sekolah ini.', 403);
      }
      const admin = kenal.peranan === 'admin';
      const ctx = { env, sek, sesi, g, kenal, admin, pemilik, badan, url, now, bait, req };

      if (sub === '/config' && req.method === 'GET') {
        const c = await bacaConfig(g, sek);
        return json({ ok: true, tetapan: c.tetapan, jenis: c.jenis, senarai: c.senarai });
      }
      if (sub === '/guru' && req.method === 'GET') return admin ? senaraiGuru(ctx) : ralat('Hanya admin.', 403);
      if (sub === '/guru' && req.method === 'POST') return admin ? await tambahGuru(ctx) : ralat('Hanya admin.', 403);
      if (sub === '/guru/kemaskini' && req.method === 'POST') return admin ? await kemaskiniGuru(ctx) : ralat('Hanya admin.', 403);
      if (sub === '/laporan' && req.method === 'GET') return await senaraiLaporan(ctx);
      if (sub === '/laporan' && req.method === 'POST') return await simpanLaporan(ctx);
      if (sub === '/fail' && req.method === 'POST') return await terimaFail(ctx);
      const mf = sub.match(/^\/laporan\/([A-Za-z0-9-]{8,64})\/fail\/([A-Za-z0-9_-]{10,128})$/);
      if (mf && req.method === 'GET') return await hantarFail(ctx, mf[1], mf[2]);
      const ml = sub.match(/^\/laporan\/([A-Za-z0-9-]{8,64})(\/padam)?$/);
      if (ml && !ml[2] && req.method === 'GET') return await bacaLaporan(ctx, ml[1]);
      if (ml && ml[2] && req.method === 'POST') return await padamLaporan(ctx, ml[1]);
      return ralat('Laluan tidak dijumpai.', 404);
    });
    if (r.gagal) {
      if (sub === '/me' && pemilik) return json({ ok: true, email: sesi.email, nama: sesi.nama, peranan: 'admin', pemilik, ...maklumatPemilik() });
      return responsGagalToken(r.gagal, pemilik);
    }
    return r.hasil;
  } catch (e) {
    console.error('API sekolah gagal', sek.slug, sub, e && e.message);
    return ralat(mesejRalatGoogle(e), 502);
  }
}

// ---------------------------------------------------------------- guru
function senaraiGuru({ kenal, sek }) {
  const guru = kenal.jadual.baris.map(r => ({
    email: String(r.Email).trim().toLowerCase(), nama: String(r.Nama || ''),
    peranan: String(r.Peranan || 'guru').toLowerCase() === 'admin' ? 'admin' : 'guru',
    aktif: String(r.Aktif).toUpperCase() === 'YA', ditambah: String(r.Ditambah || ''),
    pemilik: String(r.Email).trim().toLowerCase() === sek.adminEmail
  })).filter(x => x.email);
  return json({ ok: true, guru });
}

// Terima teks tampal: satu guru satu baris, "emel" atau "emel, nama" (koma atau tab).
export function huraiSenaraiGuru(teks) {
  const keluar = [], salah = [];
  String(teks || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean).forEach(baris => {
    const [e, ...n] = baris.split(/[,\t;]/);
    const email = String(e || '').trim().toLowerCase();
    const nama = n.join(' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (EMEL_RE.test(email)) keluar.push({ email, nama });
    else salah.push(baris.slice(0, 80));
  });
  return { senarai: keluar, salah };
}

async function tambahGuru({ g, sek, sesi, kenal, pemilik, badan, now }) {
  const peranan = badan.peranan === 'admin' ? 'admin' : 'guru';
  if (peranan === 'admin' && !pemilik) return ralat('Hanya admin utama boleh melantik admin lain.', 403);
  const { senarai, salah } = huraiSenaraiGuru(badan.teks);
  if (!senarai.length) return ralat(salah.length ? 'Tiada emel yang sah dijumpai.' : 'Sila masukkan sekurang-kurangnya satu emel.');
  if (senarai.length > 300) return ralat('Maksimum 300 guru setiap kali.');

  const sedia = new Set(kenal.jadual.baris.map(r => String(r.Email).trim().toLowerCase()));
  const masa = new Date(now()).toISOString();
  const baru = [], diabaikan = salah.map(b => ({ teks: b, sebab: 'Format emel tidak sah' }));
  senarai.forEach(x => {
    if (sedia.has(x.email)) { diabaikan.push({ teks: x.email, sebab: 'Sudah ada dalam senarai' }); return; }
    sedia.add(x.email);
    baru.push(x);
  });
  if (baru.length) {
    await tambahBaris(g, sek.sheetId, TAB.GURU, baru.map(x => [x.email, x.nama, peranan, 'YA', masa, sesi.email]));
    await audit(g, sek, sesi, 'admin', 'TAMBAH_GURU', baru.length + ' akaun', 'BERJAYA', peranan);
  }
  return json({ ok: true, ditambah: baru.map(x => x.email), diabaikan });
}

async function kemaskiniGuru({ g, sek, sesi, kenal, pemilik, badan }) {
  const email = String(badan.email || '').trim().toLowerCase();
  const sasaran = kenal.jadual.baris.find(r => String(r.Email).trim().toLowerCase() === email);
  if (!sasaran) return ralat('Guru tidak dijumpai.', 404);
  if (email === sek.adminEmail) return ralat('Admin utama sekolah tidak boleh diubah atau dinyahaktif.', 403);
  const kiniAdmin = String(sasaran.Peranan).toLowerCase() === 'admin';
  const perananBaru = badan.peranan === undefined ? (kiniAdmin ? 'admin' : 'guru') : (badan.peranan === 'admin' ? 'admin' : 'guru');
  // Melantik, menurunkan atau mengubah admin lain: pemilik sahaja.
  if ((kiniAdmin || perananBaru === 'admin') && !pemilik) return ralat('Hanya admin utama boleh mengubah akaun admin.', 403);
  if (email === sesi.email && badan.aktif === false) return ralat('Anda tidak boleh menyahaktifkan akaun sendiri.', 400);

  const rekod = { ...sasaran, Peranan: perananBaru };
  if (badan.aktif !== undefined) rekod.Aktif = badan.aktif ? 'YA' : 'TIDAK';
  if (badan.nama !== undefined) rekod.Nama = String(badan.nama).replace(/\s+/g, ' ').trim().slice(0, 200);
  const tajuk = kenal.jadual.tajuk;
  await kemaskiniJulat(g, sek.sheetId, TAB.GURU, 'A' + sasaran._baris + ':' + hurufLajur(tajuk.length) + sasaran._baris,
    [barisIkutTajuk(tajuk, rekod)]);
  await audit(g, sek, sesi, kenal.peranan, 'KEMASKINI_GURU', email, 'BERJAYA', 'peranan=' + perananBaru + ' aktif=' + rekod.Aktif);
  return json({ ok: true });
}

// ---------------------------------------------------------------- laporan
async function senaraiLaporan({ g, sek, sesi, admin, url }) {
  const { baris } = await bacaJadual(g, sek.sheetId, TAB.LAPORAN);
  const carian = String(url.searchParams.get('carian') || '').trim().toLowerCase();
  const jenis = String(url.searchParams.get('jenis') || '').trim().toUpperCase();
  const hasil = baris.filter(r => r.ID && String(r.Dipadam).toUpperCase() !== 'YA')
    .filter(r => admin || String(r.PemilikEmail).toLowerCase() === sesi.email)
    .filter(r => !jenis || String(r.Jenis).toUpperCase() === jenis)
    .filter(r => !carian || [r.Tajuk, r.Unit, r.Nama, r.Peringkat, r.Anjuran].join(' ').toLowerCase().includes(carian))
    .map(ringkasan)
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  return json({ ok: true, jumlah: hasil.length, data: hasil.slice(0, 500), admin });
}

async function cariLaporan(g, sek, id) {
  const jadual = await bacaJadual(g, sek.sheetId, TAB.LAPORAN);
  const rekod = jadual.baris.find(r => String(r.ID) === id && String(r.Dipadam).toUpperCase() !== 'YA');
  return { jadual, rekod };
}

async function bacaLaporan({ g, sek, sesi, admin }, id) {
  const { rekod } = await cariLaporan(g, sek, id);
  if (!rekod) return ralat('Laporan tidak dijumpai.', 404);
  if (!admin && String(rekod.PemilikEmail).toLowerCase() !== sesi.email) return ralat('Anda tiada kebenaran untuk laporan ini.', 403);
  return json({ ok: true, data: butiran(rekod) });
}

async function simpanLaporan(ctx) {
  const { g, sek, sesi, admin, kenal, badan, now } = ctx;
  const d = badan.data || {};
  if (!String(d.tajuk || '').trim()) return ralat('Sila isi nama program / aktiviti.');
  const status = String(badan.status || '').toUpperCase() === 'HANTAR' ? STATUS.HANTAR : STATUS.DRAF;
  const masa = new Date(now()).toISOString();
  const tetapan = await bacaTetapan(g, sek);

  if (badan.id) {
    const { jadual, rekod: lama } = await cariLaporan(g, sek, String(badan.id));
    if (!lama) return ralat('Laporan tidak dijumpai.', 404);
    if (!admin && String(lama.PemilikEmail).toLowerCase() !== sesi.email) {
      await audit(g, sek, sesi, kenal.peranan, 'SIMPAN_LAPORAN', lama.ID, 'DITOLAK', 'bukan pemilik');
      return ralat('Anda hanya boleh mengemas kini laporan sendiri.', 403);
    }
    if (String(lama.Status).toUpperCase() === STATUS.DISEMAK && !admin) return ralat('Laporan yang telah disemak tidak boleh diubah. Hubungi admin.', 403);
    // Admin yang mengedit laporan telah disemak: status semakan dikekalkan (bug v2 diperbaiki).
    const statusAkhir = String(lama.Status).toUpperCase() === STATUS.DISEMAK ? STATUS.DISEMAK : status;
    const rekod = binaRekod(d, { lama, sesi, status: statusAkhir, tetapan, masa });
    const f = await pakaiFail(ctx, rekod, lama, tetapan);
    if (f.respons) return f.respons;
    const tajuk = jadual.tajuk;
    await kemaskiniJulat(g, sek.sheetId, TAB.LAPORAN, 'A' + lama._baris + ':' + hurufLajur(tajuk.length) + lama._baris, [barisIkutTajuk(tajuk, rekod)]);
    await selesaiFail(ctx, f);
    await audit(g, sek, sesi, kenal.peranan, 'SIMPAN_LAPORAN', rekod.ID, 'BERJAYA', rekod.Jenis + ' / ' + statusAkhir + ' (kemas kini)');
    return json({ ok: true, id: rekod.ID, status: statusAkhir });
  }

  if (!badan.consent) return ralat('Sila tanda persetujuan notis PDPA sebelum menyimpan.');
  const rekod = binaRekod(d, { lama: null, sesi, status, tetapan, id: crypto.randomUUID(), masa });
  const f = await pakaiFail(ctx, rekod, null, tetapan);
  if (f.respons) return f.respons;
  const { tajuk } = await bacaJadual(g, sek.sheetId, TAB.LAPORAN);
  await tambahBaris(g, sek.sheetId, TAB.LAPORAN, [barisIkutTajuk(tajuk.length ? tajuk : KOLUM[TAB.LAPORAN], rekod)]);
  await selesaiFail(ctx, f);
  await audit(g, sek, sesi, kenal.peranan, 'SIMPAN_LAPORAN', rekod.ID, 'BERJAYA', rekod.Jenis + ' / ' + status + ' (baharu)');
  return json({ ok: true, id: rekod.ID, status });
}

async function padamLaporan({ g, sek, sesi, admin, kenal, now }, id) {
  const { jadual, rekod } = await cariLaporan(g, sek, id);
  if (!rekod) return ralat('Laporan tidak dijumpai.', 404);
  if (!admin && String(rekod.PemilikEmail).toLowerCase() !== sesi.email) return ralat('Anda hanya boleh memadam laporan sendiri.', 403);
  if (String(rekod.Status).toUpperCase() === STATUS.DISEMAK && !admin) return ralat('Laporan yang telah disemak tidak boleh dipadam.', 403);
  const baru = { ...rekod, Dipadam: 'YA', DikemaskiniPada: new Date(now()).toISOString() };
  await kemaskiniJulat(g, sek.sheetId, TAB.LAPORAN, 'A' + rekod._baris + ':' + hurufLajur(jadual.tajuk.length) + rekod._baris, [barisIkutTajuk(jadual.tajuk, baru)]);
  await audit(g, sek, sesi, kenal.peranan, 'PADAM_LAPORAN', id, 'BERJAYA', 'soft delete');
  return json({ ok: true });
}


// ---------------------------------------------------------------- fail (PDF + gambar)
const HAD_FAIL = { lampiran: 10 * 1024 * 1024, pdf: 25 * 1024 * 1024 };
const MIME_FAIL = { lampiran: ['image/jpeg', 'image/png', 'image/webp'], pdf: ['application/pdf'] };
const MAKS_LAMPIRAN = 20;

function namaFailSelamat(n, lalai) {
  const s = String(n || '').replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 150);
  return s || lalai;
}

// Terima satu fail (badan binari). Fail disimpan terus ke subfolder Drive
// sekolah dan direkod sebagai "muat naik tergantung" milik pengguna ini
// sehingga ia dilampirkan pada laporan (atau luput selepas 1 hari).
async function terimaFail({ env, g, sek, sesi, url, bait, req }) {
  const jenis = url.searchParams.get('jenis') === 'pdf' ? 'pdf' : 'lampiran';
  const mime = String(req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!MIME_FAIL[jenis].includes(mime)) return ralat(jenis === 'pdf' ? 'Hanya fail PDF dibenarkan.' : 'Hanya gambar JPG, PNG atau WEBP dibenarkan.', 400);
  if (!bait || !bait.length) return ralat('Fail kosong.', 400);
  if (bait.length > HAD_FAIL[jenis]) return ralat('Fail melebihi had ' + Math.round(HAD_FAIL[jenis] / 1048576) + 'MB.', 413);
  const sub = sek.subfolder || {};
  const folder = (jenis === 'pdf' ? sub.PDF : sub.LAMPIRAN) || sek.folderId;
  const nama = namaFailSelamat(url.searchParams.get('nama'), jenis === 'pdf' ? 'laporan.pdf' : 'gambar.jpg');
  const id = await muatNaik(g, folder, nama, mime, bait);
  await env.OPR_KV.put('upload:' + sek.slug + ':' + id, JSON.stringify({ email: sesi.email, jenis }), { expirationTtl: 86400 });
  return json({ ok: true, fileId: id });
}

// Sahkan fail yang dirujuk oleh laporan dan isi medan fail dalam rekod.
// Fail baharu MESTI dimuat naik oleh pengguna yang sama untuk sekolah ini.
async function pakaiFail({ env, sek, sesi, badan }, rekod, lama, tetapan) {
  const lamaPdf = lama ? String(lama.PdfFileId || '') : '';
  const lamaLampiran = lama ? String(lama.LampiranIds || '').split(',').filter(Boolean) : [];
  const pdf = badan.pdfFileId !== undefined ? String(badan.pdfFileId || '') : lamaPdf;
  const lampiran = Array.isArray(badan.lampiranIds) ? badan.lampiranIds.map(String).filter(Boolean) : lamaLampiran;
  if (lampiran.length > MAKS_LAMPIRAN) return { respons: ralat('Maksimum ' + MAKS_LAMPIRAN + ' gambar setiap laporan.') };
  if (String(tetapan.WAJIB_PDF || '').toUpperCase() === 'YA' && !pdf) {
    return { respons: ralat('Sekolah anda menetapkan PDF wajib dijana sebelum laporan disimpan. Hidupkan "Jana PDF".') };
  }
  const baharu = [];
  const semak = [[pdf, 'pdf', lamaPdf ? [lamaPdf] : []], ...lampiran.map(id => [id, 'lampiran', lamaLampiran])];
  for (const [id, jenis, sedia] of semak) {
    if (!id || sedia.includes(id)) continue;
    if (!/^[A-Za-z0-9_-]{10,128}$/.test(id)) return { respons: ralat('Rujukan fail tidak sah.') };
    const rek = await env.OPR_KV.get('upload:' + sek.slug + ':' + id, 'json');
    if (!rek || rek.email !== sesi.email || rek.jenis !== jenis) return { respons: ralat('Fail tidak sah atau sudah luput. Sila muat naik semula.', 400) };
    baharu.push(id);
  }
  rekod.PdfFileId = pdf;
  rekod.PdfNama = pdf ? (pdf === lamaPdf ? String(lama.PdfNama || '') : namaFailSelamat(badan.pdfNama, 'laporan.pdf')) : '';
  rekod.LampiranIds = lampiran.join(',');
  const buang = [lamaPdf, ...lamaLampiran].filter(id => id && id !== pdf && !lampiran.includes(id));
  return { baharu, buang };
}

// Dipanggil HANYA selepas baris laporan berjaya ditulis: fail lama yang tidak
// lagi dirujuk dibuang ke Tong Sampah (bug v2: fail lama dibuang dahulu).
async function selesaiFail({ env, g, sek }, f) {
  for (const id of f.baharu) await env.OPR_KV.delete('upload:' + sek.slug + ':' + id);
  for (const id of f.buang) {
    try { await buangKeTong(g, id); } catch (e) { console.error('Buang fail lama gagal', id, e && e.message); }
  }
}

async function hantarFail({ g, sek, sesi, admin }, id, fileId) {
  const { rekod } = await cariLaporan(g, sek, id);
  if (!rekod) return ralat('Laporan tidak dijumpai.', 404);
  if (!admin && String(rekod.PemilikEmail).toLowerCase() !== sesi.email) return ralat('Anda tiada kebenaran untuk fail ini.', 403);
  const dibenar = [rekod.PdfFileId, rekod.PdfDisemakId, ...String(rekod.LampiranIds || '').split(',')].map(String).filter(Boolean);
  if (!dibenar.includes(fileId)) return ralat('Fail tidak berkaitan dengan laporan ini.', 404);
  const res = await muatTurun(g, fileId);
  return new Response(res.body, { headers: {
    'content-type': res.headers.get('content-type') || 'application/octet-stream',
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff'
  } });
}

// ======================================================================
// Halaman sekolah /s/<slug>
// ======================================================================

async function halamanSekolah(req, env, url) {
  // Lapisan aset melencongkan /sekolah.html ke /sekolah, jadi minta /sekolah terus.
  const asal = await env.ASSETS.fetch(new Request(new URL('/sekolah', url.origin), { headers: req.headers }));
  const h = new Headers(asal.headers);
  Object.entries(KESELAMATAN_HTML).forEach(([k, v]) => h.set(k, v));
  return new Response(asal.body, { status: asal.status, headers: h });
}

