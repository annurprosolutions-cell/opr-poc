// =====================================================================
// ENJIN PRATONTON A4 + PENJANAAN PDF
// ---------------------------------------------------------------------
// Bahagian bertanda "KOD V2" di bawah diambil VERBATIM daripada OPR v2
// (annurprosolutions-cell/oprtemplate, index.html) supaya rupa dan tingkah
// laku PDF kekal sama seperti yang sekolah sudah biasa, termasuk semua
// pembetulan html2canvas (object-fit, pangkas sisa bundar, jalur satu muka).
// Ubah di bahagian lapisan sambungan ini, bukan dalam kod v2, jika boleh.
//
// Bergantung pada pustaka global (dimuat dari /vendor, bukan CDN):
//   html2pdf (html2pdf.bundle.min.js), pdfjsLib (pdf.min.js)
// =====================================================================
import { $ } from '/app.js';

// ---------------------------------------------------------------- lapisan sambungan
let CFG = {};
export const imejBukti = [];   // { nama, dataUrl, keterangan }
export const pdfHalaman = [];  // { nama, halaman: [dataUrl] }
const kait = { overlay: () => {}, toast: () => {}, ralat: (m) => alert(m), tandaSentuh: () => {} };

/** Tetapkan konfigurasi sekolah (format v2: namaSekolah, footerPdf, logo1, ...). */
export function setCfg(c) { CFG = c || {}; }
export function getCfg() { return CFG; }
/** Sambungkan UI aplikasi (overlay/toast/ralat/tandaSentuh). */
export function setKait(k) { Object.assign(kait, k || {}); }
const overlay = (...a) => kait.overlay(...a);
const toast = (...a) => kait.toast(...a);
const ralat = (...a) => kait.ralat(...a);
const tandaSentuh = (...a) => kait.tandaSentuh(...a);
export function kosongkanLampiran() { imejBukti.length = 0; pdfHalaman.length = 0; }

if (typeof window !== 'undefined' && window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.js';
}

// =====================================================================
// KOD V2 (verbatim)
// =====================================================================
const SLOT_TTD = [
  { kod: 'SEDIA', label: 'Disediakan Oleh', kotak: 'tSedia', medan: 'fNama' },
  { kod: 'SEMAK', label: 'Disemak Oleh',    kotak: 'tSemak', medan: 'fPenyemak' },
  { kod: 'SAH',   label: 'Disahkan Oleh',   kotak: 'tSah',   medan: 'fPengesah' }
];

const SUSUN_GAMBAR = [
  { kod: 'AUTO',  nama: 'Auto (ikut bilangan gambar)', nota: 'Sistem pilih bilangan lajur paling kemas.' },
  { kod: 'SATU',  nama: 'Satu lajur — gambar besar',   nota: 'Sesuai untuk 1–3 gambar utama.' },
  { kod: 'DUA',   nama: 'Dua lajur',                    nota: 'Pilihan paling seimbang untuk 4–6 gambar.' },
  { kod: 'TIGA',  nama: 'Tiga lajur',                   nota: 'Untuk 6–9 gambar.' },
  { kod: 'EMPAT', nama: 'Empat lajur — gambar kecil',   nota: 'Untuk banyak gambar dokumentasi.' },
  { kod: 'SOROT', nama: 'Sorotan — 1 besar + selebihnya kecil', nota: 'Gambar pertama jadi sorotan utama.' }
];

const GAYA_LAPORAN = [
  { kod: 'KOTAK',  nama: 'Kotak (Standard)',  nota: 'Reka bentuk sedia ada. Sehingga 5 gambar disatukan pada muka 1.' },
  { kod: 'POSTER', nama: 'Poster (Satu Muka)', nota: 'Templat poster padat — sesuai untuk paparan/edaran. Sehingga 5 gambar.' }
];

const MAKS_GAMBAR_SATU_MUKA = 5;

const WARNA_KERTAS = [
  { kod: '#fffbeb', nama: 'Krim' },
  { kod: '#ffffff', nama: 'Putih' },
  { kod: '#f8fafc', nama: 'Kelabu lembut' },
  { kod: '#eff6ff', nama: 'Biru muda' },
  { kod: '#f0fdf4', nama: 'Hijau muda' },
  { kod: '#fdf2f8', nama: 'Merah jambu' },
  { kod: '#fef2f2', nama: 'Merah lembut' }
];

function slotDipilih() {
  return SLOT_TTD.filter(sl => $(sl.kotak) && $(sl.kotak).checked);
}

function tarikhDMY(nilai) {
  if (!nilai) return '-';
  const d = new Date(nilai);
  if (isNaN(d)) return String(nilai);
  return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear();
}

function tarikhInputKeDMY(v) {
  if (!v) return '-';
  const p = String(v).split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : v;
}

function e_(tag, kelas, teks) {
  const n = document.createElement(tag);
  if (kelas) n.className = kelas;
  if (teks !== undefined && teks !== null) n.textContent = String(teks);
  return n;
}

function butang(kelas, ikonKelas, tajuk, onClick) {
  const b = e_('button', kelas);
  b.title = tajuk;
  const i = document.createElement('i');
  i.className = ikonKelas;          // ikon = pemalar dalaman, bukan data pengguna
  b.appendChild(i);
  b.addEventListener('click', onClick);
  return b;
}

function isiLogoKecil(bekas, cfg) {
  if (!bekas) return;
  bekas.textContent = '';
  [cfg.logo1, cfg.logo2].filter(Boolean).forEach(src => {
    const im = document.createElement('img');
    im.className = 'pv-logo-kecil'; im.src = src; im.alt = '';
    bekas.appendChild(im);
  });
}

/**
 * Medan "Sertakan" yang boleh diuntick oleh guru: bila diuntick, kotak itu
 * tersembunyi dari pratonton/PDF DAN nilainya tidak dihantar ke backend
 * (lihat hantarLaporan) — walaupun kolum dalam Sheet sedia ada.
 * Satu checkbox boleh kawal lebih dari satu kotak (contoh: Kehadiran).
 */
