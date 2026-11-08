import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/worker.js';
import { sulit, nyahsulit, semakSlug, b64url } from '../src/lib.js';

const ASAS = 'https://opr.annurpro.com';
const CLIENT_ID = 'ujian.apps.googleusercontent.com';
const DRIVE = 'https://www.googleapis.com/auth/drive.file';
const T0 = Date.UTC(2026, 10, 8, 2, 0, 0);

// ---------------------------------------------------------------- palsu
function kvPalsu() {
  const m = new Map();
  return {
    m,
    async get(k, jenis) { const v = m.has(k) ? m.get(k) : null; return v !== null && jenis === 'json' ? JSON.parse(v) : v; },
    async put(k, v) { m.set(k, String(v)); },
    async delete(k) { m.delete(k); }
  };
}

function env(lebih = {}) {
  return {
    BASE_URL: ASAS,
    GOOGLE_CLIENT_ID: CLIENT_ID,
    GOOGLE_CLIENT_SECRET: 'rahsia-ujian',
    APP_SECRET: 'a'.repeat(48),
    OPR_KV: kvPalsu(),
    ASSETS: { fetch: async (r) => new Response('ASET ' + new URL(r.url).pathname, { headers: { 'content-type': 'text/html' } }) },
    ...lebih
  };
}

function idToken(tuntutan) {
  const bhg = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  return bhg({ alg: 'RS256' }) + '.' + bhg(tuntutan) + '.sig';
}

// Google palsu: rekod setiap panggilan, jawab ikut senario.
function googlePalsu(senario = {}) {
  const panggilan = [];
  const f = async (url, opt = {}) => {
    const u = String(url);
    const badan = opt.body ? new URLSearchParams(String(opt.body)) : null;
    panggilan.push({ url: u, badan });
    if (u === 'https://oauth2.googleapis.com/token' && badan.get('grant_type') === 'authorization_code') {
      const email = senario.email || 'admin@sekolah.edu.my';
      return Response.json({
        access_token: 'akses-1',
        refresh_token: senario.tiadaRefresh ? undefined : 'refresh-' + email,
        scope: senario.skop || ('openid https://www.googleapis.com/auth/userinfo.email ' + DRIVE),
        id_token: idToken({
          iss: 'https://accounts.google.com', aud: senario.aud || CLIENT_ID,
          exp: Math.floor(T0 / 1000) + 3600, email, email_verified: true, name: 'Cikgu Ujian'
        })
      });
    }
    if (u === 'https://oauth2.googleapis.com/token' && badan.get('grant_type') === 'refresh_token') {
      if (senario.refreshMati) return Response.json({ error: 'invalid_grant' }, { status: 400 });
      return Response.json({ access_token: 'akses-2', scope: DRIVE });
    }
    if (u.startsWith('https://oauth2.googleapis.com/tokeninfo')) {
      return Response.json({ scope: DRIVE, email: senario.email || 'admin@sekolah.edu.my' });
    }
    return new Response('tidak dijangka: ' + u, { status: 599 });
  };
  return { f, panggilan };
}

function deps(g) { return { fetch: g.f, now: () => T0 }; }

function kukiDari(res) {
  const semua = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
  const peta = {};
  semua.filter(Boolean).forEach(k => { const [nv] = k.split(';'); const i = nv.indexOf('='); peta[nv.slice(0, i)] = decodeURIComponent(nv.slice(i + 1)); });
  return peta;
}

function req(laluan, opt = {}) {
  const h = new Headers(opt.headers || {});
  if (opt.kuki) h.set('Cookie', Object.entries(opt.kuki).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('; '));
  if (opt.method && opt.method !== 'GET' && opt.origin !== false) h.set('Origin', opt.origin || ASAS);
  return new Request(ASAS + laluan, { method: opt.method || 'GET', headers: h, body: opt.body ? JSON.stringify(opt.body) : undefined });
}

