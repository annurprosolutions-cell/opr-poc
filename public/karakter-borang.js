// e-Karakter Fasa 2: Borang (S-02) dan Laporan Saya (S-05 asas, S-06 butiran).
// Server mengesahkan semua input; semakan di sini hanya untuk mesej cepat.
import { $, el, api } from '/app.js';
import { kecilkanImej } from '/dokumen.js';

let K = null;          // { A, overlay, pesan, getCfg, slug, email }
let borang = null;     // keadaan borang semasa
let senarai = { skop: 'saya', halaman: 1, cari: '', kelas: '', teras: '' };

const MAKS_GAMBAR = 4;
const LAIN = '__lain__';
const kosongkan = (n) => { n.textContent = ''; return n; };
const tarikhDmy = (iso) => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '';

// Warna teras (DBD seksyen 2). Teras tambahan ikut urutan.
const WARNA_ASAL = { 'Penyayang': '#e11d48', 'Berdaya Tahan': '#d97706', 'Berupaya Memimpin': '#4f46e5', 'Warganegara Aktif': '#059669' };
const WARNA_TAMBAHAN = ['#0891b2', '#9333ea', '#db2777', '#65a30d', '#ea580c', '#0d9488', '#7c3aed', '#ca8a04'];
export function warnaTeras(nama) {
  if (WARNA_ASAL[nama]) return WARNA_ASAL[nama];
  const lain = (K.getCfg().teras || []).map(t => t.nama).filter(n => !WARNA_ASAL[n]);
  const i = lain.indexOf(nama);
  return WARNA_TAMBAHAN[(i < 0 ? 0 : i) % WARNA_TAMBAHAN.length];
}
const lencanaTeras = (n) => el('span', { class: 'krk-lencana', style: '--w:' + warnaTeras(n), text: n });

export function pasang(konteks) { K = konteks; }

// ====================================================================== draf setempat
const kunciDraf = () => 'krk.draf.' + K.slug + '.' + K.email;
function simpanDraf() {
  if (!borang || borang.id) return;   // tiada draf semasa mengedit laporan sedia ada
  try { localStorage.setItem(kunciDraf(), JSON.stringify({ data: bacaMedan(), pada: Date.now() })); } catch (e) { /* storan disekat */ }
}
function bacaDraf() { try { return JSON.parse(localStorage.getItem(kunciDraf()) || 'null'); } catch (e) { return null; } }
function buangDraf() { try { localStorage.removeItem(kunciDraf()); } catch (e) { /* storan disekat */ } }

// ====================================================================== borang
const masaKini = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

function borangKosong() {
  const C = K.getCfg();
  return { id: null, data: { tarikh: C.hariIni, masa: masaKini(), kelas: (C.guruKelas || [])[0] || '', subjek: '', teras: [], tajuk: '', catatan: '' },
    gambar: [], akuan: false };
}