/* Setiap medan boleh kawal kotak dalam gaya Kotak (pvKotakXxx) DAN blok yang
   sepadan dalam gaya Poster (psBlokXxx / psChipXxx) — dua reka bentuk, satu
   sahaja tanda "Sertakan". */
const MEDAN_SERTAKAN = [
  { chk: 'tUnit',      kotak: ['pvKotakUnit', 'psBlokUnit'] },
  { chk: 'tAnjuran',   kotak: ['pvKotakAnjuran', 'psBlokAnjuran'] },
  { chk: 'tPeringkat', kotak: ['pvKotakPeringkat', 'psBlokPeringkat'] },
  { chk: 'tTarikh',    kotak: ['pvKotakTarikh', 'psBlokTarikh'] },
  { chk: 'tMasa',      kotak: ['pvKotakMasa', 'psBlokMasa'] },
  { chk: 'tTempat',    kotak: ['pvKotakTempat', 'psBlokTempat'] },
  { chk: 'tKehadiran', kotak: ['pvKotakLelaki', 'pvKotakPerempuan', 'pvKotakJumlah', 'psBlokKehadiran'] },
  { chk: 'tObjektif',  kotak: ['pvKotakObjektif', 'psBlokObjektif'] },
  { chk: 'tUcapan',    kotak: ['pvKotakUcapan', 'psChipUcapan'] },
  { chk: 'tKaedah',    kotak: ['pvKotakKaedah', 'psBlokKaedah'] },
  { chk: 'tKekuatan',  kotak: ['pvKotakKekuatan', 'psChipKekuatan'] },
  { chk: 'tImprove',   kotak: ['pvKotakImprove', 'psChipImprove'] },
  { chk: 'tRumusan',   kotak: ['pvKotakRumusan', 'psBlokRumusan'] }
];

/** Sertakan/keluarkan sesuatu medan dari laporan ini sahaja (bukan tetapan sistem). */
function sertakanMedan(id) {
  const s = $(id); return !s || s.checked;
}

function lukisSertakan() {
  MEDAN_SERTAKAN.forEach(m => {
    const papar = sertakanMedan(m.chk);
    m.kotak.forEach(k => { const n = $(k); if (n) n.style.display = papar ? '' : 'none'; });
  });
}

/**
 * Logo tambahan (kaki PDF, v2.12) — slot 3-6. Beza dengan MEDAN_SERTAKAN:
 * bukan "value" per laporan (imej logo aset Config global dikongsi semua
 * laporan), jadi kena tanda EKSPLISIT slot mana disertakan (rentetan "3,5"
 * pada LogoFooter — corak sama seperti SlotTtd), bukan infer dari kosong/ada
 * macam medan teks di atas. Lalai TIDAK ditick — guru pilih sendiri.
 */
const LOGO_FOOTER_SLOT = [3, 4, 5, 6];

/** Senarai slot yang guru TICK untuk laporan semasa (rentetan cth ['3','5']). */
function logoFooterDipilih() {
  return LOGO_FOOTER_SLOT.filter(n => { const c = $('tLogo' + n); return c && c.checked; }).map(String);
}

/** Bina checkbox "sertakan" untuk setiap logo tambahan yang DIKONFIGUR admin
    (CFG.logoN wujud) — slot yang tiada imej langsung tidak dipapar. Dipanggil
    semula setiap kali CFG berubah (pakaiTema), bukan sekali sahaja, sebab
    admin boleh tambah/tukar logo tengah sesi. Status tick sedia ada
    dikekalkan merentasi bina semula supaya tidak tertanggal senyap. */
function lukisPilihanLogoFooter(cfg) {
  const bekas = $('senaraiLogoFooter'), blok = $('blokLogoFooter');
  if (!bekas || !blok) return;
  const sediaCentang = {};
  LOGO_FOOTER_SLOT.forEach(n => { const c = $('tLogo' + n); if (c) sediaCentang[n] = c.checked; });
  bekas.textContent = '';
  const aktif = LOGO_FOOTER_SLOT.filter(n => cfg['logo' + n]);
  blok.classList.toggle('hidden', aktif.length === 0);
  aktif.forEach(n => {
    const lbl = e_('label', 'flex items-center gap-1.5 cursor-pointer');
    const chk = document.createElement('input');
    chk.type = 'checkbox'; chk.id = 'tLogo' + n; chk.className = 'accent-teal-600 h-3.5 w-3.5 cursor-pointer';
    chk.checked = !!sediaCentang[n];
    chk.addEventListener('change', lukisPratonton);
    const img = document.createElement('img');
    img.src = cfg['logo' + n]; img.alt = '';
    img.className = 'h-6 w-6 object-contain border rounded bg-white';
    const teks = e_('span', 'text-[11px] font-semibold text-slate-600', cfg['logo' + n + 'Label'] || ('Logo ' + n));
    lbl.appendChild(chk); lbl.appendChild(img); lbl.appendChild(teks);
    bekas.appendChild(lbl);
  });
}

/** Papar jalur kecil logo tambahan di kaki PDF — dikongsi Kotak & Poster.
    Hanya logo yang (a) dikonfigur admin DAN (b) ditick guru untuk laporan
    ini yang muncul. */
function lukisLogoFooterPdf(bekas) {
  if (!bekas) return;
  bekas.textContent = '';
  // v2.12.1 — jajaran (kiri/tengah/kanan) ditetapkan admin, lalai TENGAH.
  bekas.classList.remove('logo-footer-kiri', 'logo-footer-tengah', 'logo-footer-kanan');
  const jajaran = { KIRI: 'logo-footer-kiri', KANAN: 'logo-footer-kanan' }[CFG.logoFooterAlign] || 'logo-footer-tengah';
  bekas.classList.add(jajaran);
  const dipilih = logoFooterDipilih();
  const tunjuk = LOGO_FOOTER_SLOT.filter(n => dipilih.indexOf(String(n)) !== -1 && CFG['logo' + n]);
  bekas.classList.toggle('hidden', tunjuk.length === 0);
  tunjuk.forEach(n => {
    const img = document.createElement('img');
    img.src = CFG['logo' + n];
    img.alt = CFG['logo' + n + 'Label'] || ('Logo ' + n);
    bekas.appendChild(img);
  });
}

