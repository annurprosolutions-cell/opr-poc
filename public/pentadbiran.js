// Fungsi admin: dashboard, tetapan sekolah, logo, jenis laporan, senarai dropdown, semakan.
import { $, el, api, mesej } from '/app.js';
import { PROFIL_JENIS, SENARAI_JENIS, LABEL_SENARAI } from '/profil.js';
import { kecilkanImej } from '/dokumen.js';

let K = null;   // konteks dari sekolah.js: { A, getCfg, muatSemulaCfg }
export function pasang(konteks) { K = konteks; }

const tunjuk = (id, ya = true) => $(id).classList.toggle('tersembunyi', !ya);
const namaKategori = (k) => LABEL_SENARAI[k] || String(k).split('_').map(x => x.charAt(0) + x.slice(1).toLowerCase()).join(' ');

async function muatTurunBlob(laluan, namaLalai) {
  const res = await fetch(K.A(laluan), { credentials: 'same-origin' });
  if (!res.ok) throw new Error('Muat turun gagal (' + res.status + ').');
  const nama = ((res.headers.get('content-disposition') || '').match(/filename="([^"]+)"/) || [])[1] || namaLalai;
  const url = URL.createObjectURL(await res.blob());
  const a = el('a', { href: url, download: nama });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ====================================================================== dashboard
// Satu siri setiap carta: satu warna (--utama), tiada legenda, nilai sebagai teks.
function cartaBar(bekas, data, label = (k) => k, had = 10) {
  bekas.textContent = '';
  let baris = Object.entries(data).sort((a, b) => b[1] - a[1]);
  if (!baris.length) return bekas.append(el('p', { class: 'kosong-carta', text: 'Belum ada data.' }));
  if (baris.length > had) {
    const lain = baris.slice(had - 1).reduce((s, [, v]) => s + v, 0);
    baris = [...baris.slice(0, had - 1), ['__lain', lain]];
  }
  const maks = Math.max(...baris.map(([, v]) => v));
  baris.forEach(([k, v]) => {
    const nama = k === '__lain' ? 'Lain-lain' : label(k);
    bekas.append(el('div', { class: 'bar-baris', title: nama + ': ' + v + ' laporan' },
      el('span', { class: 'bar-label', text: nama }),
      el('span', { class: 'bar-trek' }, el('span', { class: 'bar-isi', style: 'display:block;width:' + Math.max(1, (v / maks) * 100) + '%' })),
      el('span', { class: 'bar-nilai', text: String(v) })));
  });
}

const BULAN = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];

function cartaBulan(data) {
  const kini = new Date();
  const bulan = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(kini.getFullYear(), kini.getMonth() - i, 1);
    const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    bulan.push({ k, nama: BULAN[d.getMonth()], penuh: BULAN[d.getMonth()] + ' ' + d.getFullYear(), v: data[k] || 0 });
  }
  const maks = Math.max(1, ...bulan.map(b => b.v));
  const c = $('cartaBulan'); c.textContent = '';
  bulan.forEach(b => c.append(el('div', { class: 'lajur', title: b.penuh + ': ' + b.v + ' laporan' },
    el('span', { class: 'lajur-nilai', text: b.v ? String(b.v) : '' }),
    el('span', { class: 'lajur-isi', style: b.v ? 'height:' + Math.max(2, (b.v / maks) * 100) + '%' : 'height:0;min-height:0' }))));
  c.setAttribute('aria-label', 'Laporan mengikut bulan: ' + bulan.map(b => b.penuh + ' ' + b.v).join(', '));
  const paksi = el('div', { class: 'lajur-paksi' }, ...bulan.map(b => el('span', { text: b.nama })));
  $('jadualBulan').textContent = '';
  $('jadualBulan').append(paksi);
}

