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
  if (p === '/api/diag' && req.method === 'GET') return diag(env, url);

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
    return await ciptaSekolah(req, env, sesi, now);
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
      return json({ ok: true, email: sesi.email, nama: sesi.nama, peranan,
        statusToken: peranan === 'admin' ? sek.statusToken : undefined });
    }
    if (sub === '/health' && req.method === 'POST') {
      if (!sesi) return ralat('Belum log masuk.', 401);
      if (sesi.email !== sek.adminEmail) return ralat('Hanya admin sekolah ini.', 403);
      return await ujiDrive(env, sek, f, now);
    }
  }

  return ralat('Laluan tidak dijumpai.', 404);
}

// Diagnosis konfigurasi. HANYA bentuk (ada/tiada, panjang, awalan format) dan
// tidak pernah memulangkan nilai rahsia. Awalan "GOCSPX-" ialah format tetap
// semua secret Google, bukan sebahagian daripada nilai rahsia.
function diag(env, url) {
  const id = String(env.GOOGLE_CLIENT_ID || '');
  const sec = String(env.GOOGLE_CLIENT_SECRET || '');
  const app = String(env.APP_SECRET || '');
  return json({
    ok: true,
    redirectUri: asasUrl(env, url) + '/auth/callback',
    clientId: { ada: !!id, formatBetul: /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(id), nomborProjek: id.split('-')[0] || '' },
    clientSecret: {
      ada: !!sec,
      panjang: sec.length,
      bermulaGOCSPX: sec.startsWith('GOCSPX-'),
      adaRuangKosong: /\s/.test(sec),
      adaPetik: /['"]/.test(sec)
    },
    appSecret: { ada: !!app, panjang: app.length, cukupPanjang: app.length >= 32 },
    kv: !!env.OPR_KV
  });
}

async function ciptaSekolah(req, env, sesi, now) {
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
  return json({ ok: true, slug: s.slug, pautan: '/s/' + s.slug });
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

async function ujiDrive(env, sek, f, now) {
  const t = await tokenAdmin(env, sek, f, now);
  if (!t.ok) {
    return t.perluSambung
      ? ralat('Sambungan Google admin telah tamat atau dibatalkan. Sila sambung semula.', 409, { perluSambung: true })
      : ralat('Google tidak memberi akses buat masa ini (' + t.ralat + '). Cuba lagi sebentar.', 502);
  }
  const info = await f('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(t.accessToken));
  const d = await info.json().catch(() => ({}));
  const skop = String(d.scope || t.skop).split(/\s+/);
  return json({ ok: true, drive: skop.includes(SKOP_DRIVE), emailToken: d.email || '' });
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