function lukisPratonton() {
  const g = (id) => $(id).value.trim();
  const isi = (id, v) => { $(id).textContent = (v === '' || v === null || v === undefined) ? '-' : v; };

  isi('pvTajuk', g('fTajuk'));
  $('pvTajuk2').textContent = g('fTajuk');
  isi('pvUnit', g('fUnit'));
  isi('pvAnjuran', g('fAnjuran'));
  isi('pvPeringkat', g('fPeringkat'));
  isi('pvTarikh', g('fTarikh') ? tarikhInputKeDMY(g('fTarikh')) : '');
  isi('pvMasa', g('fMasa'));
  isi('pvTempat', g('fTempat'));
  const l = Number(g('fLelaki')) || 0, p = Number(g('fPerempuan')) || 0;
  isi('pvLelaki', l); isi('pvPerempuan', p); isi('pvJumlah', l + p);
  isi('pvObjektif', g('fObjektif'));
  isi('pvUcapan', g('fUcapan'));
  isi('pvKaedah', g('fKaedah'));
  isi('pvKekuatan', g('fKekuatan'));
  isi('pvImprove', g('fImprove'));
  isi('pvRumusan', g('fRumusan'));
  lukisSertakan();
  // Nama penyedia dipapar melalui blok tandatangan dinamik (lukisTandatangan).

  const footer = CFG.footerPdf || ('\u00A9 ' + (CFG.namaSekolah || ''));
  $('pvFooter').textContent = footer;
  $('pvFooter2').textContent = footer;
  $('pvNama2').textContent = g('fNama') || '-';
  $('pvTarikhCetak').textContent = 'Dijana: ' + tarikhDMY(new Date());

  lukisTandatangan();
  lukisLogoFooterPdf($('pvLogoFooter'));
  pakaiDasarPdf();
  pakaiWarnaKertas();
  kemaskiniLayoutGambar();
}

/** Sapu warna kertas pilihan ke semua muka A4 (termasuk muka lampiran). */
function pakaiWarnaKertas() {
  const n = $('fWarnaKertas'); if (!n) return;
  const warna = /^#[0-9a-fA-F]{6}$/.test(n.value) ? n.value : (CFG.warnaKertas || '#fffbeb');
  $('pdfContent').style.setProperty('--kertas', warna);
  document.querySelectorAll('#swatchKertas .swatch').forEach(b => {
    b.classList.toggle('aktif', b.dataset.warna.toLowerCase() === warna.toLowerCase());
  });
}

/** Bina butang warna pantas + senarai templat gambar. Dipanggil sekali sahaja. */
function binaKawalanRupa() {
  const bekas = $('swatchKertas');
  if (bekas && !bekas.children.length) {
    WARNA_KERTAS.forEach(w => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'swatch'; b.dataset.warna = w.kod;
      b.style.background = w.kod; b.title = w.nama;
      b.addEventListener('click', () => {
        $('fWarnaKertas').value = w.kod;
        tandaSentuh('fWarnaKertas');
        lukisPratonton();
      });
      bekas.appendChild(b);
    });
  }
  const sel = $('fSusunGambar');
  if (sel && !sel.children.length) {
    SUSUN_GAMBAR.forEach(x => { const o = e_('option', '', x.nama); o.value = x.kod; sel.appendChild(o); });
  }
  const selGaya = $('fGayaLaporan');
  if (selGaya && !selGaya.children.length) {
    GAYA_LAPORAN.forEach(x => { const o = e_('option', '', x.nama); o.value = x.kod; selGaya.appendChild(o); });
  }
}

/** Kemas kini nota bantuan + dasar PDF sekolah. */
function pakaiDasarPdf() {
  const susun = SUSUN_GAMBAR.filter(x => x.kod === ($('fSusunGambar').value || 'AUTO'))[0];
  $('notaSusun').textContent = susun ? susun.nota : '';
  const gaya = GAYA_LAPORAN.filter(x => x.kod === ($('fGayaLaporan').value || 'KOTAK'))[0];
  if ($('notaGaya')) $('notaGaya').textContent = gaya ? gaya.nota : '';

  const wajib = CFG.wajibPdf === true;
  const kotak = $('tJanaPdf');
  if (wajib) { kotak.checked = true; kotak.disabled = true; }
  else { kotak.disabled = false; }
  $('notaPdf').textContent = wajib
    ? 'Sekolah anda menetapkan PDF WAJIB dijana. Tetapan ini dikunci oleh pentadbir.'
    : 'Boleh dimatikan jika anda hanya mahu simpan maklumat dahulu. PDF boleh dijana kemudian.';
}

/**
 * Bina ruang tandatangan mengikut slot yang ditanda sahaja.
 * Bilangan lajur mengikut bilangan slot supaya susun aturnya kekal seimbang
 * sama ada satu, dua atau tiga ruang digunakan.
 */
function lukisTandatangan() {
  const bekas = $('pvTandatangan'); if (!bekas) return;
  bekas.textContent = '';
  const dipilih = slotDipilih();

  bekas.className = 'pv-grid pv-tandatangan pv-' + (dipilih.length || 1);
  // Tiada slot ditanda — blok tandatangan hilang sepenuhnya dari PDF.
  bekas.style.display = dipilih.length ? '' : 'none';

  dipilih.forEach(sl => {
    const kotak = document.createElement('div');
    kotak.appendChild(e_('div', 'lbl', sl.label));
    const nilai = String($(sl.medan).value || '').trim();
    kotak.appendChild(e_('div', 'val pv-kecil pv-tebal', nilai || '-'));
    kotak.appendChild(e_('div', 'pv-garis'));
    kotak.appendChild(e_('div', 'pv-nota', 'Tandatangan & Tarikh'));
    bekas.appendChild(kotak);
  });
}

