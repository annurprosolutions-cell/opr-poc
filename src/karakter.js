// e-Karakter (Fasa 0): Sheet Karakter ASING, pemasangan struktur, audit.
//
// Reka bentuk (keputusan 26/11/2026):
//   - Sheet OPR tidak disentuh. Peranan guru dibaca daripada tab Guru dalam Sheet OPR
//     (satu sumber; nyahaktif guru terus berkuat kuasa untuk kedua-dua modul).
//   - Sheet Karakter ("Annur OPR - <sekolah> (e-Karakter)") duduk dalam folder sekolah,
//     bersebelahan Sheet OPR. Fail modul ini dalam folder "e-Karakter" (PDF, Lampiran, Tandatangan).
//   - Rekod sekolah dalam KV: sek.karakter = { folderId, subfolder, sheetId, sheetDalamFolder, versiSkema, sediaPada }
//
// Bila struktur dipasang:
//   1. Sekolah baharu: semasa sediakanDrive (kegagalan tidak menggagalkan OPR).
//   2. Sekolah sedia ada: automatik pada permintaan /karakter/* pertama oleh ADMIN.
//      Guru biasa mendapat 409 sehingga admin membuka modul ini (elak dua guru
//      mencipta Sheet serentak).
//   3. Butang sandaran admin: POST /karakter/skema/pasang (semak penuh + baiki tab yang hilang).

import { json, ralat } from './lib.js';
import {
  ciptaFolder, ciptaSpreadsheet, pindahKeFolder, infoFail, tambahBaris, bacaObjek,
  senaraiTab, tambahTab, pautanSheet, pautanFolder, RalatGoogle,
  bacaBanyak, kemaskiniJulat, kosongkanJulat, muatNaik, muatTurun, buangKeTong, kemaskiniKandungan
} from './google.js';
import { hariIni, tambahHari } from './lesen.js';
import { hurufLajur } from './laporan.js';
import {
  TAB, VERSI_SKEMA_KRK, TAB_KRK, KOLUM_KRK, FOLDER_KRK, SUBFOLDER_KRK,
  SENARAI_KARAKTER, tetapanKarakterAsal, barisSenaraiKarakter
} from './skema.js';

const simpan = (env, sek) => env.OPR_KV.put('school:' + sek.slug, JSON.stringify(sek));

export const karakterSedia = (sek) => !!(sek.karakter && sek.karakter.sheetId && sek.karakter.versiSkema >= VERSI_SKEMA_KRK);

// Idempoten dan boleh disambung: setiap langkah disimpan ke KV sebaik siap.
// `penuh`: semak juga tab dan seed dalam Sheet sedia ada (butang pasang semula).
export async function pasangSkemaKarakter(env, sek, g, sesi, now, { penuh = false } = {}) {
  if (!sek.folderId) throw new Error('Folder sekolah belum disediakan.');
  const masa = new Date(now()).toISOString();
  const ringkasan = { dicipta: [], dibaiki: [], sediaAda: [] };
  const K = sek.karakter = sek.karakter || {};

  if (!K.folderId) {
    K.folderId = await ciptaFolder(g, FOLDER_KRK, sek.folderId);
    ringkasan.dicipta.push('folder ' + FOLDER_KRK);
    await simpan(env, sek);
  }
  K.subfolder = K.subfolder || {};
  for (const [kunci, nama] of Object.entries(SUBFOLDER_KRK)) {
    if (!K.subfolder[kunci]) {
      K.subfolder[kunci] = await ciptaFolder(g, nama, K.folderId);
      ringkasan.dicipta.push('folder ' + nama);
      await simpan(env, sek);
    }
  }

  if (!K.sheetId) {
    K.sheetId = await ciptaSpreadsheet(g, 'Annur OPR - ' + sek.nama + ' (e-Karakter)', [
      { nama: TAB_KRK.REKOD, tajuk: KOLUM_KRK[TAB_KRK.REKOD] },
      { nama: TAB_KRK.GURUKELAS, tajuk: KOLUM_KRK[TAB_KRK.GURUKELAS] },
      { nama: TAB_KRK.TTD, tajuk: KOLUM_KRK[TAB_KRK.TTD] },
      { nama: TAB_KRK.SENARAI, tajuk: KOLUM_KRK[TAB_KRK.SENARAI], baris: barisSenaraiKarakter() },
      { nama: TAB_KRK.TETAPAN, tajuk: KOLUM_KRK[TAB_KRK.TETAPAN], baris: tetapanKarakterAsal() },
      { nama: TAB_KRK.AUDIT, tajuk: KOLUM_KRK[TAB_KRK.AUDIT],
        baris: [[masa, (sesi && sesi.email) || sek.adminEmail, 'admin', 'KARAKTER_SEDIAKAN', sek.slug, 'BERJAYA', 'Versi skema ' + VERSI_SKEMA_KRK]] }
    ]);
    K.sheetDalamFolder = false;
    ringkasan.dicipta.push('Sheet e-Karakter');
    await simpan(env, sek);
  } else if (penuh) {
    await baikiStruktur(g, K.sheetId, ringkasan);
  }
  if (!K.sheetDalamFolder) {
    await pindahKeFolder(g, K.sheetId, sek.folderId);   // bersebelahan Sheet OPR
    K.sheetDalamFolder = true;
  }
  if (!ringkasan.dicipta.length && !ringkasan.dibaiki.length) ringkasan.sediaAda.push('Semua struktur e-Karakter sudah lengkap');
  K.versiSkema = VERSI_SKEMA_KRK;
  K.sediaPada = K.sediaPada || masa;
  await simpan(env, sek);
  return ringkasan;
}

// Tambah tab yang hilang; seed kategori Senarai dan kunci Tetapan yang TIADA LANGSUNG
// (tidak menimpa suntingan admin).
async function baikiStruktur(g, sheetId, ringkasan) {
  const ada = new Set(await senaraiTab(g, sheetId));
  for (const nama of Object.values(TAB_KRK)) {
    if (ada.has(nama)) continue;
    const seed = nama === TAB_KRK.SENARAI ? barisSenaraiKarakter() : nama === TAB_KRK.TETAPAN ? tetapanKarakterAsal() : [];
    await tambahTab(g, sheetId, nama, KOLUM_KRK[nama], seed);
    ringkasan.dibaiki.push('tab ' + nama);
  }
  const senarai = await bacaObjek(g, sheetId, TAB_KRK.SENARAI);
  const kategoriAda = new Set(senarai.map(r => String(r.Kategori).trim()));
  const tambahSenarai = [];
  for (const [kat, item] of Object.entries(SENARAI_KARAKTER)) {
    if (kategoriAda.has(kat)) continue;
    item.forEach((v, i) => tambahSenarai.push([kat, v, String(i + 1), 'YA']));
    ringkasan.dibaiki.push('senarai ' + kat);
  }
  if (tambahSenarai.length) await tambahBaris(g, sheetId, TAB_KRK.SENARAI, tambahSenarai);

  const kunciAda = new Set((await bacaObjek(g, sheetId, TAB_KRK.TETAPAN)).map(r => String(r.Kunci).trim()));
  const tambahTetapan = tetapanKarakterAsal().filter(([k]) => !kunciAda.has(k));
  if (tambahTetapan.length) {
    await tambahBaris(g, sheetId, TAB_KRK.TETAPAN, tambahTetapan);
    ringkasan.dibaiki.push('tetapan ' + tambahTetapan.map(([k]) => k).join(', '));
  }
}

// ---------------------------------------------------------------- audit
// Tulis ke AuditLog Sheet Karakter; jika belum wujud, ke AuditLog Sheet OPR.
export async function auditKarakter({ g, sek, sesi, kenal }, tindakan, sasaran, status, nota) {
  const sheetId = (sek.karakter && sek.karakter.sheetId) || sek.sheetId;
  const tab = sek.karakter && sek.karakter.sheetId ? TAB_KRK.AUDIT : TAB.AUDIT;
  try {
    await tambahBaris(g, sheetId, tab, [[new Date().toISOString(), sesi.email, (kenal && kenal.peranan) || '',
      tindakan, sasaran || '', status || 'BERJAYA', nota || '']]);
  } catch (e) { console.error('Audit karakter gagal', e && e.message); }
}

// Tolak akses: rekod KARAKTER_AKSES_DITOLAK dan pulangkan 403.
export async function tolakKarakter(ctx, laluan, sebab, mesej) {
  await auditKarakter(ctx, 'KARAKTER_AKSES_DITOLAK', laluan, 'DITOLAK', sebab);
  return ralat(mesej || 'Anda tidak dibenarkan membuka bahagian ini.', 403);
}