// Jalankan aliran log masuk penuh dan pulangkan kuki sesi.
async function logMasuk(e, g, mode, lebih = '') {
  const r1 = await handle(req('/auth/login?mode=' + mode + lebih), e, deps(g));
  const lokasi = new URL(r1.headers.get('location'));
  const state = lokasi.searchParams.get('state');
  const k1 = kukiDari(r1);
  const r2 = await handle(req('/auth/callback?code=kod&state=' + state, { kuki: k1 }), e, deps(g));
  return { r1, r2, lokasi, sesi: kukiDari(r2).opr_sesi };
}

// ---------------------------------------------------------------- ujian
test('login admin: ke Google dengan PKCE, offline dan skop drive.file', async () => {
  const e = env(); const g = googlePalsu();
  const r = await handle(req('/auth/login?mode=admin&next=/daftar'), e, deps(g));
  assert.equal(r.status, 302);
  const u = new URL(r.headers.get('location'));
  assert.equal(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(u.searchParams.get('redirect_uri'), ASAS + '/auth/callback');
  assert.equal(u.searchParams.get('access_type'), 'offline');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(u.searchParams.get('scope').includes(DRIVE));
  const st = await e.OPR_KV.get('state:' + u.searchParams.get('state'), 'json');
  assert.equal(st.mode, 'admin');
  assert.equal(st.next, '/daftar');
});

test('login guru: tiada skop Drive dan tiada akses offline', async () => {
  const e = env();
  const r = await handle(req('/auth/login?mode=guru&s=smkwakanda'), e, deps(googlePalsu()));
  const u = new URL(r.headers.get('location'));
  assert.ok(!u.searchParams.get('scope').includes('drive'));
  assert.equal(u.searchParams.get('access_type'), null);
});

test('aliran penuh: admin sambung, daftar sekolah, uji Drive', async () => {
  const e = env(); const g = googlePalsu();
  const { r2, sesi } = await logMasuk(e, g, 'admin', '&next=/daftar');
  assert.equal(r2.headers.get('location'), '/daftar');
  assert.ok(sesi);

  // refresh token disimpan tersulit, bukan teks biasa
  const pending = e.OPR_KV.m.get('pending:admin@sekolah.edu.my');
  assert.ok(pending && !pending.includes('refresh-admin'));

  const me = await (await handle(req('/api/me', { kuki: { opr_sesi: sesi } }), e, deps(g))).json();
  assert.equal(me.driveDisambung, true);
  assert.equal(me.sekolahAdmin, null);

  const cipta = await handle(req('/api/schools', { method: 'POST', kuki: { opr_sesi: sesi }, body: { nama: 'SMK Wakanda', slug: 'smkwakanda' } }), e, deps(g));
  assert.equal(cipta.status, 200);
  assert.equal((await cipta.json()).pautan, '/s/smkwakanda');

  const peranan = await (await handle(req('/api/s/smkwakanda/me', { kuki: { opr_sesi: sesi } }), e, deps(g))).json();
  assert.equal(peranan.peranan, 'admin');

  const uji = await (await handle(req('/api/s/smkwakanda/health', { method: 'POST', kuki: { opr_sesi: sesi } }), e, deps(g))).json();
  assert.equal(uji.ok, true);
  assert.equal(uji.drive, true);
  const refresh = g.panggilan.find(p => p.badan && p.badan.get('grant_type') === 'refresh_token');
  assert.equal(refresh.badan.get('refresh_token'), 'refresh-admin@sekolah.edu.my');
});

test('admin kedua tidak boleh daftar sekolah kedua; slug sama ditolak', async () => {
  const e = env(); const g = googlePalsu();
  const { sesi } = await logMasuk(e, g, 'admin');
  await handle(req('/api/schools', { method: 'POST', kuki: { opr_sesi: sesi }, body: { nama: 'SMK Wakanda', slug: 'smkwakanda' } }), e, deps(g));

  const ulang = await handle(req('/api/schools', { method: 'POST', kuki: { opr_sesi: sesi }, body: { nama: 'SMK Lain', slug: 'smklain' } }), e, deps(g));
  assert.equal(ulang.status, 409);

  const g2 = googlePalsu({ email: 'lain@sekolah.edu.my' });
  const b = await logMasuk(e, g2, 'admin');
  const sama = await handle(req('/api/schools', { method: 'POST', kuki: { opr_sesi: b.sesi }, body: { nama: 'Tiruan', slug: 'smkwakanda' } }), e, deps(g2));
  assert.equal(sama.status, 409);
});

test('guru log masuk: peranan "tiada" sehingga didaftarkan (Fasa 3)', async () => {
  const e = env(); const g = googlePalsu();
  const a = await logMasuk(e, g, 'admin');
  await handle(req('/api/schools', { method: 'POST', kuki: { opr_sesi: a.sesi }, body: { nama: 'SMK Wakanda', slug: 'smkwakanda' } }), e, deps(g));

  const gg = googlePalsu({ email: 'guru@gmail.com', skop: 'openid email' });
  const { r2, sesi } = await logMasuk(e, gg, 'guru', '&s=smkwakanda');
  assert.equal(r2.headers.get('location'), '/s/smkwakanda');
  const me = await (await handle(req('/api/s/smkwakanda/me', { kuki: { opr_sesi: sesi } }), e, deps(gg))).json();
  assert.equal(me.peranan, 'tiada');
  const uji = await handle(req('/api/s/smkwakanda/health', { method: 'POST', kuki: { opr_sesi: sesi } }), e, deps(gg));
  assert.equal(uji.status, 403);
});

test('admin tolak kebenaran Drive: tiada token disimpan', async () => {
  const e = env(); const g = googlePalsu({ skop: 'openid email' });
  const { r2 } = await logMasuk(e, g, 'admin');
  assert.equal(r2.headers.get('location'), '/daftar?ralat=drive_tidak_dibenarkan');
  assert.equal(e.OPR_KV.m.get('pending:admin@sekolah.edu.my'), undefined);
});

test('callback ditolak: kuki state tidak sepadan dan aud salah', async () => {
  const e = env(); const g = googlePalsu();
  const r1 = await handle(req('/auth/login?mode=guru'), e, deps(g));
  const state = new URL(r1.headers.get('location')).searchParams.get('state');
  const tanpaKuki = await handle(req('/auth/callback?code=x&state=' + state), e, deps(g));
  assert.match(tanpaKuki.headers.get('location'), /state_tidak_sepadan/);

  const gSalah = googlePalsu({ aud: 'client-lain' });
  const r = await logMasuk(e, gSalah, 'guru');
  assert.match(r.r2.headers.get('location'), /id_token_tidak_sah/);
  assert.equal(r.sesi, undefined);
});

test('refresh token dibatalkan: sekolah ditanda perlu sambung semula', async () => {
  const e = env(); const g = googlePalsu();
  const { sesi } = await logMasuk(e, g, 'admin');
  await handle(req('/api/schools', { method: 'POST', kuki: { opr_sesi: sesi }, body: { nama: 'SMK Wakanda', slug: 'smkwakanda' } }), e, deps(g));

  const gMati = googlePalsu({ refreshMati: true });
  const r = await handle(req('/api/s/smkwakanda/health', { method: 'POST', kuki: { opr_sesi: sesi } }), e, deps(gMati));
  assert.equal(r.status, 409);
  assert.equal((await r.json()).perluSambung, true);
  assert.equal((await e.OPR_KV.get('school:smkwakanda', 'json')).statusToken, 'perlu_sambung');

  // Sambung semula: token baharu, status kembali ok
  const s2 = await logMasuk(e, g, 'admin', '&s=smkwakanda');
  assert.equal(s2.r2.headers.get('location'), '/s/smkwakanda?disambung=1');
  assert.equal((await e.OPR_KV.get('school:smkwakanda', 'json')).statusToken, 'ok');
});

test('POST tanpa Origin yang sah ditolak', async () => {
  const e = env();
  const r1 = await handle(req('/api/schools', { method: 'POST', origin: false, body: {} }), e, deps(googlePalsu()));
  assert.equal(r1.status, 403);
  const r2 = await handle(req('/api/schools', { method: 'POST', origin: 'https://jahat.example', body: {} }), e, deps(googlePalsu()));
  assert.equal(r2.status, 403);
});

test('semakan slug', async () => {
  assert.equal(semakSlug('smkwakanda').ok, true);
  assert.equal(semakSlug('SMK-Wakanda').slug, 'smk-wakanda');
  assert.equal(semakSlug('ab').ok, false);
  assert.equal(semakSlug('-smk').ok, false);
  assert.equal(semakSlug('smk--a').ok, false);
  assert.equal(semakSlug('daftar').ok, false);
  assert.equal(semakSlug('smk wakanda').ok, false);

  const e = env();
  const r = await (await handle(req('/api/slug/panduan'), e, deps(googlePalsu()))).json();
  assert.equal(r.tersedia, false);
});

test('next tidak boleh lencong ke domain lain', async () => {
  const e = env();
  const r = await handle(req('/auth/login?mode=guru&next=//jahat.example'), e, deps(googlePalsu()));
  const st = await e.OPR_KV.get('state:' + new URL(r.headers.get('location')).searchParams.get('state'), 'json');
  assert.equal(st.next, '/');
});

test('halaman /s/<slug> dihidang dari aset /sekolah dengan header keselamatan', async () => {
  const e = env();
  const r = await handle(req('/s/smkwakanda'), e, deps(googlePalsu()));
  assert.equal(await r.text(), 'ASET /sekolah');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
});

test('sulitan token: pusingan penuh dan kunci salah gagal', async () => {
  const blob = await sulit('rahsia-token', 'k'.repeat(40));
  assert.equal(await nyahsulit(blob, 'k'.repeat(40)), 'rahsia-token');
  await assert.rejects(nyahsulit(blob, 'z'.repeat(40)));
  await assert.rejects(sulit('x', 'pendek'));
});

test('tukar token gagal: kod ralat Google dipaparkan dalam URL, tanpa rahsia', async () => {
  const e = env();
  const g = googlePalsu();
  const f0 = g.f;
  const gagalKlien = async (url, opt) => {
    const b = opt && opt.body ? new URLSearchParams(String(opt.body)) : null;
    if (String(url) === 'https://oauth2.googleapis.com/token' && b && b.get('grant_type') === 'authorization_code') {
      return Response.json({ error: 'invalid_client', error_description: 'Unauthorized' }, { status: 401 });
    }
    return f0(url, opt);
  };
  const r1 = await handle(req('/auth/login?mode=guru'), e, deps(g));
  const state = new URL(r1.headers.get('location')).searchParams.get('state');
  const r2 = await handle(req('/auth/callback?code=x&state=' + state, { kuki: kukiDari(r1) }), e, { fetch: gagalKlien, now: () => T0 });
  const lok = r2.headers.get('location');
  assert.match(lok, /ralat=tukar_token_gagal/);
  assert.match(lok, /d=invalid_client/);
  assert.match(lok, /m=Unauthorized/);
  assert.ok(!lok.includes('rahsia-ujian'));
});

test('/api/diag: tunjuk bentuk konfigurasi, tidak pernah memulangkan nilai rahsia', async () => {
  const sec = 'GOCSPX-' + 'x'.repeat(28);
  const e = env({ GOOGLE_CLIENT_SECRET: sec, GOOGLE_CLIENT_ID: '123-abc.apps.googleusercontent.com' });
  const r = await handle(req('/api/diag'), e, deps(googlePalsu()));
  const teks = await r.text();
  const d = JSON.parse(teks);
  assert.equal(d.clientSecret.ada, true);
  assert.equal(d.clientSecret.panjang, 35);
  assert.equal(d.clientSecret.bermulaGOCSPX, true);
  assert.equal(d.clientSecret.adaRuangKosong, false);
  assert.equal(d.clientId.nomborProjek, '123');
  assert.equal(d.redirectUri, ASAS + '/auth/callback');
  assert.ok(!teks.includes(sec) && !teks.includes('a'.repeat(48)));

  const kosong = await (await handle(req('/api/diag'), env({ GOOGLE_CLIENT_SECRET: '' }), deps(googlePalsu()))).json();
  assert.equal(kosong.clientSecret.ada, false);
  const buruk = await (await handle(req('/api/diag'), env({ GOOGLE_CLIENT_SECRET: ' GOCSPX-abc\n' }), deps(googlePalsu()))).json();
  assert.equal(buruk.clientSecret.adaRuangKosong, true);
});