export function paparBorang(bekas, mula) {
  if (mula) borang = mula;
  if (!borang) {
    borang = borangKosong();
    const d = bacaDraf();
    if (d && d.data) { Object.assign(borang.data, d.data); borang.drafDipulih = true; }
  }
  const C = K.getCfg();
  const b = kosongkan(bekas);
  b.append(el('div', { class: 'baris-antara' },
    el('h2', { text: borang.id ? 'Edit laporan karakter' : 'Laporan karakter baharu' }),
    borang.id ? el('button', { type: 'button', class: 'butang sekunder', text: 'Batal edit', onclick: () => { borang = null; paparBorang(bekas); } }) : ''));
  if (borang.id) b.append(el('p', { class: 'redup kecil', text: 'ID ' + borang.id + '. Menyimpan perubahan akan memadam tandatangan (jika ada); anda perlu tandatangan semula.' }));
  if (borang.drafDipulih) {
    b.append(el('div', { class: 'mesej ok kecil', text: 'Draf yang belum dihantar dipulihkan. Gambar tidak disimpan dalam draf; sila tambah semula.' }));
    borang.drafDipulih = false;
  }

  const f = el('form', { id: 'borangKrk', novalidate: '' });
  const dua = el('div', { class: 'grid-2' });
  const tarikh = el('input', { type: 'date', id: 'kTarikh', required: '', max: C.hariIni, ...(C.tarikhAwal ? { min: C.tarikhAwal } : {}) });
  tarikh.value = borang.data.tarikh;
  const masa = el('input', { type: 'time', id: 'kMasa' });
  masa.value = borang.data.masa;
  dua.append(el('div', {}, el('label', { for: 'kTarikh', text: 'Tarikh' }), tarikh), el('div', {}, el('label', { for: 'kMasa', text: 'Masa' }), masa));
  f.append(dua);

  f.append(...pilihDenganLain('kKelas', 'Kelas', C.kelas, borang.data.kelas, 'Taip nama kelas'),
    ...pilihDenganLain('kSubjek', 'Mata pelajaran', C.subjek, borang.data.subjek, 'Taip mata pelajaran'));

  f.append(el('label', { text: 'Guru pelaksana' }), el('p', { class: 'krk-papar', id: 'kGuru', text: C.nama }));

  // Elemen teras: kad boleh tanda (checkbox sebenar, boleh papan kekunci)
  const kad = el('fieldset', { class: 'krk-teras', id: 'kTeras' }, el('legend', { text: 'Elemen teras yang diterapkan' }));
  C.teras.forEach((t, i) => {
    const cb = el('input', { type: 'checkbox', id: 'kTeras' + i, value: t.nama, class: 'sr-only' });
    cb.checked = borang.data.teras.includes(t.nama);
    cb.onchange = simpanDraf;
    kad.append(el('label', { class: 'krk-teras-kad', for: 'kTeras' + i, style: '--w:' + warnaTeras(t.nama) }, cb,
      el('span', { class: 'krk-teras-tanda', 'aria-hidden': 'true' }),
      el('span', { class: 'krk-teras-teks' }, el('b', { text: t.nama }), t.huraian ? el('span', { class: 'kecil redup', text: t.huraian }) : '')));
  });
  f.append(kad);

  const tajuk = el('input', { type: 'text', id: 'kTajuk', maxlength: '150', required: '', placeholder: 'Contoh: Eksperimen berkumpulan tumbesaran pokok' });
  tajuk.value = borang.data.tajuk;
  const catatan = el('textarea', { id: 'kCatatan', rows: '6', maxlength: '3000', required: '', placeholder: 'Apa yang dilakukan, bagaimana elemen teras diterapkan, dan kesan kepada murid.' });
  catatan.value = borang.data.catatan;
  const kira = el('span', { class: 'kecil redup', id: 'kKira' });
  const kemaskiniKira = () => { kira.textContent = catatan.value.length + ' / 3000'; };
  catatan.addEventListener('input', kemaskiniKira); kemaskiniKira();
  f.append(el('label', { for: 'kTajuk', text: 'Tajuk aktiviti' }), tajuk,
    el('div', { class: 'medan-kepala' }, el('label', { for: 'kCatatan', text: 'Huraian aktiviti dan impak karakter' }),
      el('button', { type: 'button', class: 'pautan-butang', id: 'cadanganAyat', text: 'Cadangan ayat', onclick: cadanganAyat })),
    catatan, kira);

  // Gambar
  f.append(el('label', { for: 'kGambar', text: 'Gambar aktiviti (maksimum ' + MAKS_GAMBAR + ')' }),
    el('p', { class: 'redup kecil', style: 'margin:0 0 6px', text: 'Gambar dikecilkan secara automatik dan disimpan dalam Google Drive sekolah. Tiada pautan awam.' }));
  const inputGambar = el('input', { type: 'file', id: 'kGambar', accept: 'image/jpeg,image/png,image/webp', multiple: '' });
  inputGambar.onchange = () => tambahGambar(inputGambar);
  f.append(inputGambar, el('div', { id: 'kSenaraiGambar', class: 'krk-gambar' }),
    el('label', { class: 'semak-kotak', id: 'kBlokAkuan' }, (() => { const a = el('input', { type: 'checkbox', id: 'kAkuan' }); a.checked = borang.akuan; a.onchange = () => { borang.akuan = a.checked; }; return a; })(),
      el('span', { text: 'Saya mengesahkan kebenaran ibu bapa atau penjaga telah diperoleh bagi murid yang kelihatan dalam gambar, mengikut dasar sekolah.' })));

  f.append(el('div', { class: 'baris-butang ruang-atas krk-hantar' },
    el('button', { type: 'submit', class: 'butang', id: 'hantarKrk', text: borang.id ? 'Simpan perubahan' : 'Hantar laporan' }),
    borang.id ? '' : el('button', { type: 'button', class: 'butang sekunder', text: 'Kosongkan borang', onclick: () => {
      if (!confirm('Kosongkan borang ini?')) return;
      buangDraf(); borang = borangKosong(); paparBorang(bekas);
    } })));
  f.onsubmit = (ev) => { ev.preventDefault(); hantar(bekas); };
  f.addEventListener('input', simpanDraf);
  f.addEventListener('change', simpanDraf);
  b.append(f);
  lukisGambar();
}