// ---------------------------------------------------------------- API
// Dipanggil oleh apiSekolah selepas kenalPasti (pengguna ialah ahli aktif sekolah).
export async function apiKarakter(ctx, sub) {
  const { env, sek, sesi, g, admin, req, now } = ctx;
  const s = sub.slice('/karakter'.length) || '/';
  const laluan = req.method + ' /karakter' + (s === '/' ? '' : s);

  // Butang sandaran: semak penuh dan baiki
  if (s === '/skema/pasang' && req.method === 'POST') {
    if (!admin) return tolakKarakter(ctx, laluan, 'Bukan admin');
    return denganKunci(env, sek, async () => {
      if (sek.karakter && sek.karakter.sheetId) {
        const info = await infoFail(g, sek.karakter.sheetId).catch(e => { if (e instanceof RalatGoogle && e.status === 404) return null; throw e; });
        if (!info) return ralat('Sheet e-Karakter sekolah tidak dijumpai dalam Google Drive. Sila hubungi AnnurPro.', 409);
        if (info.trashed) return ralat('Sheet e-Karakter berada dalam Tong Sampah Google Drive. Sila pulihkannya, kemudian cuba lagi.', 409);
      }
      const r = await pasangSkemaKarakter(env, sek, g, sesi, now, { penuh: true });
      if (r.dicipta.length || r.dibaiki.length) {
        await auditKarakter(ctx, 'KARAKTER_SEDIAKAN', sek.slug, 'BERJAYA', [...r.dicipta, ...r.dibaiki].join('; ').slice(0, 500));
      }
      return json({ ok: true, ...r, ...statusStruktur(sek) });
    });
  }

  // Pemasangan automatik kali pertama (admin sahaja)
  if (!karakterSedia(sek)) {
    if (!admin) return ralat('e-Karakter belum disediakan oleh admin sekolah. Sila minta admin membuka modul e-Karakter sekali.', 409, { perluSediaKarakter: true });
    const r = await denganKunci(env, sek, async () => { await pasangSkemaKarakter(env, sek, g, sesi, now); return null; });
    if (r) return r;
  }

  if (s === '/config' && req.method === 'GET') return await configKarakter(ctx);
  if (s === '/setup' && req.method === 'GET') return admin ? await setupKarakter(ctx) : tolakKarakter(ctx, laluan, 'Bukan admin');
  if (s === '/senarai' && req.method === 'POST') return admin ? await simpanSenaraiKarakter(ctx) : tolakKarakter(ctx, laluan, 'Bukan admin');
  if (s === '/gurukelas' && req.method === 'POST') return admin ? await simpanGuruKelas(ctx) : tolakKarakter(ctx, laluan, 'Bukan admin');
  if (s === '/tetapan' && req.method === 'POST') return admin ? await simpanTetapanKarakter(ctx) : tolakKarakter(ctx, laluan, 'Bukan admin');

  // Fasa 2: rekod dan fail
  if (s === '/fail' && req.method === 'POST') return await terimaFailKarakter(ctx);
  if (s === '/rekod' && req.method === 'POST') return await simpanRekod(ctx);
  if (s === '/rekod' && req.method === 'GET') return await senaraiRekod(ctx, laluan);
  if (s === '/statistik' && req.method === 'GET' && ctx.url.searchParams.get('skop') === 'kelas') return await statistikKelas(ctx, laluan);
  if (s === '/statistik' && req.method === 'GET') return admin ? await statistikAdmin(ctx) : tolakKarakter(ctx, laluan, 'Bukan admin');
  if (s === '/eksport' && req.method === 'GET') return admin ? await eksportKarakter(ctx) : tolakKarakter(ctx, laluan, 'Bukan admin');
  const mr = s.match(/^\/rekod\/(KRK-\d{8}-[A-Z0-9]{5})(\/padam)?$/);
  if (mr && !mr[2] && req.method === 'GET') return await bacaSatuRekod(ctx, mr[1], laluan);
  if (mr && mr[2] && req.method === 'POST') return await padamRekod(ctx, mr[1], laluan);
  const mf = s.match(/^\/fail\/([A-Za-z0-9_-]{10,128})$/);
  if (mf && req.method === 'GET') return await hantarFailKarakter(ctx, mf[1], laluan);
  // Fasa 3: tandatangan dan PDF
  const mp = s.match(/^\/rekod\/(KRK-\d{8}-[A-Z0-9]{5})\/pdf$/);
  if (mp && req.method === 'POST') return await simpanPdf(ctx, mp[1], laluan);
  if (mp && req.method === 'GET') return await hantarPdf(ctx, mp[1], laluan);
  if (s === '/ttd' && req.method === 'GET') return await bacaTtd(ctx);
  if (s === '/ttd' && req.method === 'POST') return await simpanTtd(ctx);
  if (s === '/ttd/padam' && req.method === 'POST') return await padamTtd(ctx);
  if (s === '/ttd/gambar' && req.method === 'GET') return await gambarTtd(ctx);

  if (s === '/struktur' && req.method === 'GET') {
    if (!admin) return tolakKarakter(ctx, laluan, 'Bukan admin');
    const tabAda = await senaraiTab(g, sek.karakter.sheetId);
    const tabHilang = Object.values(TAB_KRK).filter(t => !tabAda.includes(t));
    return json({ ok: true, ...statusStruktur(sek), tabHilang });
  }

  return ralat('Laluan tidak dijumpai.', 404);
}

function statusStruktur(sek) {
  const K = sek.karakter || {};
  return { versiSkema: K.versiSkema || 0, sediaPada: K.sediaPada || '',
    pautanSheet: K.sheetId ? pautanSheet(K.sheetId) : '', pautanFolder: K.folderId ? pautanFolder(K.folderId) : '' };
}

// Kunci ringkas dalam KV supaya dua permintaan serentak tidak mencipta Sheet pendua.
// (KV tidak atomik; ini mengecilkan risiko, dan pemasangan sendiri idempoten.)
async function denganKunci(env, sek, fn) {
  const k = 'kunci:karakter:' + sek.slug;
  if (await env.OPR_KV.get(k)) return ralat('e-Karakter sedang disediakan untuk sekolah anda. Cuba lagi sebentar.', 409, { sedangSedia: true });
  await env.OPR_KV.put(k, '1', { expirationTtl: 60 });
  try { return await fn(); } finally { await env.OPR_KV.delete(k); }
}

// ======================================================================
// Fasa 1: config, setup (kelas, subjek, teras, guru kelas, tetapan), panduan
// ======================================================================

const KAT = { KELAS: 'KARAKTER_KELAS', SUBJEK: 'KARAKTER_SUBJEK', TERAS: 'KARAKTER_TERAS' };
const HAD_KAT = {
  [KAT.KELAS]: { panjang: 60, maks: 200, nama: 'kelas' },
  [KAT.SUBJEK]: { panjang: 60, maks: 200, nama: 'mata pelajaran' },
  [KAT.TERAS]: { panjang: 40, maks: 12, nama: 'elemen teras' }
};
// Penanda langkah panduan mula pantas (bukan tetapan awam)
const SIAP = { [KAT.KELAS]: 'KRK_SIAP_KELAS', [KAT.SUBJEK]: 'KRK_SIAP_SUBJEK', [KAT.TERAS]: 'KRK_SIAP_TERAS', TETAPAN: 'KRK_SIAP_TETAPAN' };

const bersih = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const ya = (v) => String(v).trim().toUpperCase() === 'YA';