/**
 * Ukur nisbah lebar:tinggi sesuatu gambar sekali sahaja, kemudian panggil
 * semula pelukis. Nisbah disimpan pada objek gambar itu, jadi tiada gelung —
 * lukisan kedua terus menemui nilainya.
 */
function ukurNisbah(gambar, bila) {
  if (!gambar || gambar.nisbah) return;
  const im = new Image();
  im.onload = () => {
    gambar.nisbah = im.naturalWidth / Math.max(1, im.naturalHeight);
    if (bila) bila();
  };
  im.onerror = () => { gambar.nisbah = 1.4; };
  im.src = gambar.dataUrl;
}

/**
 * Halaman gambar disembunyikan sepenuhnya jika tiada gambar — supaya tiada
 * muka surat kosong dalam PDF. Bilangan lajur dan baris dikira ikut jumlah
 * gambar supaya grid mengisi habis tinggi halaman, tiada ruang putih di bawah.
 */
function lukisGridGambar() {
  const bil = imejBukti.length;
  $('pageTwo').style.display = bil ? '' : 'none';
  if (!bil) return;

  const grid = $('pvGridGambar');
  grid.textContent = '';

  const mod = $('fSusunGambar') ? ($('fSusunGambar').value || 'AUTO') : 'AUTO';
  const sorot = (mod === 'SOROT' && bil > 1);
  const bilSisa = sorot ? bil - 1 : bil;

  let lajur;
  switch (mod) {
    case 'SATU':  lajur = 1; break;
    case 'DUA':   lajur = 2; break;
    case 'TIGA':  lajur = 3; break;
    case 'EMPAT': lajur = 4; break;
    // Sorotan: gambar kecil dimuatkan dalam SATU baris bila boleh, supaya
    // tiada gambar kedua yang melebar penuh dan kelihatan seperti hero kedua.
    case 'SOROT': lajur = bilSisa <= 3 ? Math.max(1, bilSisa) : (bilSisa === 4 ? 2 : 3); break;
    default:      lajur = bil === 1 ? 1 : (bil <= 6 ? 2 : 3);   // AUTO
  }
  if (lajur > bil) lajur = bil;   // jangan buat lajur kosong

  const barisKecil = Math.ceil(bilSisa / lajur);
  grid.style.gridTemplateColumns = 'repeat(' + lajur + ', minmax(0, 1fr))';
  if (sorot) {
    // Baris hero diberi bahagian lebih besar — inilah yang menjadikannya
    // "satu besar, selebihnya kecil", bukan sekadar lebih lebar.
    //
    // Tingginya dikira dari NISBAH gambar hero itu sendiri: gambar landskap
    // tidak perlu baris tinggi, gambar potret perlu. Tanpa ini, gambar
    // landskap akan dikelilingi jalur kosong yang besar.
    ukurNisbah(imejBukti[0], () => lukisGridGambar());
    const nis = imejBukti[0].nisbah || 1.4;
    const dalam = barisKecil >= 2;
    const tinggiHero = nis >= 1.3 ? (dalam ? 1.45 : 1.05)
                     : nis >= 0.85 ? (dalam ? 2.1 : 1.75)
                     : (dalam ? 2.6 : 2.20);
    grid.style.gridTemplateRows = tinggiHero + 'fr repeat(' + barisKecil + ', minmax(0, 1fr))';
  } else {
    grid.style.gridTemplateRows = 'repeat(' + barisKecil + ', minmax(0, 1fr))';
  }

  const baki = bilSisa % lajur;   // gambar terakhir pada baris yang tidak penuh
  imejBukti.forEach((img, i) => {
    const kad = e_('figure', 'kad-gambar');
    const bingkai = e_('div', 'kad-bingkai');
    if (sorot && i === 0) {
      kad.style.gridColumn = 'span ' + lajur;
    } else if (baki !== 0 && i >= bil - baki) {
      // Baris terakhir tidak penuh: agihkan lebar yang tinggal SAMA RATA
      // antara gambar yang ada, supaya tiada sel kosong dan tiada gambar
      // yang melebar sampai terpaksa berpindah baris.
      const kedudukan = i - (bil - baki);
      const asas = Math.floor(lajur / baki);
      const lebih = lajur % baki;
      kad.style.gridColumn = 'span ' + (asas + (kedudukan < lebih ? 1 : 0));
    }
    const im = document.createElement('img');
    im.src = img.dataUrl; im.alt = '';
    bingkai.appendChild(im);
    kad.appendChild(bingkai);
    const teks = (img.keterangan || '').trim();
    if (teks) kad.appendChild(e_('figcaption', '', teks));   // tiada kapsyen = tiada jalur putih
    grid.appendChild(kad);
  });
}

/**
 * "One Page Report" sebenar: gaya reka bentuk (Kotak / Poster) menentukan
 * templat, tetapi KEDUA-DUANYA cuba muat gambar terus pada muka 1 supaya
 * PDF benar-benar SATU muka — bukan sekadar nama.
 *
 *   - Gaya KOTAK, 1-5 gambar: gambar disatukan dalam jalur padat pada muka 1
 *     (#pvStripSatuMuka), muka 2 disembunyikan. Jaringan keselamatan: jika
 *     kandungan tetap melimpah (medan teks terlalu panjang), jatuh balik
 *     automatik ke muka 2 supaya TIADA apa yang terpotong.
 *   - Gaya KOTAK, >5 gambar: seperti sistem asal — muka 1 teks, muka 2 grid
 *     gambar penuh (SUSUN_GAMBAR).
 *   - Gaya POSTER, 1-5 gambar: templat poster satu-muka (#posterPage).
 *   - Gaya POSTER, >5 gambar: templat poster tidak cukup ruang untuk itu,
 *     jadi jatuh balik SEPENUHNYA kepada gaya Kotak dua-muka supaya tiada
 *     gambar yang hilang.
 *
 * PDF yang dimuat naik guru (lampiran dokumen) TIDAK pernah masuk kiraan
 * ini — ia sentiasa jadi muka lampiran berasingan (lihat lukisHalamanPdf()).
 */
