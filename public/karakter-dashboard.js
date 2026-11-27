// e-Karakter Fasa 5: Dashboard admin (S-07), eksport CSV dan PDF Dashboard landskap (S-09).
// Angka KPI dan carta datang daripada /karakter/statistik; jadual daripada /karakter/rekod?skop=semua
// dengan penapis yang SAMA, jadi angka sentiasa sepadan dengan jadual.
import { $, el, api } from '/app.js';
import { warnaTeras } from '/karakter-borang.js';
import { binaDashboardPdf, janaPdfLandskap, keDataUrl } from '/karakter-dokumen.js';

let K = null;      // { A, overlay, pesan, getCfg, getOprCfg, bukaButiran(id) }
let tapis = { dari: '', hingga: '', kelas: '', subjek: '', guru: '', teras: '', cari: '' };
let halaman = 1, modBar = 'kelas', ST = null, carta = [];
const kosongkan = (n) => { n.textContent = ''; return n; };
const tarikhDmy = (iso) => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '';
const kurangGerak = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let muatChart = null;
function sediaChart() {
  if (!muatChart) muatChart = new Promise((ok, gagal) => {
    if (window.Chart) return ok();
    const s = document.createElement('script');
    s.src = '/vendor/chart.umd.min.js'; s.onload = ok; s.onerror = () => gagal(new Error('Pustaka carta gagal dimuatkan.'));
    document.head.append(s);
  });
  return muatChart;
}
const qs = (lebih = {}) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries({ ...tapis, ...lebih })) if (v !== '' && v != null) q.set(k, v); return q; };

export async function paparDashboard(bekas, konteks) {
  K = konteks;
  carta.forEach(c => { try { c.destroy(); } catch (e) { /* abaikan */ } });
  carta = [];
  const b = kosongkan(bekas);
  b.append(el('div', { class: 'baris-antara krk-lentur' }, el('h2', { text: 'Dashboard e-Karakter' }),
    el('div', { class: 'baris-butang' },
      el('button', { type: 'button', class: 'butang sekunder', id: 'krkEksport', text: 'Eksport CSV', onclick: eksport }),
      el('button', { type: 'button', class: 'butang', id: 'krkPdfDashboard', text: 'Muat turun PDF Dashboard', onclick: pdfDashboard }))),
    el('div', { id: 'krkTapisDash', class: 'krk-tapis-dash' }),
    el('div', { id: 'krkKpi', class: 'krk-kpi' }),
    el('div', { class: 'krk-carta-grid' },
      el('div', { class: 'item' }, el('div', { class: 'tajuk', text: 'Pecahan elemen teras' }), el('div', { class: 'krk-donat' }, el('canvas', { id: 'krkDonat', 'aria-label': 'Carta donat pecahan elemen teras', role: 'img' })), el('ul', { id: 'krkLegenda', class: 'krk-legenda' })),
      el('div', { class: 'item' }, el('div', { class: 'baris-antara krk-lentur' }, el('div', { class: 'tajuk', id: 'krkTajukBar', text: 'Laporan mengikut kelas' }),
        el('nav', { class: 'tab tab-kecil', id: 'krkModBar', role: 'tablist' }, ...[['kelas', 'Kelas'], ['subjek', 'Subjek']].map(([k, l]) =>
          el('button', { type: 'button', role: 'tab', 'data-mod': k, 'aria-selected': String(k === modBar), text: l, onclick: () => { modBar = k; lukisBar(); } })))),
        el('div', { class: 'krk-bar' }, el('canvas', { id: 'krkBar', role: 'img' }))),
      el('div', { class: 'item' }, el('div', { class: 'tajuk', text: 'Top 5 guru' }), el('ol', { id: 'krkTopGuru', class: 'krk-top' }))),
    el('div', { id: 'krkJadual', class: 'ruang-atas' }));
  await muat();
}