function kumpulSenarai(baris) {
  const out = {};
  baris.forEach(r => {
    const k = String(r.Kategori).trim();
    if (!k) return;
    (out[k] = out[k] || []).push({ nilai: String(r.Nilai), aktif: ya(r.Aktif || 'YA'), susunan: Number(r.Susunan) || 0 });
  });
  Object.values(out).forEach(a => a.sort((x, y) => x.susunan - y.susunan));
  return out;
}
const kumpulTetapan = (baris) => Object.fromEntries(baris.filter(r => r.Kunci).map(r => [String(r.Kunci).trim(), String(r.Nilai ?? '')]));
function huraianTeras(t) {
  try { const o = JSON.parse(t.KRK_TERAS_HURAIAN || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; }
}
const guruAktif = (kenal, sek) => kenal.jadual.baris
  .filter(r => String(r.Email).trim() && (ya(r.Aktif) || String(r.Email).trim().toLowerCase() === sek.adminEmail))
  .map(r => ({ email: String(r.Email).trim().toLowerCase(), nama: String(r.Nama || ''), peranan: String(r.Peranan || 'guru').toLowerCase() }));

async function bacaKarakter(g, sek, tabs) { return bacaBanyak(g, sek.karakter.sheetId, tabs); }

// Untuk semua peranan: senarai aktif, tetapan awam, kelas yang dipetakan kepada pengguna, ada tandatangan tersimpan.
async function configKarakter({ g, sek, sesi, admin, kenal, now }) {
  const d = await bacaKarakter(g, sek, [TAB_KRK.SENARAI, TAB_KRK.TETAPAN, TAB_KRK.GURUKELAS, TAB_KRK.TTD]);
  const senarai = kumpulSenarai(d[TAB_KRK.SENARAI].baris);
  const t = kumpulTetapan(d[TAB_KRK.TETAPAN].baris);
  const aktif = (k) => (senarai[k] || []).filter(x => x.aktif).map(x => x.nilai);
  const hur = huraianTeras(t);
  const tetapan = Object.fromEntries(Object.entries(t).filter(([k]) => k.startsWith('KRK_') && !k.startsWith('KRK_SIAP_') && k !== 'KRK_TERAS_HURAIAN'));
  const email = sesi.email.toLowerCase();
  const guruKelas = d[TAB_KRK.GURUKELAS].baris.filter(r => String(r.Email).trim().toLowerCase() === email).map(r => String(r.Kelas));
  const adaTtd = d[TAB_KRK.TTD].baris.some(r => String(r.Email).trim().toLowerCase() === email && r.FileId);
  const had = hadMundur(t);
  return json({ ok: true, admin, kelas: aktif(KAT.KELAS), subjek: aktif(KAT.SUBJEK),
    teras: aktif(KAT.TERAS).map(nama => ({ nama, huraian: hur[nama] || '' })),
    tetapan, guruKelas, adaTtd,
    nama: namaGuru(kenal, sesi), hariIni: hariIni(now()), tarikhAwal: admin ? '' : tambahHari(hariIni(now()), -had),
    aktifUntukGuru: t.KRK_AKTIF !== 'TIDAK',
    ...(admin ? { setupBelumLengkap: !(t[SIAP[KAT.KELAS]] && t[SIAP[KAT.SUBJEK]] && t[SIAP.TETAPAN]) } : {}) });
}

// Admin: semua data untuk skrin Setup dan Panduan Mula Pantas, satu bacaan.
async function setupKarakter({ g, sek, kenal }) {
  const d = await bacaKarakter(g, sek, [TAB_KRK.SENARAI, TAB_KRK.TETAPAN, TAB_KRK.GURUKELAS, TAB_KRK.REKOD]);
  const senarai = kumpulSenarai(d[TAB_KRK.SENARAI].baris);
  const t = kumpulTetapan(d[TAB_KRK.TETAPAN].baris);
  const hur = huraianTeras(t);
  const guru = guruAktif(kenal, sek);
  const lainLain = (kat, medan) => {
    const rasmi = new Set((senarai[kat] || []).map(x => x.nilai.toLowerCase()));
    const kira = new Map();
    d[TAB_KRK.REKOD].baris.filter(r => !ya(r.Dipadam)).forEach(r => {
      const v = String(r[medan] || '').trim();
      if (v && !rasmi.has(v.toLowerCase())) kira.set(v, (kira.get(v) || 0) + 1);
    });
    return [...kira].map(([nilai, bil]) => ({ nilai, bil })).sort((a, b) => b.bil - a.bil).slice(0, 50);
  };
  const pemetaan = d[TAB_KRK.GURUKELAS].baris.map(r => ({ kelas: String(r.Kelas), email: String(r.Email).trim().toLowerCase() }))
    .filter(m => m.kelas && m.email);
  const kelasAktif = new Set((senarai[KAT.KELAS] || []).filter(x => x.aktif).map(x => x.nilai));
  const emelAktif = new Set(guru.map(x => x.email));
  const yatim = pemetaan.filter(m => !kelasAktif.has(m.kelas) || !emelAktif.has(m.email))
    .map(m => ({ ...m, sebab: !kelasAktif.has(m.kelas) ? 'Kelas tiada atau tidak aktif dalam senarai' : 'Guru tiada atau tidak aktif' }));
  const tetapan = Object.fromEntries(Object.entries(t).filter(([k]) => k.startsWith('KRK_') && !k.startsWith('KRK_SIAP_')));
  const panduan = [
    { kod: 'guru', tajuk: 'Tambah guru', siap: guru.filter(x => x.email !== sek.adminEmail).length > 0, nota: 'Dalam modul OPR, tab Guru (dikongsi dengan e-Karakter).' },
    { kod: 'kelas', tajuk: 'Senarai kelas', siap: !!t[SIAP[KAT.KELAS]], nota: 'Ganti kelas contoh dengan kelas sekolah anda.' },
    { kod: 'subjek', tajuk: 'Senarai mata pelajaran', siap: !!t[SIAP[KAT.SUBJEK]], nota: 'Semak dan simpan senarai mata pelajaran.' },
    { kod: 'gurukelas', tajuk: 'Guru kelas', siap: pemetaan.length > 0, pilihan: true, nota: 'Pilihan. Guru kelas boleh melihat laporan kelasnya.' },
    { kod: 'teras', tajuk: 'Elemen teras', siap: true, nota: 'Empat teras lalai sudah tersedia. Tambah atau ubah jika perlu.' },
    { kod: 'tetapan', tajuk: 'Tetapan dokumen', siap: !!t[SIAP.TETAPAN], nota: 'Kod sekolah, nama dan jawatan pengesah.' }
  ];
  return json({ ok: true,
    senarai: {
      kelas: senarai[KAT.KELAS] || [], subjek: senarai[KAT.SUBJEK] || [],
      teras: (senarai[KAT.TERAS] || []).map(x => ({ ...x, huraian: hur[x.nilai] || '' }))
    },
    tetapan, pemetaan, yatim, guru, panduan, struktur: statusStruktur(sek),
    lainLain: { kelas: lainLain(KAT.KELAS, 'Kelas'), subjek: lainLain(KAT.SUBJEK, 'Subjek') } });
}

async function tulisTetapanKrk(g, sek, ubah) {
  const { baris } = await bacaJadualKrk(g, sek, TAB_KRK.TETAPAN);
  const b = baris.map(r => [String(r.Kunci), String(r.Nilai ?? '')]);
  for (const [k, v] of Object.entries(ubah)) {
    const ada = b.find(r => r[0] === k);
    if (ada) ada[1] = v; else b.push([k, v]);
  }
  await kemaskiniJulat(g, sek.karakter.sheetId, TAB_KRK.TETAPAN, 'A2:B' + (b.length + 1), b);
}
async function bacaJadualKrk(g, sek, tab) { return (await bacaBanyak(g, sek.karakter.sheetId, [tab]))[tab]; }

// Ganti keseluruhan satu kategori (susunan = susunan dihantar). Item tidak aktif
// dikekalkan supaya laporan lama masih memaparkan nama asal.
async function simpanSenaraiKarakter(ctx) {
  const { g, sek, badan, now } = ctx;
  const kat = String(badan.kategori || '').trim().toUpperCase();
  const had = HAD_KAT[kat];
  if (!had) return ralat('Kategori tidak sah.');
  const masuk = Array.isArray(badan.item) ? badan.item : [];
  const dilihat = new Set(), item = [];
  let pendua = 0;
  for (const x of masuk) {
    const nilai = bersih(typeof x === 'object' && x ? x.nilai : x, had.panjang);
    if (!nilai) continue;
    const k = nilai.toLowerCase();
    if (dilihat.has(k)) { pendua++; continue; }
    dilihat.add(k);
    item.push({ nilai, aktif: !(typeof x === 'object' && x && x.aktif === false) });
  }
  if (!item.length) return ralat('Senarai ' + had.nama + ' mesti ada sekurang-kurangnya satu item.');
  if (item.length > had.maks) return ralat('Maksimum ' + had.maks + ' ' + had.nama + '.');
  if (!item.some(x => x.aktif)) return ralat('Sekurang-kurangnya satu ' + had.nama + ' mesti aktif.');

  const { baris } = await bacaJadualKrk(g, sek, TAB_KRK.SENARAI);
  const lain = baris.filter(r => String(r.Kategori).trim().toUpperCase() !== kat)
    .map(r => [String(r.Kategori), String(r.Nilai), String(r.Susunan), String(r.Aktif || 'YA')]);
  const semua = [...lain, ...item.map((x, i) => [kat, x.nilai, String(i + 1), x.aktif ? 'YA' : 'TIDAK'])];
  await kosongkanJulat(g, sek.karakter.sheetId, TAB_KRK.SENARAI, 'A2:D');
  await kemaskiniJulat(g, sek.karakter.sheetId, TAB_KRK.SENARAI, 'A2:D' + (semua.length + 1), semua);

  const ubah = { [SIAP[kat]]: new Date(now()).toISOString() };
  if (kat === KAT.TERAS && badan.huraian && typeof badan.huraian === 'object') {
    const hur = {};
    item.forEach(x => { const h = bersih(badan.huraian[x.nilai], 200); if (h) hur[x.nilai] = h; });
    ubah.KRK_TERAS_HURAIAN = JSON.stringify(hur);
  }
  await tulisTetapanKrk(g, sek, ubah);
  await auditKarakter(ctx, 'KARAKTER_SENARAI', kat, 'BERJAYA', item.length + ' item, ' + item.filter(x => !x.aktif).length + ' tidak aktif');
  return json({ ok: true, kategori: kat, bilangan: item.length, pendua });
}

// Ganti keseluruhan pemetaan guru kelas. Satu guru boleh banyak kelas; satu kelas boleh banyak guru.
async function simpanGuruKelas(ctx) {
  const { g, sek, sesi, kenal, badan, now } = ctx;
  const masuk = Array.isArray(badan.pemetaan) ? badan.pemetaan : null;
  if (!masuk) return ralat('Data pemetaan tidak sah.');
  if (masuk.length > 1000) return ralat('Terlalu banyak pemetaan.');
  const d = await bacaKarakter(g, sek, [TAB_KRK.SENARAI, TAB_KRK.GURUKELAS]);
  const kelasAktif = new Set((kumpulSenarai(d[TAB_KRK.SENARAI].baris)[KAT.KELAS] || []).filter(x => x.aktif).map(x => x.nilai));
  const guru = new Map(guruAktif(kenal, sek).map(x => [x.email, x]));
  const lama = new Map(d[TAB_KRK.GURUKELAS].baris.map(r => [String(r.Kelas) + '|' + String(r.Email).trim().toLowerCase(), r]));
  const salah = [], dilihat = new Set(), baris = [];
  const masa = new Date(now()).toISOString();
  for (const m of masuk) {
    const kelas = bersih(m && m.kelas, 60), email = bersih(m && m.email, 200).toLowerCase();
    if (!kelasAktif.has(kelas)) { salah.push((kelas || '(kosong)') + ': kelas tiada atau tidak aktif'); continue; }
    if (!guru.has(email)) { salah.push((email || '(kosong)') + ': bukan guru aktif sekolah ini'); continue; }
    const k = kelas + '|' + email;
    if (dilihat.has(k)) continue;
    dilihat.add(k);
    const r = lama.get(k);
    baris.push([kelas, email, r ? String(r.Ditambah) : masa, r ? String(r.DitambahOleh) : sesi.email]);
  }
  if (salah.length) return ralat('Pemetaan tidak disimpan: ' + salah.slice(0, 5).join('; ') + (salah.length > 5 ? ' (dan ' + (salah.length - 5) + ' lagi)' : ''), 400, { salah });
  await kosongkanJulat(g, sek.karakter.sheetId, TAB_KRK.GURUKELAS, 'A2:D');
  if (baris.length) await kemaskiniJulat(g, sek.karakter.sheetId, TAB_KRK.GURUKELAS, 'A2:D' + (baris.length + 1), baris);
  await auditKarakter(ctx, 'KARAKTER_GURUKELAS', '', 'BERJAYA', baris.length + ' pemetaan');
  return json({ ok: true, bilangan: baris.length });
}

const TETAPAN_KRK = {
  KRK_KOD_SEKOLAH: { panjang: 20 },
  KRK_TAJUK_DOKUMEN: { panjang: 150, wajib: true },
  KRK_NAMA_PENGESAH: { panjang: 120 },
  KRK_JAWATAN_PENGESAH: { panjang: 120 },
  KRK_WAJIB_TTD: { pilihan: ['YA', 'TIDAK'] },
  KRK_HAD_MUNDUR_HARI: { nombor: [0, 366] },
  KRK_AKTIF: { pilihan: ['YA', 'TIDAK'] }
};

async function simpanTetapanKarakter(ctx) {
  const { g, sek, badan, now } = ctx;
  const masuk = (badan && typeof badan.tetapan === 'object' && badan.tetapan) || {};
  const ubah = {}, ditolak = [];
  for (const [k, v] of Object.entries(masuk)) {
    const p = TETAPAN_KRK[k];
    if (!p) { ditolak.push(k); continue; }
    if (p.pilihan) {
      const x = String(v).trim().toUpperCase();
      if (!p.pilihan.includes(x)) return ralat(k + ' mesti ' + p.pilihan.join(' atau ') + '.');
      ubah[k] = x;
    } else if (p.nombor) {
      const n = Number(v);
      if (!Number.isInteger(n) || n < p.nombor[0] || n > p.nombor[1]) return ralat('Had mundur tarikh mesti nombor bulat ' + p.nombor[0] + ' hingga ' + p.nombor[1] + ' hari.');
      ubah[k] = String(n);
    } else {
      const x = bersih(v, p.panjang);
      if (p.wajib && !x) return ralat('Tajuk dokumen tidak boleh kosong.');
      ubah[k] = x;
    }
  }
  if (!Object.keys(ubah).length) return ralat('Tiada tetapan untuk disimpan.');
  ubah[SIAP.TETAPAN] = new Date(now()).toISOString();
  await tulisTetapanKrk(g, sek, ubah);
  await auditKarakter(ctx, 'KARAKTER_TETAPAN', '', 'BERJAYA', Object.keys(ubah).filter(k => k !== SIAP.TETAPAN).join(', '));
  return json({ ok: true, disimpan: Object.keys(ubah).filter(k => k !== SIAP.TETAPAN), ditolak });
}

// ======================================================================
// Fasa 2: borang dan rekod (F-05, F-06, F-09 asas)
// ======================================================================

const MAKS_GAMBAR = 4;
const HAD_GAMBAR = 10 * 1024 * 1024;
const HAD = { kelas: 60, subjek: 60, tajuk: 150, catatan: 3000, kapsyen: 80, teras: 40 };
const RE_ID = /^KRK-\d{8}-[A-Z0-9]{5}$/;

const hadMundur = (t) => { const n = Number(t.KRK_HAD_MUNDUR_HARI); return Number.isInteger(n) && n >= 0 ? n : 30; };
const namaGuru = (kenal, sesi) => String((kenal && kenal.baris && kenal.baris.Nama) || sesi.nama || sesi.email).trim().slice(0, 120);
const bersihTeks = (v) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
const failNama = (n, lalai) => String(n || '').replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 150) || lalai;