function kemaskiniLayoutGambar() {
  const gaya = ($('fGayaLaporan') && $('fGayaLaporan').value) || 'KOTAK';
  const bil = imejBukti.length;
  // Jalur satu-muka gaya Kotak hanya bererti bila ADA gambar untuk disatukan.
  const layakSatuMuka = bil > 0 && bil <= MAKS_GAMBAR_SATU_MUKA;
  // Poster ialah PILIHAN templat, bukan sekadar penyelesaian gambar — jadi
  // ia kekal terpakai walaupun tiada gambar langsung (lajur gambar tersembunyi).
  const posterMuat = bil <= MAKS_GAMBAR_SATU_MUKA;

  if (gaya === 'POSTER' && posterMuat) {
    kosongkanStripSatuMuka();
    $('pageOne').style.display = 'none';
    $('pageTwo').style.display = 'none';
    $('posterPage').style.display = '';
    lukisPoster();
    // Jaringan keselamatan (v2.10.1) — Poster tiada had ketat pada
    // bilangan/panjang medan seperti Kotak; kandungan sebenar (bukan teks
    // ujian ringkas) boleh melimpah past 297mm walaupun gambar <=5. Kalau
    // itu berlaku, jatuh balik SEPENUHNYA ke Kotak dua-muka (sama seperti
    // kes >5 gambar) supaya tiada apa yang terpotong/bertindan senyap-
    // senyap dalam PDF. Sengaja TIDAK cuba jalur satu-muka Kotak dahulu —
    // gelagat jatuh balik kekal mudah diramal: Poster muat sendiri, atau
    // terus ke Kotak dua-muka yang terbukti selamat.
    const pos = $('posterPage');
    if (pos.scrollHeight <= pos.clientHeight + 2) return;
    $('posterPage').style.display = 'none';
  }

  // Gaya Kotak (lalai) — atau Poster yang jatuh balik (>5 gambar, atau
  // kandungan melimpah walaupun <=5).
  $('pageOne').style.display = '';
  $('posterPage').style.display = 'none';

  if (gaya === 'KOTAK' && layakSatuMuka) {
    $('pageTwo').style.display = 'none';
    lukisStripSatuMuka();
    const satu = $('pageOne');
    if (satu.scrollHeight > satu.clientHeight + 2) {
      // Teks terlalu panjang untuk muat sekali dengan gambar — jatuh balik
      // ke muka 2 supaya tiada kandungan yang terpotong dalam PDF.
      kosongkanStripSatuMuka();
      lukisGridGambar();
    }
  } else {
    kosongkanStripSatuMuka();
    lukisGridGambar();
  }
}

/** Bilangan lajur paling seimbang untuk N gambar (1-5, had MAKS_GAMBAR_SATU_MUKA).
    3 gambar = 1 baris; 4 gambar = 2x2 (kad lebih besar drpd 3+1); 5 gambar =
    3+2. Tujuannya bina grid yang lebih "petak" (bukan satu baris panjang
    sempit) supaya setiap kad gambar lebih besar — permintaan guru selepas
    gambar dilaporkan terlalu kecil dalam jalur satu-baris asal. */
function kiraLajurGambar_(bil) {
  if (bil <= 1) return 1;
  if (bil === 2) return 2;
  if (bil === 4) return 2;
  return 3; // 3 gambar (1 baris) atau 5 gambar (3+2)
}

/** Bina jalur gambar padat (landskap, background-image cover) ke dalam
    bekas yang diberi — dikongsi oleh gaya Kotak (#pvStripSatuMuka) dan
    gaya Poster (#psGridGambar) supaya kedua-dua guna teknik SAMA yang
    terbukti selamat untuk html2canvas (lihat nota .strip-bingkai).

    v2.11.0 — susun dalam BEBERAPA BARIS (bukan satu baris rata) ikut
    kiraLajurGambar_(), setiap baris flex:1 supaya kongsi tinggi sama rata
    dan mengembang mengisi ruang baki muka (lihat #pvStripSatuMuka/
    #psGridGambar dalam CSS) — kad jadi lebih besar & "2 baris" seperti
    diminta guru, bukan sekadar lebih lebar. */
function bentukJalurGambar(bekas) {
  bekas.textContent = '';
  bekas.classList.remove('hidden');
  bekas.appendChild(e_('div', 'lbl', 'Gambar Aktiviti (' + imejBukti.length + ')'));
  const grid = e_('div', 'strip-grid');
  const kol = kiraLajurGambar_(imejBukti.length);
  for (let i = 0; i < imejBukti.length; i += kol) {
    const baris = e_('div', 'strip-baris');
    imejBukti.slice(i, i + kol).forEach(img => {
      const kad = e_('figure', 'strip-kad');
      const bingkai = e_('div', 'strip-bingkai');
      bingkai.style.backgroundImage = 'url(' + img.dataUrl + ')';
      kad.appendChild(bingkai);
      const teks = (img.keterangan || '').trim();
      if (teks) kad.appendChild(e_('figcaption', '', teks));
      baris.appendChild(kad);
    });
    grid.appendChild(baris);
  }
  bekas.appendChild(grid);
}

/** Isi jalur gambar padat pada muka 1 (gaya Kotak, 1-5 gambar). */
function lukisStripSatuMuka() {
  const bekas = $('pvStripSatuMuka'); if (!bekas) return;
  bentukJalurGambar(bekas);
}

function kosongkanStripSatuMuka() {
  const bekas = $('pvStripSatuMuka'); if (!bekas) return;
  bekas.textContent = '';
  bekas.classList.add('hidden');
}

/**
 * Isi templat POSTER — reka bentuk padat satu-muka alternatif kepada Kotak.
 * Guna medan borang yang sama seperti lukisPratonton(), jadi sentiasa
 * sepadan dengan apa yang guru sedang taip.
 */
