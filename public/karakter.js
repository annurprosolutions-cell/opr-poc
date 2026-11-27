// Modul e-Karakter (Fasa 1): Panduan Mula Pantas (S-10) dan Setup (S-08) untuk admin.
// Semua teks pengguna melalui el()/textContent. Server menguatkuasa akses; UI hanya memudahkan.
import { $, el, api, mesej } from '/app.js';

let K = null;          // { A, overlay, bukaOpr(tab) }
let S = null;          // data /karakter/setup
let subSemasa = 'kelas';
let draf = {};         // salinan boleh diedit bagi setiap senarai dan pemetaan

const pesan = (jenis, teks) => mesej($('mesejKarakter'), jenis, teks);
const kosongkan = (n) => { n.textContent = ''; return n; };

export async function mula(konteks) {
  K = konteks;
  const bekas = kosongkan($('appKarakter'));
  bekas.append(
    el('nav', { id: 'tabKarakter', class: 'tab', role: 'tablist' }),
    el('div', { id: 'mesejKarakter' }),
    el('section', { id: 'krkPanduan', class: 'kad krk-pane' }),
    el('section', { id: 'krkSetup', class: 'kad krk-pane tersembunyi' })
  );
  const tabs = [['Panduan', 'Panduan Mula'], ['Setup', 'Setup']];
  tabs.forEach(([k, label], i) => $('tabKarakter').append(el('button', { type: 'button', role: 'tab', 'data-krk': k,
    'aria-selected': String(i === 0), text: label, onclick: () => bukaTab(k) })));
  await muat(true);
  bukaTab('Panduan');
}

async function muat(pertama) {
  if (pertama) K.overlay(true, 'Menyediakan e-Karakter untuk sekolah anda...');
  try {
    const r = await api(K.A('/karakter/setup'));
    if (!r.ok) { pesan('bahaya', r.ralat || 'Tidak dapat memuatkan e-Karakter.'); return false; }
    S = r;
    draf = {
      kelas: S.senarai.kelas.map(x => ({ ...x })),
      subjek: S.senarai.subjek.map(x => ({ ...x })),
      teras: S.senarai.teras.map(x => ({ ...x })),
      pemetaan: S.pemetaan.map(x => ({ ...x }))
    };
    return true;
  } finally { if (pertama) K.overlay(false); }
}

