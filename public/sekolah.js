// Aplikasi sekolah: /s/<slug>. Peranan ditentukan oleh pelayan (tab Guru dalam Sheet).
// Mod demo dimuat DAHULU (import statik menunggu await peringkat atas dalam demo.js),
// supaya pintasan fetch sudah dipasang sebelum aplikasi membuat panggilan pertama.
import '/demo.js';
import { $, el, api, mesej, logKeluar } from '/app.js';
import { PROFIL_JENIS, SENARAI_JENIS, LABEL_SENARAI, STATUS_PAPAR } from '/profil.js';
import * as D from '/dokumen.js';
import * as P from '/pentadbiran.js';

const tunjuk = (id, ya = true) => $(id).classList.toggle('tersembunyi', !ya);
const slug = decodeURIComponent(location.pathname.split('/')[2] || '');
const A = (laluan) => '/api/s/' + encodeURIComponent(slug) + laluan;

let ME = null, CFG = null, jenisSemasa = 'KOKURIKULUM';

async function mulaSesi() {
  ME = await api(A('/me'));
  if (ME.status === 401) {
    $('butangLogin').href = '/auth/login?mode=guru&s=' + encodeURIComponent(slug);
    return tunjuk('perluLogin');
  }
  if (!ME.ok) return mesej($('mesej'), 'bahaya', ME.ralat || 'Tidak dapat memuatkan maklumat akaun.');

  paparLesen(ME);
  $('pengguna').append(el('span', { text: ME.email }),
    el('button', { class: 'butang sekunder', type: 'button', onclick: logKeluar, text: 'Keluar' }));

  if (ME.peranan === 'tiada' || ME.peranan === 'tidak_aktif') {
    $('tajukBukan').textContent = ME.peranan === 'tidak_aktif' ? 'Akaun dinyahaktifkan' : 'Akaun belum didaftarkan';
    $('teksBukan').textContent = ME.peranan === 'tidak_aktif'
      ? 'Akaun ' + ME.email + ' telah dinyahaktifkan oleh admin sekolah ini.'
      : 'Akaun ' + ME.email + ' belum didaftarkan dalam sekolah ini. Minta admin sekolah menambah emel anda, atau log keluar dan cuba akaun lain.';
    return tunjuk('bukanAhli');
  }

  if (ME.pemilik && (!ME.sedia || ME.statusToken === 'perlu_sambung')) {
    bina(['Drive']);
    paparDrive();
    return;
  }
  if (ME.belumSedia) return tunjuk('belumSediaGuru');

  CFG = await api(A('/config'));
  if (!CFG.ok) return mesej($('mesej'), 'bahaya', CFG.ralat || 'Tidak dapat memuatkan tetapan sekolah.');
  P.pasang({ A, getCfg: () => CFG, muatSemulaCfg });
  const tabs = ['Borang', 'Laporan'];
  if (ME.peranan === 'admin') tabs.push('Dashboard', 'Guru', 'Tetapan');
  if (ME.pemilik) tabs.push('Drive');
  bina(tabs);
  sediaBorang();
}

// ====================================================================== lesen
const tarikhDmy = (iso) => iso ? iso.split('-').reverse().join('/') : '';

// Notis ikut peraturan Annur Time Table: percubaan (info >7 hari, amaran <=7, segera <=3),
// berbayar (amaran <=14, segera <=3), tempoh ihsan (segera), tamat (kritikal).
function paparLesen(me) {
  const L = me.lesen, bekas = $('notisLesen');
  bekas.textContent = '';
  if (!L) return;
  const admin = me.peranan === 'admin';
  const hari = (n) => n === 0 ? 'hari ini' : n + ' hari lagi';
  let jenis = '', teks = '';
  if (L.reason === 'ok' && L.plan === 'percubaan') {
    jenis = L.daysLeft <= 3 ? 'bahaya' : L.daysLeft <= 7 ? 'amaran' : 'ok';
    teks = 'Tempoh percubaan percuma tamat ' + hari(L.daysLeft) + ' (' + tarikhDmy(L.expires) + ').';
    if (!admin && L.daysLeft > 3) return;
  } else if (L.reason === 'ok' && L.daysLeft !== null && L.daysLeft <= 14) {
    jenis = L.daysLeft <= 3 ? 'bahaya' : 'amaran';
    teks = 'Langganan sekolah tamat ' + hari(L.daysLeft) + ' (' + tarikhDmy(L.expires) + ').';
    if (!admin) return;
  } else if (L.reason === 'tamat-tempoh-ihsan') {
    jenis = 'bahaya';
    teks = 'Langganan sekolah tamat pada ' + tarikhDmy(L.expires) + '. Sistem masih boleh digunakan dalam tempoh ihsan; sila perbaharui segera.';
  } else if (!L.ok) {
    jenis = 'bahaya';
    teks = (L.reason === 'percubaan-tamat' ? 'Tempoh percubaan percuma telah tamat.' : 'Langganan sekolah telah tamat.')
      + ' Laporan sedia ada masih boleh dibuka dan dimuat turun. Data dalam Google Drive sekolah tidak dipadam.';
  } else return;

  const kotak = el('div', { class: 'mesej ' + jenis }, el('div', { text: teks }));
  if (admin && me.buyUrl) {
    kotak.append(el('p', { class: 'kecil', style: 'margin:8px 0', text: 'Semasa membayar, isi medan "E-mel Google untuk sistem" dengan: ' + (me.adminEmail || me.email) }),
      el('a', { class: 'butang', href: me.buyUrl, target: '_blank', rel: 'noopener', text: L.plan === 'percubaan' || L.reason === 'tiada' ? 'Langgan sekarang' : 'Perbaharui langganan' }));
  } else if (!admin && !L.ok) {
    kotak.append(el('p', { class: 'kecil', style: 'margin:6px 0 0', text: 'Sila maklumkan admin sekolah untuk memperbaharui langganan.' }));
  }
  bekas.append(kotak);
  if (!L.ok) document.body.classList.add('lesen-tamat');
}

