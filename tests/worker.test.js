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

// Google palsu: OAuth + Drive + Sheets dalam memori. Rekod setiap panggilan.
function googlePalsu(senario = {}) {
  const panggilan = [];
  const fail = new Map();      // id -> { name, mimeType, parents, trashed }
  const sheet = new Map();     // id -> { title, tabs: Map(nama -> rows[][]) }
  let kiraan = 0;
  const gagalSheetKali = { n: senario.gagalSheetKali || 0 };

  const f = async (url, opt = {}) => {
    const u = String(url);
    const kaedah = (opt.method || 'GET').toUpperCase();
    const teks = opt.body instanceof Blob ? '' : (opt.body ? String(opt.body) : '');
    const badanForm = u.startsWith('https://oauth2.googleapis.com/token') ? new URLSearchParams(teks) : null;
    panggilan.push({ url: u, kaedah, badan: badanForm });

    if (u === 'https://oauth2.googleapis.com/token' && badanForm.get('grant_type') === 'authorization_code') {
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
    if (u === 'https://oauth2.googleapis.com/token' && badanForm.get('grant_type') === 'refresh_token') {
      if (senario.refreshMati) return Response.json({ error: 'invalid_grant' }, { status: 400 });
      return Response.json({ access_token: 'akses-2', scope: DRIVE });
    }
    if (u.startsWith('https://oauth2.googleapis.com/tokeninfo')) {
      return Response.json({ scope: DRIVE, email: senario.email || 'admin@sekolah.edu.my' });
    }

    // ---- Drive
    const mDrive = u.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files(?:\/([^?]+))?(?:\?(.*))?$/);
    if (mDrive) {
      const [, id, qs] = mDrive; const q = new URLSearchParams(qs || '');
      if (!id && kaedah === 'POST') {
        const meta = JSON.parse(teks);
        const nid = 'fold-' + (++kiraan);
        fail.set(nid, { name: meta.name, mimeType: meta.mimeType, parents: meta.parents || ['root'], trashed: false });
        return Response.json({ id: nid, name: meta.name });
      }
      const rec = fail.get(id);
      if (!rec) return Response.json({ error: { code: 404, message: 'File not found: ' + id } }, { status: 404 });
      if (kaedah === 'GET') return Response.json({ id, name: rec.name, parents: rec.parents, trashed: rec.trashed });
      if (kaedah === 'PATCH') {
        const tambah = q.get('addParents'), buang = q.get('removeParents');
        if (buang) rec.parents = rec.parents.filter(x => !buang.split(',').includes(x));
        if (tambah) rec.parents.push(...tambah.split(','));
        const meta = teks ? JSON.parse(teks) : {};
        if (meta.trashed) rec.trashed = true;
        return Response.json({ id, parents: rec.parents });
      }
    }

    // ---- Sheets
    if (u.startsWith('https://sheets.googleapis.com/v4/spreadsheets')) {
      if (kaedah === 'POST' && /\/spreadsheets\?/.test(u)) {
        if (gagalSheetKali.n > 0) {
          gagalSheetKali.n--;
          return Response.json({ error: { code: 403, status: 'PERMISSION_DENIED',
            message: 'Google Sheets API has not been used in project 98079080039 before or it is disabled.' } }, { status: 403 });
        }
        const badan = JSON.parse(teks);
        const sid = 'sheet-' + (++kiraan);
        const tabs = new Map();
        badan.sheets.forEach(sh => {
          const rows = (sh.data[0].rowData || []).map(r => r.values.map(c => {
            assert.ok('stringValue' in c.userEnteredValue, 'semua sel mesti stringValue');
            return c.userEnteredValue.stringValue;
          }));
          tabs.set(sh.properties.title, rows);
        });
        sheet.set(sid, { title: badan.properties.title, tabs });
        fail.set(sid, { name: badan.properties.title, mimeType: 'sheet', parents: ['root'], trashed: false });
        return Response.json({ spreadsheetId: sid });
      }
      const m = u.match(/\/spreadsheets\/([^/]+)\/values\/([^?:]+)(:append)?/);
      const sh = m && sheet.get(m[1]);
      if (!sh) return Response.json({ error: { code: 404, message: 'Requested entity was not found.' } }, { status: 404 });
      const tab = decodeURIComponent(m[2]).replace(/^'|'(!.*)?$/g, '').replace(/''/g, "'");
      const rows = sh.tabs.get(tab);
      if (m[3]) {
        assert.match(u, /valueInputOption=RAW/);
        rows.push(...JSON.parse(teks).values);
        return Response.json({ updates: { updatedRange: tab + '!A' + rows.length } });
      }
      return Response.json({ values: rows });
    }
    return new Response('tidak dijangka: ' + u, { status: 599 });
  };
  return { f, panggilan, fail, sheet };
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

test('aliran penuh: admin sambung, daftar sekolah (folder + Sheet dicipta), uji tulis/baca', async () => {
  const e = env(); const g = googlePalsu();
  const { r2, sesi } = await logMasuk(e, g, 'admin', '&next=/daftar');
  assert.equal(r2.headers.get('location'), '/daftar');
  assert.ok(sesi);

  const pending = e.OPR_KV.m.get('pending:admin@sekolah.edu.my');
  assert.ok(pending && !pending.includes('refresh-admin'));

  const me = await (await handle(req('/api/me', { kuki: { opr_sesi: sesi } }), e, deps(g))).json();
  assert.equal(me.driveDisambung, true);

  const cipta = await handle(req('/api/schools', { method: 'POST', kuki: { opr_sesi: sesi }, body: { nama: 'SMK Wakanda', slug: 'smkwakanda' } }), e, deps(g));
  const c = await cipta.json();
  assert.equal(c.pautan, '/s/smkwakanda');
  assert.equal(c.sedia, true, c.ralatSedia);

  // Folder utama + 3 subfolder, Sheet dalam folder utama
  const sek = await e.OPR_KV.get('school:smkwakanda', 'json');
  assert.ok(sek.folderId && sek.sheetId);
  assert.equal(g.fail.get(sek.folderId).name, 'Annur OPR - SMK Wakanda');
  for (const k of ['PDF', 'LAMPIRAN', 'ASET']) assert.deepEqual(g.fail.get(sek.subfolder[k]).parents, [sek.folderId]);
  assert.deepEqual(g.fail.get(sek.sheetId).parents, [sek.folderId]);

  // Tab dan data asal
  const tabs = g.sheet.get(sek.sheetId).tabs;
  assert.deepEqual([...tabs.keys()], ['Guru', 'Laporan', 'Senarai', 'Tetapan', 'AuditLog']);
  assert.deepEqual(tabs.get('Guru')[1].slice(0, 4), ['admin@sekolah.edu.my', 'Cikgu Ujian', 'admin', 'YA']);
  assert.equal(tabs.get('Laporan').length, 1);
  assert.equal(tabs.get('Senarai').length, 187);
  assert.ok(tabs.get('Senarai').some(r => r[0] === 'MINGGU_BERTUGAS'));
  const jenis = JSON.parse(tabs.get('Tetapan').find(r => r[0] === 'JENIS_TETAPAN')[1]);
  assert.equal(Object.keys(jenis).length, 8);

  const peranan = await (await handle(req('/api/s/smkwakanda/me', { kuki: { opr_sesi: sesi } }), e, deps(g))).json();
  assert.equal(peranan.peranan, 'admin');
  assert.equal(peranan.sedia, true);
  assert.match(peranan.pautanSheet, /docs\.google\.com\/spreadsheets\/d\/sheet-/);

  const uji = await (await handle(req('/api/s/smkwakanda/health', { method: 'POST', kuki: { opr_sesi: sesi } }), e, deps(g))).json();
  assert.equal(uji.ok, true);
  assert.equal(uji.tulis, true);
  assert.equal(uji.namaDalamSheet, 'SMK Wakanda');
  assert.equal(tabs.get('AuditLog').at(-1)[3], 'UJI_SAMBUNGAN');
  const refresh = g.panggilan.find(p => p.badan && p.badan.get('grant_type') === 'refresh_token');
  assert.equal(refresh.badan.get('refresh_token'), 'refresh-admin@sekolah.edu.my');
});

test('Sheets API gagal semasa daftar: sekolah tetap berdaftar, butang sediakan menyambung tanpa pendua', async () => {
  const e = env(); const g = googlePalsu({ gagalSheetKali: 1 });
  const { sesi } = await logMasuk(e, g, 'admin');
  const c = await (await handle(req('/api/schools', { method: 'POST', kuki: { opr_sesi: sesi }, body: { nama: 'SMK Wakanda', slug: 'smkwakanda' } }), e, deps(g))).json();
  assert.equal(c.ok, true);
  assert.equal(c.sedia, false);
  assert.match(c.ralatSedia, /belum diaktifkan/);

  let sek = await e.OPR_KV.get('school:smkwakanda', 'json');
  assert.ok(sek.folderId && !sek.sheetId);
  const folderAsal = sek.folderId;
  const bilFolder = [...g.fail.values()].filter(x => x.mimeType === 'application/vnd.google-apps.folder').length;

  const belum = await handle(req('/api/s/smkwakanda/health', { method: 'POST', kuki: { opr_sesi: sesi } }), e, deps(g));
  assert.equal(belum.status, 409);
  assert.equal((await belum.json()).perluSedia, true);

  const sedia = await (await handle(req('/api/s/smkwakanda/setup', { method: 'POST', kuki: { opr_sesi: sesi } }), e, deps(g))).json();
  assert.equal(sedia.ok, true);
  sek = await e.OPR_KV.get('school:smkwakanda', 'json');
  assert.equal(sek.folderId, folderAsal);
  assert.ok(sek.sheetId);
  assert.equal([...g.fail.values()].filter(x => x.mimeType === 'application/vnd.google-apps.folder').length, bilFolder);

  // Panggil sekali lagi: tiada apa dicipta semula
  const bilSheet = g.sheet.size;
  await handle(req('/api/s/smkwakanda/setup', { method: 'POST', kuki: { opr_sesi: sesi } }), e, deps(g));
  assert.equal(g.sheet.size, bilSheet);
});

test('guru tidak boleh menjalankan penyediaan Drive', async () => {
  const e = env(); const g = googlePalsu();
  const a = await logMasuk(e, g, 'admin');
  await handle(req('/api/schools', { method: 'POST', kuki: { opr_sesi: a.sesi }, body: { nama: 'SMK Wakanda', slug: 'smkwakanda' } }), e, deps(g));
  const gg = googlePalsu({ email: 'guru@gmail.com', skop: 'openid email' });
  const b = await logMasuk(e, gg, 'guru', '&s=smkwakanda');
  const r = await handle(req('/api/s/smkwakanda/setup', { method: 'POST', kuki: { opr_sesi: b.sesi } }), e, deps(gg));
  assert.equal(r.status, 403);
});

test('folder sekolah dalam tong sampah dikesan oleh ujian sambungan', async () => {
  const e = env(); const g = googlePalsu();
  const { sesi } = await logMasuk(e, g, 'admin');
  await handle(req('/api/schools', { method: 'POST', kuki: { opr_sesi: sesi }, body: { nama: 'SMK Wakanda', slug: 'smkwakanda' } }), e, deps(g));
  const sek = await e.OPR_KV.get('school:smkwakanda', 'json');
  g.fail.get(sek.folderId).trashed = true;
  const r = await handle(req('/api/s/smkwakanda/health', { method: 'POST', kuki: { opr_sesi: sesi } }), e, deps(g));
  assert.equal(r.status, 409);
  assert.match((await r.json()).ralat, /Tong Sampah/);
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