// Select + pilihan "Lain-lain" yang membuka medan teks.
function pilihDenganLain(id, label, item, nilai, petunjuk) {
  const sel = el('select', { id, required: '' });
  sel.append(el('option', { value: '', text: 'Pilih ' + label.toLowerCase() + '...' }), ...item.map(v => el('option', { value: v, text: v })),
    el('option', { value: LAIN, text: 'Lain-lain (taip sendiri)' }));
  const teks = el('input', { type: 'text', id: id + 'Lain', maxlength: '60', placeholder: petunjuk, class: 'krk-lain', 'aria-label': label + ' (lain-lain)' });
  const lain = nilai && !item.includes(nilai);
  sel.value = lain ? LAIN : nilai;
  teks.value = lain ? nilai : '';
  teks.classList.toggle('tersembunyi', !lain);
  sel.onchange = () => { teks.classList.toggle('tersembunyi', sel.value !== LAIN); if (sel.value === LAIN) teks.focus(); };
  return [el('label', { for: id, text: label }), sel, teks];
}
const nilaiPilih = (id) => $(id).value === LAIN ? $(id + 'Lain').value.trim() : $(id).value;

function bacaMedan() {
  return { tarikh: $('kTarikh').value, masa: $('kMasa').value, kelas: nilaiPilih('kKelas'), subjek: nilaiPilih('kSubjek'),
    teras: [...document.querySelectorAll('#kTeras input:checked')].map(x => x.value),
    tajuk: $('kTajuk').value.trim(), catatan: $('kCatatan').value.trim() };
}

// ---------------------------------------------------------------- cadangan ayat (2.7)
const TEMPLAT = {
  'Penyayang': 'Murid {kelas} menunjukkan sikap prihatin dan hormat-menghormati semasa aktiviti {subjek}, termasuk membantu rakan yang memerlukan.',
  'Berdaya Tahan': 'Murid digalakkan terus mencuba walaupun menghadapi kesukaran dalam tugasan {subjek}, dan kebanyakan mereka menyelesaikannya dengan gigih.',
  'Berupaya Memimpin': 'Beberapa murid {kelas} mengetuai kumpulan, membahagikan tugas dan membimbing rakan sepanjang aktiviti.',
  'Warganegara Aktif': 'Murid mengaitkan pembelajaran {subjek} dengan tanggungjawab kepada komuniti dan mematuhi peraturan bilik darjah.'
};
function cadanganAyat() {
  const d = bacaMedan();
  if (!d.teras.length) return K.pesan('amaran', 'Pilih elemen teras dahulu untuk mendapatkan cadangan ayat.');
  const isi = (t) => t.replace(/\{kelas\}/g, d.kelas || 'kelas ini').replace(/\{subjek\}/g, d.subjek || 'mata pelajaran ini');
  const ayat = d.teras.map(t => isi(TEMPLAT[t] || 'Elemen ' + t + ' diterapkan melalui aktiviti {subjek} bersama murid {kelas}.')).join(' ');
  const c = $('kCatatan');
  c.value = (c.value.trim() ? c.value.trim() + '\n' : '') + ayat;
  c.dispatchEvent(new Event('input', { bubbles: true }));
  c.focus();
}