async function hex256(teks) {
  const b = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(teks)));
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}
export async function hashKandungan(r) {
  const teras = String(r.Teras || '').split(',').map(x => x.trim()).filter(Boolean).sort().join(', ');
  return hex256(JSON.stringify([String(r.PemilikEmail), String(r.TarikhISO), String(r.Masa), String(r.Kelas), String(r.Subjek),
    teras, String(r.Tajuk), String(r.Catatan), String(r.GambarIds), String(r.TtdFileId)]));
}

function idBaharu(tarikhHariIni, ada) {
  const abjad = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    const b = crypto.getRandomValues(new Uint8Array(5));
    const id = 'KRK-' + tarikhHariIni.replace(/-/g, '') + '-' + [...b].map(x => abjad[x % abjad.length]).join('');
    if (!ada.has(id)) return id;
  }
}

// Semak bait sebenar, bukan hanya content-type.
function jenisGambar(b) {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'image/webp';
  return '';
}

async function terimaFailKarakter(ctx) {
  const { env, g, sek, sesi, url, bait, req } = ctx;
  const jenisMinta = url.searchParams.get('jenis') || 'lampiran';
  if (jenisMinta === 'ttd') return await terimaTtd(ctx);
  if (jenisMinta !== 'lampiran') return ralat('Jenis fail tidak sah.');
  const mime = String(req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!bait || !bait.length) return ralat('Fail kosong.');
  if (bait.length > HAD_GAMBAR) return ralat('Gambar melebihi had 10MB.', 413);
  const sebenar = jenisGambar(bait);
  if (!sebenar || sebenar !== mime) return ralat('Hanya gambar JPG, PNG atau WEBP dibenarkan.');
  const id = await muatNaik(g, sek.karakter.subfolder.LAMPIRAN, failNama(url.searchParams.get('nama'), 'gambar.jpg'), mime, bait);
  await env.OPR_KV.put('upload:' + sek.slug + ':' + id, JSON.stringify({ email: sesi.email, jenis: 'krk-lampiran' }), { expirationTtl: 86400 });
  return json({ ok: true, fileId: id });
}

const pecahId = (v) => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
function kapsyenDari(r) { try { const a = JSON.parse(r.Kapsyen || '[]'); return Array.isArray(a) ? a.map(String) : []; } catch (e) { return []; } }

const MAKS_SEMUA = 1000;

