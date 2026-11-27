import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/worker.js';
import { sulit, nyahsulit, semakSlug } from '../src/lib.js';
import { tambahBulan, hariIni, nilai } from '../src/lesen.js';

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
  // Folder OPR tidak berganda; folder e-Karakter (1 + 3 subfolder) dicipta sekali bersama Sheet Karakter
  const folderKrk = [sek.karakter.folderId, ...Object.values(sek.karakter.subfolder)];
  assert.equal([...g.fail.entries()].filter(([id, x]) => x.mimeType === 'application/vnd.google-apps.folder' && !folderKrk.includes(id)).length, bilFolder);
  assert.equal(folderKrk.length, 4);

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

// ======================================================================
// Fasa 4: lesen, percubaan, BCL, pemilik
// ======================================================================

const HARI = 864e5;
const KUNCI_BCL = 'k-' + 'x'.repeat(40);
function envBcl(lebih = {}) {
  return env({ BCL_WEBHOOK_KEY: KUNCI_BCL, BCL_API_TOKEN: 'api-tok', BCL_API_URL: 'https://bcl.test/api', BCL_FORM_ID: '777',
    BUY_URL: 'https://bcl.my/f/opr', OWNER_EMAILS: 'pemilik@annurpro.com', ...lebih });
}
async function sekolahSiapBcl(lebih) {
  const e = envBcl(lebih); const g = googlePalsu();
  const { sesi } = await logMasuk(e, g, 'admin');
  await handle(req('/api/schools', { method: 'POST', kuki: { opr_sesi: sesi }, body: { nama: 'SMK Wakanda', slug: 'smkwakanda' } }), e, deps(g));
  return { e, g, sesiAdmin: sesi };
}
const pada = (g, ms) => ({ fetch: g.f, now: () => ms });
const jualan = (order, item, amount, custom, extra = {}) => ({
  event: 'payment-success',
  data: { formable_type: 'payment_form', formable_id: 777, record_type: 'Transaction', record_id: order,
    main_data: { order_number: order, payer_email: 'Bendahari@Gmail.com', transaction_type: 'live', subtotal_amount: amount,
      fee_amount: '1.00', amount: (parseFloat(amount) + 1).toFixed(2), status: 3, is_paid: 1, items: [{ item, quantity: 1, amount }], ...extra },
    custom_fields_data: custom || { 'E-mel Google untuk sistem': 'Admin@Sekolah.edu.my' } }
});
const pesanan = (order, nama, amount) => ({ order_number: order, status: 'success', status_code: 3, amount: parseFloat(amount) + 1, items: [{ name: nama, amount }] });
async function webhook(e, g, body, ms = T0, kunci = KUNCI_BCL) {
  const r = await handle(new Request(ASAS + '/bcl/' + kunci, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), e, pada(g, ms));
  return { status: r.status, ...(await r.json()) };
}

test('tarikh lesen: waktu Malaysia dan bulan berlabuh', () => {
  assert.equal(hariIni(Date.UTC(2026, 10, 8, 17, 0)), '2026-11-09');   // 01:00 MYT keesokan hari
  assert.equal(tambahBulan('2027-01-31', 1, 31), '2027-02-28');
  assert.equal(tambahBulan('2027-02-28', 1, 31), '2027-03-31');
  assert.equal(tambahBulan('2026-11-30', 12, 30), '2027-11-30');
  const e = { GRACE_DAYS: '7' };
  assert.equal(nilai({ plan: 'percubaan', expires: '2026-11-07' }, T0, e).reason, 'percubaan-tamat');
  assert.equal(nilai({ plan: 'tahunan', expires: '2026-11-03' }, T0, e).reason, 'tamat-tempoh-ihsan');
  assert.equal(nilai({ plan: 'tahunan', expires: '2026-10-01' }, T0, e).reason, 'tamat');
  assert.equal(nilai(null, T0, e).reason, 'tiada');
});

test('percubaan 14 hari bermula semasa daftar; tamat = tulis disekat, baca dan eksport kekal', async () => {
  const { e, g, sesiAdmin } = await sekolahSiapBcl();
  const l = await e.OPR_KV.get('lesen:smkwakanda', 'json');
  assert.deepEqual([l.plan, l.expires], ['percubaan', '2026-11-21']);
  const me = await panggilApi(e, g, sesiAdmin, '/me');
  assert.deepEqual([me.lesen.ok, me.lesen.daysLeft, me.buyUrl], [true, 13, 'https://bcl.my/f/opr']);
  const s1 = await panggilApi(e, g, sesiAdmin, '/laporan', { data: { tajuk: 'Sebelum tamat' }, consent: true, status: 'HANTAR' });
  assert.equal(s1.ok, true);

  const lepas = T0 + 20 * HARI;
  const tulis = await handle(req('/api/s/smkwakanda/laporan', { method: 'POST', kuki: { opr_sesi: sesiAdmin }, body: { data: { tajuk: 'X' }, consent: true } }), e, pada(g, lepas));
  assert.equal(tulis.status, 402);
  const t = await tulis.json();
  assert.equal(t.lesenTamat, true);
  assert.match(t.ralat, /percubaan/);
  assert.equal((await handle(req('/api/s/smkwakanda/guru', { method: 'POST', kuki: { opr_sesi: sesiAdmin }, body: { teks: 'a@b.com' } }), e, pada(g, lepas))).status, 402);
  // Baca, buka laporan dan eksport kekal
  assert.equal((await handle(req('/api/s/smkwakanda/laporan', { kuki: { opr_sesi: sesiAdmin } }), e, pada(g, lepas))).status, 200);
  assert.equal((await handle(req('/api/s/smkwakanda/laporan/' + s1.id, { kuki: { opr_sesi: sesiAdmin } }), e, pada(g, lepas))).status, 200);
  assert.equal((await handle(req('/api/s/smkwakanda/eksport', { kuki: { opr_sesi: sesiAdmin } }), e, pada(g, lepas))).status, 200);
  const meLepas = await (await handle(req('/api/s/smkwakanda/me', { kuki: { opr_sesi: sesiAdmin } }), e, pada(g, lepas))).json();
  assert.equal(meLepas.lesen.reason, 'percubaan-tamat');
});