// ---------------------------------------------------------------- gambar
async function tambahGambar(input) {
  const fail = [...(input.files || [])];
  input.value = '';
  const ruang = MAKS_GAMBAR - borang.gambar.length;
  if (!ruang) return K.pesan('amaran', 'Maksimum ' + MAKS_GAMBAR + ' gambar.');
  if (fail.length > ruang) K.pesan('amaran', 'Hanya ' + ruang + ' gambar lagi boleh ditambah; selebihnya diabaikan.');
  for (const f of fail.slice(0, ruang)) {
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { K.pesan('amaran', f.name + ': hanya gambar JPG, PNG atau WEBP.'); continue; }
    const dataUrl = await new Promise((ok, gagal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = gagal; r.readAsDataURL(f); });
    const kecil = await kecilkanImej(dataUrl, 900, 0.8, { format: 'image/jpeg' });   // keputusan 8: mampat 900px
    borang.gambar.push({ src: kecil, dataUrl: kecil, kapsyen: '', nama: f.name });
  }
  lukisGambar();
}

function lukisGambar() {
  const s = $('kSenaraiGambar');
  if (!s) return;
  kosongkan(s);
  borang.gambar.forEach((x, i) => {
    const kap = el('input', { type: 'text', maxlength: '80', placeholder: 'Kapsyen (pilihan)', 'aria-label': 'Kapsyen gambar ' + (i + 1) });
    kap.value = x.kapsyen || '';
    kap.oninput = () => { x.kapsyen = kap.value; };
    s.append(el('div', { class: 'krk-gambar-item' }, el('img', { src: x.src, alt: 'Gambar ' + (i + 1) }), kap,
      el('button', { type: 'button', class: 'butang bahaya kecil-butang', 'aria-label': 'Buang gambar ' + (i + 1), text: '×',
        onclick: () => { borang.gambar.splice(i, 1); lukisGambar(); } })));
  });
  $('kBlokAkuan').classList.toggle('tersembunyi', !borang.gambar.length);
  $('kGambar').disabled = borang.gambar.length >= MAKS_GAMBAR;
}

async function muatNaikGambar(dataUrl, nama) {
  const blob = await (await fetch(dataUrl)).blob();
  const res = await fetch(K.A('/karakter/fail?jenis=lampiran&nama=' + encodeURIComponent(nama || 'gambar.jpg')),
    { method: 'POST', credentials: 'same-origin', headers: { 'content-type': blob.type }, body: blob });
  const r = await res.json().catch(() => ({}));
  if (!res.ok || !r.fileId) throw new Error(r.ralat || 'Muat naik gambar gagal (' + res.status + ').');
  return r.fileId;
}