export async function muatDashboard() {
  const j = $('jubin'); j.textContent = ''; j.append(el('p', { class: 'redup', text: 'Memuatkan...' }));
  const s = await api(K.A('/statistik'));
  j.textContent = '';
  if (!s.ok) return j.append(el('div', { class: 'mesej bahaya', text: s.ralat || 'Gagal memuatkan statistik.' }));
  [['Jumlah laporan', s.jumlah], ['Belum disemak', s.hantar], ['Telah disemak', s.disemak], ['Draf', s.draf],
    ['Murid terlibat', s.muridLelaki + s.muridPerempuan]]
    .forEach(([n, v]) => j.append(el('div', { class: 'jubin-item' }, el('div', { class: 'angka', text: String(v) }), el('div', { class: 'nama', text: n }))));
  const cfg = K.getCfg();
  cartaBar($('cartaJenis'), s.jenis, k => (cfg.jenis[k] && cfg.jenis[k].nama) || k);
  cartaBar($('cartaPeringkat'), s.peringkat);
  cartaBar($('cartaUnit'), s.unit);
  cartaBar($('cartaGuru'), s.guru);
  cartaBulan(s.bulan);
}

$('butangEksport').onclick = async () => {
  $('butangEksport').disabled = true;
  try { await muatTurunBlob('/eksport', 'OPR.csv'); } catch (e) { mesej($('mesej'), 'bahaya', e.message); }
  $('butangEksport').disabled = false;
};

// ====================================================================== tetapan
let T = null;   // respons /tetapan terakhir
const SUB = [['setIdentiti', 'Identiti'], ['setLogo', 'Logo'], ['setJenis', 'Jenis laporan'], ['setSenarai', 'Senarai']];

