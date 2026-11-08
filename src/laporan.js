// Logik laporan OPR: normalisasi input dan bina rekod baris Sheet.
// Dipindah daripada Code.gs v2 (susunGambarSah_, slotTtdSah_, handleSimpanLaporan_, ...)
// supaya data lama dan baharu kekal serasi.

import { JENIS_SAH, KOLUM, TAB } from './skema.js';

const SLOT_TTD = ['SEDIA', 'SEMAK', 'SAH'];
const SUSUN = ['AUTO', 'SATU', 'DUA', 'TIGA', 'EMPAT', 'SOROT'];
const GAYA = ['KOTAK', 'POSTER'];
const LOGO_FOOTER = ['3', '4', '5', '6'];
export const STATUS = { DRAF: 'SIMPAN', HANTAR: 'HANTAR', DISEMAK: 'TELAH DISEMAK' };

function bersih(v, maks) {
  return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, maks);
}

function pilihDari(senarai, nilai, fallback) {
  const v = String(nilai || '').trim().toUpperCase();
  if (senarai.includes(v)) return v;
  const f = String(fallback || '').trim().toUpperCase();
  return senarai.includes(f) ? f : senarai[0];
}

function senaraiKod(sah, nilai, fallback) {
  let m = nilai;
  if (m === undefined || m === null || m === '') m = fallback;
  const arr = Array.isArray(m) ? m : String(m || '').split(',');
  const keluar = [];
  arr.forEach(x => { const k = String(x).trim().toUpperCase(); if (sah.includes(k) && !keluar.includes(k)) keluar.push(k); });
  keluar.sort((a, b) => sah.indexOf(a) - sah.indexOf(b));
  return keluar.join(',');
}