// Penapis tunggal: julat tarikh, kelas, subjek, teras, guru (emel), carian. Susun terbaru dahulu.
export function tapisRekod(baris, q, { abaiKelas = false, guru = false } = {}) {
  const cari = String(q.get('cari') || '').trim().toLowerCase().slice(0, 100);
  const dari = q.get('dari') || '', hingga = q.get('hingga') || '';
  const kelas = abaiKelas ? '' : q.get('kelas'), subjek = q.get('subjek'), teras = q.get('teras');
  const emel = guru ? String(q.get('guru') || '').toLowerCase() : '';
  return baris
    .filter(r => !kelas || String(r.Kelas) === kelas)
    .filter(r => !subjek || String(r.Subjek) === subjek)
    .filter(r => !teras || pecahId(r.Teras).includes(teras))
    .filter(r => !emel || String(r.PemilikEmail).toLowerCase() === emel)
    .filter(r => !dari || String(r.TarikhISO) >= dari)
    .filter(r => !hingga || String(r.TarikhISO) <= hingga)
    .filter(r => !cari || [r.Tajuk, r.Catatan, r.Kelas, r.Subjek, r.NamaGuru, r.ID].join(' ').toLowerCase().includes(cari))
    .sort((a, b) => String(b.TarikhISO).localeCompare(String(a.TarikhISO)) || String(b.Timestamp).localeCompare(String(a.Timestamp)));
}

function ringkasRekod(r) {
  return { id: String(r.ID), tarikh: String(r.TarikhISO), masa: String(r.Masa), kelas: String(r.Kelas), subjek: String(r.Subjek),
    teras: pecahId(r.Teras), tajuk: String(r.Tajuk), nama: String(r.NamaGuru), email: String(r.PemilikEmail),
    catatanRingkas: String(r.Catatan || '').replace(/\s+/g, ' ').slice(0, 160),
    bilGambar: Number(r.BilGambar) || 0, adaTtd: !!r.TtdFileId, adaPdf: !!r.PdfFileId,
    pdf: statusPdf(r), dikemaskini: String(r.DikemaskiniPada || r.Timestamp) };
}

// Pengesahan penuh di server (BSD 8, TRD 5). Pulangkan { ralat } atau { data }.
function sahkanInput(m, { teras, admin, hariIniMyt, had }) {
  const salah = (t) => ({ ralat: t });
  const tarikh = String(m.tarikh || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tarikh) || Number.isNaN(Date.parse(tarikh + 'T00:00:00Z')) || new Date(tarikh + 'T00:00:00Z').toISOString().slice(0, 10) !== tarikh) return salah('Tarikh tidak sah.');
  if (tarikh > hariIniMyt) return salah('Tarikh tidak boleh melebihi hari ini.');
  if (!admin && tarikh < tambahHari(hariIniMyt, -had)) return salah('Tarikh tidak boleh lebih awal daripada ' + had + ' hari lalu.');
  const masa = String(m.masa || '');
  if (masa && !/^([01]\d|2[0-3]):[0-5]\d$/.test(masa)) return salah('Masa tidak sah (gunakan format 24 jam, contoh 08:30).');
  const out = { TarikhISO: tarikh, Masa: masa };
  for (const [k, kol, label] of [['kelas', 'Kelas', 'Kelas'], ['subjek', 'Subjek', 'Mata pelajaran'], ['tajuk', 'Tajuk', 'Tajuk aktiviti']]) {
    const v = bersihTeks(m[k]).replace(/\s+/g, ' ');
    if (!v) return salah(label + ' wajib diisi.');
    if (v.length > HAD[k]) return salah(label + ' melebihi ' + HAD[k] + ' aksara.');
    out[kol] = v;
  }
  const catatan = bersihTeks(m.catatan);
  if (!catatan) return salah('Huraian aktiviti dan impak wajib diisi.');
  if (catatan.length > HAD.catatan) return salah('Huraian melebihi ' + HAD.catatan + ' aksara.');
  out.Catatan = catatan;
  const dipilih = [...new Set((Array.isArray(m.teras) ? m.teras : []).map(x => bersihTeks(x)))].filter(Boolean);
  if (!dipilih.length) return salah('Pilih sekurang-kurangnya satu elemen teras.');
  const tidakSah = dipilih.filter(x => !teras.includes(x));
  if (tidakSah.length) return salah('Elemen teras tidak sah: ' + tidakSah.join(', ').slice(0, 100) + '.');
  out.Teras = teras.filter(x => dipilih.includes(x)).join(', ');     // susunan ikut senarai rasmi
  return { data: out };
}

async function simpanRekod(ctx) {
  const { env, g, sek, sesi, kenal, admin, badan, now } = ctx;
  const d = await bacaKarakter(g, sek, [TAB_KRK.SENARAI, TAB_KRK.TETAPAN, TAB_KRK.REKOD, TAB_KRK.TTD]);
  const t = kumpulTetapan(d[TAB_KRK.TETAPAN].baris);
  if (!admin && t.KRK_AKTIF === 'TIDAK') return tolakKarakter(ctx, 'POST /karakter/rekod', 'Modul tidak aktif', 'Modul e-Karakter belum diaktifkan oleh admin sekolah.');
  const teras = (kumpulSenarai(d[TAB_KRK.SENARAI].baris)[KAT.TERAS] || []).filter(x => x.aktif).map(x => x.nilai);
  const hariMyt = hariIni(now());
  const v = sahkanInput((badan && badan.data) || {}, { teras, admin, hariIniMyt: hariMyt, had: hadMundur(t) });
  if (v.ralat) return ralat(v.ralat);

  const jadual = d[TAB_KRK.REKOD];
  let lama = null;
  if (badan.id !== undefined && badan.id !== null && badan.id !== '') {
    const id = String(badan.id);
    lama = RE_ID.test(id) ? jadual.baris.find(r => String(r.ID) === id) : null;
    if (!lama || ya(lama.Dipadam)) return ralat('Laporan tidak dijumpai.', 404);
    // Hanya pemilik boleh mengedit (admin tidak mengedit laporan guru lain)
    if (String(lama.PemilikEmail).toLowerCase() !== sesi.email) return tolakKarakter(ctx, 'POST /karakter/rekod ' + id, 'Bukan pemilik', 'Anda hanya boleh mengedit laporan sendiri.');
  }

  // Gambar: maksimum 4; fail baharu mesti dimuat naik oleh pengguna ini
  const gambar = Array.isArray(badan.gambar) ? badan.gambar : [];
  if (gambar.length > MAKS_GAMBAR) return ralat('Maksimum ' + MAKS_GAMBAR + ' gambar setiap laporan.');
  const lamaIds = lama ? pecahId(lama.GambarIds) : [];
  const ids = [], kapsyen = [], baharu = [];
  for (const x of gambar) {
    const fid = String((x && x.fileId) || '');
    if (!/^[A-Za-z0-9_-]{10,128}$/.test(fid) || ids.includes(fid)) return ralat('Rujukan gambar tidak sah.');
    if (!lamaIds.includes(fid)) {
      const rek = await env.OPR_KV.get('upload:' + sek.slug + ':' + fid, 'json');
      if (!rek || rek.email !== sesi.email || rek.jenis !== 'krk-lampiran') return ralat('Gambar tidak sah atau sudah luput. Sila muat naik semula.');
      baharu.push(fid);
    }
    const k = bersihTeks(x.kapsyen).replace(/\s+/g, ' ');
    if (k.length > HAD.kapsyen) return ralat('Kapsyen gambar melebihi ' + HAD.kapsyen + ' aksara.');
    ids.push(fid); kapsyen.push(k);
  }
  if (ids.length && badan.akuanGambar !== true) return ralat('Sila tanda akuan kebenaran ibu bapa atau penjaga bagi gambar murid.');

  // Tandatangan (F-07): hanya milik pengguna yang log masuk. Sama ada tandatangan
  // tersimpan pengguna ini, atau fail tandatangan yang baru dimuat naik olehnya.
  const ttd = String(badan.ttdFileId || '');
  let ttdBaharu = false;
  if (ttd) {
    if (!/^[A-Za-z0-9_-]{10,128}$/.test(ttd)) return ralat('Rujukan tandatangan tidak sah.');
    const tersimpan = d[TAB_KRK.TTD].baris.find(r => String(r.Email).trim().toLowerCase() === sesi.email);
    if (!tersimpan || String(tersimpan.FileId) !== ttd) {
      const rek = await env.OPR_KV.get('upload:' + sek.slug + ':' + ttd, 'json');
      if (!rek || rek.email !== sesi.email || rek.jenis !== 'krk-ttd') return ralat('Tandatangan tidak sah atau sudah luput. Sila tandatangan semula.');
      ttdBaharu = true;
    }
  } else if (String(t.KRK_WAJIB_TTD).toUpperCase() === 'YA') {
    return ralat('Sekolah anda mewajibkan tandatangan guru sebelum laporan dihantar.');
  }

  // Tahun sesi daripada Tetapan OPR (satu sumber identiti sekolah)
  let tahunSesi = v.data.TarikhISO.slice(0, 4);
  try {
    const opr = await bacaObjek(g, sek.sheetId, TAB.TETAPAN);
    const ts = opr.find(r => String(r.Kunci).trim() === 'TAHUN_SESI');
    if (ts && /^\d{4}$/.test(String(ts.Nilai).trim())) tahunSesi = String(ts.Nilai).trim();
  } catch (e) { console.error('Baca TAHUN_SESI gagal', e && e.message); }

  const masa = new Date(now()).toISOString();
  const rekod = lama ? { ...lama } : {
    ID: idBaharu(hariMyt, new Set(jadual.baris.map(r => String(r.ID)))), Timestamp: masa,
    PemilikEmail: sesi.email, PdfFileId: '', PdfPada: '', Dipadam: '', DipadamPada: ''
  };
  Object.assign(rekod, v.data, {
    DikemaskiniPada: masa, NamaGuru: namaGuru(kenal, sesi), BilGambar: String(ids.length), GambarIds: ids.join(','),
    Kapsyen: JSON.stringify(kapsyen), AkuanGambar: ids.length ? 'YA' : '', TahunSesi: tahunSesi,
    // Edit memadam tandatangan lama; guru perlu tandatangan semula dalam penghantaran yang sama
    TtdFileId: ttd, TtdPada: ttd ? masa : '',
    PdfPada: ''                   // PDF sedia ada kini lapuk sehingga dijana semula (fail sama akan ditimpa)
  });
  rekod.KandunganHash = await hashKandungan(rekod);

  const tajuk = jadual.tajuk.length ? jadual.tajuk : KOLUM_KRK[TAB_KRK.REKOD];
  const baris = tajuk.map(h => { const x = rekod[h]; return x === undefined || x === null ? '' : String(x); });
  if (lama) await kemaskiniJulat(g, sek.karakter.sheetId, TAB_KRK.REKOD, 'A' + lama._baris + ':' + hurufLajur(tajuk.length) + lama._baris, [baris]);
  else await tambahBaris(g, sek.karakter.sheetId, TAB_KRK.REKOD, [baris]);

  for (const fid of baharu) await env.OPR_KV.delete('upload:' + sek.slug + ':' + fid);
  if (ttdBaharu) await env.OPR_KV.delete('upload:' + sek.slug + ':' + ttd);
  if (ttd) await auditKarakter(ctx, 'KARAKTER_TANDATANGAN', rekod.ID, 'BERJAYA', '');
  for (const fid of lamaIds.filter(x => !ids.includes(x))) {
    try { await buangKeTong(g, fid); } catch (e) { console.error('Buang gambar lama gagal', fid, e && e.message); }
  }
  await auditKarakter(ctx, 'KARAKTER_SIMPAN', rekod.ID, 'BERJAYA', (lama ? 'Kemas kini' : 'Baharu') + ', ' + ids.length + ' gambar');
  return json({ ok: true, id: rekod.ID, baharu: !lama, rekod: { ...ringkasRekod(rekod), hash: rekod.KandunganHash.slice(0, 8),
    timestamp: rekod.Timestamp, ttdPada: rekod.TtdPada, ttdFileId: rekod.TtdFileId } });
}