function bukaSub(id) {
  document.querySelectorAll('#subTetapan button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.sub === id)));
  document.querySelectorAll('.sub-tetapan').forEach(s => s.classList.add('tersembunyi'));
  tunjuk(id);
}

export async function muatTetapan() {
  const nav = $('subTetapan');
  if (!nav.children.length) {
    SUB.forEach(([id, nama], i) => nav.append(el('button', { type: 'button', 'data-sub': id, 'aria-selected': String(i === 0), text: nama, onclick: () => bukaSub(id) })));
  }
  mesej($('hasilTetapan'), 'amaran', 'Memuatkan tetapan...');
  T = await api(K.A('/tetapan'));
  if (!T.ok) return mesej($('hasilTetapan'), 'bahaya', T.ralat || 'Gagal memuatkan tetapan.');
  mesej($('hasilTetapan'), 'ok', '');
  document.querySelectorAll('#paneTetapan [data-kunci]').forEach(n => {
    const v = T.tetapan[n.dataset.kunci];
    if (v !== undefined) n.value = v || (n.type === 'color' ? '#ffffff' : n.value);
  });
  binaLogo(); binaJenis(); binaSenarai();
}

async function simpan(tetapan, mesejOk) {
  const r = await api(K.A('/tetapan'), { method: 'POST', body: { tetapan } });
  if (!r.ok) { mesej($('hasilTetapan'), 'bahaya', r.ralat || 'Gagal menyimpan.'); return false; }
  mesej($('hasilTetapan'), r.ditolak && r.ditolak.length ? 'amaran' : 'ok',
    (mesejOk || 'Tetapan disimpan.') + (r.ditolak && r.ditolak.length ? ' Tidak disimpan (nilai tidak sah): ' + r.ditolak.join(', ') : ''));
  await K.muatSemulaCfg();
  return true;
}

document.querySelectorAll('[data-simpan-tetapan]').forEach(b => {
  b.onclick = async () => {
    const t = {};
    $(b.dataset.simpanTetapan).querySelectorAll('[data-kunci]').forEach(n => { t[n.dataset.kunci] = n.value; });
    b.disabled = true; await simpan(t); b.disabled = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
});

// ---------------------------------------------------------------- logo
// Kecilkan dalam pelayar (seperti v2 sediakanLogo): PNG/WEBP kekal format
// supaya latar lutsinar tidak jadi hitam; JPEG hanya jalan terakhir.
async function sediakanLogo(fail) {
  const dataUrl = await new Promise((ok, gagal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = gagal; r.readAsDataURL(fail); });
  const kekal = fail.type === 'image/png' || fail.type === 'image/webp';
  for (const sisi of [360, 300, 240, 200, 160]) {
    const hasil = await kecilkanImej(dataUrl, sisi, 0.92, { format: kekal ? fail.type : 'image/jpeg' });
    const blob = await (await fetch(hasil)).blob();
    if (blob.size <= 150 * 1000) return { blob, ditukar: false };
  }
  const blob = await (await fetch(await kecilkanImej(dataUrl, 320, 0.85, { format: 'image/jpeg', latar: '#ffffff' }))).blob();
  return { blob, ditukar: kekal };
}

function binaLogo() {
  const bekas = $('slotLogo'); bekas.textContent = '';
  for (let n = 1; n <= 6; n++) {
    const id = T.logo[n];
    const input = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', 'aria-label': 'Fail logo ' + n });
    const kad = el('div', { class: 'logo-slot' },
      el('div', { class: 'baris-antara' },
        el('b', { text: n <= 2 ? 'Logo ' + n + (n === 1 ? ' (sekolah)' : ' (pilihan)') : 'Logo tambahan ' + n }),
        id ? el('img', { src: K.A('/logo/' + n + '?v=' + encodeURIComponent(id)), alt: 'Logo ' + n }) : el('span', { class: 'redup kecil', text: 'Tiada' })),
      n >= 3 ? el('input', { type: 'text', maxlength: '40', 'data-kunci': 'LOGO' + n + '_LABEL', value: T.tetapan['LOGO' + n + '_LABEL'] || ('Logo ' + n), 'aria-label': 'Label logo ' + n, class: 'ruang-kecil' }) : '',
      el('div', { class: 'ruang-kecil' }, input),
      el('div', { class: 'baris-butang' },
        el('button', { type: 'button', class: 'butang sekunder', text: 'Muat naik', onclick: () => naikLogo(n, input) }),
        id ? el('button', { type: 'button', class: 'butang bahaya', text: 'Buang', onclick: () => buangLogo(n) }) : ''));
    bekas.append(kad);
  }
}

async function naikLogo(n, input) {
  const f = input.files && input.files[0];
  if (!f) return mesej($('hasilTetapan'), 'amaran', 'Pilih fail logo dahulu.');
  if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return mesej($('hasilTetapan'), 'bahaya', 'Format logo mesti PNG, JPG atau WEBP.');
  mesej($('hasilTetapan'), 'amaran', 'Memuat naik logo...');
  try {
    const { blob, ditukar } = await sediakanLogo(f);
    const res = await fetch(K.A('/logo/' + n), { method: 'POST', credentials: 'same-origin', headers: { 'content-type': blob.type }, body: blob });
    const r = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(r.ralat || 'Muat naik gagal.');
    await K.muatSemulaCfg();
    await muatTetapan(); bukaSub('setLogo');
    mesej($('hasilTetapan'), ditukar ? 'amaran' : 'ok', ditukar
      ? 'Logo disimpan, tetapi ditukar kepada JPG berlatar putih kerana fail terlalu besar. Guna PNG yang lebih kecil untuk kekalkan latar lutsinar.'
      : 'Logo ' + n + ' disimpan dan terus dipakai dalam PDF.');
  } catch (e) { mesej($('hasilTetapan'), 'bahaya', e.message); }
}

async function buangLogo(n) {
  if (!confirm('Buang logo ' + n + '?')) return;
  const r = await api(K.A('/logo/' + n + '/padam'), { method: 'POST', body: {} });
  if (!r.ok) return mesej($('hasilTetapan'), 'bahaya', r.ralat || 'Gagal.');
  await K.muatSemulaCfg();
  await muatTetapan(); bukaSub('setLogo');
  mesej($('hasilTetapan'), 'ok', 'Logo ' + n + ' dibuang.');
}

// ---------------------------------------------------------------- jenis laporan
function binaJenis() {
  const bekas = $('kotakJenis'); bekas.textContent = '';
  const semuaKat = Object.keys(T.senarai).sort((a, b) => namaKategori(a).localeCompare(namaKategori(b), 'ms'));
  SENARAI_JENIS.forEach(kod => {
    const j = T.jenis[kod];
    const kat = String(j.kategori).split(',');
    const slot = String(j.slot).split(',');
    const medan = (nama, nilai, label, had) => el('div', {}, el('label', { text: label }), el('input', { type: 'text', 'data-j': nama, value: nilai || '', maxlength: String(had) }));
    bekas.append(el('div', { class: 'jenis-baris', 'data-jenis': kod },
      el('label', { class: 'cip', style: 'font-weight:700' }, el('input', { type: 'checkbox', 'data-j': 'aktif', ...(j.aktif ? { checked: '' } : {}) }), j.nama),
      el('p', { class: 'redup kecil', text: PROFIL_JENIS[kod].nota }),
      el('div', { class: 'grid-2' }, medan('nama', j.nama, 'Nama paparan', 60), medan('tajuk', j.tajuk, 'Tajuk dalam PDF', 160)),
      el('div', { class: 'grid-2' }, medan('penyemak', j.penyemak, 'Jawatan penyemak', 120), medan('pengesah', j.pengesah, 'Jawatan pengesah', 120)),
      el('label', { text: 'Ruang tandatangan lalai' }),
      el('div', {}, ...['SEDIA', 'SEMAK', 'SAH'].map(s => el('label', { class: 'cip' },
        el('input', { type: 'checkbox', 'data-slot': s, ...(slot.includes(s) ? { checked: '' } : {}) }),
        { SEDIA: 'Disediakan', SEMAK: 'Disemak', SAH: 'Disahkan' }[s]))),
      el('label', { text: 'Senarai untuk medan pertama' }),
      el('div', {}, ...semuaKat.map(k => el('label', { class: 'cip' },
        el('input', { type: 'checkbox', 'data-kat': k, ...(kat.includes(k) ? { checked: '' } : {}) }), namaKategori(k))))));
  });
  const sel = $('tJenisDefault'); sel.textContent = '';
  SENARAI_JENIS.forEach(k => sel.append(el('option', { value: k, text: T.jenis[k].nama })));
  sel.value = T.tetapan.JENIS_DEFAULT || 'KOKURIKULUM';
}

$('simpanJenis').onclick = async () => {
  const jenis = {};
  document.querySelectorAll('#kotakJenis [data-jenis]').forEach(b => {
    const v = (k) => b.querySelector('[data-j="' + k + '"]');
    jenis[b.dataset.jenis] = {
      aktif: v('aktif').checked, nama: v('nama').value, tajuk: v('tajuk').value,
      penyemak: v('penyemak').value, pengesah: v('pengesah').value,
      slot: [...b.querySelectorAll('[data-slot]:checked')].map(x => x.dataset.slot).join(','),
      kategori: [...b.querySelectorAll('[data-kat]:checked')].map(x => x.dataset.kat).join(',')
    };
  });
  if (!Object.values(jenis).some(j => j.aktif)) return mesej($('hasilTetapan'), 'bahaya', 'Sekurang-kurangnya satu jenis laporan mesti aktif.');
  const tanpa = Object.entries(jenis).filter(([, j]) => j.aktif && !j.kategori).map(([k]) => jenis[k].nama);
  if (tanpa.length) return mesej($('hasilTetapan'), 'bahaya', 'Pilih sekurang-kurangnya satu senarai untuk: ' + tanpa.join(', '));
  $('simpanJenis').disabled = true;
  if (await simpan({ JENIS_TETAPAN: jenis, JENIS_DEFAULT: $('tJenisDefault').value }, 'Jenis laporan disimpan.')) {
    const teks = $('hasilTetapan').textContent;   // muatTetapan() mengosongkan mesej; papar semula selepasnya
    await muatTetapan(); bukaSub('setJenis');
    mesej($('hasilTetapan'), 'ok', teks);
  }
  $('simpanJenis').disabled = false;
};

// ---------------------------------------------------------------- senarai dropdown
function binaSenarai() {
  const bekas = $('kotakSenarai'); bekas.textContent = '';
  const guna = (k) => SENARAI_JENIS.filter(j => String(T.jenis[j].kategori).split(',').includes(k)).map(j => T.jenis[j].nama);
  Object.keys(T.senarai).sort((a, b) => namaKategori(a).localeCompare(namaKategori(b), 'ms')).forEach(k => {
    const ta = el('textarea', { rows: '7', 'aria-label': namaKategori(k) });
    ta.value = T.senarai[k].join('\n');
    const g = guna(k);
    bekas.append(el('div', { class: 'item' },
      el('div', { class: 'atas' }, el('div', { class: 'tajuk', text: namaKategori(k) }), el('span', { class: 'redup kecil', text: T.senarai[k].length + ' item' })),
      el('div', { class: 'meta', text: k + (g.length ? ' · digunakan oleh ' + g.join(', ') : '') }),
      el('div', { class: 'ruang-kecil' }, ta),
      el('div', { class: 'aksi' },
        el('button', { type: 'button', class: 'butang sekunder', text: 'Simpan', onclick: () => simpanSenarai(k, ta.value) }),
        el('button', { type: 'button', class: 'butang bahaya', text: 'Padam senarai', onclick: () => padamSenarai(k) }))));
  });
}

async function simpanSenarai(kategori, teks) {
  const r = await api(K.A('/senarai'), { method: 'POST', body: { kategori, item: teks } });
  if (!r.ok) return mesej($('hasilTetapan'), 'bahaya', r.ralat || 'Gagal.');
  await K.muatSemulaCfg();
  await muatTetapan(); bukaSub('setSenarai');
  mesej($('hasilTetapan'), 'ok', namaKategori(r.kategori) + ' disimpan (' + r.bilangan + ' item).');
}

async function padamSenarai(kategori) {
  if (!confirm('Padam senarai ' + namaKategori(kategori) + '?')) return;
  const r = await api(K.A('/senarai/padam'), { method: 'POST', body: { kategori } });
  if (!r.ok) return mesej($('hasilTetapan'), 'bahaya', r.ralat || 'Gagal.');
  await K.muatSemulaCfg();
  await muatTetapan(); bukaSub('setSenarai');
  mesej($('hasilTetapan'), 'ok', 'Senarai dipadam.');
}

$('ciptaSenarai').onclick = () => {
  const kod = $('katBaruKod').value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  if (T.senarai[kod]) return mesej($('hasilTetapan'), 'amaran', 'Senarai ' + kod + ' sudah wujud. Sunting dalam kotaknya.');
  simpanSenarai(kod, $('katBaruItem').value).then(() => { $('katBaruKod').value = ''; $('katBaruItem').value = ''; });
};

// ====================================================================== semakan
// Panel dalam kad laporan: muat naik PDF bertandatangan, tanda disemak.
export function panelSemak(x, selesai) {
  const wajib = String(K.getCfg().tetapan.WAJIB_PDF_SEMAK || 'YA').toUpperCase() !== 'TIDAK';
  const input = el('input', { type: 'file', accept: 'application/pdf', 'aria-label': 'PDF bertandatangan' });
  const hasil = el('div');
  const jalan = async (denganFail) => {
    let pdfFileId;
    try {
      if (denganFail) {
        const f = input.files && input.files[0];
        if (!f) return mesej(hasil, 'amaran', 'Pilih fail PDF yang telah ditandatangan.');
        if (f.type !== 'application/pdf') return mesej(hasil, 'bahaya', 'Hanya fail PDF dibenarkan.');
        if (f.size > 20 * 1024 * 1024) return mesej(hasil, 'bahaya', 'Saiz fail melebihi 20MB. Imbas semula pada resolusi lebih rendah.');
        mesej(hasil, 'amaran', 'Memuat naik...');
        const res = await fetch(K.A('/fail?jenis=pdfsemak&nama=' + encodeURIComponent(f.name)), { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/pdf' }, body: f });
        const u = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(u.ralat || 'Muat naik gagal.');
        pdfFileId = u.fileId;
      }
      const r = await api(K.A('/laporan/' + encodeURIComponent(x.id) + '/semak'), { method: 'POST', body: { pdfFileId } });
      if (!r.ok) throw new Error(r.ralat || 'Gagal menanda disemak.');
      selesai();
    } catch (e) { mesej(hasil, 'bahaya', e.message); }
  };
  return el('div', { class: 'panel-semak' },
    el('p', { class: 'kecil', text: wajib
      ? 'Muat naik salinan PDF yang telah dicetak, ditandatangan dan diimbas.'
      : 'Muat naik salinan bertandatangan jika ada, atau terus tanda disemak.' }),
    input,
    el('div', { class: 'aksi' },
      el('button', { type: 'button', class: 'butang', text: 'Muat naik & tanda disemak', onclick: () => jalan(true) }),
      wajib ? '' : el('button', { type: 'button', class: 'butang sekunder', text: 'Tanda tanpa PDF', onclick: () => jalan(false) })),
    hasil);
}
