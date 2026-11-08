import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/worker.js';
import { sulit, nyahsulit, semakSlug } from '../src/lib.js';

import { ASAS, CLIENT_ID, DRIVE, T0, kvPalsu, env, idToken, googlePalsu } from './palsu.js';

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

// Sekolah siap (admin daftar + Drive disediakan) untuk ujian Fasa 3.
async function sekolahSiap() {
  const e = env(); const g = googlePalsu();
  const { sesi } = await logMasuk(e, g, 'admin');
  const c = await (await handle(req('/api/schools', { method: 'POST', kuki: { opr_sesi: sesi }, body: { nama: 'SMK Wakanda', slug: 'smkwakanda' } }), e, deps(g))).json();
  assert.equal(c.sedia, true);
  return { e, g, sesiAdmin: sesi };
}

async function logMasukSebagai(e, g, email, mode = 'guru') {
  g.senario.email = email;
  const r = await logMasuk(e, g, mode, mode === 'guru' ? '&s=smkwakanda' : '');
  g.senario.email = 'admin@sekolah.edu.my';
  return r;
}

async function panggilApi(e, g, sesi, laluan, body) {
  const r = await handle(req('/api/s/smkwakanda' + laluan, body === undefined ? { kuki: { opr_sesi: sesi } } : { method: 'POST', kuki: { opr_sesi: sesi }, body }), e, deps(g));
  return { status: r.status, ...(await r.json()) };
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

test('guru belum didaftarkan: peranan "tiada" dan tidak boleh guna API sekolah', async () => {
  const { e, g } = await sekolahSiap();
  const b = await logMasukSebagai(e, g, 'guru@gmail.com', 'guru');
  assert.equal(b.r2.headers.get('location'), '/s/smkwakanda');
  const me = await (await handle(req('/api/s/smkwakanda/me', { kuki: { opr_sesi: b.sesi } }), e, deps(g))).json();
  assert.equal(me.peranan, 'tiada');
  assert.equal((await handle(req('/api/s/smkwakanda/config', { kuki: { opr_sesi: b.sesi } }), e, deps(g))).status, 403);
  assert.equal((await handle(req('/api/s/smkwakanda/health', { method: 'POST', kuki: { opr_sesi: b.sesi } }), e, deps(g))).status, 403);
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

// ======================================================================
// Fasa 3a
// ======================================================================

test('admin tambah guru (tampal senarai), guru dikenali, nyahaktif berkuat kuasa serta-merta', async () => {
  const { e, g, sesiAdmin } = await sekolahSiap();
  const t = await panggilApi(e, g, sesiAdmin, '/guru', { teks: 'aminah@moe-dl.edu.my, Cikgu Aminah\nali@gmail.com\tCikgu Ali\nbukan-emel\nADMIN@sekolah.edu.my\nali@gmail.com' });
  assert.deepEqual(t.ditambah, ['aminah@moe-dl.edu.my', 'ali@gmail.com']);
  assert.equal(t.diabaikan.length, 3);

  const senarai = await panggilApi(e, g, sesiAdmin, '/guru');
  assert.equal(senarai.guru.length, 3);
  assert.equal(senarai.guru.find(x => x.email === 'admin@sekolah.edu.my').pemilik, true);

  const ali = await logMasukSebagai(e, g, 'ali@gmail.com');
  assert.equal((await panggilApi(e, g, ali.sesi, '/me')).peranan, 'guru');
  const cfg = await panggilApi(e, g, ali.sesi, '/config');
  assert.equal(Object.keys(cfg.jenis).length, 8);
  assert.ok(cfg.senarai.UNIT_UNIFORM.length > 5);
  assert.equal(cfg.tetapan.NAMA_SEKOLAH, 'SMK Wakanda');
  assert.equal((await panggilApi(e, g, ali.sesi, '/guru')).status, 403);

  assert.equal((await panggilApi(e, g, sesiAdmin, '/guru/kemaskini', { email: 'ali@gmail.com', aktif: false })).ok, true);
  const me = await panggilApi(e, g, ali.sesi, '/me');
  assert.equal(me.peranan, 'tidak_aktif');
  const tolak = await panggilApi(e, g, ali.sesi, '/config');
  assert.equal(tolak.status, 403);
  assert.match(tolak.ralat, /dinyahaktifkan/);
});

test('hierarki admin: hanya pemilik boleh melantik/mengubah admin; pemilik tidak boleh diubah', async () => {
  const { e, g, sesiAdmin } = await sekolahSiap();
  await panggilApi(e, g, sesiAdmin, '/guru', { teks: 'pk@sekolah.edu.my\nguru@gmail.com' });
  const naik = await panggilApi(e, g, sesiAdmin, '/guru/kemaskini', { email: 'pk@sekolah.edu.my', peranan: 'admin' });
  assert.equal(naik.ok, true);

  const pk = await logMasukSebagai(e, g, 'pk@sekolah.edu.my');
  assert.equal((await panggilApi(e, g, pk.sesi, '/me')).peranan, 'admin');
  // Admin biasa: boleh tambah guru, tidak boleh lantik admin, tidak boleh ubah pemilik
  assert.equal((await panggilApi(e, g, pk.sesi, '/guru', { teks: 'baru@gmail.com' })).ok, true);
  assert.equal((await panggilApi(e, g, pk.sesi, '/guru', { teks: 'x@gmail.com', peranan: 'admin' })).status, 403);
  assert.equal((await panggilApi(e, g, pk.sesi, '/guru/kemaskini', { email: 'guru@gmail.com', peranan: 'admin' })).status, 403);
  assert.equal((await panggilApi(e, g, pk.sesi, '/guru/kemaskini', { email: 'admin@sekolah.edu.my', aktif: false })).status, 403);
  // Pemilik sendiri pun tidak boleh diubah melalui API
  assert.equal((await panggilApi(e, g, sesiAdmin, '/guru/kemaskini', { email: 'admin@sekolah.edu.my', peranan: 'guru' })).status, 403);
  // Penurunan pangkat oleh pemilik berkuat kuasa serta-merta
  await panggilApi(e, g, sesiAdmin, '/guru/kemaskini', { email: 'pk@sekolah.edu.my', peranan: 'guru' });
  assert.equal((await panggilApi(e, g, pk.sesi, '/me')).peranan, 'guru');
  assert.equal((await panggilApi(e, g, pk.sesi, '/guru')).status, 403);
});

test('laporan: guru simpan, edit baris sama, tidak nampak laporan guru lain; admin nampak semua', async () => {
  const { e, g, sesiAdmin } = await sekolahSiap();
  await panggilApi(e, g, sesiAdmin, '/guru', { teks: 'ali@gmail.com\nabu@gmail.com' });
  const ali = await logMasukSebagai(e, g, 'ali@gmail.com');
  const abu = await logMasukSebagai(e, g, 'abu@gmail.com');

  const data = { jenis: 'KOKURIKULUM', tajuk: 'Kejohanan Bola Sepak MSSD', unit: 'Bola Sepak', jumLelaki: '22', tarikhProgram: '2026-11-08', objektif: '=HYPERLINK("http://jahat")' };
  assert.equal((await panggilApi(e, g, ali.sesi, '/laporan', { data, status: 'SIMPAN' })).status, 400); // tiada consent
  const s1 = await panggilApi(e, g, ali.sesi, '/laporan', { data, status: 'SIMPAN', consent: true });
  assert.equal(s1.ok, true);

  const sek = await e.OPR_KV.get('school:smkwakanda', 'json');
  const rows = g.sheet.get(sek.sheetId).tabs.get('Laporan');
  assert.equal(rows.length, 2);
  const tajuk = rows[0];
  const baris = Object.fromEntries(tajuk.map((h, i) => [h, rows[1][i]]));
  assert.equal(baris.PemilikEmail, 'ali@gmail.com');
  assert.equal(baris.Objektif, '=HYPERLINK("http://jahat")'); // disimpan RAW sebagai teks

  // Edit: baris sama dikemas kini, tiada baris baharu
  const s2 = await panggilApi(e, g, ali.sesi, '/laporan', { id: s1.id, data: { ...data, tajuk: 'Kejohanan (dikemas kini)' }, status: 'HANTAR' });
  assert.equal(s2.status, 'HANTAR');
  assert.equal(rows.length, 2);
  assert.equal((await panggilApi(e, g, ali.sesi, '/laporan/' + s1.id)).data.tajuk, 'Kejohanan (dikemas kini)');

  // Guru lain: tidak nampak, tidak boleh baca/edit/padam
  assert.equal((await panggilApi(e, g, abu.sesi, '/laporan')).jumlah, 0);
  assert.equal((await panggilApi(e, g, abu.sesi, '/laporan/' + s1.id)).status, 403);
  assert.equal((await panggilApi(e, g, abu.sesi, '/laporan', { id: s1.id, data, status: 'SIMPAN' })).status, 403);
  assert.equal((await panggilApi(e, g, abu.sesi, '/laporan/' + s1.id + '/padam', {})).status, 403);

  // Admin nampak semua
  const semua = await panggilApi(e, g, sesiAdmin, '/laporan');
  assert.equal(semua.jumlah, 1);
  assert.equal(semua.data[0].nama, 'Cikgu Ujian');

  // Padam lembut
  assert.equal((await panggilApi(e, g, ali.sesi, '/laporan/' + s1.id + '/padam', {})).ok, true);
  assert.equal((await panggilApi(e, g, ali.sesi, '/laporan')).jumlah, 0);
  assert.equal(rows.length, 2);
  assert.ok(g.sheet.get(sek.sheetId).tabs.get('AuditLog').some(r => r[3] === 'PADAM_LAPORAN'));
});

test('laporan telah disemak: guru tidak boleh ubah; admin edit tidak menjatuhkan status semakan', async () => {
  const { e, g, sesiAdmin } = await sekolahSiap();
  await panggilApi(e, g, sesiAdmin, '/guru', { teks: 'ali@gmail.com' });
  const ali = await logMasukSebagai(e, g, 'ali@gmail.com');
  const s1 = await panggilApi(e, g, ali.sesi, '/laporan', { data: { tajuk: 'Program X' }, status: 'HANTAR', consent: true });

  const sek = await e.OPR_KV.get('school:smkwakanda', 'json');
  const rows = g.sheet.get(sek.sheetId).tabs.get('Laporan');
  rows[1][rows[0].indexOf('Status')] = 'TELAH DISEMAK';

  assert.equal((await panggilApi(e, g, ali.sesi, '/laporan', { id: s1.id, data: { tajuk: 'Ubah' }, status: 'HANTAR' })).status, 403);
  assert.equal((await panggilApi(e, g, ali.sesi, '/laporan/' + s1.id + '/padam', {})).status, 403);
  const adm = await panggilApi(e, g, sesiAdmin, '/laporan', { id: s1.id, data: { tajuk: 'Dibetulkan admin' }, status: 'SIMPAN' });
  assert.equal(adm.status, 'TELAH DISEMAK');
});

test('access token di-cache; 401 daripada Google mencetuskan token baharu dan cuba semula', async () => {
  const { e, g, sesiAdmin } = await sekolahSiap();
  const bilRefresh = () => g.panggilan.filter(p => p.badan && p.badan.get('grant_type') === 'refresh_token').length;
  const awal = bilRefresh();
  await panggilApi(e, g, sesiAdmin, '/config');
  await panggilApi(e, g, sesiAdmin, '/laporan');
  assert.equal(bilRefresh(), awal);           // guna cache
  assert.ok(e.OPR_KV.m.get('at:smkwakanda') && !e.OPR_KV.m.get('at:smkwakanda').includes('akses-2'));

  g.senario.tolak401Sekali = true;
  const r = await panggilApi(e, g, sesiAdmin, '/config');
  assert.equal(r.ok, true);
  assert.equal(bilRefresh(), awal + 1);       // token baharu diambil sekali
});

// ======================================================================
// Fasa 3b-1: fail PDF dan gambar
// ======================================================================

async function muatNaikFail(e, g, sesi, jenis, mime, bait, nama = 'fail') {
  const r = await handle(new Request(ASAS + '/api/s/smkwakanda/fail?jenis=' + jenis + '&nama=' + encodeURIComponent(nama), {
    method: 'POST', body: bait,
    headers: { Origin: ASAS, 'content-type': mime, Cookie: 'opr_sesi=' + encodeURIComponent(sesi) }
  }), e, deps(g));
  return { status: r.status, ...(await r.json()) };
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 250, 0, 13]);
const PDFB = new TextEncoder().encode('%PDF-1.4 ujian');

test('muat naik: ke subfolder betul, jenis/saiz disemak, bukan ahli ditolak', async () => {
  const { e, g, sesiAdmin } = await sekolahSiap();
  await panggilApi(e, g, sesiAdmin, '/guru', { teks: 'ali@gmail.com' });
  const ali = await logMasukSebagai(e, g, 'ali@gmail.com');
  const sek = await e.OPR_KV.get('school:smkwakanda', 'json');

  const gbr = await muatNaikFail(e, g, ali.sesi, 'lampiran', 'image/png', PNG, 'gambar 1.png');
  assert.equal(gbr.ok, true);
  assert.deepEqual(g.fail.get(gbr.fileId).parents, [sek.subfolder.LAMPIRAN]);
  assert.deepEqual([...g.fail.get(gbr.fileId).data], [...PNG]);   // bait binari utuh
  const pdf = await muatNaikFail(e, g, ali.sesi, 'pdf', 'application/pdf', PDFB, 'OPR_x.pdf');
  assert.deepEqual(g.fail.get(pdf.fileId).parents, [sek.subfolder.PDF]);

  assert.equal((await muatNaikFail(e, g, ali.sesi, 'lampiran', 'text/html', PNG)).status, 400);
  assert.equal((await muatNaikFail(e, g, ali.sesi, 'pdf', 'image/png', PNG)).status, 400);
  assert.equal((await muatNaikFail(e, g, ali.sesi, 'lampiran', 'image/png', new Uint8Array(10 * 1024 * 1024 + 1))).status, 413);
  const asing = await logMasukSebagai(e, g, 'orang@luar.com');
  assert.equal((await muatNaikFail(e, g, asing.sesi, 'lampiran', 'image/png', PNG)).status, 403);
});

test('laporan dengan PDF + gambar: hanya fail milik sendiri diterima; fail lama dibuang selepas simpan', async () => {
  const { e, g, sesiAdmin } = await sekolahSiap();
  await panggilApi(e, g, sesiAdmin, '/guru', { teks: 'ali@gmail.com\nabu@gmail.com' });
  const ali = await logMasukSebagai(e, g, 'ali@gmail.com');
  const abu = await logMasukSebagai(e, g, 'abu@gmail.com');

  const g1 = (await muatNaikFail(e, g, ali.sesi, 'lampiran', 'image/png', PNG)).fileId;
  const g2 = (await muatNaikFail(e, g, ali.sesi, 'lampiran', 'image/png', PNG)).fileId;
  const p1 = (await muatNaikFail(e, g, ali.sesi, 'pdf', 'application/pdf', PDFB)).fileId;
  const gAbu = (await muatNaikFail(e, g, abu.sesi, 'lampiran', 'image/png', PNG)).fileId;

  // Fail milik guru lain atau ID rekaan ditolak
  const data = { tajuk: 'Program Gambar' };
  assert.equal((await panggilApi(e, g, ali.sesi, '/laporan', { data, consent: true, lampiranIds: [g1, gAbu] })).status, 400);
  assert.equal((await panggilApi(e, g, ali.sesi, '/laporan', { data, consent: true, lampiranIds: ['xxxxxxxxxxxxxxxx'] })).status, 400);
  // PDF tidak boleh dihantar sebagai lampiran (jenis mesti sepadan)
  assert.equal((await panggilApi(e, g, ali.sesi, '/laporan', { data, consent: true, pdfFileId: g1 })).status, 400);

  const s1 = await panggilApi(e, g, ali.sesi, '/laporan', { data, consent: true, status: 'HANTAR', pdfFileId: p1, pdfNama: 'OPR_Program.pdf', lampiranIds: [g1, g2] });
  assert.equal(s1.ok, true);
  const senarai = await panggilApi(e, g, ali.sesi, '/laporan');
  assert.equal(senarai.data[0].adaPdf, true);

  // Muat turun: pemilik dan admin boleh; guru lain tidak; fail asing ditolak
  const turun = await handle(req('/api/s/smkwakanda/laporan/' + s1.id + '/fail/' + g1, { kuki: { opr_sesi: ali.sesi } }), e, deps(g));
  assert.equal(turun.status, 200);
  assert.deepEqual([...new Uint8Array(await turun.arrayBuffer())], [...PNG]);
  assert.equal((await handle(req('/api/s/smkwakanda/laporan/' + s1.id + '/fail/' + p1, { kuki: { opr_sesi: sesiAdmin } }), e, deps(g))).status, 200);
  assert.equal((await handle(req('/api/s/smkwakanda/laporan/' + s1.id + '/fail/' + g1, { kuki: { opr_sesi: abu.sesi } }), e, deps(g))).status, 403);
  assert.equal((await handle(req('/api/s/smkwakanda/laporan/' + s1.id + '/fail/' + gAbu, { kuki: { opr_sesi: ali.sesi } }), e, deps(g))).status, 404);

  // Edit: buang g2, tambah g3, PDF baharu -> g2 dan PDF lama ke Tong Sampah SELEPAS simpan
  const g3 = (await muatNaikFail(e, g, ali.sesi, 'lampiran', 'image/png', PNG)).fileId;
  const p2 = (await muatNaikFail(e, g, ali.sesi, 'pdf', 'application/pdf', PDFB)).fileId;
  const s2 = await panggilApi(e, g, ali.sesi, '/laporan', { id: s1.id, data, status: 'HANTAR', pdfFileId: p2, lampiranIds: [g1, g3] });
  assert.equal(s2.ok, true);
  assert.equal(g.fail.get(g2).trashed, true);
  assert.equal(g.fail.get(p1).trashed, true);
  assert.equal(g.fail.get(g1).trashed, false);
  assert.equal(g.fail.get(g3).trashed, false);

  // Edit tanpa medan fail: fail sedia ada dikekalkan
  await panggilApi(e, g, ali.sesi, '/laporan', { id: s1.id, data: { tajuk: 'Tukar tajuk sahaja' }, status: 'HANTAR' });
  const b = await panggilApi(e, g, ali.sesi, '/laporan/' + s1.id);
  assert.equal(b.data.tajuk, 'Tukar tajuk sahaja');
  const rows = g.sheet.get((await e.OPR_KV.get('school:smkwakanda', 'json')).sheetId).tabs.get('Laporan');
  const t = rows[0];
  assert.equal(rows[1][t.indexOf('LampiranIds')], g1 + ',' + g3);
  assert.equal(rows[1][t.indexOf('PdfFileId')], p2);
});

test('simpan gagal = fail lama TIDAK dibuang (bug v2 dibetulkan)', async () => {
  const { e, g, sesiAdmin } = await sekolahSiap();
  await panggilApi(e, g, sesiAdmin, '/guru', { teks: 'ali@gmail.com' });
  const ali = await logMasukSebagai(e, g, 'ali@gmail.com');
  const p1 = (await muatNaikFail(e, g, ali.sesi, 'pdf', 'application/pdf', PDFB)).fileId;
  const s1 = await panggilApi(e, g, ali.sesi, '/laporan', { data: { tajuk: 'X' }, consent: true, pdfFileId: p1 });
  const p2 = (await muatNaikFail(e, g, ali.sesi, 'pdf', 'application/pdf', PDFB)).fileId;
  // Tajuk kosong -> simpan ditolak; PDF lama mesti kekal
  const r = await panggilApi(e, g, ali.sesi, '/laporan', { id: s1.id, data: { tajuk: '' }, pdfFileId: p2 });
  assert.equal(r.status, 400);
  assert.equal(g.fail.get(p1).trashed, false);
});

test('WAJIB_PDF = YA: laporan tanpa PDF ditolak', async () => {
  const { e, g, sesiAdmin } = await sekolahSiap();
  const sek = await e.OPR_KV.get('school:smkwakanda', 'json');
  const tet = g.sheet.get(sek.sheetId).tabs.get('Tetapan');
  tet.find(r => r[0] === 'WAJIB_PDF')[1] = 'YA';
  const r = await panggilApi(e, g, sesiAdmin, '/laporan', { data: { tajuk: 'Tanpa PDF' }, consent: true });
  assert.equal(r.status, 400);
  assert.match(r.ralat, /PDF wajib/);
});

// ======================================================================
// Fasa 3b-2: semakan, statistik, eksport, tetapan, logo, senarai
// ======================================================================

async function sekolahDenganLaporan() {
  const { e, g, sesiAdmin } = await sekolahSiap();
  await panggilApi(e, g, sesiAdmin, '/guru', { teks: 'ali@gmail.com' });
  const ali = await logMasukSebagai(e, g, 'ali@gmail.com');
  const s1 = await panggilApi(e, g, ali.sesi, '/laporan', { data: { tajuk: '=CMD()', unit: 'Bola Sepak', peringkat: 'Daerah', jumLelaki: '10', jumPerempuan: '5', tarikhProgram: '2026-03-04' }, status: 'HANTAR', consent: true });
  const s2 = await panggilApi(e, g, ali.sesi, '/laporan', { data: { tajuk: 'Draf', unit: 'Bola Sepak' }, status: 'SIMPAN', consent: true });
  return { e, g, sesiAdmin, ali, s1, s2 };
}

test('semakan: guru ditolak; PDF bertandatangan wajib; status berubah; salinan boleh dimuat turun', async () => {
  const { e, g, sesiAdmin, ali, s1, s2 } = await sekolahDenganLaporan();
  assert.equal((await panggilApi(e, g, ali.sesi, '/laporan/' + s1.id + '/semak', {})).status, 403);
  assert.equal((await muatNaikFail(e, g, ali.sesi, 'pdfsemak', 'application/pdf', PDFB)).status, 403);
  assert.equal((await panggilApi(e, g, sesiAdmin, '/laporan/' + s2.id + '/semak', {})).status, 409);   // draf
  assert.equal((await panggilApi(e, g, sesiAdmin, '/laporan/' + s1.id + '/semak', {})).status, 400);   // wajib PDF

  const sp = (await muatNaikFail(e, g, sesiAdmin, 'pdfsemak', 'application/pdf', PDFB, 'ditandatangan.pdf')).fileId;
  const r = await panggilApi(e, g, sesiAdmin, '/laporan/' + s1.id + '/semak', { pdfFileId: sp });
  assert.equal(r.status, 'TELAH DISEMAK');
  const senarai = await panggilApi(e, g, ali.sesi, '/laporan');
  const x = senarai.data.find(d => d.id === s1.id);
  assert.equal(x.status, 'TELAH DISEMAK');
  assert.equal(x.adaPdfDisemak, true);
  assert.equal(x.disemakOleh, 'Cikgu Ujian');
  // Guru boleh muat turun salinan bertandatangan laporannya sendiri
  assert.equal((await handle(req('/api/s/smkwakanda/laporan/' + s1.id + '/fail/' + sp, { kuki: { opr_sesi: ali.sesi } }), e, deps(g))).status, 200);
  // Ganti salinan: yang lama dibuang
  const sp2 = (await muatNaikFail(e, g, sesiAdmin, 'pdfsemak', 'application/pdf', PDFB)).fileId;
  await panggilApi(e, g, sesiAdmin, '/laporan/' + s1.id + '/semak', { pdfFileId: sp2 });
  assert.equal(g.fail.get(sp).trashed, true);
});

test('semakan tanpa PDF dibenarkan bila WAJIB_PDF_SEMAK = TIDAK', async () => {
  const { e, g, sesiAdmin, s1 } = await sekolahDenganLaporan();
  assert.equal((await panggilApi(e, g, sesiAdmin, '/tetapan', { tetapan: { WAJIB_PDF_SEMAK: 'TIDAK' } })).ok, true);
  assert.equal((await panggilApi(e, g, sesiAdmin, '/laporan/' + s1.id + '/semak', {})).status, 'TELAH DISEMAK');
});

test('statistik dan eksport CSV (formula dinetralkan)', async () => {
  const { e, g, sesiAdmin, ali } = await sekolahDenganLaporan();
  const s = await panggilApi(e, g, sesiAdmin, '/statistik');
  assert.equal(s.jumlah, 2); assert.equal(s.hantar, 1); assert.equal(s.draf, 1);
  assert.equal(s.muridLelaki + s.muridPerempuan, 15);
  assert.equal(s.unit['Bola Sepak'], 2);
  assert.equal(s.bulan['2026-03'], 1);
  assert.equal((await panggilApi(e, g, ali.sesi, '/statistik')).status, 403);

  const r = await handle(req('/api/s/smkwakanda/eksport', { kuki: { opr_sesi: sesiAdmin } }), e, deps(g));
  assert.match(r.headers.get('content-disposition'), /attachment; filename="OPR_smkwakanda_/);
  const bait = new Uint8Array(await r.arrayBuffer());
  assert.deepEqual([...bait.slice(0, 3)], [0xef, 0xbb, 0xbf]);   // BOM UTF-8 untuk Excel
  const csv = new TextDecoder().decode(bait);
  assert.ok(csv.startsWith('"ID"'));
  assert.ok(csv.includes('"\'=CMD()"'));
  assert.ok(!csv.includes('"Dipadam"'));
  assert.equal((await handle(req('/api/s/smkwakanda/eksport', { kuki: { opr_sesi: ali.sesi } }), e, deps(g))).status, 403);
});

test('tetapan: senarai putih, pengesahan nilai, jenis laporan dibersihkan, guru ditolak', async () => {
  const { e, g, sesiAdmin, ali } = await sekolahDenganLaporan();
  const r = await panggilApi(e, g, sesiAdmin, '/tetapan', { tetapan: {
    NAMA_SEKOLAH: 'SMK Wakanda Baharu', ALAMAT_SEKOLAH: 'Jalan 1', WARNA_1: '#ABCDEF', WARNA_2: 'merah',
    GAYA_LAPORAN: 'poster', LOGO1_ID: 'cubaan', FOLDER_ID: 'cubaan', JENIS_DEFAULT: 'HEM',
    JENIS_TETAPAN: { HEM: { aktif: true, nama: 'HEM Sekolah', slot: 'SAH,xx', kategori: 'UNIT_HEM,bukan kod!' }, KELAS: { aktif: false }, LAIN: { aktif: true } }
  } });
  assert.equal(r.ok, true);
  assert.ok(r.ditolak.includes('WARNA_2') && r.ditolak.includes('LOGO1_ID') && r.ditolak.includes('FOLDER_ID'));
  const t = await panggilApi(e, g, sesiAdmin, '/tetapan');
  assert.equal(t.tetapan.NAMA_SEKOLAH, 'SMK Wakanda Baharu');
  assert.equal(t.tetapan.WARNA_1, '#abcdef');
  assert.equal(t.tetapan.WARNA_2, '#312e81');
  assert.equal(t.tetapan.GAYA_LAPORAN, 'POSTER');
  assert.equal(t.tetapan.JENIS_DEFAULT, 'HEM');
  assert.equal(t.jenis.HEM.nama, 'HEM Sekolah');
  assert.equal(t.jenis.HEM.slot, 'SAH');
  assert.equal(t.jenis.HEM.kategori, 'UNIT_HEM');
  assert.equal(t.jenis.KELAS.aktif, false);
  assert.equal(t.jenis.LAIN, undefined);
  // Baris lain dalam tab Tetapan tidak terganggu
  assert.equal((await panggilApi(e, g, ali.sesi, '/config')).tetapan.CONSENT_TEXT.length > 50, true);
  assert.equal((await panggilApi(e, g, ali.sesi, '/tetapan', { tetapan: { NAMA_SEKOLAH: 'Godam' } })).status, 403);
  assert.equal((await panggilApi(e, g, ali.sesi, '/tetapan')).status, 403);
});

test('logo: admin muat naik ke Aset, ahli boleh muat turun, ganti membuang yang lama', async () => {
  const { e, g, sesiAdmin, ali } = await sekolahDenganLaporan();
  const naik = async (sesi, mime, bait) => {
    const r = await handle(new Request(ASAS + '/api/s/smkwakanda/logo/1', { method: 'POST', body: bait,
      headers: { Origin: ASAS, 'content-type': mime, Cookie: 'opr_sesi=' + encodeURIComponent(sesi) } }), e, deps(g));
    return { status: r.status, ...(await r.json()) };
  };
  assert.equal((await naik(ali.sesi, 'image/png', PNG)).status, 403);
  assert.equal((await naik(sesiAdmin, 'image/svg+xml', PNG)).status, 400);
  assert.equal((await naik(sesiAdmin, 'image/png', new Uint8Array(400001))).status, 413);
  const l1 = await naik(sesiAdmin, 'image/png', PNG);
  assert.equal(l1.ok, true);
  const sek = await e.OPR_KV.get('school:smkwakanda', 'json');
  assert.deepEqual(g.fail.get(l1.fileId).parents, [sek.subfolder.ASET]);
  assert.equal((await panggilApi(e, g, ali.sesi, '/config')).logo[1], l1.fileId);
  const turun = await handle(req('/api/s/smkwakanda/logo/1', { kuki: { opr_sesi: ali.sesi } }), e, deps(g));
  assert.equal(turun.status, 200);
  assert.deepEqual([...new Uint8Array(await turun.arrayBuffer())], [...PNG]);
  const l2 = await naik(sesiAdmin, 'image/png', PNG);
  assert.equal(g.fail.get(l1.fileId).trashed, true);
  assert.equal((await panggilApi(e, g, sesiAdmin, '/logo/1/padam', {})).ok, true);
  assert.equal(g.fail.get(l2.fileId).trashed, true);
  assert.equal((await handle(req('/api/s/smkwakanda/logo/1', { kuki: { opr_sesi: ali.sesi } }), e, deps(g))).status, 404);
});

test('senarai dropdown: ganti isi, cipta baharu, padam ditolak jika masih digunakan', async () => {
  const { e, g, sesiAdmin, ali } = await sekolahDenganLaporan();
  assert.equal((await panggilApi(e, g, sesiAdmin, '/senarai', { kategori: 'UNIT_SUKAN', item: 'Bola Sepak\nRagbi\nRagbi\n\nHoki' })).bilangan, 3);
  assert.equal((await panggilApi(e, g, sesiAdmin, '/senarai', { kategori: 'agensi_luar', item: ['JKM', 'PDRM'] })).kategori, 'AGENSI_LUAR');
  const cfg = await panggilApi(e, g, ali.sesi, '/config');
  assert.deepEqual(cfg.senarai.UNIT_SUKAN, ['Bola Sepak', 'Ragbi', 'Hoki']);
  assert.deepEqual(cfg.senarai.AGENSI_LUAR, ['JKM', 'PDRM']);
  assert.ok(cfg.senarai.UNIT_UNIFORM.length > 5);   // senarai lain utuh
  assert.equal((await panggilApi(e, g, sesiAdmin, '/senarai/padam', { kategori: 'UNIT_SUKAN' })).status, 409);
  assert.equal((await panggilApi(e, g, sesiAdmin, '/senarai/padam', { kategori: 'ANJURAN' })).status, 409);
  assert.equal((await panggilApi(e, g, sesiAdmin, '/senarai/padam', { kategori: 'AGENSI_LUAR' })).ok, true);
  assert.equal((await panggilApi(e, g, ali.sesi, '/config')).senarai.AGENSI_LUAR, undefined);
  assert.equal((await panggilApi(e, g, ali.sesi, '/senarai', { kategori: 'X1', item: ['a'] })).status, 403);
});