// Senarai berhalaman. skop=saya (lalai, semua peranan) atau skop=semua (admin sahaja).
async function senaraiRekod(ctx, laluan) {
  const { g, sek, sesi, admin, url } = ctx;
  const q = url.searchParams;
  const skop = q.get('skop') || 'saya';
  if (skop === 'semua' && !admin) return tolakKarakter(ctx, laluan + '?skop=semua', 'Bukan admin');
  if (!['saya', 'semua', 'kelas'].includes(skop)) return ralat('Skop tidak sah.');
  const d = await bacaKarakter(g, sek, skop === 'kelas' ? [TAB_KRK.REKOD, TAB_KRK.GURUKELAS] : [TAB_KRK.REKOD]);
  const { baris } = d[TAB_KRK.REKOD];
  // Guru kelas: hanya kelas yang dipetakan kepadanya, dikuatkuasakan di server (F-10)
  let kelasDibenar = null;
  if (skop === 'kelas') {
    const dipeta = kelasDipeta(d[TAB_KRK.GURUKELAS], sesi.email);
    if (!dipeta.length) return tolakKarakter(ctx, laluan + '?skop=kelas', 'Bukan guru kelas', 'Anda bukan guru kelas bagi mana-mana kelas.');
    const minta = q.get('kelas');
    if (minta && !dipeta.includes(minta)) return tolakKarakter(ctx, laluan + '?skop=kelas&kelas=' + minta.slice(0, 60), 'Kelas tidak dipetakan', 'Anda bukan guru kelas bagi kelas ini.');
    kelasDibenar = minta ? [minta] : dipeta;
  }
  let data = tapisRekod(baris.filter(r => r.ID && !ya(r.Dipadam))
    .filter(r => skop === 'semua' || (skop === 'kelas' ? kelasDibenar.includes(String(r.Kelas)) : String(r.PemilikEmail).toLowerCase() === sesi.email)),
    q, { abaiKelas: skop === 'kelas', guru: skop === 'semua' });
  // Admin: saiz=semua untuk PDF dashboard (dihadkan)
  const semuaBaris = skop === 'semua' && q.get('saiz') === 'semua';
  const saiz = semuaBaris ? MAKS_SEMUA : 20, jumlah = data.length;
  const halaman = Math.min(Math.max(1, parseInt(q.get('halaman'), 10) || 1), Math.max(1, Math.ceil(jumlah / saiz)));
  data = data.slice((halaman - 1) * saiz, halaman * saiz).map(ringkasRekod);
  return json({ ok: true, skop, jumlah, halaman, saiz, data, ...(kelasDibenar ? { kelasDipeta: kelasDipeta(d[TAB_KRK.GURUKELAS], sesi.email) } : {}) });
}

// Akses baca: admin, atau pemilik. (Guru kelas bagi kelasnya: Fasa 4.)
// Akses baca: admin, pemilik, atau guru kelas bagi kelas laporan itu (baca sahaja).
async function cariRekodBolehBaca(ctx, id, laluan) {
  const { g, sek, sesi, admin } = ctx;
  const d = await bacaKarakter(g, sek, [TAB_KRK.REKOD, TAB_KRK.GURUKELAS]);
  const { baris, tajuk } = d[TAB_KRK.REKOD];
  const r = baris.find(x => String(x.ID) === id);
  if (!r || ya(r.Dipadam)) return { respons: ralat('Laporan tidak dijumpai.', 404) };
  const pemilik = String(r.PemilikEmail).toLowerCase() === sesi.email;
  const guruKelas = !pemilik && kelasDipeta(d[TAB_KRK.GURUKELAS], sesi.email).includes(String(r.Kelas));
  if (!admin && !pemilik && !guruKelas) return { respons: await tolakKarakter(ctx, laluan, 'Bukan pemilik atau guru kelas', 'Anda tiada kebenaran untuk laporan ini.') };
  return { r, tajuk, pemilik, guruKelas };
}

function kelasDipeta(jadualGuruKelas, email) {
  return [...new Set(jadualGuruKelas.baris.filter(x => String(x.Email).trim().toLowerCase() === email).map(x => String(x.Kelas)).filter(Boolean))];
}

// Ringkasan kelas untuk guru kelas (F-10): bilangan laporan, teras terbanyak, guru yang melapor.
async function statistikKelas(ctx, laluan) {
  const { g, sek, sesi, url } = ctx;
  const d = await bacaKarakter(g, sek, [TAB_KRK.REKOD, TAB_KRK.GURUKELAS]);
  const dipeta = kelasDipeta(d[TAB_KRK.GURUKELAS], sesi.email);
  if (!dipeta.length) return tolakKarakter(ctx, laluan + '?skop=kelas', 'Bukan guru kelas', 'Anda bukan guru kelas bagi mana-mana kelas.');
  const minta = url.searchParams.get('kelas');
  if (minta && !dipeta.includes(minta)) return tolakKarakter(ctx, laluan + '?skop=kelas&kelas=' + minta.slice(0, 60), 'Kelas tidak dipetakan', 'Anda bukan guru kelas bagi kelas ini.');
  const kelas = minta ? [minta] : dipeta;
  const kira = (peta, k) => peta.set(k, (peta.get(k) || 0) + 1);
  const susun = (peta) => [...peta].map(([nama, bil]) => ({ nama, bil })).sort((a, b) => b.bil - a.bil || a.nama.localeCompare(b.nama));
  const hasil = kelas.map(k => {
    const rekod = d[TAB_KRK.REKOD].baris.filter(r => r.ID && !ya(r.Dipadam) && String(r.Kelas) === k);
    const guru = new Map(), teras = new Map();
    rekod.forEach(r => { kira(guru, String(r.NamaGuru || r.PemilikEmail)); pecahId(r.Teras).forEach(t => kira(teras, t)); });
    const terakhir = rekod.map(r => String(r.TarikhISO)).sort().pop() || '';
    return { kelas: k, bil: rekod.length, guru: susun(guru), teras: susun(teras), terakhir };
  });
  return json({ ok: true, kelasDipeta: dipeta, kelas: hasil });
}