function lukisPoster() {
  const g = (id) => $(id).value.trim();
  const isi = (id, v) => { const n = $(id); if (n) n.textContent = (v === '' || v === null || v === undefined) ? '-' : v; };

  isi('psTajuk', g('fTajuk'));
  isi('psSekolah', CFG.namaSekolah || '');
  isi('psUnit', g('fUnit'));
  isi('psAnjuran', g('fAnjuran'));
  isi('psPeringkat', g('fPeringkat'));
  isi('psKaedah', g('fKaedah'));
  isi('psObjektif', g('fObjektif'));
  isi('psTarikh', g('fTarikh') ? tarikhInputKeDMY(g('fTarikh')) : '');
  isi('psMasa', g('fMasa'));
  isi('psTempat', g('fTempat'));
  const l = Number(g('fLelaki')) || 0, p = Number(g('fPerempuan')) || 0;
  isi('psKehadiran', (l + p) ? ((l + p) + ' murid  (L: ' + l + ' / P: ' + p + ')') : '');
  isi('psRumusan', g('fRumusan'));
  isi('psUcapan', g('fUcapan'));
  isi('psKekuatan', g('fKekuatan'));
  isi('psImprove', g('fImprove'));

  const pasang = (id, src) => { const n = $(id); if (!n) return; if (src) { n.src = src; n.classList.remove('hidden'); } else { n.classList.add('hidden'); } };
  pasang('psLogo1', CFG.logo1); pasang('psLogo2', CFG.logo2);

  const footer = CFG.footerPdf || ('© ' + (CFG.namaSekolah || ''));
  if ($('psFooter')) $('psFooter').textContent = footer;
  if ($('psTarikhCetak')) $('psTarikhCetak').textContent = 'Dijana: ' + tarikhDMY(new Date());

  lukisPosterTandatangan();
  lukisSertakan();
  lukisPosterGambar();
  lukisLogoFooterPdf($('psLogoFooter'));
}

/** Ruang tandatangan padat (satu baris) untuk templat Poster. */
function lukisPosterTandatangan() {
  const bekas = $('psTandatangan'); if (!bekas) return;
  bekas.textContent = '';
  const dipilih = slotDipilih();
  bekas.style.display = dipilih.length ? '' : 'none';
  dipilih.forEach(sl => {
    const blok = e_('div', 'poster-ttd-blok');
    blok.appendChild(document.createTextNode(sl.label + ': '));
    const nilai = String($(sl.medan).value || '').trim();
    const tebal = document.createElement('b'); tebal.textContent = nilai || '-';
    blok.appendChild(tebal);
    blok.appendChild(e_('div', 'poster-ttd-garis'));
    bekas.appendChild(blok);
  });
}

/** Jalur gambar landskap templat Poster (di bawah semua maklumat) —
    terhad kepada MAKS_GAMBAR_SATU_MUKA, teknik sama seperti jalur Kotak. */
function lukisPosterGambar() {
  const bekas = $('psGridGambar'); if (!bekas) return;
  bekas.textContent = '';
  if (!imejBukti.length) { bekas.classList.add('hidden'); return; }
  bentukJalurGambar(bekas);
}

// ---------------------------------------------------------------- lampiran
/** Baca jenis MIME dari kepala satu data URL. */
function jenisDataUrl(dataUrl) {
  const m = /^data:([^;,]+)/.exec(String(dataUrl || ''));
  return m ? m[1].toLowerCase() : '';
}

/** Anggaran saiz sebenar (bait) bagi bahagian base64 sesuatu data URL. */
function saizDataUrl(dataUrl) {
  const b64 = String(dataUrl || '').split(',')[1] || '';
  return Math.floor(b64.length * 3 / 4);
}

/**
 * Kecilkan imej dalam pelayar.
 *
 * PENTING — kenapa format dikekalkan:
 * Kanvas menyimpan kawasan lutsinar sebagai rgba(0,0,0,0). Bila ia dieksport
 * sebagai JPEG, saluran alpha dibuang dan yang tinggal ialah HITAM. Itulah
 * sebabnya logo PNG berlatar lutsinar dahulunya keluar dengan kotak hitam.
 * Jadi:
 *   - sumber PNG / WEBP  -> kekal PNG / WEBP, lutsinar terpelihara
 *   - sumber lain (JPEG) -> kekal JPEG, tetapi kanvas dicat putih dahulu
 *     supaya sebarang piksel lutsinar jadi putih, bukan hitam.
 *
 * pilihan.format : 'auto' (lalai) | 'image/png' | 'image/jpeg' | 'image/webp'
 * pilihan.latar  : warna latar bila output tidak menyokong lutsinar
 */