// ====================================================================== tab
function bina(tabs) {
  tunjuk('aplikasi');
  $('utama').classList.add('lebar');
  const nav = $('tab'); nav.textContent = '';
  tabs.forEach((t, i) => nav.append(el('button', { type: 'button', role: 'tab', 'aria-selected': String(i === 0), 'data-tab': t,
    text: t === 'Borang' ? 'Borang OPR' : t, onclick: () => buka(t) })));
  buka(tabs[0]);
}

function buka(t) {
  document.querySelectorAll('#tab button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  document.querySelectorAll('.pane').forEach(p => p.classList.add('tersembunyi'));
  tunjuk('pane' + t);
  if (t === 'Laporan') muatLaporan();
  if (t === 'Guru') muatGuru();
  if (t === 'Dashboard') P.muatDashboard();
  if (t === 'Tetapan') P.muatTetapan();
  kemaskiniTerapung();
  if (t === 'Drive') paparDrive();
}

// ====================================================================== borang
// Pustaka PDF (besar) dimuat dari /vendor hanya bila diperlukan.
const skripDimuat = {};
function muatSkrip(src) {
  if (!skripDimuat[src]) skripDimuat[src] = new Promise((ok, gagal) => {
    const n = document.createElement('script');
    n.src = src; n.onload = ok; n.onerror = () => gagal(new Error('Gagal memuatkan ' + src));
    document.head.append(n);
  });
  return skripDimuat[src];
}
async function sediaPdfJs() {
  await muatSkrip('/vendor/pdf.min.js');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.js';
}
const sediaHtml2pdf = () => muatSkrip('/vendor/html2pdf.bundle.min.js');

function overlay(papar, teks) {
  tunjuk('overlay', papar);
  if (teks) $('overlayTeks').textContent = teks;
}

const isiSelect = (sel, item, kosong) => {
  const lama = sel.value;
  sel.textContent = '';
  sel.append(el('option', { value: '', text: kosong }));
  (item || []).forEach(v => sel.append(el('option', { value: v, text: v })));
  if (lama && [...sel.options].some(o => o.value === lama)) sel.value = lama;
};

// Pastikan nilai lama (mungkin sudah dibuang dari senarai) masih boleh dipapar semasa edit.
const pilih = (sel, nilai) => {
  if (!nilai) { sel.value = ''; return; }
  if (![...sel.options].some(o => o.value === nilai)) sel.append(el('option', { value: nilai, text: nilai }));
  sel.value = nilai;
};

function jenisAktif() {
  const a = SENARAI_JENIS.filter(k => CFG.jenis[k] && CFG.jenis[k].aktif);
  return a.length ? a : ['KOKURIKULUM'];
}

// Tetapan Sheet -> format CFG v2 yang digunakan enjin dokumen.
function cfgDokumen(t) {
  const c = {
    namaSekolah: t.NAMA_SEKOLAH || '', alamatSekolah: t.ALAMAT_SEKOLAH || '', namaSistem: t.NAMA_SISTEM || 'One Page Report',
    singkatan: t.SINGKATAN || 'OPR', tajukDokumen: t.TAJUK_DOKUMEN || t.NAMA_SISTEM || 'One Page Report',
    telefon: t.TELEFON || '', faks: t.FAKS || '', moto: t.MOTO || '', footerPdf: t.FOOTER_PDF || '',
    warna1: t.WARNA_1 || '#0f766e', warna2: t.WARNA_2 || '#312e81', warnaAksen: t.WARNA_AKSEN || '#f59e0b',
    warnaKertas: t.WARNA_KERTAS || '#fffbeb', susunGambar: t.SUSUN_GAMBAR || 'AUTO', gayaLaporan: t.GAYA_LAPORAN || 'KOTAK',
    wajibPdf: String(t.WAJIB_PDF).toUpperCase() === 'YA', logoFooterAlign: t.LOGO_FOOTER_ALIGN || 'TENGAH'
  };
  for (let i = 1; i <= 6; i++) {
    c['logo' + i] = (CFG.logo && CFG.logo[i]) ? A('/logo/' + i + '?v=' + encodeURIComponent(CFG.logo[i])) : '';
    if (i >= 3) c['logo' + i + 'Label'] = t['LOGO' + i + '_LABEL'] || ('Logo ' + i);
  }
  return c;
}

function pasangKepala(c) {
  const akar = $('pdfContent');
  akar.style.setProperty('--w1', c.warna1); akar.style.setProperty('--w2', c.warna2); akar.style.setProperty('--aksen', c.warnaAksen);
  const logo = (id, src) => { const n = $(id); if (!n) return; if (src) { n.src = src; n.classList.remove('hidden'); } else n.classList.add('hidden'); };
  logo('pvLogo1', c.logo1); logo('pvLogo2', c.logo2);
  $('pvTajukDokumen').textContent = c.tajukDokumen;
  $('pvSekolah').textContent = c.namaSekolah;
  $('pvAlamat').textContent = c.alamatSekolah;
  $('pvTelefon').textContent = [c.telefon && 'Tel: ' + c.telefon, c.faks && 'Faks: ' + c.faks].filter(Boolean).join('  |  ');
  $('pvMoto').textContent = c.moto ? '“' + c.moto + '”' : '';
  D.isiLogoKecil($('logoMukaDua'), c);
}

// <img> logo tanpa src (logo belum dimuat naik) menyebabkan html2canvas gagal memuatkan
// imej semasa menjana PDF (penolakan tidak ditangani). Beri imej lutsinar 1x1.
const IMEJ_KOSONG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// Terapkan konfigurasi sekolah (dipanggil semasa mula dan selepas admin mengubah tetapan).
function terapCfg() {
  document.querySelectorAll('#pdfContent img:not([src]), #pdfContent img[src=""]').forEach(n => { n.src = IMEJ_KOSONG; });
  const c = cfgDokumen(CFG.tetapan);
  D.setCfg(c);
  pasangKepala(c);
  D.lukisPilihanLogoFooter(c);
  const sel = $('fJenis'), dipilih = sel.value; sel.textContent = '';
  jenisAktif().forEach(k => sel.append(el('option', { value: k, text: CFG.jenis[k].nama })));
  $('teksConsent').textContent = CFG.tetapan.CONSENT_TEXT || 'Saya mengesahkan maklumat ini benar.';
  const tapis = $('tapisJenis'), tapisLama = tapis.value; tapis.textContent = '';
  tapis.append(el('option', { value: '', text: 'Semua jenis' }));
  jenisAktif().forEach(k => tapis.append(el('option', { value: k, text: CFG.jenis[k].nama })));
  if ([...tapis.options].some(o => o.value === tapisLama)) tapis.value = tapisLama;
  if (dipilih && jenisAktif().includes(dipilih)) pakaiJenis(dipilih, true);
}

async function muatSemulaCfg() {
  const baru = await api(A('/config'));
  if (!baru.ok) return;
  CFG = baru;
  terapCfg();
  D.lukisPratonton();
}

function sediaBorang() {
  D.setKait({
    overlay,
    toast: (jenis, teks) => mesej($('mesej'), jenis === 'success' ? 'ok' : 'amaran', teks),
    ralat: (teks) => mesej($('mesej'), 'bahaya', teks)
  });
  D.binaKawalanRupa();
  terapCfg();
  $('fJenis').onchange = () => pakaiJenis($('fJenis').value, false);
  $('tapisJenis').onchange = muatLaporan;
  sediaTerapung();
  let pemasa; $('cari').oninput = () => { clearTimeout(pemasa); pemasa = setTimeout(muatLaporan, 350); };

  // Setiap perubahan pada borang melukis semula pratonton
  const lukis = () => D.lukisPratonton();
  $('paneBorang').addEventListener('input', lukis);
  $('paneBorang').addEventListener('change', lukis);

  $('butangTambahFail').onclick = async () => {
    const f = $('failInput').files && $('failInput').files[0];
    if (f && f.type === 'application/pdf') {
      try { await sediaPdfJs(); } catch (e) { return mesej($('mesej'), 'bahaya', 'Tidak dapat memuatkan pembaca PDF. Semak sambungan internet.'); }
    }
    await D.tambahFail();
  };
  document.querySelectorAll('[data-hantar]').forEach(b => { b.onclick = () => hantar(b.dataset.hantar); });
  $('resetBorang').onclick = () => resetBorang();
  resetBorang();
}

function pakaiJenis(kod, kekal) {
  jenisSemasa = PROFIL_JENIS[kod] ? kod : 'KOKURIKULUM';
  $('fJenis').value = jenisSemasa;
  const p = PROFIL_JENIS[jenisSemasa], t = CFG.jenis[jenisSemasa];
  document.querySelectorAll('[data-label]').forEach(n => { n.textContent = p.label[n.dataset.label] || n.textContent; });
  // Label yang sama dalam pratonton (gaya Kotak dan Poster)
  Object.entries(p.label).forEach(([k, v]) => {
    ['pvLbl', 'psLbl'].forEach(pre => { const n = $(pre + k); if (n) n.textContent = v; });
  });
  if ($('pvLblTarikh')) $('pvLblTarikh').textContent = 'Tarikh';
  $('pvJenis').textContent = t.tajuk; $('psJenis').textContent = t.tajuk;
  $('notaJenis').textContent = p.nota;
  $('fTajuk').placeholder = p.petunjuk;

  const unit = $('fUnit'), lamaUnit = unit.value;
  unit.textContent = '';
  unit.append(el('option', { value: '', text: 'Pilih ' + p.label.Unit.toLowerCase() + '...' }));
  const kat = String(t.kategori || '').split(',').map(x => x.trim()).filter(Boolean);
  kat.forEach(k => {
    const item = CFG.senarai[k] || [];
    if (!item.length) return;
    const g = kat.length > 1 ? el('optgroup', { label: LABEL_SENARAI[k] || k }) : unit;
    item.forEach(v => g.append(el('option', { value: v, text: v })));
    if (g !== unit) unit.append(g);
  });
  if (kekal) pilih(unit, lamaUnit);

  isiSelect($('fAnjuran'), CFG.senarai.ANJURAN, 'Pilih penganjur...');
  isiSelect($('fPeringkat'), CFG.senarai[p.peringkat] || CFG.senarai.PERINGKAT, 'Pilih ' + p.label.Peringkat.toLowerCase() + '...');
  isiSelect($('fKaedah'), CFG.senarai.KAEDAH, 'Pilih kaedah...');

  if (!kekal) {
    $('fPenyemak').value = t.penyemak || '';
    $('fPengesah').value = t.pengesah || '';
    const slot = String(t.slot || 'SEDIA,SEMAK').split(',');
    D.SLOT_TTD.forEach(s => { $(s.kotak).checked = slot.includes(s.kod); });
  }
  D.lukisPratonton();
}

function resetBorang() {
  $('borang').reset();
  $('borang').id.value = '';
  $('fNama').value = ME.nama || '';
  D.MEDAN_SERTAKAN.forEach(m => { $(m.chk).checked = true; });
  D.LOGO_FOOTER_SLOT.forEach(n => { const c = $('tLogo' + n); if (c) c.checked = false; });
  const c = D.getCfg();
  $('fWarnaKertas').value = c.warnaKertas; $('fSusunGambar').value = c.susunGambar; $('fGayaLaporan').value = c.gayaLaporan;
  $('tJanaPdf').checked = true;
  $('fConsent').checked = false;
  D.kosongkanLampiran();
  D.lukisSenaraiLampiran(); D.lukisHalamanPdf(); D.pakaiDasarPdf();
  tunjuk('lencanaEdit', false); tunjuk('blokConsent');
  $('tajukBorang').textContent = 'Laporan baharu';
  const lalai = jenisAktif().includes(CFG.tetapan.JENIS_DEFAULT) ? CFG.tetapan.JENIS_DEFAULT : jenisAktif()[0];
  pakaiJenis(lalai, false);
}

// Medan yang guru untick "Sertakan" tidak dihantar (kekal kosong dalam Sheet), seperti v2.
function dataBorang() {
  const b = $('borang'), ada = (t) => D.sertakanMedan(t), v = (k) => (b[k] && b[k].value || '').trim();
  return {
    jenis: v('jenis'), tajuk: v('tajuk'), nama: v('nama'), penyemak: v('penyemak'), pengesah: v('pengesah'),
    unit: ada('tUnit') ? v('unit') : '', anjuran: ada('tAnjuran') ? v('anjuran') : '',
    peringkat: ada('tPeringkat') ? v('peringkat') : '', tarikhProgram: ada('tTarikh') ? v('tarikhProgram') : '',
    masa: ada('tMasa') ? v('masa') : '', tempat: ada('tTempat') ? v('tempat') : '',
    jumLelaki: ada('tKehadiran') ? v('jumLelaki') : '', jumPerempuan: ada('tKehadiran') ? v('jumPerempuan') : '',
    objektif: ada('tObjektif') ? v('objektif') : '', ucapanBertema: ada('tUcapan') ? v('ucapanBertema') : '',
    kaedah: ada('tKaedah') ? v('kaedah') : '', kekuatan: ada('tKekuatan') ? v('kekuatan') : '',
    penambahbaikan: ada('tImprove') ? v('penambahbaikan') : '', rumusan: ada('tRumusan') ? v('rumusan') : '',
    slotTtd: D.slotDipilih().map(s => s.kod).join(','),
    warnaKertas: $('fWarnaKertas').value, susunGambar: $('fSusunGambar').value, gayaLaporan: $('fGayaLaporan').value,
    logoFooter: D.logoFooterDipilih().join(',')
  };
}

async function muatNaik(jenis, blob, nama) {
  const res = await fetch(A('/fail?jenis=' + jenis + '&nama=' + encodeURIComponent(nama)), {
    method: 'POST', credentials: 'same-origin', headers: { 'content-type': blob.type }, body: blob
  });
  const r = await res.json().catch(() => ({}));
  if (!res.ok || !r.fileId) throw new Error(r.ralat || 'Muat naik gagal (' + res.status + ').');
  return r.fileId;
}

const dataUrlKeBlob = async (u) => (await fetch(u)).blob();

async function hantar(status) {
  const d = dataBorang();
  const id = $('borang').id.value;
  if (!d.tajuk) { mesej($('mesej'), 'bahaya', 'Sila isi ' + PROFIL_JENIS[jenisSemasa].label.Tajuk.toLowerCase() + '.'); return $('fTajuk').focus(); }
  if (!id && !$('fConsent').checked) { mesej($('mesej'), 'bahaya', 'Sila tanda kotak persetujuan notis PDPA.'); return $('fConsent').focus(); }
  const janaPdf = $('tJanaPdf').checked || D.getCfg().wajibPdf;
  document.querySelectorAll('[data-hantar]').forEach(b => { b.disabled = true; });
  try {
    const badan = { id: id || undefined, status, consent: $('fConsent').checked, data: d };
    if (janaPdf) {
      overlay(true, 'Menjana PDF...');
      await sediaHtml2pdf();
      const blob = await D.janaBlobPdf();
      const tarikh = (d.tarikhProgram || new Date().toISOString().slice(0, 10)).split('-').reverse().join('');
      const nama = (CFG.tetapan.PREFIX_FAIL || 'OPR') + '_' + d.tajuk.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 60) + '_' + tarikh + '.pdf';
      overlay(true, 'Memuat naik PDF...');
      badan.pdfFileId = await muatNaik('pdf', new Blob([blob], { type: 'application/pdf' }), nama);
      badan.pdfNama = nama;
    }
    // Gambar: yang sudah ada dalam Drive (dimuat semasa edit) guna ID sedia ada.
    const ids = [];
    for (let i = 0; i < D.imejBukti.length; i++) {
      const im = D.imejBukti[i];
      if (im.fileId) { ids.push(im.fileId); continue; }
      overlay(true, 'Memuat naik gambar ' + (i + 1) + '/' + D.imejBukti.length + '...');
      im.fileId = await muatNaik('lampiran', await dataUrlKeBlob(im.dataUrl), im.nama || ('gambar-' + (i + 1) + '.jpg'));
      ids.push(im.fileId);
    }
    badan.lampiranIds = ids;
    overlay(true, 'Menyimpan laporan...');
    const r = await api(A('/laporan'), { method: 'POST', body: badan });
    if (!r.ok) throw new Error(r.ralat || 'Gagal menyimpan laporan.');
    mesej($('mesej'), 'ok', (status === 'HANTAR' ? 'Laporan dihantar.' : 'Draf disimpan.') + (janaPdf ? ' PDF disimpan dalam Drive sekolah.' : ''));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    resetBorang();
  } catch (e) {
    mesej($('mesej'), 'bahaya', e.message || 'Gagal menyimpan laporan.');
  } finally {
    overlay(false);
    document.querySelectorAll('[data-hantar]').forEach(b => { b.disabled = false; });
  }
}