// ---------------------------------------------------------------- hantar
async function hantar(bekas) {
  const d = bacaMedan();
  const kurang = [];
  if (!d.tarikh) kurang.push('tarikh');
  if (!d.kelas) kurang.push('kelas');
  if (!d.subjek) kurang.push('mata pelajaran');
  if (!d.teras.length) kurang.push('elemen teras');
  if (!d.tajuk) kurang.push('tajuk aktiviti');
  if (!d.catatan) kurang.push('huraian');
  if (kurang.length) return K.pesan('amaran', 'Sila lengkapkan: ' + kurang.join(', ') + '.');
  if (borang.gambar.length && !$('kAkuan').checked) return K.pesan('amaran', 'Sila tanda akuan kebenaran ibu bapa atau penjaga bagi gambar.');
  try {
    for (let i = 0; i < borang.gambar.length; i++) {
      const x = borang.gambar[i];
      if (x.fileId) continue;
      K.overlay(true, 'Memuat naik gambar ' + (i + 1) + '/' + borang.gambar.length + '...');
      x.fileId = await muatNaikGambar(x.dataUrl, x.nama);
    }
    K.overlay(true, 'Menghantar laporan...');
    const r = await api(K.A('/karakter/rekod'), { method: 'POST', body: {
      ...(borang.id ? { id: borang.id } : {}), data: d,
      gambar: borang.gambar.map(x => ({ fileId: x.fileId, kapsyen: (x.kapsyen || '').trim() })), akuanGambar: $('kAkuan').checked } });
    if (!r.ok) return K.pesan('bahaya', r.ralat || 'Laporan tidak dapat dihantar. Data borang masih ada; cuba lagi.');
    const edit = !!borang.id;
    buangDraf();
    borang = borangKosong();
    paparBorang(bekas);
    K.pesan('ok', (edit ? 'Perubahan disimpan' : 'Laporan dihantar') + ' (ID ' + r.id + '). Lihat dalam tab Laporan.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    K.pesan('bahaya', (e && e.message) || 'Rangkaian terputus. Data borang masih ada; cuba lagi.');
  } finally { K.overlay(false); }
}

// ====================================================================== Laporan Saya (S-05) dan butiran (S-06)
export async function paparLaporan(bekas, bukaBorang) {
  const C = K.getCfg();
  const b = kosongkan(bekas);
  const tajuk = el('h2', { text: senarai.skop === 'semua' ? 'Semua laporan karakter' : 'Laporan saya' });
  const atas = el('div', { class: 'baris-antara' }, tajuk);
  if (C.admin) {
    const pilih = el('select', { id: 'kSkop', 'aria-label': 'Skop laporan', style: 'width:auto' },
      el('option', { value: 'saya', text: 'Laporan saya' }), el('option', { value: 'semua', text: 'Semua laporan sekolah' }));
    pilih.value = senarai.skop;
    pilih.onchange = () => { senarai.skop = pilih.value; senarai.halaman = 1; paparLaporan(bekas, bukaBorang); };
    atas.append(pilih);
  }
  const cari = el('input', { type: 'search', id: 'kCari', placeholder: 'Cari tajuk, kelas, subjek...', 'aria-label': 'Cari laporan' });
  cari.value = senarai.cari;
  const kelas = el('select', { id: 'kTapisKelas', 'aria-label': 'Tapis kelas' }, el('option', { value: '', text: 'Semua kelas' }), ...C.kelas.map(v => el('option', { value: v, text: v })));
  kelas.value = senarai.kelas;
  const teras = el('select', { id: 'kTapisTeras', 'aria-label': 'Tapis teras' }, el('option', { value: '', text: 'Semua teras' }), ...C.teras.map(t => el('option', { value: t.nama, text: t.nama })));
  teras.value = senarai.teras;
  let tunda = null;
  const tapis = () => { senarai.cari = cari.value.trim(); senarai.kelas = kelas.value; senarai.teras = teras.value; senarai.halaman = 1; muat(); };
  cari.oninput = () => { clearTimeout(tunda); tunda = setTimeout(tapis, 350); };
  kelas.onchange = tapis; teras.onchange = tapis;
  const hasil = el('div', { id: 'kSenaraiLaporan', class: 'senarai ruang-atas' });
  b.append(atas, el('div', { class: 'krk-tapis' }, cari, kelas, teras), hasil);

  async function muat() {
    kosongkan(hasil).append(el('p', { class: 'redup', text: 'Memuatkan...' }));
    const q = new URLSearchParams({ skop: senarai.skop, halaman: senarai.halaman });
    for (const k of ['cari', 'kelas', 'teras']) if (senarai[k]) q.set(k, senarai[k]);
    const r = await api(K.A('/karakter/rekod?' + q));
    kosongkan(hasil);
    if (!r.ok) return hasil.append(el('div', { class: 'mesej bahaya', text: r.ralat || 'Gagal memuatkan laporan.' }));
    if (!r.data.length) return hasil.append(el('p', { class: 'redup', text: senarai.cari || senarai.kelas || senarai.teras ? 'Tiada laporan sepadan.' : 'Belum ada laporan. Isi borang pertama anda.' }));
    hasil.append(el('p', { class: 'kecil redup', text: r.jumlah + ' laporan' }));
    r.data.forEach(x => hasil.append(kadLaporan(x, () => paparButiran(bekas, x.id, bukaBorang))));
    const halAkhir = Math.ceil(r.jumlah / r.saiz);
    if (halAkhir > 1) {
      hasil.append(el('div', { class: 'baris-butang ruang-atas' },
        el('button', { type: 'button', class: 'butang sekunder', text: 'Sebelum', ...(r.halaman <= 1 ? { disabled: '' } : {}), onclick: () => { senarai.halaman--; muat(); } }),
        el('span', { class: 'kecil redup', text: 'Halaman ' + r.halaman + ' / ' + halAkhir }),
        el('button', { type: 'button', class: 'butang sekunder', text: 'Seterusnya', ...(r.halaman >= halAkhir ? { disabled: '' } : {}), onclick: () => { senarai.halaman++; muat(); } })));
    }
  }
  await muat();
}

function kadLaporan(x, buka) {
  return el('div', { class: 'item krk-item', 'data-id': x.id },
    el('div', { class: 'atas' }, el('div', {}, el('div', { class: 'tajuk', text: x.tajuk }),
      el('div', { class: 'meta', text: tarikhDmy(x.tarikh) + (x.masa ? ' ' + x.masa : '') + ' · ' + x.kelas + ' · ' + x.subjek + (senarai.skop === 'semua' ? ' · ' + x.nama : '') }))),
    el('div', { class: 'krk-lencana-baris' }, ...x.teras.map(lencanaTeras),
      x.bilGambar ? el('span', { class: 'pil draf', text: x.bilGambar + ' gambar' }) : ''),
    el('div', { class: 'aksi' }, el('button', { type: 'button', class: 'butang sekunder', text: 'Lihat', onclick: buka })));
}

async function paparButiran(bekas, id, bukaBorang) {
  K.overlay(true, 'Memuatkan laporan...');
  let r;
  try { r = await api(K.A('/karakter/rekod/' + encodeURIComponent(id))); } finally { K.overlay(false); }
  if (!r.ok) return K.pesan('bahaya', r.ralat || 'Laporan tidak dapat dibuka.');
  const x = r.rekod;
  const b = kosongkan(bekas);
  const gambar = el('div', { class: 'krk-gambar-butiran' });
  b.append(el('p', {}, el('button', { type: 'button', class: 'pautan-butang', text: '← Kembali ke senarai', onclick: () => paparLaporan(bekas, bukaBorang) })),
    el('h2', { text: x.tajuk }),
    el('dl', { class: 'krk-butiran' },
      ...[['ID', x.id], ['Tarikh', tarikhDmy(x.tarikh) + (x.masa ? ', ' + x.masa : '')], ['Kelas', x.kelas], ['Mata pelajaran', x.subjek],
        ['Guru pelaksana', x.nama], ['Dihantar', new Date(x.timestamp).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })], ['Cap jari kandungan', x.hash]]
        .flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })])),
    el('div', { class: 'krk-lencana-baris' }, ...x.teras.map(lencanaTeras)),
    el('p', { class: 'krk-catatan', text: x.catatan }),
    gambar);
  const aksi = el('div', { class: 'baris-butang ruang-atas' });
  if (r.boleh.edit) aksi.append(el('button', { type: 'button', class: 'butang', text: 'Edit', onclick: () => editLaporan(x, bukaBorang) }));
  if (r.boleh.padam) aksi.append(el('button', { type: 'button', class: 'butang bahaya', text: 'Padam', onclick: async () => {
    if (!confirm('Padam laporan "' + x.tajuk + '"?')) return;
    const p = await api(K.A('/karakter/rekod/' + encodeURIComponent(x.id) + '/padam'), { method: 'POST', body: {} });
    if (!p.ok) return K.pesan('bahaya', p.ralat || 'Gagal memadam.');
    K.pesan('ok', 'Laporan dipadam.');
    paparLaporan(bekas, bukaBorang);
  } }));
  b.append(aksi);
  for (const gb of x.gambar) {
    const url = await muatGambar(x.id, gb.fileId);
    gambar.append(el('figure', {}, url ? el('img', { src: url, alt: gb.kapsyen || 'Gambar aktiviti' }) : el('div', { class: 'redup kecil', text: 'Gambar tidak dapat dimuatkan.' }),
      gb.kapsyen ? el('figcaption', { text: gb.kapsyen }) : ''));
  }
}

async function muatGambar(rekodId, fileId) {
  try {
    const res = await fetch(K.A('/karakter/fail/' + encodeURIComponent(fileId) + '?rekod=' + encodeURIComponent(rekodId)), { credentials: 'same-origin' });
    if (!res.ok) return '';
    return URL.createObjectURL(await res.blob());
  } catch (e) { return ''; }
}

async function editLaporan(x, bukaBorang) {
  K.overlay(true, 'Memuatkan gambar...');
  try {
    const gambar = [];
    for (const gb of x.gambar) gambar.push({ fileId: gb.fileId, kapsyen: gb.kapsyen, src: await muatGambar(x.id, gb.fileId) });
    bukaBorang({ id: x.id, data: { tarikh: x.tarikh, masa: x.masa, kelas: x.kelas, subjek: x.subjek, teras: x.teras, tajuk: x.tajuk, catatan: x.catatan },
      gambar, akuan: !!x.akuanGambar });
  } finally { K.overlay(false); }
}