function binaTapis() {
  const P = ST.pilihan;
  const t = kosongkan($('krkTapisDash'));
  const pilih = (k, label, item) => {
    const s = el('select', { id: 'dTapis_' + k, 'aria-label': label }, el('option', { value: '', text: label }), ...item.map(([v, n]) => el('option', { value: v, text: n })));
    s.value = tapis[k]; s.onchange = () => { tapis[k] = s.value; halaman = 1; muat(); };
    return s;
  };
  const tarikh = (k, label) => { const i = el('input', { type: 'date', id: 'dTapis_' + k, 'aria-label': label, title: label }); i.value = tapis[k]; i.onchange = () => { tapis[k] = i.value; halaman = 1; muat(); }; return i; };
  const cari = el('input', { type: 'search', id: 'dTapis_cari', placeholder: 'Cari tajuk, catatan, ID...', 'aria-label': 'Cari' });
  cari.value = tapis.cari;
  let tunda = null;
  cari.oninput = () => { clearTimeout(tunda); tunda = setTimeout(() => { tapis.cari = cari.value.trim(); halaman = 1; muat(); }, 400); };
  t.append(el('label', { class: 'krk-tarikh-label' }, el('span', { class: 'kecil redup', text: 'Dari' }), tarikh('dari', 'Dari tarikh')),
    el('label', { class: 'krk-tarikh-label' }, el('span', { class: 'kecil redup', text: 'Hingga' }), tarikh('hingga', 'Hingga tarikh')),
    pilih('kelas', 'Semua kelas', P.kelas.map(v => [v, v])), pilih('subjek', 'Semua subjek', P.subjek.map(v => [v, v])),
    pilih('guru', 'Semua guru', P.guru.map(gu => [gu.email, gu.nama])), pilih('teras', 'Semua teras', P.teras.map(v => [v, v])), cari,
    el('button', { type: 'button', class: 'butang sekunder', text: 'Set semula', onclick: () => { tapis = { dari: '', hingga: '', kelas: '', subjek: '', guru: '', teras: '', cari: '' }; halaman = 1; muat(); } }));
}

async function muat() {
  const r = await api(K.A('/karakter/statistik?' + qs()));
  if (!r.ok) return K.pesan('bahaya', r.ralat || 'Dashboard tidak dapat dimuatkan.');
  ST = r;
  if (!$('dTapis_cari') || document.activeElement !== $('dTapis_cari')) binaTapis();
  const k = r.kpi;
  kosongkan($('krkKpi')).append(...[
    ['JUMLAH LAPORAN', String(k.jumlah), r.jumlahSemua !== k.jumlah ? 'daripada ' + r.jumlahSemua + ' (ditapis)' : 'semua laporan'],
    ['KELAS TERLIBAT', String(k.kelas), ''], ['GURU MELAPOR', String(k.guru), ''],
    ['TERAS TERTINGGI', k.terasTertinggi ? k.terasTertinggi.nama : '-', k.terasTertinggi ? k.terasTertinggi.bil + ' laporan' : '']
  ].map(([l, n, sub]) => el('div', { class: 'item krk-kpi-kad' }, el('div', { class: 'krk-kpi-label', text: l }),
    el('div', { class: 'krk-kpi-nilai' + (/^\d+$/.test(n) ? '' : ' teks'), text: n }), sub ? el('div', { class: 'kecil redup', text: sub }) : '')));
  kosongkan($('krkLegenda')).append(...r.teras.map(t => el('li', {}, el('span', { class: 'krk-titik', style: 'background:' + warnaTeras(t.nama) }), el('span', { text: t.nama }), el('b', { text: String(t.bil) }))));
  if (!r.teras.length) $('krkLegenda').append(el('li', { class: 'redup', text: 'Belum ada data.' }));
  kosongkan($('krkTopGuru')).append(...r.topGuru.map(gu => el('li', {}, el('span', { text: gu.nama }), el('b', { text: String(gu.bil) }))));
  if (!r.topGuru.length) $('krkTopGuru').append(el('li', { class: 'redup', text: 'Belum ada data.' }));
  try { await sediaChart(); lukisDonat(); lukisBar(); } catch (e) { K.pesan('amaran', e.message); }
  await muatJadual();
}