async function bacaSatuRekod(ctx, id, laluan) {
  const x = await cariRekodBolehBaca(ctx, id, laluan);
  if (x.respons) return x.respons;
  const { r, pemilik, guruKelas } = x;
  const kap = kapsyenDari(r);
  return json({ ok: true, rekod: { ...ringkasRekod(r), catatan: String(r.Catatan), timestamp: String(r.Timestamp),
    gambar: pecahId(r.GambarIds).map((fileId, i) => ({ fileId, kapsyen: kap[i] || '' })),
    akuanGambar: ya(r.AkuanGambar), hash: String(r.KandunganHash).slice(0, 8), tahunSesi: String(r.TahunSesi),
    ttdFileId: String(r.TtdFileId || ''), ttdPada: String(r.TtdPada || ''), pdfPada: String(r.PdfPada || '') },
    boleh: { edit: pemilik, padam: pemilik || ctx.admin, janaPdf: pemilik || ctx.admin }, bacaSahaja: !pemilik && !ctx.admin && !!guruKelas });
}

// Soft delete: baris kekal dalam Sheet dengan Dipadam = YA. Fail tidak dibuang.
async function padamRekod(ctx, id, laluan) {
  const { g, sek, sesi, admin, now } = ctx;
  const { baris, tajuk } = await bacaJadualKrk(g, sek, TAB_KRK.REKOD);
  const r = baris.find(x => String(x.ID) === id);
  if (!r || ya(r.Dipadam)) return ralat('Laporan tidak dijumpai.', 404);
  if (!admin && String(r.PemilikEmail).toLowerCase() !== sesi.email) return tolakKarakter(ctx, laluan, 'Bukan pemilik rekod', 'Anda hanya boleh memadam laporan sendiri.');
  const rekod = { ...r, Dipadam: 'YA', DipadamPada: new Date(now()).toISOString() };
  const b = tajuk.map(h => { const x = rekod[h]; return x === undefined || x === null ? '' : String(x); });
  await kemaskiniJulat(g, sek.karakter.sheetId, TAB_KRK.REKOD, 'A' + r._baris + ':' + hurufLajur(tajuk.length) + r._baris, [b]);
  await auditKarakter(ctx, 'KARAKTER_PADAM', id, 'BERJAYA', String(r.PemilikEmail) === sesi.email ? '' : 'Dipadam oleh admin');
  return json({ ok: true });
}

// Hidang gambar melalui Worker selepas semak akses. Fail mesti milik rekod itu.
async function hantarFailKarakter(ctx, fileId, laluan) {
  const id = String(ctx.url.searchParams.get('rekod') || '');
  if (!RE_ID.test(id)) return ralat('Rujukan laporan tidak sah.');
  const x = await cariRekodBolehBaca(ctx, id, laluan);
  if (x.respons) return x.respons;
  if (![...pecahId(x.r.GambarIds), String(x.r.TtdFileId || '')].includes(fileId)) return ralat('Fail tidak berkaitan dengan laporan ini.', 404);
  const res = await muatTurun(ctx.g, fileId);
  return new Response(res.body, { headers: {
    'content-type': res.headers.get('content-type') || 'application/octet-stream',
    'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff'
  } });
}

// ======================================================================
// Fasa 3: tandatangan (F-07) dan PDF dalam Drive (F-08)
// ======================================================================

const HAD_TTD = 150 * 1000;
const HAD_PDF = 2 * 1024 * 1024;

export function statusPdf(r) {
  if (!r.PdfFileId) return 'tiada';
  // Edit mengosongkan PdfPada (lihat simpanRekod), jadi tidak bergantung pada jam
  return r.PdfPada && String(r.PdfPada) >= String(r.DikemaskiniPada || '') ? 'siap' : 'lapuk';
}

// PNG sahaja: semak bait tandatangan, saiz dan dimensi (IHDR).
function semakPng(b) {
  const tandatangan = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 24 || !tandatangan.every((x, i) => b[i] === x) || String.fromCharCode(...b.slice(12, 16)) !== 'IHDR') return { ralat: 'Tandatangan mesti fail PNG.' };
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const w = dv.getUint32(16), h = dv.getUint32(20);
  if (!w || !h || w > 800 || h > 300) return { ralat: 'Saiz tandatangan maksimum 800 x 300 piksel.' };
  return { w, h };
}

