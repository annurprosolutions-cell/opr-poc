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
  tambahBaris, bacaObjek, pautanSheet, pautanFolder
} from './google.js';
import { VERSI_SKEMA, TAB, KOLUM, SUBFOLDER, tetapanAsal, barisSenaraiAsal } from './skema.js';

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

  m = p.match(/^\/api\/s\/([^/]+)(\/[a-z]+)?$/);
  if (m) {
    const s = semakSlug(decodeURIComponent(m[1]));
    const sek = s.ok ? await env.OPR_KV.get('school:' + s.slug, 'json') : null;
    if (!sek) return ralat('Sekolah tidak dijumpai.', 404);
    const sub = m[2] || '';

    if (sub === '' && req.method === 'GET') {
      return json({ ok: true, slug: sek.slug, nama: sek.nama });
    }
    if (sub === '/me' && req.method === 'GET') {
      if (!sesi) return ralat('Belum log masuk.', 401);
      const peranan = sesi.email === sek.adminEmail ? 'admin' : 'tiada';
      const asas = { ok: true, email: sesi.email, nama: sesi.nama, peranan };
      if (peranan !== 'admin') return json(asas);
      return json({ ...asas, statusToken: sek.statusToken, sedia: !!sek.sheetId,
        pautanSheet: sek.sheetId ? pautanSheet(sek.sheetId) : '',
        pautanFolder: sek.folderId ? pautanFolder(sek.folderId) : '' });
    }
    if (sub === '/setup' && req.method === 'POST') {
      if (!sesi) return ralat('Belum log masuk.', 401);
      if (sesi.email !== sek.adminEmail) return ralat('Hanya admin sekolah ini.', 403);
      return await jalanSediakan(env, sek, sesi, f, now);
    }
    if (sub === '/health' && req.method === 'POST') {
      if (!sesi) return ralat('Belum log masuk.', 401);
      if (sesi.email !== sek.adminEmail) return ralat('Hanya admin sekolah ini.', 403);
      return await ujiDrive(env, sek, f, now);
    }
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
    const t = await tokenAdmin(env, rekod, fGlobal, now);
    if (t.ok) { await sediakanDrive(env, rekod, { at: t.accessToken, f: fGlobal }, sesi, now); sedia = true; }
    else ralatSedia = t.perluSambung ? 'Sambungan Google tamat.' : (t.ralat || '');
  } catch (e) { ralatSedia = mesejRalatGoogle(e); }
  return json({ ok: true, slug: s.slug, pautan: '/s/' + s.slug, sedia, ralatSedia });
}

// Dapatkan access token admin daripada refresh token tersulit.
// Dikongsi oleh semua ciri seterusnya (Sheet, Drive).
export async function tokenAdmin(env, sek, f, now) {
  if (sek.statusToken === 'perlu_sambung') {
    return { ok: false, perluSambung: true };
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
      return { ok: false, perluSambung: true };
    }
    return { ok: false, perluSambung: false, ralat: t.error || ('HTTP ' + res.status) };
  }
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

async function aksesAdmin(env, sek, f, now) {
  const t = await tokenAdmin(env, sek, f, now);
  if (t.ok) return { g: { at: t.accessToken, f } };
  return {
    respons: t.perluSambung
      ? ralat('Sambungan Google admin telah tamat atau dibatalkan. Sila sambung semula.', 409, { perluSambung: true })
      : ralat('Google tidak memberi akses buat masa ini (' + t.ralat + '). Cuba lagi sebentar.', 502)
  };
}

async function jalanSediakan(env, sek, sesi, f, now) {
  const a = await aksesAdmin(env, sek, f, now);
  if (a.respons) return a.respons;
  try {
    await sediakanDrive(env, sek, a.g, sesi, now);
  } catch (e) {
    console.error('Sediakan Drive gagal', sek.slug, e && e.message);
    return ralat(mesejRalatGoogle(e), 502);
  }
  return json({ ok: true, pautanSheet: pautanSheet(sek.sheetId), pautanFolder: pautanFolder(sek.folderId) });
}

// Ujian sebenar: tulis satu baris ke AuditLog dan baca semula Tetapan.
async function ujiDrive(env, sek, f, now) {
  if (!sek.sheetId) return ralat('Google Drive sekolah belum disediakan.', 409, { perluSedia: true });
  const a = await aksesAdmin(env, sek, f, now);
  if (a.respons) return a.respons;
  try {
    const folder = await infoFail(a.g, sek.folderId);
    if (folder.trashed) return ralat('Folder "Annur OPR" sekolah berada dalam Tong Sampah Google Drive. Sila pulihkannya.', 409);
    await tambahBaris(a.g, sek.sheetId, TAB.AUDIT,
      [[new Date(now()).toISOString(), sek.adminEmail, 'admin', 'UJI_SAMBUNGAN', sek.slug, 'BERJAYA', '']]);
    const tetapan = await bacaObjek(a.g, sek.sheetId, TAB.TETAPAN);
    const nama = (tetapan.find(r => r.Kunci === 'NAMA_SEKOLAH') || {}).Nilai || '';
    return json({ ok: true, drive: true, tulis: true, baca: !!nama, namaDalamSheet: String(nama),
      pautanSheet: pautanSheet(sek.sheetId), pautanFolder: pautanFolder(sek.folderId) });
  } catch (e) {
    console.error('Uji Drive gagal', sek.slug, e && e.message);
    return ralat(mesejRalatGoogle(e), 502);
  }
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