function kecilkanImej(dataUrl, maksSisi, kualiti, pilihan) {
  pilihan = pilihan || {};
  return new Promise((selesai) => {
    const img = new Image();
    img.onload = () => {
      let { width: w, height: h } = img;
      const skala = Math.min(1, maksSisi / Math.max(w, h));
      w = Math.max(1, Math.round(w * skala)); h = Math.max(1, Math.round(h * skala));

      const asal = jenisDataUrl(dataUrl);
      let keluar = pilihan.format || 'auto';
      if (keluar === 'auto') {
        keluar = (asal === 'image/png' || asal === 'image/webp') ? asal : 'image/jpeg';
      }
      const adaAlpha = (keluar === 'image/png' || keluar === 'image/webp');

      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      if (!adaAlpha) {                       // JPEG tiada alpha — cat latar dahulu
        ctx.fillStyle = pilihan.latar || '#ffffff';
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(img, 0, 0, w, h);

      // PNG mengabaikan parameter kualiti; hantar undefined supaya jelas.
      selesai(keluar === 'image/png' ? c.toDataURL('image/png')
                                     : c.toDataURL(keluar, kualiti || 0.82));
    };
    img.onerror = () => selesai(dataUrl);
    img.src = dataUrl;
  });
}

async function tambahFail() {
  const inp = $('failInput');
  if (!inp.files || !inp.files[0]) return toast('warning', 'Sila pilih fail dahulu.');
  const fail = inp.files[0];
  const keterangan = $('failKeterangan').value.trim();

  if (fail.size > 25 * 1024 * 1024) return ralat('Fail melebihi 25MB.');

  overlay(true, 'Memproses fail...');
  const baca = new FileReader();
  baca.onload = async (ev) => {
    try {
      if (fail.type === 'application/pdf') {
        await lampirPdf(ev.target.result, fail.name);
      } else if (/^image\//.test(fail.type)) {
        // Gambar bukti dikekalkan sebagai JPEG kerana saiznya jauh lebih kecil,
        // tetapi kanvas dicat PUTIH dahulu supaya PNG berlatar lutsinar tidak
        // keluar berlatar hitam dalam PDF.
        const kecil = await kecilkanImej(ev.target.result, 1400, 0.82,
          { format: 'image/jpeg', latar: '#ffffff' });
        imejBukti.push({ nama: fail.name, dataUrl: kecil, keterangan: keterangan });
      } else {
        overlay(false); return ralat('Hanya gambar dan PDF dibenarkan.');
      }
      inp.value = ''; $('failKeterangan').value = '';
      lukisSenaraiLampiran(); lukisPratonton();
      overlay(false); toast('success', 'Lampiran ditambah.');
    } catch (err) { overlay(false); ralat('Gagal memproses fail: ' + err.message); }
  };
  baca.readAsDataURL(fail);
}

async function lampirPdf(dataUrl, nama) {
  const bin = atob(dataUrl.split(',')[1]);
  const tugas = pdfjsLib.getDocument({ data: bin });
  const pdf = await tugas.promise;
  if (pdf.numPages > 15) throw new Error('PDF melebihi 15 halaman.');
  const halaman = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const hal = await pdf.getPage(n);
    const vp = hal.getViewport({ scale: 1.6 });
    const c = document.createElement('canvas');
    c.width = vp.width; c.height = vp.height;
    await hal.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    halaman.push(c.toDataURL('image/jpeg', 0.8));
  }
  pdfHalaman.push({ nama: nama, halaman: halaman });
  lukisHalamanPdf();
}

/**
 * Bina kepala ringkas — tajuk besar di kiri, logo kecil bersebelahan di kanan.
 * Digunakan oleh halaman lampiran PDF. Muka 1 kekal guna kepala penuh
 * (logo besar di kiri + nama & alamat sekolah).
 */
function kepalaRingkas(tajuk, subtajuk, nota) {
  const kepala = e_('div', 'pv-kepala-ringkas');
  const kiri = e_('div');
  kiri.appendChild(e_('h2', 'pv-tajuk-muka', tajuk));
  if (subtajuk) kiri.appendChild(e_('p', 'pv-sub-muka', subtajuk));
  if (nota) {
    const n = e_('p', 'pv-alamat', nota);
    n.style.fontWeight = '500'; n.style.marginTop = '2px';
    kiri.appendChild(n);
  }
  kepala.appendChild(kiri);
  const bekasLogo = e_('div', 'pv-logo-set');
  isiLogoKecil(bekasLogo, CFG);
  kepala.appendChild(bekasLogo);
  return kepala;
}

function lukisHalamanPdf() {
  const bekas = $('pvLampiranPdf'); bekas.textContent = '';
  pdfHalaman.forEach(fail => {
    fail.halaman.forEach((src, i) => {
      const muka = e_('div', 'a4-page lampiran');
      muka.appendChild(kepalaRingkas(
        'Lampiran Dokumen', fail.nama,
        'Halaman ' + (i + 1) + ' daripada ' + fail.halaman.length));

      const im = document.createElement('img');
      im.src = src; im.alt = '';
      im.style.cssText = 'width:100%;object-fit:contain;max-height:225mm;' +
        'border:1px solid #e2e8f0;background:#fff;border-radius:6px;';
      muka.appendChild(im);

      const kaki = e_('div', 'pv-kaki-muka');
      kaki.style.marginTop = 'auto';
      kaki.appendChild(e_('div', '', 'Dokumen ini dilampirkan secara elektronik'));
      kaki.appendChild(e_('div', '', CFG.footerPdf || ('\u00A9 ' + (CFG.namaSekolah || ''))));
      muka.appendChild(kaki);

      bekas.appendChild(muka);
    });
  });
}

function lukisSenaraiLampiran() {
  const l = $('senaraiLampiran'); l.textContent = '';
  if (!imejBukti.length && !pdfHalaman.length) {
    l.appendChild(e_('p', 'text-xs text-slate-400 italic text-center', 'Belum ada lampiran.'));
    return;
  }
  imejBukti.forEach((img, i) => {
    const baris = e_('div', 'flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200');
    const th = document.createElement('img');
    th.src = img.dataUrl; th.className = 'h-9 w-9 object-cover rounded'; th.alt = '';
    baris.appendChild(th);
    baris.appendChild(e_('span', 'flex-1 text-xs truncate', img.keterangan || img.nama));
    baris.appendChild(butang('text-rose-500 hover:text-rose-700 px-2', 'fas fa-trash', 'Buang', () => {
      imejBukti.splice(i, 1); lukisSenaraiLampiran(); lukisPratonton();
    }));
    l.appendChild(baris);
  });
  pdfHalaman.forEach((f, i) => {
    const baris = e_('div', 'flex items-center gap-2 bg-rose-50 p-2 rounded-lg border border-rose-200');
    const ic = document.createElement('i'); ic.className = 'fas fa-file-pdf text-rose-500 px-1';
    baris.appendChild(ic);
    baris.appendChild(e_('span', 'flex-1 text-xs truncate', f.nama + ' (' + f.halaman.length + ' hlm)'));
    baris.appendChild(butang('text-rose-500 hover:text-rose-700 px-2', 'fas fa-trash', 'Buang', () => {
      pdfHalaman.splice(i, 1); lukisHalamanPdf(); lukisSenaraiLampiran();
    }));
    l.appendChild(baris);
  });
}

/**
 * Jana PDF dari #pdfContent.
 *
 * Kelas .menjana dipasang sepanjang rakaman supaya:
 *   - setiap muka TEPAT 210 x 297mm dan tiada margin antara muka
 *     (kalau tidak, potongan muka hanyut dan tinggal jalur putih di bawah)
 *   - lebar dikunci 210mm, jadi telefon menghasilkan PDF yang SAMA dengan
 *     komputer walaupun skrinnya jauh lebih sempit
 *
 * windowWidth diberi nilai sebenar elemen supaya html2canvas tidak cuba
 * mengukur semula ikut lebar tetingkap peranti.
 */
