// Dokumen A4 e-Karakter (S-03, DBD 5.1) dan penjana PDF satu muka (html2pdf tempatan).
// Muka A4 berukuran tetap 794 x 1122.5 px; catatan yang terlalu panjang dipotong dengan "..."
// dalam PDF sahaja (teks penuh kekal dalam butiran laporan).
import { el } from '/app.js';

const HARI = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
const tarikhDmy = (iso) => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '';
const hariDari = (iso) => { const d = new Date(String(iso) + 'T00:00:00Z'); return Number.isNaN(d.getTime()) ? '' : HARI[d.getUTCDay()]; };
const LEBAR = 794, TINGGI = LEBAR * 297 / 210;

/**
 * d = { id, tarikh, masa, kelas, subjek, nama, tajuk, catatan, teras: [dipilih], semuaTeras: [nama],
 *       gambar: [{ src, kapsyen }], ttdSrc, ttdPada, hash,
 *       sekolah: { nama, alamat, telefon, logo, warna }, krk: { KRK_KOD_SEKOLAH, KRK_TAJUK_DOKUMEN, KRK_NAMA_PENGESAH, KRK_JAWATAN_PENGESAH } }
 */
export function binaA4(d) {
  const warna = /^#[0-9a-f]{6}$/i.test(d.sekolah.warna || '') ? d.sekolah.warna : '#312e81';
  const semua = [...(d.semuaTeras || [])];
  (d.teras || []).forEach(t => { if (!semua.includes(t)) semua.push(t); });   // teras lama yang sudah ditukar nama
  const n = (d.gambar || []).length;
  const tinggiGambar = n === 1 ? 208 : n === 2 ? 176 : 144;

  const kepala = el('header', { class: 'a4k-kepala' },
    d.sekolah.logo ? el('img', { class: 'a4k-logo', src: d.sekolah.logo, alt: '' }) : el('div', { class: 'a4k-logo kosong' }),
    el('div', { class: 'a4k-sekolah' },
      el('div', { class: 'a4k-nama-baris' }, el('span', { class: 'a4k-nama', text: String(d.sekolah.nama || '').toUpperCase() }),
        d.krk.KRK_KOD_SEKOLAH ? el('span', { class: 'a4k-kod', text: d.krk.KRK_KOD_SEKOLAH }) : ''),
      el('div', { class: 'a4k-alamat', text: [d.sekolah.alamat, d.sekolah.telefon ? 'Tel: ' + d.sekolah.telefon : ''].filter(Boolean).join(' · ') })));
  const tajukDok = el('div', { class: 'a4k-tajuk-dok' },
    el('div', { class: 'a4k-tajuk', text: String(d.krk.KRK_TAJUK_DOKUMEN || 'Laporan Pelaksanaan Pembentukan Karakter').toUpperCase() }),
    el('div', { class: 'a4k-subtajuk', text: 'DOKUMEN REKOD SEKOLAH' }));

  const sel = (label, nilai, span) => el('div', { class: 'a4k-sel' + (span ? ' span3' : '') }, el('span', { class: 'a4k-label', text: label }), el('span', { class: 'a4k-nilai', text: nilai || '-' }));
  const info = el('section', { class: 'a4k-info' },
    sel('TARIKH & HARI', tarikhDmy(d.tarikh) + (hariDari(d.tarikh) ? ' (' + hariDari(d.tarikh) + ')' : '')),
    sel('MASA', d.masa), sel('KELAS', d.kelas), sel('MATA PELAJARAN', d.subjek),
    sel('GURU PELAKSANA', String(d.nama || '').toUpperCase(), true), sel('RUJUKAN', d.id || 'Belum dihantar'));

  const kotak = (tajuk, ...isi) => el('section', { class: 'a4k-kotak' }, el('div', { class: 'a4k-kotak-tajuk', text: tajuk }), el('div', { class: 'a4k-kotak-isi' }, ...isi));
  const teras = kotak('ELEMEN TERAS PEMBENTUKAN KARAKTER YANG DITERAPKAN',
    el('div', { class: 'a4k-teras' }, ...semua.map(t => {
      const pilih = (d.teras || []).includes(t);
      return el('div', { class: 'a4k-teras-item' + (pilih ? ' pilih' : '') }, el('span', { class: 'a4k-kotak-tanda', text: pilih ? '✓' : '' }), el('span', { text: t }));
    })));
  const catatanTeks = el('p', { class: 'a4k-catatan', 'data-penuh': d.catatan || '', text: d.catatan || '' });
  const catatan = el('section', { class: 'a4k-kotak a4k-kotak-catatan' },
    el('div', { class: 'a4k-kotak-tajuk', text: 'CATATAN PELAKSANAAN AKTIVITI & IMPAK KARAKTER' }),
    el('div', { class: 'a4k-kotak-isi a4k-catatan-isi' }, el('div', { class: 'a4k-tajuk-aktiviti', text: String(d.tajuk || '').toUpperCase() }), catatanTeks));
  const gambar = n ? kotak('LAMPIRAN BERGAMBAR PELAKSANAAN',
    el('div', { class: 'a4k-gambar' + (n === 1 ? ' satu' : '') }, ...d.gambar.map(g => el('figure', {},
      el('img', { src: g.src, alt: '', style: 'height:' + tinggiGambar + 'px' }),
      el('figcaption', { text: g.kapsyen || '' }))))) : '';

  const ttd = el('section', { class: 'a4k-ttd' },
    el('div', {}, el('div', { class: 'a4k-ttd-label', text: 'Disediakan oleh:' }),
      el('div', { class: 'a4k-ttd-ruang' }, d.ttdSrc ? el('img', { src: d.ttdSrc, alt: '' }) : ''),
      el('div', { class: 'a4k-garis' }),
      el('div', { class: 'a4k-ttd-nama', text: String(d.nama || '').toUpperCase() }),
      el('div', { text: 'Guru Pelaksana Aktiviti' }),
      el('div', { class: 'a4k-ttd-tarikh', text: 'Tarikh: ' + tarikhDmy(String(d.ttdPada || '').slice(0, 10) || d.tarikh) })),
    el('div', {}, el('div', { class: 'a4k-ttd-label', text: 'Disahkan oleh:' }),
      el('div', { class: 'a4k-ttd-ruang' }),
      el('div', { class: 'a4k-garis' }),
      el('div', { class: 'a4k-ttd-nama', text: String(d.krk.KRK_NAMA_PENGESAH || '').toUpperCase() || ' ' }),
      el('div', { text: d.krk.KRK_JAWATAN_PENGESAH || '' }),
      el('div', { class: 'a4k-ttd-tarikh', text: 'Cap Rasmi Sekolah:' })));
  const kaki = el('footer', { class: 'a4k-kaki' },
    el('span', { text: 'Dijana melalui Annur OPR (e-Karakter)' }),
    el('span', { text: (d.id ? d.id : 'Pratonton') + (d.hash ? ' · Semak: ' + d.hash : '') }));

  const muka = el('div', { class: 'krk-a4', style: '--wk:' + warna }, kepala, tajukDok, info, teras, catatan, gambar, ttd, kaki);
  return muka;
}