function bukaTab(k) {
  document.querySelectorAll('#tabKarakter button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.krk === k)));
  $('krkPanduan').classList.toggle('tersembunyi', k !== 'Panduan');
  $('krkSetup').classList.toggle('tersembunyi', k !== 'Setup');
  if (!S) return;
  if (k === 'Panduan') paparPanduan(); else paparSetup();
}

// ====================================================================== S-10 Panduan Mula Pantas
function paparPanduan() {
  const b = kosongkan($('krkPanduan'));
  const siap = S.panduan.filter(x => x.siap).length;
  b.append(el('h2', { text: 'Panduan mula pantas' }),
    el('p', { class: 'redup', text: 'Lengkapkan langkah di bawah sebelum guru mula menghantar laporan e-Karakter. ' + siap + ' daripada ' + S.panduan.length + ' langkah siap.' }));
  const ol = el('ol', { class: 'krk-langkah' });
  S.panduan.forEach((x, i) => {
    const buka = x.kod === 'guru'
      ? el('button', { type: 'button', class: 'butang sekunder', text: 'Buka tab Guru', onclick: () => K.bukaOpr('Guru') })
      : el('button', { type: 'button', class: 'butang sekunder', text: 'Buka', onclick: () => { subSemasa = x.kod; bukaTab('Setup'); } });
    ol.append(el('li', { class: 'krk-langkah-item' + (x.siap ? ' siap' : ''), 'data-langkah': x.kod },
      el('span', { class: 'krk-tanda', 'aria-hidden': 'true', text: x.siap ? '✓' : String(i + 1) }),
      el('div', { class: 'krk-langkah-teks' },
        el('b', { text: x.tajuk + (x.pilihan ? ' (pilihan)' : '') }),
        el('span', { class: 'sr-only', text: x.siap ? ' Siap.' : ' Belum siap.' }),
        el('div', { class: 'redup kecil', text: x.nota })),
      buka));
  });
  b.append(ol, el('p', { class: 'redup kecil ruang-atas', text: 'Senarai guru dikongsi dengan modul OPR. Guru yang dinyahaktif dalam tab Guru juga hilang akses kepada e-Karakter.' }));
}

// ====================================================================== S-08 Setup
const SUB = [['kelas', 'Kelas'], ['subjek', 'Mata Pelajaran'], ['teras', 'Teras'], ['gurukelas', 'Guru Kelas'], ['tetapan', 'Tetapan'], ['struktur', 'Struktur']];

function paparSetup() {
  const b = kosongkan($('krkSetup'));
  const nav = el('nav', { id: 'subKarakter', class: 'tab tab-kecil', role: 'tablist' });
  SUB.forEach(([k, label]) => nav.append(el('button', { type: 'button', role: 'tab', 'data-sub': k, 'aria-selected': String(k === subSemasa),
    text: label, onclick: () => { subSemasa = k; paparSetup(); } })));
  b.append(el('h2', { text: 'Setup e-Karakter' }), nav, el('div', { id: 'isiSub', class: 'ruang-atas' }));
  const isi = $('isiSub');
  if (subSemasa === 'kelas') editorSenarai(isi, 'kelas', 'KARAKTER_KELAS', 'kelas', 'Contoh: 5 Ibnu Sina');
  else if (subSemasa === 'subjek') editorSenarai(isi, 'subjek', 'KARAKTER_SUBJEK', 'mata pelajaran', 'Contoh: Bahasa Melayu');
  else if (subSemasa === 'teras') editorSenarai(isi, 'teras', 'KARAKTER_TERAS', 'elemen teras', 'Contoh: Berintegriti', true);
  else if (subSemasa === 'gurukelas') editorGuruKelas(isi);
  else if (subSemasa === 'tetapan') editorTetapan(isi);
  else editorStruktur(isi);
}

// ---------------------------------------------------------------- senarai (kelas, subjek, teras)
function editorSenarai(isi, kunci, kategori, nama, contoh, teras = false) {
  const item = draf[kunci];
  const nota = teras
    ? 'Teras dipaparkan sebagai kad dalam borang, dashboard dan PDF. Maksimum 12. Laporan lama kekal dengan nama teras asal.'
    : 'Guru hanya nampak item yang aktif. Nyahaktif item yang tidak digunakan lagi; laporan lama kekal dengan nama asal.';
  isi.append(el('p', { class: 'redup kecil', text: nota }));
  const senarai = el('div', { class: 'krk-senarai', id: 'senaraiKrk' });
  const lukis = () => {
    kosongkan(senarai);
    if (!item.length) senarai.append(el('p', { class: 'redup', text: 'Senarai kosong.' }));
    item.forEach((x, i) => {
      const input = el('input', { type: 'text', maxlength: teras ? '40' : '60', 'aria-label': 'Nama ' + nama + ' ' + (i + 1) });
      input.value = x.nilai;
      input.oninput = () => { x.nilai = input.value; };
      const aktif = el('input', { type: 'checkbox', 'aria-label': 'Aktif' });
      aktif.checked = x.aktif !== false;
      aktif.onchange = () => { x.aktif = aktif.checked; baris.classList.toggle('tidak-aktif', !aktif.checked); };
      const naik = el('button', { type: 'button', class: 'butang sekunder kecil-butang', 'aria-label': 'Naik', text: '↑',
        onclick: () => { if (i > 0) { [item[i - 1], item[i]] = [item[i], item[i - 1]]; lukis(); } } });
      const turun = el('button', { type: 'button', class: 'butang sekunder kecil-butang', 'aria-label': 'Turun', text: '↓',
        onclick: () => { if (i < item.length - 1) { [item[i + 1], item[i]] = [item[i], item[i + 1]]; lukis(); } } });
      const buang = el('button', { type: 'button', class: 'butang bahaya kecil-butang', 'aria-label': 'Buang ' + x.nilai, text: '×',
        onclick: () => { item.splice(i, 1); lukis(); } });
      const baris = el('div', { class: 'krk-baris' + (x.aktif === false ? ' tidak-aktif' : '') },
        input, el('label', { class: 'krk-aktif' }, aktif, el('span', { text: 'Aktif' })), naik, turun, buang);
      if (teras) {
        const h = el('input', { type: 'text', maxlength: '200', placeholder: 'Huraian ringkas (pilihan)', 'aria-label': 'Huraian ' + x.nilai });
        h.value = x.huraian || '';
        h.oninput = () => { x.huraian = h.value; };
        baris.append(h);
        baris.classList.add('dengan-huraian');
      }
      senarai.append(baris);
    });
    $('bilKrk').textContent = item.length + ' ' + nama + ', ' + item.filter(x => x.aktif !== false).length + ' aktif';
  };
  const tampal = el('textarea', { id: 'tampalKrk', rows: '4', placeholder: 'Tampal senarai ' + nama + ', satu baris satu item. ' + contoh });
  isi.append(el('p', { id: 'bilKrk', class: 'kecil redup' }), senarai,
    el('label', { for: 'tampalKrk', text: 'Tambah ' + nama + ' (tampal dari Excel atau taip, satu baris satu item)' }), tampal,
    el('p', { class: 'baris-butang' },
      el('button', { type: 'button', class: 'butang sekunder', id: 'tambahKrk', text: 'Tambah ke senarai', onclick: () => {
        const ada = new Set(item.map(x => x.nilai.trim().toLowerCase()));
        let n = 0;
        tampal.value.split(/\r?\n/).map(x => x.split('\t')[0].trim()).filter(Boolean).forEach(v => {
          if (ada.has(v.toLowerCase())) return;
          ada.add(v.toLowerCase()); item.push({ nilai: v, aktif: true, huraian: '' }); n++;
        });
        tampal.value = ''; lukis();
        pesan(n ? 'ok' : 'amaran', n ? n + ' ' + nama + ' ditambah. Tekan Simpan untuk menyimpan.' : 'Tiada item baharu (kosong atau sudah ada).');
      } }),
      teras ? '' : el('button', { type: 'button', class: 'butang sekunder', text: 'Kosongkan senarai', onclick: () => {
        if (confirm('Buang semua ' + nama + ' daripada senarai ini? (Belum disimpan sehingga anda tekan Simpan.)')) { item.length = 0; lukis(); }
      } })),
    el('p', { class: 'ruang-atas' }, el('button', { type: 'button', class: 'butang', id: 'simpanKrk', text: 'Simpan senarai ' + nama, onclick: async () => {
      const badan = { kategori, item: item.map(x => ({ nilai: x.nilai, aktif: x.aktif !== false })) };
      if (teras) badan.huraian = Object.fromEntries(item.map(x => [x.nilai.trim(), x.huraian || '']));
      await simpan('/karakter/senarai', badan, (r) => 'Senarai ' + nama + ' disimpan (' + r.bilangan + ' item' + (r.pendua ? ', ' + r.pendua + ' pendua dibuang' : '') + ').');
    } })));
  lukis();
}

// ---------------------------------------------------------------- guru kelas
function editorGuruKelas(isi) {
  const kelasAktif = draf.kelas.filter(x => x.aktif !== false).map(x => x.nilai);
  const namaGuru = new Map(S.guru.map(x => [x.email, x.nama || x.email]));
  isi.append(el('p', { class: 'redup kecil', text: 'Guru kelas boleh melihat laporan semua guru bagi kelasnya (baca sahaja). Satu guru boleh pegang beberapa kelas, dan satu kelas boleh ada lebih daripada seorang guru kelas. Pilihan: boleh dilangkau.' }));
  if (S.yatim.length) {
    isi.append(el('div', { class: 'mesej amaran' }, el('b', { text: 'Pemetaan perlu disemak:' }),
      el('ul', {}, ...S.yatim.map(y => el('li', { text: y.kelas + ' → ' + (namaGuru.get(y.email) || y.email) + ': ' + y.sebab }))),
      el('div', { class: 'kecil', text: 'Pemetaan ini akan dibuang bila anda tekan Simpan.' })));
  }
  if (!kelasAktif.length) return isi.append(el('p', { text: 'Tiada kelas aktif. Lengkapkan senarai kelas dahulu.' }));
  if (S.guru.length <= 1) isi.append(el('div', { class: 'mesej amaran', text: 'Belum ada guru selain admin. Tambah guru dalam tab Guru modul OPR dahulu.' }));
  const jadual = el('div', { class: 'krk-gurukelas' });
  const lukis = () => {
    kosongkan(jadual);
    kelasAktif.forEach(kelas => {
      const dipeta = draf.pemetaan.filter(m => m.kelas === kelas);
      const cip = el('div', { class: 'krk-cip-bekas' }, ...dipeta.map(m => el('span', { class: 'krk-cip' },
        el('span', { text: namaGuru.get(m.email) || m.email }),
        el('button', { type: 'button', 'aria-label': 'Buang ' + (namaGuru.get(m.email) || m.email) + ' daripada ' + kelas, text: '×',
          onclick: () => { draf.pemetaan = draf.pemetaan.filter(x => !(x.kelas === kelas && x.email === m.email)); lukis(); } }))));
      if (!dipeta.length) cip.append(el('span', { class: 'redup kecil', text: 'Tiada guru kelas' }));
      const pilih = el('select', { 'aria-label': 'Tambah guru kelas untuk ' + kelas });
      pilih.append(el('option', { value: '', text: 'Tambah guru kelas...' }),
        ...S.guru.filter(gu => !dipeta.some(m => m.email === gu.email))
          .map(gu => el('option', { value: gu.email, text: (gu.nama ? gu.nama + ' (' + gu.email + ')' : gu.email) })));
      pilih.onchange = () => { if (pilih.value) { draf.pemetaan.push({ kelas, email: pilih.value }); lukis(); } };
      jadual.append(el('div', { class: 'item krk-gk-baris', 'data-kelas': kelas }, el('div', { class: 'tajuk', text: kelas }), cip, pilih));
    });
  };
  lukis();
  isi.append(jadual, el('p', { class: 'ruang-atas' }, el('button', { type: 'button', class: 'butang', id: 'simpanGuruKelas', text: 'Simpan guru kelas', onclick: async () => {
    const sah = new Set(kelasAktif), guruSah = new Set(S.guru.map(x => x.email));
    const pemetaan = draf.pemetaan.filter(m => sah.has(m.kelas) && guruSah.has(m.email));
    await simpan('/karakter/gurukelas', { pemetaan }, (r) => 'Guru kelas disimpan (' + r.bilangan + ' pemetaan).');
  } })));
}

// ---------------------------------------------------------------- tetapan (F-13)
const MEDAN_TETAPAN = [
  ['KRK_KOD_SEKOLAH', 'Kod sekolah', 'text', 'Contoh: BEA1234. Dipaparkan dalam PDF.'],
  ['KRK_TAJUK_DOKUMEN', 'Tajuk dokumen', 'text', ''],
  ['KRK_NAMA_PENGESAH', 'Nama pengesah', 'text', 'Contoh: Guru Besar atau Pengetua. Ruang "Disahkan oleh" dalam PDF.'],
  ['KRK_JAWATAN_PENGESAH', 'Jawatan pengesah', 'text', ''],
  ['KRK_WAJIB_TTD', 'Tandatangan guru wajib sebelum hantar?', ['TIDAK', 'YA'], ''],
  ['KRK_HAD_MUNDUR_HARI', 'Had mundur tarikh laporan (hari)', 'number', 'Guru tidak boleh memilih tarikh lebih awal daripada had ini. Admin tiada had.'],
  ['KRK_AKTIF', 'Modul e-Karakter untuk guru', ['YA', 'TIDAK'], 'TIDAK: guru tidak nampak modul ini. Admin tetap boleh membuat setup.']
];

function editorTetapan(isi) {
  const borang = el('form', { id: 'borangTetapanKrk', novalidate: '' });
  MEDAN_TETAPAN.forEach(([k, label, jenis, nota]) => {
    let input;
    if (Array.isArray(jenis)) {
      input = el('select', { id: 'krk_' + k, name: k });
      jenis.forEach(v => input.append(el('option', { value: v, text: k === 'KRK_AKTIF' ? (v === 'YA' ? 'Aktif' : 'Tidak aktif') : (v === 'YA' ? 'Ya' : 'Tidak') })));
    } else {
      input = el('input', { id: 'krk_' + k, name: k, type: jenis, ...(jenis === 'number' ? { min: '0', max: '366', step: '1' } : { maxlength: '150' }) });
    }
    input.value = S.tetapan[k] ?? '';
    borang.append(el('label', { for: 'krk_' + k, text: label }), input, nota ? el('p', { class: 'redup kecil', style: 'margin:4px 0 0', text: nota }) : '');
  });
  borang.append(el('p', { class: 'ruang-atas' }, el('button', { type: 'submit', class: 'butang', id: 'simpanTetapanKrk', text: 'Simpan tetapan' })));
  borang.onsubmit = async (ev) => {
    ev.preventDefault();
    const tetapan = Object.fromEntries(MEDAN_TETAPAN.map(([k]) => [k, $('krk_' + k).value]));
    await simpan('/karakter/tetapan', { tetapan }, () => 'Tetapan e-Karakter disimpan.');
  };
  isi.append(el('p', { class: 'redup kecil', text: 'Nama, alamat dan logo sekolah diambil daripada Tetapan modul OPR.' }), borang);
}

// ---------------------------------------------------------------- struktur
async function editorStruktur(isi) {
  const st = S.struktur;
  const tarikh = st.sediaPada ? new Date(st.sediaPada).toLocaleDateString('ms-MY', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';
  isi.append(el('p', { text: 'Versi struktur: ' + st.versiSkema + ' · disediakan pada ' + tarikh }),
    el('p', { class: 'baris-butang' },
      el('a', { class: 'butang sekunder', href: st.pautanSheet, target: '_blank', rel: 'noopener', text: 'Buka Google Sheet e-Karakter' }),
      el('a', { class: 'butang sekunder', href: st.pautanFolder, target: '_blank', rel: 'noopener', text: 'Buka folder e-Karakter' })),
    el('p', { class: 'redup kecil', text: 'Data e-Karakter disimpan dalam Google Sheet berasingan daripada OPR. Jangan tukar nama tab atau baris pertama (tajuk kolum).' }),
    el('div', { id: 'hasilStruktur' }),
    el('p', {}, el('button', { type: 'button', class: 'butang sekunder', id: 'pasangSemula', text: 'Semak / pasang semula struktur e-Karakter', onclick: async () => {
      K.overlay(true, 'Menyemak struktur...');
      try {
        const r = await api(K.A('/karakter/skema/pasang'), { method: 'POST', body: {} });
        if (!r.ok) return mesej($('hasilStruktur'), 'bahaya', r.ralat || 'Gagal.');
        mesej($('hasilStruktur'), 'ok', r.dibaiki.length || r.dicipta.length
          ? 'Dibaiki: ' + [...r.dicipta, ...r.dibaiki].join(', ') + '.' : 'Struktur lengkap. Tiada apa perlu dibaiki.');
        await muat(false);
      } finally { K.overlay(false); }
    } })));
}

// ---------------------------------------------------------------- simpan
async function simpan(laluan, badan, teksBerjaya) {
  K.overlay(true, 'Menyimpan...');
  try {
    const r = await api(K.A(laluan), { method: 'POST', body: badan });
    if (!r.ok) { pesan('bahaya', r.ralat || 'Gagal menyimpan.'); return; }
    await muat(false);
    paparSetup();
    pesan('ok', teksBerjaya(r));
  } catch (e) {
    pesan('bahaya', 'Rangkaian terputus. Perubahan belum disimpan; cuba lagi.');
  } finally { K.overlay(false); }
}