test('percubaan hanya sekali bagi setiap e-mel admin', async () => {
  const { e } = await sekolahSiapBcl();
  await e.OPR_KV.delete('lesen:smkwakanda');
  const { mulaPercubaan } = await import('../src/lesen.js');
  assert.equal(await mulaPercubaan(e, 'smkwakanda', 'admin@sekolah.edu.my', T0), null);
});

test('BCL: kunci rahsia, borang lain, transaksi ujian dan pesanan tidak dibayar ditolak', async () => {
  const { e, g } = await sekolahSiapBcl();
  assert.equal((await webhook(e, g, {}, T0, 'salah')).status, 404);
  assert.equal((await handle(new Request(ASAS + '/bcl/' + KUNCI_BCL, { method: 'POST', body: '{}' }), env(), pada(g, T0))).status, 404); // tiada kunci dikonfigurasi
  const lain = jualan('L-1', 'Langganan Tahunan', '200.00'); lain.data.formable_id = 1;
  assert.equal((await webhook(e, g, lain)).ignored, 'borang-lain');
  assert.equal((await webhook(e, g, jualan('L-2', 'Langganan Tahunan', '200.00', null, { transaction_type: 'test' }))).ignored, 'transaksi-ujian');
  // API kata belum dibayar
  g.senario.bclPesanan = { 'L-3': { order_number: 'L-3', status: 'pending', status_code: 1, amount: 201 } };
  assert.equal((await webhook(e, g, jualan('L-3', 'Langganan Tahunan', '200.00'))).reason, 'belum-dibayar');
  // Jumlah webhook berbeza daripada API
  g.senario.bclPesanan = { 'L-4': pesanan('L-4', 'Langganan Tahunan', '200.00') };
  assert.equal((await webhook(e, g, jualan('L-4', 'Langganan Tahunan', '20.00'))).reason, 'jumlah-tidak-sepadan');
  assert.equal((await e.OPR_KV.get('lesen:smkwakanda', 'json')).plan, 'percubaan');
});

test('BCL tahunan: disahkan API, dilanjut dari tarikh tamat percubaan, sekali sahaja', async () => {
  const { e, g, sesiAdmin } = await sekolahSiapBcl();
  g.senario.bclPesanan = { 'L-10': pesanan('L-10', 'Langganan Tahunan OPR', '200.00') };
  const r = await webhook(e, g, jualan('L-10', 'Langganan Tahunan OPR', '200.00'));
  assert.deepEqual([r.ok, r.slug, r.months, r.expires], [true, 'smkwakanda', 12, '2027-11-21']);
  const ulang = await webhook(e, g, jualan('L-10', 'Langganan Tahunan OPR', '200.00'));
  assert.equal(ulang.duplicate, true);
  assert.equal((await e.OPR_KV.get('lesen:smkwakanda', 'json')).expires, '2027-11-21');
  const rek = await e.OPR_KV.get('bcl:L-10', 'json');
  assert.equal(rek.amount, 201);
  const me = await panggilApi(e, g, sesiAdmin, '/me');
  assert.deepEqual([me.lesen.plan, me.lesen.ok], ['tahunan', true]);
});

test('BCL selepas tamat: lanjut dari hari ini dan tulis dibuka semula', async () => {
  const { e, g, sesiAdmin } = await sekolahSiapBcl();
  const lepas = T0 + 30 * HARI;   // 2026-12-08
  g.senario.bclPesanan = { 'L-20': pesanan('L-20', 'Langganan Bulanan OPR', '20.00') };
  const r = await webhook(e, g, jualan('L-20', 'Langganan Bulanan OPR', '20.00'), lepas);
  assert.deepEqual([r.months, r.expires], [1, '2027-01-08']);
  const tulis = await handle(req('/api/s/smkwakanda/laporan', { method: 'POST', kuki: { opr_sesi: sesiAdmin }, body: { data: { tajuk: 'Selepas bayar' }, consent: true } }), e, pada(g, lepas));
  assert.equal(tulis.status, 200);
});