// Potong catatan supaya muat dalam ruang yang tinggal (perlu berada dalam DOM).
export function muatkanCatatan(muka) {
  const p = muka.querySelector('.a4k-catatan');
  const bekas = muka.querySelector('.a4k-catatan-isi');
  if (!p || !bekas) return;
  const penuh = p.dataset.penuh || '';
  p.textContent = penuh;
  if (bekas.scrollHeight <= bekas.clientHeight + 1) return;
  let lo = 0, hi = penuh.length;
  while (lo < hi) {
    const m = Math.ceil((lo + hi) / 2);
    p.textContent = penuh.slice(0, m).trimEnd() + '...';
    if (bekas.scrollHeight <= bekas.clientHeight + 1) lo = m; else hi = m - 1;
  }
  p.textContent = penuh.slice(0, lo).trimEnd() + '...';
}

// Paparan berskala (pratonton) dalam bekas sebarang lebar.
export function pratonton(bekas, d) {
  bekas.textContent = '';
  const muka = binaA4(d);
  const skala = el('div', { class: 'krk-a4-skala' }, muka);
  bekas.append(skala);
  const k = Math.min(1, (bekas.clientWidth || LEBAR) / LEBAR);
  muka.style.transform = 'scale(' + k + ')';
  skala.style.height = Math.ceil(TINGGI * k) + 'px';
  muatkanCatatan(muka);
  return muka;
}

export async function keDataUrl(url) {
  if (!url || url.startsWith('data:')) return url || '';
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) return '';
  const blob = await res.blob();
  return new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ok(''); r.readAsDataURL(blob); });
}