const warnaUtama = () => getComputedStyle(document.documentElement).getPropertyValue('--utama').trim() || '#312e81';
const warnaTeks = () => getComputedStyle(document.documentElement).getPropertyValue('--redup').trim() || '#5b6478';

function lukisDonat() {
  carta.filter(c => c.canvas.id === 'krkDonat').forEach(c => c.destroy());
  carta = carta.filter(c => c.canvas && c.canvas.id !== 'krkDonat');
  if (!ST.teras.length) return;
  carta.push(new window.Chart($('krkDonat'), { type: 'doughnut',
    data: { labels: ST.teras.map(t => t.nama), datasets: [{ data: ST.teras.map(t => t.bil), backgroundColor: ST.teras.map(t => warnaTeras(t.nama)), borderWidth: 2 }] },
    options: { cutout: '62%', animation: kurangGerak() ? false : { duration: 250 }, plugins: { legend: { display: false } }, maintainAspectRatio: false } }));
}

function lukisBar() {
  document.querySelectorAll('#krkModBar button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mod === modBar)));
  $('krkTajukBar').textContent = modBar === 'kelas' ? 'Laporan mengikut kelas' : 'Laporan mengikut subjek';
  carta.filter(c => c.canvas.id === 'krkBar').forEach(c => c.destroy());
  carta = carta.filter(c => c.canvas && c.canvas.id !== 'krkBar');
  const data = (modBar === 'kelas' ? ST.kelas : ST.subjek).slice(0, 12);
  $('krkBar').setAttribute('aria-label', 'Carta bar: ' + data.map(x => x.nama + ' ' + x.bil).join(', '));
  if (!data.length) return;
  carta.push(new window.Chart($('krkBar'), { type: 'bar',
    data: { labels: data.map(x => x.nama), datasets: [{ data: data.map(x => x.bil), backgroundColor: warnaUtama(), maxBarThickness: 38, borderRadius: 6 }] },
    options: { indexAxis: 'y', animation: kurangGerak() ? false : { duration: 250 }, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0, color: warnaTeks() } }, y: { ticks: { color: warnaTeks() } } } } }));
}

async function muatJadual() {
  const bekas = $('krkJadual');
  const r = await api(K.A('/karakter/rekod?' + qs({ skop: 'semua', halaman })));
  kosongkan(bekas);
  if (!r.ok) return bekas.append(el('div', { class: 'mesej bahaya', text: r.ralat || 'Jadual gagal dimuatkan.' }));
  bekas.append(el('p', { class: 'kecil redup', id: 'krkJumlahJadual', text: r.jumlah + ' laporan' }));
  if (!r.data.length) return bekas.append(el('p', { class: 'redup', text: 'Tiada laporan sepadan dengan tapisan.' }));
  const jadual = el('table', { class: 'krk-jadual' },
    el('thead', {}, el('tr', {}, ...['ID dan tarikh', 'Kelas dan subjek', 'Guru', 'Teras', 'Tajuk', 'Gambar', ''].map(t => el('th', { text: t })))),
    el('tbody', {}, ...r.data.map(x => el('tr', { 'data-id': x.id },
      el('td', { 'data-label': 'ID' }, el('div', { class: 'kecil redup', text: x.id }), el('div', { text: tarikhDmy(x.tarikh) })),
      el('td', { 'data-label': 'Kelas' }, el('div', { text: x.kelas }), el('div', { class: 'kecil redup', text: x.subjek })),
      el('td', { 'data-label': 'Guru', text: x.nama }),
      el('td', { 'data-label': 'Teras' }, ...x.teras.map(t => el('span', { class: 'krk-lencana', style: '--w:' + warnaTeras(t), text: t }))),
      el('td', { 'data-label': 'Tajuk', text: x.tajuk }),
      el('td', { 'data-label': 'Gambar', text: String(x.bilGambar) }),
      el('td', {}, el('button', { type: 'button', class: 'butang sekunder kecil-butang', text: 'Lihat', onclick: () => K.bukaButiran(x.id) }))))));
  bekas.append(el('div', { class: 'krk-jadual-bekas' }, jadual));
  const akhir = Math.ceil(r.jumlah / r.saiz);
  if (akhir > 1) bekas.append(el('div', { class: 'baris-butang ruang-atas' },
    el('button', { type: 'button', class: 'butang sekunder', text: 'Sebelum', ...(r.halaman <= 1 ? { disabled: '' } : {}), onclick: () => { halaman--; muatJadual(); } }),
    el('span', { class: 'kecil redup', text: 'Halaman ' + r.halaman + ' / ' + akhir }),
    el('button', { type: 'button', class: 'butang sekunder', text: 'Seterusnya', ...(r.halaman >= akhir ? { disabled: '' } : {}), onclick: () => { halaman++; muatJadual(); } })));
}