test('BCL sebelum sekolah didaftar: disimpan sebagai kredit dan dipakai semasa daftar', async () => {
  const e = envBcl(); const g = googlePalsu({ email: 'baru@sekolah.edu.my' });
  g.senario.bclPesanan = { 'L-30': pesanan('L-30', 'Langganan Tahunan', '200.00') };
  const r = await webhook(e, g, jualan('L-30', 'Langganan Tahunan', '200.00', { 'E-mel Google untuk sistem': 'baru@sekolah.edu.my', 'Nama sekolah': 'SMK Baharu' }));
  assert.deepEqual([r.ok, r.kredit], [true, true]);
  assert.equal((await e.OPR_KV.get('kredit:baru@sekolah.edu.my', 'json')).months, 12);
  const { sesi } = await logMasuk(e, g, 'admin');
  await handle(req('/api/schools', { method: 'POST', kuki: { opr_sesi: sesi }, body: { nama: 'SMK Baharu', slug: 'smkbaharu' } }), e, deps(g));
  const l = await e.OPR_KV.get('lesen:smkbaharu', 'json');
  assert.deepEqual([l.plan, l.expires], ['tahunan', '2027-11-21']);   // percubaan + 12 bulan
  assert.equal(await e.OPR_KV.get('kredit:baru@sekolah.edu.my'), null);
  assert.equal((await e.OPR_KV.get('bcl:L-30', 'json')).slug, 'smkbaharu');
});

test('BCL: pautan /s/<slug> dalam borang mengatasi e-mel; auto-debit melanjut 1 bulan setiap potongan', async () => {
  const { e, g } = await sekolahSiapBcl();
  g.senario.bclPesanan = { 'L-40': pesanan('L-40', 'Langganan Bulanan', '20.00') };
  const r = await webhook(e, g, jualan('L-40', 'Langganan Bulanan', '20.00', { 'E-mel Google untuk sistem': 'bendahari@gmail.com', 'Pautan sekolah': 'https://opr.annurpro.com/s/smkwakanda' }));
  assert.equal(r.slug, 'smkwakanda');
  const daftar = { event: 'payment-success', data: { formable_id: 777, record_type: 'DirectDebit', record_id: 'DD-1',
    main_data: { order_number: 'DD-1', payer_email: 'x@gmail.com', transaction_type: 'live' }, custom_fields_data: { 'E-mel Google untuk sistem': 'admin@sekolah.edu.my' } } };
  assert.equal((await webhook(e, g, daftar)).mandate, 'DD-1');
  const potong = { event: 'direct-debit', data: { formable_id: 777, record_id: 'DD-1', main_data: { order_number: 'DDP-1', status: 3, amount: '20.00', transaction_type: 'live' } } };
  const sebelum = (await e.OPR_KV.get('lesen:smkwakanda', 'json')).expires;
  const p1 = await webhook(e, g, potong);
  assert.equal(p1.expires, tambahBulan(sebelum, 1, +sebelum.slice(8)));
  assert.equal((await webhook(e, g, potong)).duplicate, true);
});

test('API pemilik: hanya OWNER_EMAILS; ringkasan, tambah bulan, tetapkan tarikh, pakai kredit', async () => {
  const { e, g, sesiAdmin } = await sekolahSiapBcl();
  assert.equal((await handle(req('/api/pemilik/ringkasan', { kuki: { opr_sesi: sesiAdmin } }), e, deps(g))).status, 403);
  g.senario.email = 'pemilik@annurpro.com';
  const { sesi } = await logMasuk(e, g, 'guru');
  g.senario.email = 'admin@sekolah.edu.my';
  const r = await (await handle(req('/api/pemilik/ringkasan', { kuki: { opr_sesi: sesi } }), e, deps(g))).json();
  assert.equal(r.sekolah.length, 1);
  assert.deepEqual([r.sekolah[0].slug, r.sekolah[0].status.reason, r.ringkasan.percubaanAktif], ['smkwakanda', 'ok', 1]);
  const pos = (laluan, body) => handle(req(laluan, { method: 'POST', kuki: { opr_sesi: sesi }, body }), e, deps(g)).then(x => x.json());
  assert.equal((await pos('/api/pemilik/lesen', { slug: 'smkwakanda', tambahBulan: 12 })).lesen.expires, '2027-11-21');
  assert.equal((await pos('/api/pemilik/lesen', { slug: 'smkwakanda', expires: '2027-12-31', plan: 'pilot' })).lesen.plan, 'pilot');
  assert.equal((await pos('/api/pemilik/lesen', { slug: 'smkwakanda', expires: '31/12/2027' })).ok, false);
  await e.OPR_KV.put('kredit:salah@taip.com', JSON.stringify({ months: 1, orders: [] }));
  assert.equal((await pos('/api/pemilik/kredit', { email: 'salah@taip.com', slug: 'smkwakanda' })).lesen.expires, '2028-01-31');
  const r2 = await (await handle(req('/api/pemilik/ringkasan', { kuki: { opr_sesi: sesi } }), e, deps(g))).json();
  // Kredit dibayar menukar pilot kepada bulanan, jadi kini dikira langganan berbayar aktif
  assert.equal(r2.sekolah[0].lesen.plan, 'bulanan');
  assert.equal(r2.ringkasan.berbayarAktif, 1);
  assert.equal(r2.ringkasan.mrr, 20);
});

