// Aplikasi sekolah: /s/<slug>. Peranan ditentukan oleh pelayan (tab Guru dalam Sheet).
import { $, el, api, mesej, logKeluar } from '/app.js';
import { PROFIL_JENIS, SENARAI_JENIS, LABEL_SENARAI, SLOT_TTD, STATUS_PAPAR } from '/profil.js';

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
  const tabs = ['Borang', 'Laporan'];
  if (ME.peranan === 'admin') tabs.push('Guru');
  if (ME.pemilik) tabs.push('Drive');
  bina(tabs);
  sediaBorang();
}

// ====================================================================== tab
function bina(tabs) {
  tunjuk('aplikasi');
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
  if (t === 'Drive') paparDrive();
}

// ====================================================================== borang
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

function sediaBorang() {
  const sel = $('fJenis'); sel.textContent = '';
  jenisAktif().forEach(k => sel.append(el('option', { value: k, text: CFG.jenis[k].nama })));
  sel.onchange = () => pakaiJenis(sel.value, false);
  $('teksConsent').textContent = CFG.tetapan.CONSENT_TEXT || 'Saya mengesahkan maklumat ini benar.';

  const slot = $('slotTtd'); slot.textContent = '';
  SLOT_TTD.forEach(s => slot.append(el('div', { class: 'slot' },
    el('input', { type: 'checkbox', id: 'slot' + s.kod, 'aria-label': s.label }),
    el('label', { for: 'slot' + s.kod, text: s.label, style: 'margin:0' }),
    el('span'), el('input', { type: 'text', name: s.medan, maxlength: '200', placeholder: s.label }))));

  const tapis = $('tapisJenis'); tapis.textContent = '';
  tapis.append(el('option', { value: '', text: 'Semua jenis' }));
  jenisAktif().forEach(k => tapis.append(el('option', { value: k, text: CFG.jenis[k].nama })));
  tapis.onchange = muatLaporan;
  let pemasa; $('cari').oninput = () => { clearTimeout(pemasa); pemasa = setTimeout(muatLaporan, 350); };

  document.querySelectorAll('[data-hantar]').forEach(b => { b.onclick = () => hantar(b.dataset.hantar); });
  $('resetBorang').onclick = () => resetBorang();
  resetBorang();
}

function pakaiJenis(kod, kekal) {
  jenisSemasa = PROFIL_JENIS[kod] ? kod : 'KOKURIKULUM';
  $('fJenis').value = jenisSemasa;
  const p = PROFIL_JENIS[jenisSemasa], t = CFG.jenis[jenisSemasa];
  document.querySelectorAll('[data-label]').forEach(n => { n.textContent = p.label[n.dataset.label] || n.textContent; });
  $('notaJenis').textContent = p.nota;
  $('fTajuk').placeholder = p.petunjuk;

  // Unit: kumpulan ikut kategori yang ditetapkan untuk jenis ini
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
    $('borang').penyemak.value = t.penyemak || '';
    $('borang').pengesah.value = t.pengesah || '';
    const slot = String(t.slot || 'SEDIA,SEMAK').split(',');
    SLOT_TTD.forEach(s => { $('slot' + s.kod).checked = slot.includes(s.kod); });
  }
}

function resetBorang() {
  $('borang').reset();
  $('borang').id.value = '';
  $('borang').nama.value = ME.nama || '';
  tunjuk('lencanaEdit', false); tunjuk('blokConsent');
  $('tajukBorang').textContent = 'Laporan baharu';
  const lalai = jenisAktif().includes(CFG.tetapan.JENIS_DEFAULT) ? CFG.tetapan.JENIS_DEFAULT : jenisAktif()[0];
  pakaiJenis(lalai, false);
}

function dataBorang() {
  const b = $('borang'), d = {};
  ['jenis', 'tajuk', 'unit', 'anjuran', 'peringkat', 'tarikhProgram', 'masa', 'tempat', 'jumLelaki', 'jumPerempuan',
    'objektif', 'ucapanBertema', 'kaedah', 'kekuatan', 'penambahbaikan', 'rumusan', 'nama', 'penyemak', 'pengesah']
    .forEach(k => { d[k] = (b[k] && b[k].value || '').trim(); });
  d.slotTtd = SLOT_TTD.filter(s => $('slot' + s.kod).checked).map(s => s.kod).join(',');
  return d;
}

async function hantar(status) {
  const d = dataBorang();
  const id = $('borang').id.value;
  if (!d.tajuk) { mesej($('mesej'), 'bahaya', 'Sila isi ' + PROFIL_JENIS[jenisSemasa].label.Tajuk.toLowerCase() + '.'); return $('fTajuk').focus(); }
  if (!id && !$('fConsent').checked) { mesej($('mesej'), 'bahaya', 'Sila tanda kotak persetujuan notis PDPA.'); return $('fConsent').focus(); }
  document.querySelectorAll('[data-hantar]').forEach(b => { b.disabled = true; });
  const r = await api(A('/laporan'), { method: 'POST', body: { id: id || undefined, status, consent: $('fConsent').checked, data: d } });
  document.querySelectorAll('[data-hantar]').forEach(b => { b.disabled = false; });
  if (!r.ok) return mesej($('mesej'), 'bahaya', r.ralat || 'Gagal menyimpan laporan.');
  mesej($('mesej'), 'ok', status === 'HANTAR' ? 'Laporan dihantar.' : 'Draf disimpan.');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  resetBorang();
}

async function editLaporan(id) {
  const r = await api(A('/laporan/' + encodeURIComponent(id)));
  if (!r.ok) return mesej($('mesej'), 'bahaya', r.ralat || 'Tidak dapat membuka laporan.');
  const d = r.data, b = $('borang');
  buka('Borang');
  b.reset();
  pakaiJenis(d.jenis, false);
  b.id.value = d.id;
  ['tajuk', 'tarikhProgram', 'masa', 'tempat', 'jumLelaki', 'jumPerempuan', 'objektif', 'ucapanBertema',
    'kekuatan', 'penambahbaikan', 'rumusan', 'nama', 'penyemak', 'pengesah'].forEach(k => { if (b[k]) b[k].value = d[k] || ''; });
  pilih($('fUnit'), d.unit); pilih($('fAnjuran'), d.anjuran); pilih($('fPeringkat'), d.peringkat); pilih($('fKaedah'), d.kaedah);
  const slot = String(d.slotTtd || '').split(',');
  SLOT_TTD.forEach(s => { $('slot' + s.kod).checked = slot.includes(s.kod); });
  tunjuk('lencanaEdit'); tunjuk('blokConsent', false);
  $('tajukBorang').textContent = 'Edit laporan';
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
    if (boleh) {
      aksi.append(el('button', { class: 'butang sekunder', type: 'button', text: 'Edit', onclick: () => editLaporan(x.id) }));
      aksi.append(el('button', { class: 'butang bahaya', type: 'button', text: 'Padam', onclick: () => padam(x) }));
    }
    bekas.append(el('div', { class: 'item' },
      el('div', { class: 'atas' }, el('div', { class: 'tajuk', text: x.tajuk || '(tiada tajuk)' }), el('span', { class: 'pil ' + kelas, text: teks })),
      el('div', { class: 'meta', text: [CFG.jenis[x.jenis] ? CFG.jenis[x.jenis].nama : x.jenis, x.unit, tarikh, r.admin ? x.nama : ''].filter(Boolean).join(' · ') }),
      aksi));
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