async function terimaTtd({ env, g, sek, sesi, bait, req }) {
  const mime = String(req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (mime !== 'image/png') return ralat('Tandatangan mesti fail PNG.');
  if (!bait || !bait.length) return ralat('Fail kosong.');
  if (bait.length > HAD_TTD) return ralat('Fail tandatangan melebihi 150KB.', 413);
  const p = semakPng(bait);
  if (p.ralat) return ralat(p.ralat);
  const nama = 'ttd-' + sesi.email.replace(/[^a-z0-9]/g, '_').slice(0, 40) + '-' + Date.now() + '.png';
  const id = await muatNaik(g, sek.karakter.subfolder.TTD, nama, 'image/png', bait);
  await env.OPR_KV.put('upload:' + sek.slug + ':' + id, JSON.stringify({ email: sesi.email, jenis: 'krk-ttd' }), { expirationTtl: 86400 });
  return json({ ok: true, fileId: id });
}

async function bacaTtd({ g, sek, sesi }) {
  const { baris } = await bacaJadualKrk(g, sek, TAB_KRK.TTD);
  const r = baris.find(x => String(x.Email).trim().toLowerCase() === sesi.email && x.FileId);
  return json({ ok: true, ada: !!r, fileId: r ? String(r.FileId) : '', dikemaskini: r ? String(r.DikemaskiniPada) : '' });
}

// Tulis semula tab KarakterTtd (satu baris setiap guru); buang fail lama jika tiada rekod merujuknya.
async function tulisTtd(ctx, fileIdBaharu) {
  const { g, sek, sesi, now } = ctx;
  const d = await bacaKarakter(g, sek, [TAB_KRK.TTD, TAB_KRK.REKOD]);
  const baris = d[TAB_KRK.TTD].baris.map(r => [String(r.Email).trim().toLowerCase(), String(r.FileId), String(r.DikemaskiniPada)]);
  const i = baris.findIndex(r => r[0] === sesi.email);
  const lama = i >= 0 ? baris[i][1] : '';
  if (i >= 0) baris.splice(i, 1);
  if (fileIdBaharu) baris.push([sesi.email, fileIdBaharu, new Date(now()).toISOString()]);
  await kosongkanJulat(g, sek.karakter.sheetId, TAB_KRK.TTD, 'A2:C');
  if (baris.length) await kemaskiniJulat(g, sek.karakter.sheetId, TAB_KRK.TTD, 'A2:C' + (baris.length + 1), baris);
  // BSD 2.3: fail lama dikekalkan jika masih dirujuk oleh mana-mana laporan
  if (lama && lama !== fileIdBaharu && !d[TAB_KRK.REKOD].baris.some(r => String(r.TtdFileId) === lama)) {
    try { await buangKeTong(g, lama); } catch (e) { console.error('Buang tandatangan lama gagal', e && e.message); }
  }
}

async function simpanTtd(ctx) {
  const { env, sek, sesi, badan } = ctx;
  const fid = String((badan && badan.fileId) || '');
  if (!/^[A-Za-z0-9_-]{10,128}$/.test(fid)) return ralat('Rujukan tandatangan tidak sah.');
  const rek = await env.OPR_KV.get('upload:' + sek.slug + ':' + fid, 'json');
  if (!rek || rek.email !== sesi.email || rek.jenis !== 'krk-ttd') return ralat('Tandatangan tidak sah atau sudah luput. Sila tandatangan semula.');
  await tulisTtd(ctx, fid);
  await auditKarakter(ctx, 'KARAKTER_TTD_SIMPAN', '', 'BERJAYA', '');
  return json({ ok: true, fileId: fid });
}

async function padamTtd(ctx) {
  await tulisTtd(ctx, '');
  await auditKarakter(ctx, 'KARAKTER_TTD_SIMPAN', '', 'BERJAYA', 'Tandatangan tersimpan dipadam');
  return json({ ok: true });
}

// Hanya tandatangan tersimpan milik sendiri.
async function gambarTtd(ctx) {
  const { g, sek, sesi } = ctx;
  const { baris } = await bacaJadualKrk(g, sek, TAB_KRK.TTD);
  const r = baris.find(x => String(x.Email).trim().toLowerCase() === sesi.email && x.FileId);
  if (!r) return ralat('Tiada tandatangan tersimpan.', 404);
  const res = await muatTurun(g, String(r.FileId));
  return new Response(res.body, { headers: { 'content-type': 'image/png', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
}

const namaPdf = (r) => ('Laporan_Karakter_' + String(r.Kelas) + '_' + String(r.TarikhISO) + '_' + String(r.ID))
  .replace(/[^A-Za-z0-9_-]+/g, '_').replace(/_+/g, '_').slice(0, 150) + '.pdf';

// PDF dijana oleh pelayar selepas Hantar, kemudian disimpan di sini. Fail sedia ada
// DITIMPA (fail sama), supaya Drive tidak penuh dengan versi lama.
// Pemilik atau admin (jana semula). Dibenarkan walaupun lesen tamat (keputusan 1).
async function simpanPdf(ctx, id, laluan) {
  const { g, sek, sesi, admin, bait, now } = ctx;
  if (!bait || !bait.length) return ralat('Fail PDF kosong.');
  if (bait.length > HAD_PDF) return ralat('PDF melebihi 2MB.', 413);
  if (String.fromCharCode(...bait.slice(0, 5)) !== '%PDF-') return ralat('Fail bukan PDF.');
  const { baris, tajuk } = await bacaJadualKrk(g, sek, TAB_KRK.REKOD);
  const r = baris.find(x => String(x.ID) === id);
  if (!r || ya(r.Dipadam)) return ralat('Laporan tidak dijumpai.', 404);
  if (!admin && String(r.PemilikEmail).toLowerCase() !== sesi.email) return tolakKarakter(ctx, laluan, 'Bukan pemilik rekod', 'Anda hanya boleh menjana PDF bagi laporan sendiri.');
  let fid = String(r.PdfFileId || '');
  if (fid) {
    try { await kemaskiniKandungan(g, fid, 'application/pdf', bait); }
    catch (e) { if (e instanceof RalatGoogle && e.status === 404) fid = ''; else throw e; }
  }
  if (!fid) fid = await muatNaik(g, sek.karakter.subfolder.PDF, namaPdf(r), 'application/pdf', bait);
  const rekod = { ...r, PdfFileId: fid, PdfPada: new Date(now()).toISOString() };
  const b = tajuk.map(h => { const x = rekod[h]; return x === undefined || x === null ? '' : String(x); });
  await kemaskiniJulat(g, sek.karakter.sheetId, TAB_KRK.REKOD, 'A' + r._baris + ':' + hurufLajur(tajuk.length) + r._baris, [b]);
  await auditKarakter(ctx, 'KARAKTER_PDF', id, 'BERJAYA', r.PdfFileId ? 'Ditimpa' : 'Baharu');
  return json({ ok: true, pdfFileId: fid, pdf: statusPdf(rekod) });
}

async function hantarPdf(ctx, id, laluan) {
  const x = await cariRekodBolehBaca(ctx, id, laluan);
  if (x.respons) return x.respons;
  if (!x.r.PdfFileId) return ralat('PDF belum dijana untuk laporan ini.', 404);
  const res = await muatTurun(ctx.g, String(x.r.PdfFileId));
  return new Response(res.body, { headers: {
    'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="' + namaPdf(x.r) + '"',
    'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
}

// ======================================================================
// Fasa 5: dashboard admin (F-11) dan eksport (F-12)
// ======================================================================

const kiraSusun = (peta) => [...peta].map(([nama, bil]) => ({ nama, bil })).sort((a, b) => b.bil - a.bil || a.nama.localeCompare(b.nama));

async function statistikAdmin(ctx) {
  const { g, sek, url } = ctx;
  const d = await bacaKarakter(g, sek, [TAB_KRK.REKOD, TAB_KRK.SENARAI]);
  const sah = d[TAB_KRK.REKOD].baris.filter(r => r.ID && !ya(r.Dipadam));
  const f = tapisRekod(sah, url.searchParams, { guru: true });
  const kira = (peta, k) => peta.set(k, (peta.get(k) || 0) + 1);
  const teras = new Map(), kelas = new Map(), subjek = new Map(), guru = new Map();
  for (const r of f) {
    pecahId(r.Teras).forEach(t => kira(teras, t));
    kira(kelas, String(r.Kelas)); kira(subjek, String(r.Subjek));
    const e = String(r.PemilikEmail).toLowerCase();
    if (!guru.has(e)) guru.set(e, { email: e, nama: String(r.NamaGuru || e), bil: 0 });
    guru.get(e).bil++;
  }
  // Teras ikut susunan senarai rasmi (warna konsisten), kemudian teras lama
  const rasmi = (kumpulSenarai(d[TAB_KRK.SENARAI].baris)[KAT.TERAS] || []).map(x => x.nilai);
  const terasSusun = [...rasmi.filter(t => teras.has(t)), ...[...teras.keys()].filter(t => !rasmi.includes(t))].map(nama => ({ nama, bil: teras.get(nama) }));
  const tertinggi = kiraSusun(teras)[0] || null;
  // Pilihan penapis daripada semua laporan (termasuk nilai "Lain-lain")
  const pilihan = {
    kelas: [...new Set(sah.map(r => String(r.Kelas)))].sort(), subjek: [...new Set(sah.map(r => String(r.Subjek)))].sort(),
    guru: [...new Map(sah.map(r => [String(r.PemilikEmail).toLowerCase(), String(r.NamaGuru || r.PemilikEmail)]))].map(([email, nama]) => ({ email, nama })).sort((a, b) => a.nama.localeCompare(b.nama)),
    teras: [...new Set([...rasmi, ...sah.flatMap(r => pecahId(r.Teras))])]
  };
  return json({ ok: true,
    kpi: { jumlah: f.length, kelas: kelas.size, guru: guru.size, terasTertinggi: tertinggi },
    teras: terasSusun, kelas: kiraSusun(kelas), subjek: kiraSusun(subjek),
    topGuru: [...guru.values()].sort((a, b) => b.bil - a.bil || a.nama.localeCompare(b.nama)).slice(0, 5),
    pilihan, jumlahSemua: sah.length });
}

// CSV: UTF-8 BOM, sel bermula = + - @ TAB CR dineutralkan, ikut tapisan, tanpa laporan dipadam.
export function selCsvKrk(v) {
  let t = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return '"' + t.replace(/"/g, '""') + '"';
}

async function eksportKarakter(ctx) {
  const { g, sek, url, now } = ctx;
  const { baris } = await bacaJadualKrk(g, sek, TAB_KRK.REKOD);
  const f = tapisRekod(baris.filter(r => r.ID && !ya(r.Dipadam)), url.searchParams, { guru: true });
  const kol = ['ID', 'Tarikh', 'Masa', 'Kelas', 'Mata Pelajaran', 'Guru', 'Emel', 'Elemen Teras', 'Tajuk', 'Catatan',
    'Bil Gambar', 'Bertandatangan', 'Status PDF', 'Dihantar', 'Dikemas kini', 'Tahun Sesi'];
  const baris2 = f.map(r => [r.ID, r.TarikhISO, r.Masa, r.Kelas, r.Subjek, r.NamaGuru, r.PemilikEmail, r.Teras, r.Tajuk, r.Catatan,
    r.BilGambar, r.TtdFileId ? 'YA' : 'TIDAK', statusPdf(r), r.Timestamp, r.DikemaskiniPada, r.TahunSesi]);
  const csv = '﻿' + [kol, ...baris2].map(b => b.map(selCsvKrk).join(',')).join('\r\n') + '\r\n';
  const tapisan = ['dari', 'hingga', 'kelas', 'subjek', 'guru', 'teras', 'cari'].filter(k => url.searchParams.get(k)).map(k => k + '=' + url.searchParams.get(k).slice(0, 40)).join(', ');
  await auditKarakter(ctx, 'KARAKTER_EKSPORT', '', 'BERJAYA', f.length + ' laporan' + (tapisan ? '; ' + tapisan : ''));
  return new Response(csv, { headers: {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': 'attachment; filename="e-Karakter_' + sek.slug + '_' + hariIni(now()) + '.csv"',
    'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
}