test('tambah 1 bulan kepada pelan tahunan aktif: pelan kekal tahunan', async () => {
  const { lanjutLesen } = await import('../src/lesen.js');
  const e = envBcl();
  await e.OPR_KV.put('lesen:x', JSON.stringify({ plan: 'tahunan', expires: '2027-06-30', day: 30 }));
  const l = await lanjutLesen(e, 'x', 1, T0);
  assert.deepEqual([l.plan, l.expires], ['tahunan', '2027-07-30']);
  await e.OPR_KV.put('lesen:y', JSON.stringify({ plan: 'tahunan', expires: '2026-01-01' }));   // sudah tamat
  assert.equal((await lanjutLesen(e, 'y', 1, T0)).plan, 'bulanan');
});

test('BCL: kunci webhook gaya base64 (mengandungi + dan =) diterima; kunci hampir sama ditolak', async () => {
  const kunci = 'abcDEF123+xyz456/uvw789==';
  const { e, g } = await sekolahSiapBcl({ BCL_WEBHOOK_KEY: kunci.replace('/', '-') });
  const k = kunci.replace('/', '-');
  g.senario.bclPesanan = { 'K-1': pesanan('K-1', 'Langganan Bulanan', '20.00') };
  assert.equal((await webhook(e, g, jualan('K-1', 'Langganan Bulanan', '20.00'), T0, k)).months, 1);
  assert.equal((await webhook(e, g, {}, T0, k.slice(0, -1))).status, 404);
  assert.equal((await webhook(e, g, {}, T0, k + 'x')).status, 404);
});

// ======================================================================
// e-Karakter Fasa 0: Sheet asing, pemasangan idempoten, audit
// ======================================================================
const FOLDER = 'application/vnd.google-apps.folder';
const tabKrk = ['KarakterRekod', 'KarakterGuruKelas', 'KarakterTtd', 'Senarai', 'Tetapan', 'AuditLog'];

test('karakter: sekolah baharu dapat Sheet e-Karakter asing; Sheet OPR tidak berubah', async () => {
  const { e, g } = await sekolahSiap();
  const sek = await e.OPR_KV.get('school:smkwakanda', 'json');
  const K = sek.karakter;
  assert.ok(K && K.sheetId && K.sheetId !== sek.sheetId, 'dua Sheet berbeza');
  assert.equal(K.versiSkema, 1);
  // Sheet OPR: 5 tab asal, VERSI_SKEMA kekal 1, tiada kategori KARAKTER_*
  const opr = g.sheet.get(sek.sheetId);
  assert.deepEqual([...opr.tabs.keys()], ['Guru', 'Laporan', 'Senarai', 'Tetapan', 'AuditLog']);
  assert.equal(opr.tabs.get('Tetapan').find(r => r[0] === 'VERSI_SKEMA')[1], '1');
  assert.ok(!opr.tabs.get('Senarai').some(r => String(r[0]).startsWith('KARAKTER_')));
  // Sheet Karakter: 6 tab, tajuk, seed
  const krk = g.sheet.get(K.sheetId);
  assert.equal(krk.title, 'Annur OPR - SMK Wakanda (e-Karakter)');
  assert.deepEqual([...krk.tabs.keys()], tabKrk);
  assert.equal(krk.tabs.get('KarakterRekod')[0].length, 24);
  assert.equal(krk.tabs.get('KarakterRekod')[0][18], 'TahunSesi');
  const senarai = krk.tabs.get('Senarai').slice(1);
  assert.deepEqual(senarai.filter(r => r[0] === 'KARAKTER_TERAS').map(r => r[1]), ['Penyayang', 'Berdaya Tahan', 'Berupaya Memimpin', 'Warganegara Aktif']);
  assert.equal(new Set(senarai.filter(r => r[0] === 'KARAKTER_KELAS').map(r => r[1])).size, senarai.filter(r => r[0] === 'KARAKTER_KELAS').length, 'kelas tanpa pendua');
  const tet = Object.fromEntries(krk.tabs.get('Tetapan').slice(1));
  assert.equal(tet.KRK_WAJIB_TTD, 'TIDAK');
  assert.equal(tet.KRK_HAD_MUNDUR_HARI, '30');
  assert.ok(JSON.parse(tet.KRK_TERAS_HURAIAN).Penyayang);
  assert.equal(krk.tabs.get('AuditLog')[1][3], 'KARAKTER_SEDIAKAN');
  // Drive: Sheet Karakter bersebelahan Sheet OPR; folder e-Karakter dengan 3 subfolder
  assert.deepEqual(g.fail.get(K.sheetId).parents, [sek.folderId]);
  assert.equal(g.fail.get(K.folderId).name, 'e-Karakter');
  assert.deepEqual(g.fail.get(K.folderId).parents, [sek.folderId]);
  for (const [k, nama] of [['PDF', 'PDF'], ['LAMPIRAN', 'Lampiran'], ['TTD', 'Tandatangan']]) {
    assert.equal(g.fail.get(K.subfolder[k]).name, nama);
    assert.deepEqual(g.fail.get(K.subfolder[k]).parents, [K.folderId]);
  }
});