let muatHtml2pdf = null;
function sediaHtml2pdf() {
  if (!muatHtml2pdf) muatHtml2pdf = new Promise((ok, gagal) => {
    if (window.html2pdf) return ok();
    const s = document.createElement('script');
    s.src = '/vendor/html2pdf.bundle.min.js'; s.onload = ok; s.onerror = () => gagal(new Error('Pustaka PDF gagal dimuatkan.'));
    document.head.append(s);
  });
  return muatHtml2pdf;
}

// Jana PDF A4 satu muka. Semua imej mesti data: URL (elak isu kanvas tercemar).
export async function janaPdf(d) {
  await sediaHtml2pdf();
  const hos = el('div', { class: 'krk-hos-pdf' });
  const muka = binaA4(d);
  muka.style.height = (TINGGI - 0.25) + 'px';
  hos.append(muka);
  document.body.append(hos);
  const gulung = window.scrollY;
  window.scrollTo(0, 0);
  try {
    await Promise.all([...muka.querySelectorAll('img')].map(i => i.complete ? null : new Promise(ok => { i.onload = i.onerror = ok; })));
    muatkanCatatan(muka);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const skala = (window.innerWidth < 700 || (navigator.deviceMemory || 8) <= 4) ? 1.5 : 2;
    return await window.html2pdf().set({
      margin: 0, image: { type: 'jpeg', quality: 0.85 },
      html2canvas: { scale: skala, useCORS: true, scrollX: 0, scrollY: 0, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    }).from(muka).toCanvas().then(function pangkas() {
      // Sama seperti OPR (dokumen.js): buang baki bundar kecil supaya tidak terhasil muka kedua kosong.
      const k = this.prop.canvas, pxMuka = Math.floor(k.width * (297 / 210)), penuh = Math.floor(k.height / pxMuka), sisa = k.height - penuh * pxMuka;
      if (penuh >= 1 && sisa > 0 && sisa <= 8) {
        const c = document.createElement('canvas'); c.width = k.width; c.height = penuh * pxMuka;
        c.getContext('2d').drawImage(k, 0, 0); this.prop.canvas = c;
      }
    }).toPdf().outputPdf('blob');
  } finally {
    hos.remove();
    window.scrollTo(0, gulung);
  }
}

// ======================================================================
// PDF Dashboard landskap (S-09, DBD 5.2): muka 1 KPI + carta, muka 2+ jadual,
// nombor muka, blok pengesahan pada muka akhir. Setiap muka dirakam berasingan
// (elak had tinggi kanvas pelayar bila ratusan laporan).
// ======================================================================
const L_LEBAR = 1122, L_TINGGI = L_LEBAR * 210 / 297;
const BARIS_SEMUKA = 15, BARIS_DENGAN_TTD = 10;

function kepalaLandskap(d, subtajuk) {
  return el('header', { class: 'a4l-kepala' },
    d.sekolah.logo ? el('img', { class: 'a4l-logo', src: d.sekolah.logo, alt: '' }) : '',
    el('div', { class: 'a4l-kepala-teks' },
      el('div', { class: 'a4k-nama-baris' }, el('span', { class: 'a4k-nama', text: String(d.sekolah.nama || '').toUpperCase() }),
        d.krk.KRK_KOD_SEKOLAH ? el('span', { class: 'a4k-kod', text: d.krk.KRK_KOD_SEKOLAH }) : ''),
      el('div', { class: 'a4l-tajuk', text: 'LAPORAN DASHBOARD PEMBENTUKAN KARAKTER' + (subtajuk ? ' · ' + subtajuk : '') }),
      el('div', { class: 'a4k-alamat', text: 'Tapisan: ' + d.tapisan + ' · Dijana: ' + tarikhDmy(new Date().toISOString().slice(0, 10)) })));
}

export function binaDashboardPdf(d) {
  const warna = /^#[0-9a-f]{6}$/i.test(d.sekolah.warna || '') ? d.sekolah.warna : '#312e81';
  const muka = [];
  const baru = (...isi) => { const m = el('div', { class: 'krk-a4l', style: '--wk:' + warna }, ...isi); muka.push(m); return m; };
  const st = d.st, k = st.kpi;

  // Muka 1
  const donat = el('canvas', { width: '240', height: '240' });
  const bar = el('canvas', { width: '430', height: '300' });
  const dataBar = st.kelas.slice(0, 10);
  const m1 = baru(kepalaLandskap(d, ''),
    el('div', { class: 'a4l-kpi' }, ...[['JUMLAH LAPORAN', k.jumlah], ['KELAS TERLIBAT', k.kelas], ['GURU MELAPOR', k.guru],
      ['TERAS TERTINGGI', k.terasTertinggi ? k.terasTertinggi.nama + ' (' + k.terasTertinggi.bil + ')' : '-']]
      .map(([l, n]) => el('div', { class: 'a4l-kpi-kad' }, el('div', { class: 'a4k-label', text: l }), el('div', { class: 'a4l-kpi-nilai', text: String(n) })))),
    el('div', { class: 'a4l-carta' },
      el('section', { class: 'a4k-kotak' }, el('div', { class: 'a4k-kotak-tajuk', text: 'PECAHAN ELEMEN TERAS' }),
        el('div', { class: 'a4k-kotak-isi a4l-donat' }, donat, el('ul', { class: 'a4l-legenda' }, ...st.teras.map(t =>
          el('li', {}, el('span', { class: 'a4l-titik', style: 'background:' + d.warnaTeras(t.nama) }), el('span', { text: t.nama }), el('b', { text: String(t.bil) })))))),
      el('section', { class: 'a4k-kotak' }, el('div', { class: 'a4k-kotak-tajuk', text: 'LAPORAN MENGIKUT KELAS (10 TERATAS)' }), el('div', { class: 'a4k-kotak-isi' }, bar)),
      el('section', { class: 'a4k-kotak' }, el('div', { class: 'a4k-kotak-tajuk', text: 'TOP 5 GURU' }),
        el('ol', { class: 'a4k-kotak-isi a4l-top' }, ...st.topGuru.map(gu => el('li', {}, el('span', { text: gu.nama }), el('b', { text: String(gu.bil) })))))));
  m1.lukis = () => {
    const Ch = window.Chart;
    const c1 = st.teras.length ? new Ch(donat, { type: 'doughnut', data: { labels: st.teras.map(t => t.nama), datasets: [{ data: st.teras.map(t => t.bil), backgroundColor: st.teras.map(t => d.warnaTeras(t.nama)), borderWidth: 2 }] },
      options: { cutout: '62%', animation: false, responsive: false, devicePixelRatio: 2, plugins: { legend: { display: false } } } }) : null;
    const c2 = dataBar.length ? new Ch(bar, { type: 'bar', data: { labels: dataBar.map(x => x.nama), datasets: [{ data: dataBar.map(x => x.bil), backgroundColor: warna, maxBarThickness: 38, borderRadius: 6 }] },
      options: { indexAxis: 'y', animation: false, responsive: false, devicePixelRatio: 2, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } } }) : null;
    return () => { if (c1) c1.destroy(); if (c2) c2.destroy(); };
  };

  // Muka jadual
  const baris = d.baris || [];
  const kumpulan = [];
  for (let i = 0; i < baris.length; i += BARIS_SEMUKA) kumpulan.push(baris.slice(i, i + BARIS_SEMUKA));
  // Setiap sel dibalut div bertinggi tetap: baris tidak pernah melebihi 38px, jadi 15 baris sentiasa muat
  // (jadual yang melimpah muka tidak dilukis oleh html2canvas).
  const sel = (...isi) => el('td', {}, el('div', { class: 'a4l-sel' }, ...isi));
  const kepalaJadual = () => el('thead', {}, el('tr', {}, ...['Bil', 'ID dan tarikh', 'Kelas dan subjek', 'Guru', 'Elemen teras', 'Tajuk dan catatan ringkas', 'Gambar'].map(t => el('th', { text: t }))));
  kumpulan.forEach((kb, ki) => {
    baru(kepalaLandskap(d, 'SENARAI LAPORAN' + (d.jumlah > baris.length ? ' (' + baris.length + ' daripada ' + d.jumlah + ')' : '')),
      el('table', { class: 'a4l-jadual' }, kepalaJadual(), el('tbody', {}, ...kb.map((r, i) => el('tr', {},
        sel(el('div', { text: String(ki * BARIS_SEMUKA + i + 1) })),
        sel(el('div', { class: 'a4l-kecil a4l-klip1', text: r.id }), el('div', { class: 'a4l-klip1', text: tarikhDmy(r.tarikh) })),
        sel(el('div', { class: 'a4l-klip1', text: r.kelas }), el('div', { class: 'a4l-kecil a4l-klip1', text: r.subjek })),
        sel(el('div', { class: 'a4l-klip2', text: r.nama })),
        sel(el('div', { class: 'a4l-klip2', text: r.teras.join(', ') })),
        sel(el('div', { class: 'a4l-tebal a4l-klip1', text: r.tajuk }), el('div', { class: 'a4l-kecil a4l-klip1', text: r.catatanRingkas || '' })),
        sel(el('div', { class: 'a4l-tengah', text: String(r.bilGambar) })))))));
  });

  // Blok pengesahan pada muka akhir (atau muka baharu jika penuh)
  const ttd = el('section', { class: 'a4k-ttd a4l-ttd' },
    el('div', {}, el('div', { class: 'a4k-ttd-label', text: 'Disediakan oleh:' }), el('div', { class: 'a4k-ttd-ruang' }), el('div', { class: 'a4k-garis' }),
      el('div', { class: 'a4k-ttd-nama', text: ' ' }), el('div', { text: 'Penyelaras Pembentukan Karakter' }), el('div', { class: 'a4k-ttd-tarikh', text: 'Tarikh:' })),
    el('div', {}, el('div', { class: 'a4k-ttd-label', text: 'Disahkan oleh:' }), el('div', { class: 'a4k-ttd-ruang' }), el('div', { class: 'a4k-garis' }),
      el('div', { class: 'a4k-ttd-nama', text: String(d.krk.KRK_NAMA_PENGESAH || '').toUpperCase() || ' ' }),
      el('div', { text: d.krk.KRK_JAWATAN_PENGESAH || '' }), el('div', { class: 'a4k-ttd-tarikh', text: 'Cap Rasmi Sekolah:' })));
  const akhir = kumpulan.length && kumpulan[kumpulan.length - 1].length <= BARIS_DENGAN_TTD ? muka[muka.length - 1] : baru(kepalaLandskap(d, 'PENGESAHAN'));
  akhir.append(ttd);

  // Kaki dengan nombor muka
  muka.forEach((m, i) => m.append(el('footer', { class: 'a4k-kaki a4l-kaki' },
    el('span', { text: 'Dijana melalui Annur OPR (e-Karakter)' }), el('span', { text: 'Muka ' + (i + 1) + ' / ' + muka.length }))));
  return muka;
}

