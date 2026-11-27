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
  senaraiTab, tambahTab, pautanSheet, pautanFolder, RalatGoogle
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