test('karakter: pasang semula dua kali tiada pendua tab, seed atau folder', async () => {
  const { e, g, sesiAdmin } = await sekolahSiap();
  const sek = await e.OPR_KV.get('school:smkwakanda', 'json');
  const bilSheet = g.sheet.size, bilFolder = [...g.fail.values()].filter(x => x.mimeType === FOLDER).length;
  const bilSenarai = g.sheet.get(sek.karakter.sheetId).tabs.get('Senarai').length;
  const r1 = await panggilApi(e, g, sesiAdmin, '/karakter/skema/pasang', {});
  const r2 = await panggilApi(e, g, sesiAdmin, '/karakter/skema/pasang', {});
  for (const r of [r1, r2]) { assert.equal(r.ok, true); assert.deepEqual(r.dicipta, []); assert.deepEqual(r.dibaiki, []); }
  assert.equal(r2.versiSkema, 1);
  assert.equal(g.sheet.size, bilSheet);
  assert.equal([...g.fail.values()].filter(x => x.mimeType === FOLDER).length, bilFolder);
  assert.equal(g.sheet.get(sek.karakter.sheetId).tabs.get('Senarai').length, bilSenarai);
  assert.equal(await e.OPR_KV.get('kunci:karakter:smkwakanda'), null, 'kunci dilepaskan');
});

test('karakter: pasang semula membaiki tab yang dipadam dan seed yang hilang tanpa menimpa suntingan', async () => {
  const { e, g, sesiAdmin } = await sekolahSiap();
  const sek = await e.OPR_KV.get('school:smkwakanda', 'json');
  const krk = g.sheet.get(sek.karakter.sheetId);
  krk.tabs.delete('KarakterTtd');                                        // admin padam satu tab
  krk.tabs.set('Senarai', krk.tabs.get('Senarai').filter(r => r[0] !== 'KARAKTER_TERAS'));   // padam semua teras
  const kelas = krk.tabs.get('Senarai').filter(r => r[0] === 'KARAKTER_KELAS');
  kelas[0][1] = '6 Ibnu Khaldun';                                        // suntingan admin
  krk.tabs.set('Tetapan', krk.tabs.get('Tetapan').filter(r => r[0] !== 'KRK_WAJIB_TTD'));
  const r = await panggilApi(e, g, sesiAdmin, '/karakter/skema/pasang', {});
  assert.equal(r.ok, true);
  assert.deepEqual(r.dibaiki.sort(), ['senarai KARAKTER_TERAS', 'tab KarakterTtd', 'tetapan KRK_WAJIB_TTD'].sort());
  assert.deepEqual(krk.tabs.get('KarakterTtd')[0], ['Email', 'FileId', 'DikemaskiniPada']);
  assert.equal(krk.tabs.get('Senarai').filter(r => r[0] === 'KARAKTER_TERAS').length, 4);
  assert.equal(krk.tabs.get('Senarai').filter(r => r[0] === 'KARAKTER_KELAS').length, kelas.length, 'kelas tidak diseed semula');
  assert.ok(krk.tabs.get('Senarai').some(r => r[1] === '6 Ibnu Khaldun'), 'suntingan admin kekal');
  assert.equal(krk.tabs.get('Tetapan').filter(r => r[0] === 'KRK_WAJIB_TTD').length, 1);
  const s = await panggilApi(e, g, sesiAdmin, '/karakter/struktur');
  assert.deepEqual(s.tabHilang, []);
  assert.ok(krk.tabs.get('AuditLog').some(x => x[3] === 'KARAKTER_SEDIAKAN' && /tab KarakterTtd/.test(x[6])));
});

test('karakter: sekolah sedia ada (tanpa Sheet Karakter) dinaik taraf automatik oleh admin; guru tunggu; data OPR utuh', async () => {
  const { e, g, sesiAdmin } = await sekolahSiap();
  // Simulasi sekolah yang didaftar sebelum e-Karakter wujud
  let sek = await e.OPR_KV.get('school:smkwakanda', 'json');
  delete sek.karakter;
  await e.OPR_KV.put('school:smkwakanda', JSON.stringify(sek));
  const bilSheet = g.sheet.size;
  await panggilApi(e, g, sesiAdmin, '/guru', { teks: 'guru@gmail.com' });
  const lap = await panggilApi(e, g, sesiAdmin, '/laporan', { data: { tajuk: 'Laporan OPR lama' }, consent: true });
  assert.equal(lap.ok, true);
  const laporanSebelum = JSON.stringify(g.sheet.get(sek.sheetId).tabs.get('Laporan'));

  // Guru buka dahulu: 409, tiada apa dicipta
  const guru = await logMasukSebagai(e, g, 'guru@gmail.com');
  const rg = await panggilApi(e, g, guru.sesi, '/karakter/struktur');
  assert.equal(rg.status, 409);
  assert.equal(rg.perluSediaKarakter, true);
  assert.equal(g.sheet.size, bilSheet);

  // Admin buka: Sheet Karakter dicipta, OPR tidak disentuh
  const ra = await panggilApi(e, g, sesiAdmin, '/karakter/struktur');
  assert.equal(ra.ok, true);
  assert.equal(ra.versiSkema, 1);
  assert.equal(g.sheet.size, bilSheet + 1);
  sek = await e.OPR_KV.get('school:smkwakanda', 'json');
  assert.ok(sek.karakter.sheetId);
  assert.equal(JSON.stringify(g.sheet.get(sek.sheetId).tabs.get('Laporan')), laporanSebelum);
  assert.equal((await panggilApi(e, g, sesiAdmin, '/laporan')).jumlah, 1);

  // Guru kini boleh masuk modul (laluan admin tetap ditolak, lihat ujian seterusnya)
  assert.equal((await panggilApi(e, g, guru.sesi, '/karakter/tiada')).status, 404);
});

