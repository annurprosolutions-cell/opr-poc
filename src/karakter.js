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
  bacaBanyak, kemaskiniJulat, kosongkanJulat
} from './google.js';
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
async function configKarakter({ g, sek, sesi, admin }) {
  const d = await bacaKarakter(g, sek, [TAB_KRK.SENARAI, TAB_KRK.TETAPAN, TAB_KRK.GURUKELAS, TAB_KRK.TTD]);
  const senarai = kumpulSenarai(d[TAB_KRK.SENARAI].baris);
  const t = kumpulTetapan(d[TAB_KRK.TETAPAN].baris);
  const aktif = (k) => (senarai[k] || []).filter(x => x.aktif).map(x => x.nilai);
  const hur = huraianTeras(t);
  const tetapan = Object.fromEntries(Object.entries(t).filter(([k]) => k.startsWith('KRK_') && !k.startsWith('KRK_SIAP_') && k !== 'KRK_TERAS_HURAIAN'));
  const email = sesi.email.toLowerCase();
  const guruKelas = d[TAB_KRK.GURUKELAS].baris.filter(r => String(r.Email).trim().toLowerCase() === email).map(r => String(r.Kelas));
  const adaTtd = d[TAB_KRK.TTD].baris.some(r => String(r.Email).trim().toLowerCase() === email && r.FileId);
  return json({ ok: true, admin, kelas: aktif(KAT.KELAS), subjek: aktif(KAT.SUBJEK),
    teras: aktif(KAT.TERAS).map(nama => ({ nama, huraian: hur[nama] || '' })),
    tetapan, guruKelas, adaTtd });
}

// Admin: semua data untuk skrin Setup dan Panduan Mula Pantas, satu bacaan.
async function setupKarakter({ g, sek, kenal }) {
  const d = await bacaKarakter(g, sek, [TAB_KRK.SENARAI, TAB_KRK.TETAPAN, TAB_KRK.GURUKELAS]);
  const senarai = kumpulSenarai(d[TAB_KRK.SENARAI].baris);
  const t = kumpulTetapan(d[TAB_KRK.TETAPAN].baris);
  const hur = huraianTeras(t);
  const guru = guruAktif(kenal, sek);
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
    tetapan, pemetaan, yatim, guru, panduan, struktur: statusStruktur(sek) });
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