async function bacaFailSebagaiDataUrl(laporanId, fileId) {
  const res = await fetch(A('/laporan/' + encodeURIComponent(laporanId) + '/fail/' + encodeURIComponent(fileId)), { credentials: 'same-origin' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const blob = await res.blob();
  return await new Promise((ok) => { const r = new FileReader(); r.onloadend = () => ok(r.result); r.readAsDataURL(blob); });
}

async function editLaporan(id) {
  overlay(true, 'Memuatkan laporan...');
  try {
    const r = await api(A('/laporan/' + encodeURIComponent(id)));
    if (!r.ok) throw new Error(r.ralat || 'Tidak dapat membuka laporan.');
    const d = r.data;
    buka('Borang');
    resetBorang();
    pakaiJenis(d.jenis, false);
    const b = $('borang');
    b.id.value = d.id;
    ['tajuk', 'tarikhProgram', 'masa', 'tempat', 'jumLelaki', 'jumPerempuan', 'objektif', 'ucapanBertema',
      'kekuatan', 'penambahbaikan', 'rumusan', 'nama', 'penyemak', 'pengesah'].forEach(k => { if (b[k]) b[k].value = d[k] || ''; });
    pilih($('fUnit'), d.unit); pilih($('fAnjuran'), d.anjuran); pilih($('fPeringkat'), d.peringkat); pilih($('fKaedah'), d.kaedah);
    // "Sertakan" dianggar dari rekod: kosong bermakna tidak disertakan (seperti v2)
    const ada = (x) => !!String(x || '').trim();
    $('tUnit').checked = ada(d.unit); $('tAnjuran').checked = ada(d.anjuran); $('tPeringkat').checked = ada(d.peringkat);
    $('tTarikh').checked = ada(d.tarikhProgram); $('tMasa').checked = ada(d.masa); $('tTempat').checked = ada(d.tempat);
    $('tKehadiran').checked = ada(d.jumLelaki) || ada(d.jumPerempuan); $('tObjektif').checked = ada(d.objektif);
    $('tUcapan').checked = ada(d.ucapanBertema); $('tKaedah').checked = ada(d.kaedah); $('tKekuatan').checked = ada(d.kekuatan);
    $('tImprove').checked = ada(d.penambahbaikan); $('tRumusan').checked = ada(d.rumusan);
    const slot = String(d.slotTtd || '').split(',');
    if (d.slotTtd) D.SLOT_TTD.forEach(s => { $(s.kotak).checked = slot.includes(s.kod); });
    const c = D.getCfg();
    $('fWarnaKertas').value = d.warnaKertas || c.warnaKertas;
    $('fSusunGambar').value = d.susunGambar || c.susunGambar;
    $('fGayaLaporan').value = d.gayaLaporan || c.gayaLaporan;
    const logo = String(d.logoFooter || '').split(',');
    D.LOGO_FOOTER_SLOT.forEach(n => { const k = $('tLogo' + n); if (k) k.checked = logo.includes(String(n)); });
    // Gambar sedia ada dimuat semula dari Drive (ID dikekalkan supaya tidak dimuat naik semula)
    for (let i = 0; i < d.lampiranIds.length; i++) {
      overlay(true, 'Memuatkan gambar ' + (i + 1) + '/' + d.lampiranIds.length + '...');
      try {
        D.imejBukti.push({ nama: 'gambar-' + (i + 1) + '.jpg', dataUrl: await bacaFailSebagaiDataUrl(d.id, d.lampiranIds[i]), keterangan: '', fileId: d.lampiranIds[i] });
      } catch (e) { /* fail hilang dari Drive: langkau */ }
    }
    D.lukisSenaraiLampiran(); D.lukisHalamanPdf(); D.lukisPratonton();
    tunjuk('lencanaEdit'); tunjuk('blokConsent', false);
    $('tajukBorang').textContent = 'Edit laporan';
    mesej($('mesej'), 'ok', 'Laporan dimuatkan. Halaman PDF yang dilampirkan sebelum ini perlu dilampirkan semula jika masih diperlukan.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    mesej($('mesej'), 'bahaya', e.message);
  } finally { overlay(false); }
}

async function bukaPdf(x, jenis = 'asal') {
  overlay(true, 'Membuka PDF...');
  try {
    const r = await api(A('/laporan/' + encodeURIComponent(x.id)));
    const fid = jenis === 'disemak' ? r.data && r.data.pdfDisemakId : r.data && r.data.pdfFileId;
    if (!r.ok || !fid) throw new Error(r.ralat || 'Tiada PDF untuk laporan ini.');
    const res = await fetch(A('/laporan/' + encodeURIComponent(x.id) + '/fail/' + encodeURIComponent(fid)), { credentials: 'same-origin' });
    if (!res.ok) throw new Error('Tidak dapat membuka PDF.');
    const url = URL.createObjectURL(new Blob([await res.arrayBuffer()], { type: 'application/pdf' }));
    const a = el('a', { href: url, download: (jenis === 'disemak' ? 'Bertandatangan_' : '') + (r.data.pdfNama || 'laporan.pdf'), target: '_blank', rel: 'noopener' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) { mesej($('mesej'), 'bahaya', e.message); }
  finally { overlay(false); }
}

// ---------------------------------------------------------------- butang pratonton (telefon)
let pratontonNampak = false;
function kemaskiniTerapung() {
  const diBorang = !$('paneBorang').classList.contains('tersembunyi');
  tunjuk('butangPratonton', diBorang && !pratontonNampak);
}
function sediaTerapung() {
  $('butangPratonton').onclick = () => $('lajurPratonton').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('kembaliBorang').onclick = () => $('paneBorang').scrollIntoView({ behavior: 'smooth', block: 'start' });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((e) => { pratontonNampak = e.some(x => x.isIntersecting); kemaskiniTerapung(); }, { threshold: 0.05 })
      .observe($('pdfContent'));
  }
  kemaskiniTerapung();
}

// ====================================================================== senarai laporan
async function muatLaporan() {
  const bekas = $('senaraiLaporan');
  bekas.textContent = ''; bekas.append(el('p', { class: 'redup', text: 'Memuatkan...' }));
  const q = new URLSearchParams();
  if ($('tapisJenis').value) q.set('jenis', $('tapisJenis').value);
  if ($('cari').value.trim()) q.set('carian', $('cari').value.trim());
  const r = await api(A('/laporan?' + q));
  bekas.textContent = '';
  if (!r.ok) return bekas.append(el('div', { class: 'mesej bahaya', text: r.ralat || 'Gagal memuatkan.' }));
  $('tajukSenarai').textContent = r.admin ? 'Semua laporan (' + r.jumlah + ')' : 'Laporan saya (' + r.jumlah + ')';
  if (!r.data.length) return bekas.append(el('p', { class: 'redup', text: 'Tiada laporan.' }));
  r.data.forEach(x => {
    const [teks, kelas] = STATUS_PAPAR[x.status] || STATUS_PAPAR.SIMPAN;
    const tarikh = x.tarikhProgram ? x.tarikhProgram.split('-').reverse().join('/') : '';
    const boleh = r.admin || x.status !== 'TELAH DISEMAK';
    const aksi = el('div', { class: 'aksi' });
    if (x.adaPdf) aksi.append(el('button', { class: 'butang sekunder', type: 'button', text: 'PDF', onclick: () => bukaPdf(x) }));
    if (x.adaPdfDisemak) aksi.append(el('button', { class: 'butang sekunder', type: 'button', text: 'PDF bertandatangan', onclick: () => bukaPdf(x, 'disemak') }));
    if (r.admin && x.status === 'HANTAR') {
      const bekasSemak = el('div');
      aksi.append(el('button', { class: 'butang', type: 'button', text: 'Semak', onclick: () => {
        if (bekasSemak.firstChild) { bekasSemak.textContent = ''; return; }
        bekasSemak.append(P.panelSemak(x, () => { mesej($('mesej'), 'ok', 'Laporan "' + x.tajuk + '" ditanda telah disemak.'); muatLaporan(); }));
      } }));
      aksi._semak = bekasSemak;
    }
    if (boleh) {
      aksi.append(el('button', { class: 'butang sekunder', type: 'button', text: 'Edit', onclick: () => editLaporan(x.id) }));
      aksi.append(el('button', { class: 'butang bahaya', type: 'button', text: 'Padam', onclick: () => padam(x) }));
    }
    bekas.append(el('div', { class: 'item' },
      el('div', { class: 'atas' }, el('div', { class: 'tajuk', text: x.tajuk || '(tiada tajuk)' }), el('span', { class: 'pil ' + kelas, text: teks })),
      el('div', { class: 'meta', text: [CFG.jenis[x.jenis] ? CFG.jenis[x.jenis].nama : x.jenis, x.unit, tarikh, r.admin ? x.nama : ''].filter(Boolean).join(' · ') }),
      x.status === 'TELAH DISEMAK' && x.disemakOleh ? el('div', { class: 'meta', text: 'Disemak oleh ' + x.disemakOleh }) : '',
      aksi, aksi._semak || ''));
  });
}

async function padam(x) {
  if (!confirm('Padam laporan "' + (x.tajuk || '') + '"?')) return;
  const r = await api(A('/laporan/' + encodeURIComponent(x.id) + '/padam'), { method: 'POST', body: {} });
  if (!r.ok) return mesej($('mesej'), 'bahaya', r.ralat || 'Gagal memadam.');
  muatLaporan();
}

// ====================================================================== guru
async function muatGuru() {
  tunjuk('perananBaru', !!ME.pemilik);
  const bekas = $('senaraiGuru');
  bekas.textContent = ''; bekas.append(el('p', { class: 'redup', text: 'Memuatkan...' }));
  const r = await api(A('/guru'));
  bekas.textContent = '';
  if (!r.ok) return bekas.append(el('div', { class: 'mesej bahaya', text: r.ralat || 'Gagal memuatkan.' }));
  bekas.append(el('p', { class: 'redup kecil', text: r.guru.length + ' akaun' }));
  r.guru.forEach(gu => {
    const aksi = el('div', { class: 'aksi' });
    const bolehUbah = !gu.pemilik && gu.email !== ME.email && (ME.pemilik || gu.peranan !== 'admin');
    if (bolehUbah) {
      aksi.append(el('button', { class: 'butang sekunder', type: 'button', text: gu.aktif ? 'Nyahaktif' : 'Aktifkan',
        onclick: () => ubahGuru({ email: gu.email, aktif: !gu.aktif }) }));
      if (ME.pemilik) aksi.append(el('button', { class: 'butang sekunder', type: 'button',
        text: gu.peranan === 'admin' ? 'Jadikan guru' : 'Jadikan admin',
        onclick: () => ubahGuru({ email: gu.email, peranan: gu.peranan === 'admin' ? 'guru' : 'admin' }) }));
    }
    const lencana = gu.pemilik ? 'ADMIN UTAMA' : gu.peranan === 'admin' ? 'ADMIN' : '';
    bekas.append(el('div', { class: 'item' + (gu.aktif ? '' : ' tidak-aktif') },
      el('div', { class: 'atas' }, el('div', { class: 'tajuk', text: gu.nama || gu.email }),
        lencana ? el('span', { class: 'pil admin', text: lencana }) : (gu.aktif ? '' : el('span', { class: 'pil draf', text: 'TIDAK AKTIF' }))),
      el('div', { class: 'meta', text: gu.email }), aksi));
  });
}

async function ubahGuru(badan) {
  const r = await api(A('/guru/kemaskini'), { method: 'POST', body: badan });
  if (!r.ok) return mesej($('hasilGuru'), 'bahaya', r.ralat || 'Gagal mengemas kini.');
  mesej($('hasilGuru'), 'ok', 'Dikemas kini.');
  muatGuru();
}

$('tambahGuru').onclick = async () => {
  const teks = $('teksGuru').value;
  if (!teks.trim()) return mesej($('hasilGuru'), 'amaran', 'Tampal sekurang-kurangnya satu emel.');
  $('tambahGuru').disabled = true;
  const r = await api(A('/guru'), { method: 'POST', body: { teks, peranan: $('perananBaru').value } });
  $('tambahGuru').disabled = false;
  if (!r.ok) return mesej($('hasilGuru'), 'bahaya', r.ralat || 'Gagal menambah.');
  const abai = r.diabaikan.length ? ' ' + r.diabaikan.length + ' diabaikan: ' + r.diabaikan.map(x => x.teks + ' (' + x.sebab + ')').join('; ') : '';
  mesej($('hasilGuru'), r.diabaikan.length ? 'amaran' : 'ok', r.ditambah.length + ' guru ditambah.' + abai);
  if (r.ditambah.length) $('teksGuru').value = '';
  muatGuru();
};

// ====================================================================== drive (pemilik)
function paparDrive() {
  $('pautanGuru').textContent = location.origin + '/s/' + slug;
  tunjuk('belumSedia', !ME.sedia); tunjuk('sudahSedia', !!ME.sedia);
  if (ME.sedia) { $('pautanSheet').href = ME.pautanSheet; $('pautanFolder').href = ME.pautanFolder; }
  if (ME.statusToken === 'perlu_sambung') paparSambungSemula();
}

function paparSambungSemula() {
  $('hasilUji').textContent = '';
  $('hasilUji').append(el('div', { class: 'mesej amaran', text: 'Sambungan Google Drive admin telah tamat atau dibatalkan.' }),
    el('a', { class: 'butang', href: '/auth/login?mode=admin&s=' + encodeURIComponent(slug), text: 'Sambung semula Google Drive' }));
}

$('butangSedia').onclick = async () => {
  $('butangSedia').disabled = true;
  mesej($('hasilUji'), 'amaran', 'Mencipta folder dan Google Sheet dalam Drive anda...');
  const r = await api(A('/setup'), { method: 'POST' });
  $('butangSedia').disabled = false;
  if (r.ok) { mesej($('mesej'), 'ok', ''); location.reload(); }
  else if (r.perluSambung) paparSambungSemula();
  else mesej($('hasilUji'), 'bahaya', r.ralat || 'Penyediaan gagal. Cuba lagi.');
};

$('ujiDrive').onclick = async () => {
  $('ujiDrive').disabled = true;
  mesej($('hasilUji'), 'amaran', 'Menguji...');
  const r = await api(A('/health'), { method: 'POST' });
  $('ujiDrive').disabled = false;
  if (r.ok && r.tulis) mesej($('hasilUji'), 'ok', 'Berjaya. Annur OPR boleh menulis dan membaca Google Sheet sekolah ("' + r.namaDalamSheet + '").');
  else if (r.perluSambung) paparSambungSemula();
  else mesej($('hasilUji'), 'bahaya', r.ralat || 'Ujian gagal.');
};

// ====================================================================== mula
// Dipanggil di HUJUNG fail, selepas semua fungsi dan pemalar diisytiharkan.
async function mula() {
const sek = await api(A(''));
if (!sek.ok) {
  $('namaSekolah').textContent = 'Sekolah tidak dijumpai';
  mesej($('mesej'), 'amaran', 'Semak semula pautan yang diberi oleh admin sekolah anda.');
} else {
  document.title = sek.nama + ' | Annur OPR';
  $('namaSekolah').textContent = sek.nama;
  $('pautan').textContent = 'opr.annurpro.com/s/' + sek.slug;
  const q = new URLSearchParams(location.search);
  if (q.get('baru')) mesej($('mesej'), q.get('sedia') === '0' ? 'amaran' : 'ok', q.get('sedia') === '0'
    ? 'Sekolah berjaya didaftarkan, tetapi Google Drive belum siap disediakan. Buka tab "Drive" dan tekan "Sediakan Google Drive".'
    : 'Sekolah berjaya didaftarkan. Tambah guru dalam tab "Guru", kemudian kongsi pautan sekolah dengan mereka.');
  if (q.get('disambung')) mesej($('mesej'), 'ok', 'Google Drive berjaya disambung semula.');
  await mulaSesi();
}
}

mula();