export async function janaPdfLandskap(muka) {
  await sediaHtml2pdf();
  const hos = el('div', { class: 'krk-hos-pdf landskap' });
  muka.forEach(m => { m.style.height = (L_TINGGI - 0.25) + 'px'; hos.append(m); });
  document.body.append(hos);
  const gulung = window.scrollY;
  window.scrollTo(0, 0);
  const musnah = [];
  try {
    muka.forEach(m => { if (m.lukis) musnah.push(m.lukis()); });
    await Promise.all([...hos.querySelectorAll('img')].map(i => i.complete ? null : new Promise(ok => { i.onload = i.onerror = ok; })));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    // Skala 1.5 dan JPEG 0.75: teks jadual masih jelas, saiz kira-kira sepertiga berbanding skala 2
    const pilihan = { margin: 0, image: { type: 'jpeg', quality: 0.75 },
      html2canvas: { scale: 1.5, useCORS: true, scrollX: 0, scrollY: 0, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }, pagebreak: { mode: ['avoid-all', 'css', 'legacy'] } };
    const pangkas = function () {
      const k = this.prop.canvas, pxMuka = Math.floor(k.width * (210 / 297)), penuh = Math.floor(k.height / pxMuka), sisa = k.height - penuh * pxMuka;
      if (penuh >= 1 && sisa > 0 && sisa <= 8) {
        const c = document.createElement('canvas'); c.width = k.width; c.height = penuh * pxMuka;
        c.getContext('2d').drawImage(k, 0, 0); this.prop.canvas = c;
      }
    };
    let w = window.html2pdf().set(pilihan).from(muka[0]).toCanvas().then(pangkas).toPdf();
    for (const m of muka.slice(1)) {
      w = w.get('pdf').then(pdf => { pdf.addPage('a4', 'landscape'); }).from(m).toContainer().toCanvas().then(pangkas).toPdf();
    }
    return await w.outputPdf('blob');
  } finally {
    musnah.forEach(f => { try { f(); } catch (e) { /* abaikan */ } });
    hos.remove();
    window.scrollTo(0, gulung);
  }
}