test('karakter: guru ditolak untuk laluan admin dan penolakan direkod dalam AuditLog e-Karakter', async () => {
  const { e, g, sesiAdmin } = await sekolahSiap();
  await panggilApi(e, g, sesiAdmin, '/guru', { teks: 'guru@gmail.com' });
  const guru = await logMasukSebagai(e, g, 'guru@gmail.com');
  const p = await panggilApi(e, g, guru.sesi, '/karakter/skema/pasang', {});
  assert.equal(p.status, 403);
  const s = await panggilApi(e, g, guru.sesi, '/karakter/struktur');
  assert.equal(s.status, 403);
  const sek = await e.OPR_KV.get('school:smkwakanda', 'json');
  const log = g.sheet.get(sek.karakter.sheetId).tabs.get('AuditLog').filter(r => r[3] === 'KARAKTER_AKSES_DITOLAK');
  assert.equal(log.length, 2);
  assert.equal(log[0][1], 'guru@gmail.com');
  assert.equal(log[0][4], 'POST /karakter/skema/pasang');
  assert.equal(log[0][5], 'DITOLAK');
  // Tiada apa-apa ditulis ke AuditLog OPR untuk penolakan karakter
  assert.ok(!g.sheet.get(sek.sheetId).tabs.get('AuditLog').some(r => r[3] === 'KARAKTER_AKSES_DITOLAK'));
  // Bukan ahli langsung: ditolak oleh pengawal OPR sedia ada
  const luar = await logMasukSebagai(e, g, 'orang.luar@gmail.com');
  assert.equal((await panggilApi(e, g, luar.sesi, '/karakter/struktur')).status, 403);
});

test('karakter: kegagalan Sheet e-Karakter semasa daftar tidak menggagalkan OPR; admin baiki kemudian', async () => {
  const e = env(); const g = googlePalsu({ gagalCiptaSheetKe: 2 });   // Sheet ke-2 = Sheet Karakter
  const { sesi } = await logMasuk(e, g, 'admin');
  const c = await (await handle(req('/api/schools', { method: 'POST', kuki: { opr_sesi: sesi }, body: { nama: 'SMK Wakanda', slug: 'smkwakanda' } }), e, deps(g))).json();
  assert.equal(c.sedia, true, 'OPR tetap siap');
  let sek = await e.OPR_KV.get('school:smkwakanda', 'json');
  assert.ok(sek.sheetId && !sek.karakter.sheetId && sek.karakter.folderId, 'folder Karakter wujud, Sheet belum');
  const bilFolder = [...g.fail.values()].filter(x => x.mimeType === FOLDER).length;
  const r = await panggilApi(e, g, sesi, '/karakter/struktur');
  assert.equal(r.ok, true);
  sek = await e.OPR_KV.get('school:smkwakanda', 'json');
  assert.ok(sek.karakter.sheetId);
  assert.equal([...g.fail.values()].filter(x => x.mimeType === FOLDER).length, bilFolder, 'folder tidak dicipta semula');
});

test('karakter: dua permintaan serentak semasa pemasangan: yang kedua diminta cuba lagi', async () => {
  const { e, g, sesiAdmin } = await sekolahSiap();
  await e.OPR_KV.put('kunci:karakter:smkwakanda', '1');
  const r = await panggilApi(e, g, sesiAdmin, '/karakter/skema/pasang', {});
  assert.equal(r.status, 409);
  assert.equal(r.sedangSedia, true);
});