async function muatTurunBlob(blob, nama) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: nama });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function eksport() {
  K.overlay(true, 'Menyediakan CSV...');
  try {
    const res = await fetch(K.A('/karakter/eksport?' + qs()), { credentials: 'same-origin' });
    if (!res.ok) throw new Error('Eksport gagal (' + res.status + ').');
    const nama = ((res.headers.get('content-disposition') || '').match(/filename="([^"]+)"/) || [])[1] || 'e-Karakter.csv';
    await muatTurunBlob(await res.blob(), nama);
  } catch (e) { K.pesan('bahaya', e.message); } finally { K.overlay(false); }
}

function ringkasanTapisan() {
  const g = ST && ST.pilihan.guru.find(x => x.email === tapis.guru);
  const b = [];
  if (tapis.dari || tapis.hingga) b.push('Tarikh ' + (tarikhDmy(tapis.dari) || 'awal') + ' hingga ' + (tarikhDmy(tapis.hingga) || 'kini'));
  if (tapis.kelas) b.push('Kelas ' + tapis.kelas);
  if (tapis.subjek) b.push('Subjek ' + tapis.subjek);
  if (g) b.push('Guru ' + g.nama);
  if (tapis.teras) b.push('Teras ' + tapis.teras);
  if (tapis.cari) b.push('Carian "' + tapis.cari + '"');
  return b.length ? b.join(' · ') : 'Semua laporan';
}

async function pdfDashboard() {
  K.overlay(true, 'Mengumpul data...');
  try {
    const r = await api(K.A('/karakter/rekod?' + qs({ skop: 'semua', saiz: 'semua' })));
    if (!r.ok) throw new Error(r.ralat || 'Data tidak dapat dimuatkan.');
    await sediaChart();
    const o = (K.getOprCfg && K.getOprCfg()) || {}, t = o.tetapan || {};
    const logo = o.logo && o.logo[1] ? await keDataUrl(K.A('/logo/1?v=' + encodeURIComponent(o.logo[1]))).catch(() => '') : '';
    const C = K.getCfg();
    K.overlay(true, 'Menjana PDF Dashboard...');
    const muka = binaDashboardPdf({ st: ST, baris: r.data, jumlah: r.jumlah, tapisan: ringkasanTapisan(), warnaTeras,
      sekolah: { nama: t.NAMA_SEKOLAH || '', alamat: t.ALAMAT_SEKOLAH || '', warna: t.WARNA_2 || '', logo }, krk: C.tetapan || {} });
    const blob = await janaPdfLandskap(muka);
    const hari = new Date().toISOString().slice(0, 10);
    await muatTurunBlob(blob, 'Dashboard_e-Karakter_' + hari + '.pdf');
    K.pesan('ok', 'PDF Dashboard dijana (' + muka.length + ' muka).' + (r.jumlah > r.data.length ? ' Jadual dihadkan kepada ' + r.data.length + ' laporan; gunakan Eksport CSV untuk senarai penuh.' : ''));
  } catch (e) { K.pesan('bahaya', (e && e.message) || 'PDF Dashboard gagal dijana.'); }
  finally { K.overlay(false); }
}