async function janaBlobPdf() {
  const bekas = $('pdfContent');
  const induk = bekas.parentNode;
  const seterusnya = bekas.nextSibling;
  const gulungAsal = window.scrollY;

  // Pindahkan blok dokumen ke hos di penjuru kiri atas. Tanpa ini, kedudukan
  // asalnya di dalam grid dua lajur menyebabkan html2canvas merakam dari
  // koordinat yang salah dan kandungan keluar terpotong di tepi kiri.
  let muka = [];
  const hos = document.createElement('div');
  hos.id = 'hosJana';
  document.body.appendChild(hos);
  hos.appendChild(bekas);
  bekas.classList.add('menjana');
  window.scrollTo(0, 0);

  try {
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    // html2pdf memotong kanvas setiap (lebar x 297/210) piksel. Kalau tinggi
    // muka kita tersasar walau 0.1px, lebihan itu menjadi satu muka surat
    // KOSONG di hujung PDF. Jadi tinggi setiap muka dikunci kepada nilai
    // potongan itu sendiri, tolak sedikit supaya tidak pernah melimpah.
    // (Nilai -0.25 ini SENGAJA dikekalkan kecil — dibuktikan menaikkannya
    // untuk cuba elak isu "1 muka jadi 2" di bawah menconteng sempadan
    // muka pada dokumen BERBILANG muka. Fix isu itu dibuat selepas
    // penjanaan kanvas sebaliknya — lihat pangkasSisaBundar().)
    const lebarPx = bekas.getBoundingClientRect().width || 794;
    const tinggiMuka = (lebarPx * 297 / 210) - 0.25;
    muka = Array.prototype.slice.call(bekas.querySelectorAll('.a4-page'));
    muka.forEach(m => {
      m.style.height = tinggiMuka + 'px';
      m.style.minHeight = tinggiMuka + 'px';
      m.style.maxHeight = tinggiMuka + 'px';
    });
    await new Promise(r => requestAnimationFrame(r));

    // Kanvas skala 2 pada telefon lama boleh kehabisan memori. Skala
    // diturunkan bila peranti kecil, tetapi lebar dokumen kekal 210mm —
    // jadi susun aturnya identikal, cuma resolusinya sedikit lebih rendah.
    const skala = (window.innerWidth < 700 || (navigator.deviceMemory || 8) <= 4) ? 1.5 : 2;

    const pilihan = {
      margin: 0,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: skala, useCORS: true, scrollX: 0, scrollY: 0, letterRendering: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };
    return await html2pdf().set(pilihan).from(bekas).toCanvas().then(function pangkasSisaBundar() {
      // v2.10.1 — pepijat "1 muka jadi 2": walaupun tinggi setiap .a4-page
      // dikunci di atas, html2canvas kadang membundarkan tinggi KANVAS
      // SEBENAR ke atas 1-2px berbanding tinggi satu muka yang legacy
      // pagebreak slicer html2pdf sendiri kira (canvas.width * 297/210,
      // Math.floor) — cukup untuk mencipta SATU muka PDF tambahan yang
      // hampir kosong, paling ketara bila laporan satu-muka (Kotak/Poster)
      // TIADA lampiran PDF (jadi tiada muka lain untuk "menyerap" hingar
      // pembundaran itu). Cuba elakkan dengan menambah potongan tinggiMuka
      // di atas terbukti RAPUH — nilai yang betul untuk 1 muka menconteng
      // sempadan muka pada dokumen BERBILANG muka pula. Jadi dibuang di
      // SINI sebaliknya: pangkas terus baki bundar yang SANGAT KECIL
      // (<=8px kanvas, jauh lebih nipis daripada apa-apa kandungan
      // sebenar — malah satu baris teks pun jauh lebih tinggi) daripada
      // kanvas akhir sebelum ia dihiris ke muka PDF. Muka yang GENUINELY
      // hampir penuh (baki besar, kandungan sebenar) tidak disentuh.
      const kanvas = this.prop.canvas;
      const pxMuka = Math.floor(kanvas.width * (297 / 210));
      const mukaPenuh = Math.floor(kanvas.height / pxMuka);
      const sisa = kanvas.height - mukaPenuh * pxMuka;
      if (mukaPenuh >= 1 && sisa > 0 && sisa <= 8) {
        const dipangkas = document.createElement('canvas');
        dipangkas.width = kanvas.width;
        dipangkas.height = mukaPenuh * pxMuka;
        dipangkas.getContext('2d').drawImage(kanvas, 0, 0);
        this.prop.canvas = dipangkas;
      }
    }).toPdf().outputPdf('blob');
  } finally {
    muka.forEach(m => { m.style.height = ''; m.style.minHeight = ''; m.style.maxHeight = ''; });
    bekas.classList.remove('menjana');
    induk.insertBefore(bekas, seterusnya);
    hos.remove();
    window.scrollTo(0, gulungAsal);
  }
}

function blobKeBase64(blob) {
  return new Promise((selesai, gagal) => {
    const r = new FileReader();
    r.onloadend = () => selesai(String(r.result).split(',')[1]);
    r.onerror = gagal;
    r.readAsDataURL(blob);
  });
}

// =====================================================================
// Eksport
// =====================================================================
export {
  SLOT_TTD, SUSUN_GAMBAR, GAYA_LAPORAN, WARNA_KERTAS, MEDAN_SERTAKAN, LOGO_FOOTER_SLOT,
  slotDipilih, tarikhDMY, sertakanMedan, logoFooterDipilih, lukisPilihanLogoFooter,
  lukisPratonton, binaKawalanRupa, pakaiDasarPdf, tambahFail, lukisHalamanPdf,
  lukisSenaraiLampiran, kecilkanImej, janaBlobPdf, blobKeBase64, isiLogoKecil, e_
};