// ======================================================================
// e-Karakter Fasa 1: setup sekolah (kelas, subjek, teras, guru kelas, tetapan)
// ======================================================================
test('karakter fasa 1: penerimaan IPD (12 kelas, 10 subjek, teras kelima, 2 guru kelas, kod sekolah)', async () => {
  const { e, g, sesiAdmin } = await sekolahSiap();
  await panggilApi(e, g, sesiAdmin, '/guru', { teks: 'aminah@gmail.com, Cikgu Aminah\nali@gmail.com, Cikgu Ali\nbekas@gmail.com' });
  // Panduan awal: guru siap, kelas/subjek/tetapan belum
  let s = await panggilApi(e, g, sesiAdmin, '/karakter/setup');
  const siap = (p) => Object.fromEntries(p.map(x => [x.kod, x.siap]));
  assert.deepEqual(siap(s.panduan), { guru: true, kelas: false, subjek: false, gurukelas: false, teras: true, tetapan: false });
  assert.equal(s.senarai.teras.length, 4);
  assert.ok(s.senarai.teras[0].huraian);

  const kelas = Array.from({ length: 12 }, (_, i) => ({ nilai: (i % 6 + 1) + ' ' + ['Arif', 'Bijak'][Math.floor(i / 6)] }));
  let r = await panggilApi(e, g, sesiAdmin, '/karakter/senarai', { kategori: 'KARAKTER_KELAS', item: [...kelas, { nilai: '1 arif' }, { nilai: '  ' }] });
  assert.equal(r.ok, true); assert.equal(r.bilangan, 12); assert.equal(r.pendua, 1);
  const subjek = ['BM', 'BI', 'MT', 'SN', 'PI', 'PM', 'SJ', 'GG', 'RBT', 'PJK'].map(nilai => ({ nilai }));
  r = await panggilApi(e, g, sesiAdmin, '/karakter/senarai', { kategori: 'KARAKTER_SUBJEK', item: subjek });
  assert.equal(r.bilangan, 10);
  const teras = ['Penyayang', 'Berdaya Tahan', 'Berupaya Memimpin', 'Warganegara Aktif', 'Berintegriti'].map(nilai => ({ nilai }));
  r = await panggilApi(e, g, sesiAdmin, '/karakter/senarai', { kategori: 'KARAKTER_TERAS', item: teras,
    huraian: { Penyayang: 'Ubah huraian', Berintegriti: 'Jujur dan amanah.' } });
  assert.equal(r.bilangan, 5);
  r = await panggilApi(e, g, sesiAdmin, '/karakter/gurukelas', { pemetaan: [
    { kelas: '5 Arif', email: 'aminah@gmail.com' }, { kelas: '5 Arif', email: 'ali@gmail.com' },
    { kelas: '6 Bijak', email: 'aminah@gmail.com' }, { kelas: '6 Bijak', email: 'AMINAH@gmail.com' }] });
  assert.equal(r.ok, true); assert.equal(r.bilangan, 3, 'pendua (huruf besar) diabaikan');
  r = await panggilApi(e, g, sesiAdmin, '/karakter/tetapan', { tetapan: { KRK_KOD_SEKOLAH: 'BEA1234', KRK_NAMA_PENGESAH: 'Puan Rohana', KRK_WAJIB_TTD: 'ya', LOGO1_ID: 'x' } });
  assert.equal(r.ok, true); assert.deepEqual(r.ditolak, ['LOGO1_ID']);

  s = await panggilApi(e, g, sesiAdmin, '/karakter/setup');
  assert.deepEqual(siap(s.panduan), { guru: true, kelas: true, subjek: true, gurukelas: true, teras: true, tetapan: true });
  assert.equal(s.senarai.kelas.length, 12);
  assert.equal(s.senarai.teras[4].huraian, 'Jujur dan amanah.');
  assert.equal(s.tetapan.KRK_KOD_SEKOLAH, 'BEA1234');
  assert.equal(s.tetapan.KRK_WAJIB_TTD, 'YA');
  assert.deepEqual(s.yatim, []);

  // Config guru: Aminah guru kelas 2 kelas, Ali 1 kelas, guru lain tiada
  const aminah = await logMasukSebagai(e, g, 'aminah@gmail.com');
  const c = await panggilApi(e, g, aminah.sesi, '/karakter/config');
  assert.equal(c.ok, true); assert.equal(c.admin, false);
  assert.deepEqual(c.guruKelas.sort(), ['5 Arif', '6 Bijak']);
  assert.equal(c.kelas.length, 12); assert.equal(c.subjek.length, 10);
  assert.deepEqual(c.teras.map(t => t.nama), teras.map(t => t.nilai));
  assert.equal(c.tetapan.KRK_KOD_SEKOLAH, 'BEA1234');
  assert.equal(c.tetapan.KRK_SIAP_KELAS, undefined, 'penanda dalaman tidak didedahkan');
  assert.equal(c.adaTtd, false);
  const bekas = await logMasukSebagai(e, g, 'bekas@gmail.com');
  assert.deepEqual((await panggilApi(e, g, bekas.sesi, '/karakter/config')).guruKelas, []);

  // Guru biasa: Setup ditolak di server (403) untuk semua laluan admin, dan direkod
  for (const [laluan, body] of [['/karakter/setup'], ['/karakter/senarai', { kategori: 'KARAKTER_KELAS', item: [{ nilai: 'X' }] }],
    ['/karakter/gurukelas', { pemetaan: [] }], ['/karakter/tetapan', { tetapan: { KRK_KOD_SEKOLAH: 'X' } }]]) {
    assert.equal((await panggilApi(e, g, aminah.sesi, laluan, body)).status, 403, laluan);
  }
  const sek = await e.OPR_KV.get('school:smkwakanda', 'json');
  const audit = g.sheet.get(sek.karakter.sheetId).tabs.get('AuditLog');
  assert.equal(audit.filter(x => x[3] === 'KARAKTER_AKSES_DITOLAK').length, 4);
  for (const t of ['KARAKTER_SENARAI', 'KARAKTER_GURUKELAS', 'KARAKTER_TETAPAN']) assert.ok(audit.some(x => x[3] === t), t);
});