export const jenisSah = (v, fb, lalai = 'KOKURIKULUM') => pilihDari(JENIS_SAH, v, JENIS_SAH.includes(String(fb || '').toUpperCase()) ? fb : lalai);
export const slotSah = (v, fb) => senaraiKod(SLOT_TTD, v, fb);
export const logoFooterSah = (v, fb) => senaraiKod(LOGO_FOOTER, v, fb);
export const susunSah = (v, fb) => pilihDari(SUSUN, v, fb || 'AUTO');
export const gayaSah = (v, fb) => pilihDari(GAYA, v, fb || 'KOTAK');
export function warnaSah(v, fb) {
  const s = String(v || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  const f = String(fb || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(f) ? f.toLowerCase() : '#fffbeb';
}

// Medan teks dari borang -> [kolum Sheet, had panjang]
const MEDAN = {
  nama: ['Nama', 200], tajuk: ['Tajuk', 300], unit: ['Unit', 200], anjuran: ['Anjuran', 200],
  peringkat: ['Peringkat', 100], tarikhProgram: ['TarikhProgram', 40], jumLelaki: ['JumLelaki', 10],
  jumPerempuan: ['JumPerempuan', 10], objektif: ['Objektif', 4000], kaedah: ['Kaedah', 100],
  penambahbaikan: ['Penambahbaikan', 4000], rumusan: ['Rumusan', 4000], masa: ['Masa', 40],
  tempat: ['Tempat', 200], ucapanBertema: ['UcapanBertema', 300], kekuatan: ['Kekuatan', 4000],
  penyemak: ['Penyemak', 200], pengesah: ['Pengesah', 200]
};

// Bina rekod lengkap untuk satu baris Laporan. `lama` = rekod sedia ada (edit) atau null.
export function binaRekod(d, { lama, sesi, status, tetapan, id, masa }) {
  const t = tetapan || {};
  const r = {};
  for (const [kunci, [kolum, had]] of Object.entries(MEDAN)) r[kolum] = bersih(d[kunci], had);
  if (!r.Nama) r.Nama = bersih(sesi.nama, 200);
  // Kehadiran: nombor bulat sahaja
  for (const k of ['JumLelaki', 'JumPerempuan']) r[k] = /^\d{1,6}$/.test(r[k]) ? r[k] : (r[k] ? String(Math.max(0, parseInt(r[k], 10) || 0)) : '');
  // Tarikh dalam format input HTML (YYYY-MM-DD) sahaja
  if (r.TarikhProgram && !/^\d{4}-\d{2}-\d{2}$/.test(r.TarikhProgram)) r.TarikhProgram = '';
  if (r.Masa && !/^\d{2}:\d{2}$/.test(r.Masa)) r.Masa = '';

  return {
    ...r,
    ID: lama ? lama.ID : id,
    Timestamp: lama ? lama.Timestamp : masa,
    DikemaskiniPada: masa,
    PemilikEmail: lama ? lama.PemilikEmail : sesi.email,
    Jenis: jenisSah(d.jenis, lama ? lama.Jenis : '', t.JENIS_DEFAULT),
    SlotTtd: slotSah(d.slotTtd, 'SEDIA,SEMAK'),
    WarnaKertas: warnaSah(d.warnaKertas, t.WARNA_KERTAS),
    SusunGambar: susunSah(d.susunGambar, t.SUSUN_GAMBAR),
    GayaLaporan: gayaSah(d.gayaLaporan, t.GAYA_LAPORAN),
    LogoFooter: logoFooterSah(d.logoFooter, lama ? lama.LogoFooter : ''),
    // Fail diurus dalam Fasa 3b; kekalkan nilai sedia ada.
    PdfFileId: lama ? lama.PdfFileId : '',
    PdfNama: lama ? lama.PdfNama : '',
    LampiranIds: lama ? lama.LampiranIds : '',
    PdfDisemakId: lama ? lama.PdfDisemakId : '',
    Status: status,
    DisemakOleh: lama ? lama.DisemakOleh : '',
    DisemakPada: lama ? lama.DisemakPada : '',
    Dipadam: 'TIDAK'
  };
}

// Susun nilai ikut tajuk SEBENAR dalam Sheet (bukan susunan KOLUM), supaya
// Sheet lama dengan kolum tambahan di hujung tidak tersasar.
export function barisIkutTajuk(tajuk, rekod) {
  return tajuk.map(h => (Object.prototype.hasOwnProperty.call(rekod, h) ? rekod[h] : ''));
}

export function ringkasan(r) {
  return {
    id: String(r.ID), timestamp: String(r.Timestamp || ''), jenis: String(r.Jenis || ''),
    tajuk: String(r.Tajuk || ''), unit: String(r.Unit || ''), peringkat: String(r.Peringkat || ''),
    tarikhProgram: String(r.TarikhProgram || ''), nama: String(r.Nama || ''), pemilik: String(r.PemilikEmail || ''),
    status: String(r.Status || STATUS.DRAF), adaPdf: !!String(r.PdfFileId || '')
  };
}

export function butiran(r) {
  const o = ringkasan(r);
  for (const [kunci, [kolum]] of Object.entries(MEDAN)) o[kunci] = String(r[kolum] ?? '');
  return { ...o, slotTtd: String(r.SlotTtd || ''), warnaKertas: String(r.WarnaKertas || ''),
    susunGambar: String(r.SusunGambar || ''), gayaLaporan: String(r.GayaLaporan || ''),
    logoFooter: String(r.LogoFooter || ''), disemakOleh: String(r.DisemakOleh || ''), disemakPada: String(r.DisemakPada || ''),
    pdfFileId: String(r.PdfFileId || ''), pdfNama: String(r.PdfNama || ''), pdfDisemakId: String(r.PdfDisemakId || ''),
    lampiranIds: String(r.LampiranIds || '').split(',').filter(Boolean) };
}

export const TAJUK_LAPORAN = KOLUM[TAB.LAPORAN];

// Nombor lajur (1 -> A, 27 -> AA) untuk julat A1.
export function hurufLajur(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