test('karakter fasa 1: nyahaktif kelas mengekalkan nama; pemetaan yatim dipaparkan; tukar pemetaan serta-merta', async () => {
  const { e, g, sesiAdmin } = await sekolahSiap();
  await panggilApi(e, g, sesiAdmin, '/guru', { teks: 'aminah@gmail.com' });
  await panggilApi(e, g, sesiAdmin, '/karakter/senarai', { kategori: 'KARAKTER_KELAS', item: [{ nilai: '1 Arif' }, { nilai: '2 Bestari' }] });
  await panggilApi(e, g, sesiAdmin, '/karakter/gurukelas', { pemetaan: [{ kelas: '1 Arif', email: 'aminah@gmail.com' }] });
  // Nyahaktif kelas 1 Arif: item kekal dalam Sheet (TIDAK), hilang dari config, pemetaan jadi yatim
  await panggilApi(e, g, sesiAdmin, '/karakter/senarai', { kategori: 'KARAKTER_KELAS', item: [{ nilai: '1 Arif', aktif: false }, { nilai: '2 Bestari' }] });
  const sek = await e.OPR_KV.get('school:smkwakanda', 'json');
  assert.ok(g.sheet.get(sek.karakter.sheetId).tabs.get('Senarai').some(r => r[0] === 'KARAKTER_KELAS' && r[1] === '1 Arif' && r[3] === 'TIDAK'));
  const s = await panggilApi(e, g, sesiAdmin, '/karakter/setup');
  assert.deepEqual(s.senarai.kelas.map(x => [x.nilai, x.aktif]), [['1 Arif', false], ['2 Bestari', true]]);
  assert.equal(s.yatim.length, 1); assert.match(s.yatim[0].sebab, /Kelas/);
  const aminah = await logMasukSebagai(e, g, 'aminah@gmail.com');
  assert.deepEqual((await panggilApi(e, g, aminah.sesi, '/karakter/config')).kelas, ['2 Bestari']);
  // Pemetaan ke kelas tidak aktif / guru bukan ahli ditolak, tiada apa disimpan
  const bad = await panggilApi(e, g, sesiAdmin, '/karakter/gurukelas', { pemetaan: [
    { kelas: '1 Arif', email: 'aminah@gmail.com' }, { kelas: '2 Bestari', email: 'luar@gmail.com' }] });
  assert.equal(bad.status, 400); assert.equal(bad.salah.length, 2);
  // Tukar pemetaan: berkuat kuasa pada permintaan seterusnya
  await panggilApi(e, g, sesiAdmin, '/karakter/gurukelas', { pemetaan: [{ kelas: '2 Bestari', email: 'aminah@gmail.com' }] });
  assert.deepEqual((await panggilApi(e, g, aminah.sesi, '/karakter/config')).guruKelas, ['2 Bestari']);
  // Guru dinyahaktif dalam OPR: hilang akses e-Karakter serta-merta
  await panggilApi(e, g, sesiAdmin, '/guru/kemaskini', { email: 'aminah@gmail.com', aktif: false });
  assert.equal((await panggilApi(e, g, aminah.sesi, '/karakter/config')).status, 403);
});

test('karakter fasa 1: pengesahan input senarai dan tetapan', async () => {
  const { e, g, sesiAdmin } = await sekolahSiap();
  const p = (laluan, body) => panggilApi(e, g, sesiAdmin, laluan, body);
  assert.equal((await p('/karakter/senarai', { kategori: 'UNIT_SUKAN', item: [{ nilai: 'X' }] })).status, 400, 'kategori OPR ditolak');
  assert.equal((await p('/karakter/senarai', { kategori: 'KARAKTER_TERAS', item: [{ nilai: 'A', aktif: false }] })).status, 400, 'teras mesti ada yang aktif');
  assert.equal((await p('/karakter/senarai', { kategori: 'KARAKTER_KELAS', item: [] })).status, 400);
  assert.equal((await p('/karakter/senarai', { kategori: 'KARAKTER_TERAS', item: Array.from({ length: 13 }, (_, i) => ({ nilai: 'T' + i })) })).status, 400, 'maks 12 teras');
  const panjang = await p('/karakter/senarai', { kategori: 'KARAKTER_KELAS', item: [{ nilai: 'K'.repeat(100) }, { nilai: '=HYPERLINK("x")' }] });
  assert.equal(panjang.ok, true);
  const sek = await e.OPR_KV.get('school:smkwakanda', 'json');
  const kel = g.sheet.get(sek.karakter.sheetId).tabs.get('Senarai').filter(r => r[0] === 'KARAKTER_KELAS');
  assert.equal(kel[0][1].length, 60);
  assert.equal(kel[1][1], '=HYPERLINK("x")', 'disimpan sebagai teks (RAW), bukan formula');
  assert.equal((await p('/karakter/tetapan', { tetapan: { KRK_WAJIB_TTD: 'MUNGKIN' } })).status, 400);
  assert.equal((await p('/karakter/tetapan', { tetapan: { KRK_HAD_MUNDUR_HARI: '3.5' } })).status, 400);
  assert.equal((await p('/karakter/tetapan', { tetapan: { KRK_TAJUK_DOKUMEN: '  ' } })).status, 400);
  assert.equal((await p('/karakter/tetapan', { tetapan: { NAMA_SEKOLAH: 'Hack' } })).status, 400, 'kunci OPR tidak boleh diubah melalui e-Karakter');
});
