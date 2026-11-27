// Modal tandatangan (S-04): Lukis (jari/stylus/tetikus), Upload (imej -> latar telus), Tersimpan.
// Keluaran: PNG telus, dipangkas, maksimum 800 x 300 piksel dan 150KB.
import { el, api } from '/app.js';

const MAKS_W = 800, MAKS_H = 300, HAD_BAIT = 140 * 1000;

// Pangkas ruang kosong (piksel telus) dan kecilkan supaya muat 800 x 300.
export function pangkasDanKecilkan(kanvas) {
  const ctx = kanvas.getContext('2d');
  const { width: w, height: h } = kanvas;
  const d = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;                       // kosong
  const pad = 8;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  let skala = Math.min(1, MAKS_W / cw, MAKS_H / ch);
  for (let cuba = 0; cuba < 6; cuba++) {
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(cw * skala)); out.height = Math.max(1, Math.round(ch * skala));
    const o = out.getContext('2d');
    o.imageSmoothingQuality = 'high';
    o.drawImage(kanvas, x0, y0, cw, ch, 0, 0, out.width, out.height);
    const url = out.toDataURL('image/png');
    if (url.length * 0.75 <= HAD_BAIT) return url;
    skala *= 0.8;
  }
  return null;
}

// Imej yang dimuat naik: jadikan latar terang telus, kemudian pangkas.
async function imejKeTandatangan(fail) {
  const url = URL.createObjectURL(fail);
  try {
    const img = await new Promise((ok, gagal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = gagal; i.src = url; });
    const s = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const data = ctx.getImageData(0, 0, c.width, c.height);
    const p = data.data;
    for (let i = 0; i < p.length; i += 4) {
      const terang = (p[i] + p[i + 1] + p[i + 2]) / 3;
      if (terang > 200) p[i + 3] = 0;               // latar kertas -> telus
      else { p[i] = 17; p[i + 1] = 24; p[i + 2] = 39; } // dakwat -> gelap seragam
    }
    ctx.putImageData(data, 0, 0);
    return pangkasDanKecilkan(c);
  } finally { URL.revokeObjectURL(url); }
}

// Pulangkan Promise: { dataUrl, simpan } (baharu), { tersimpan: true, fileId, src } atau null (batal).
export function bukaTandatangan({ A, adaTersimpan }) {
  return new Promise((selesai) => {
    let mod = adaTersimpan ? 'Tersimpan' : 'Lukis';
    let hasilUpload = null, tersimpan = null, kosong = true;
    const d = el('dialog', { class: 'krk-dialog', id: 'dialogTtd', 'aria-labelledby': 'tajukTtd' });
    const tab = el('nav', { class: 'tab tab-kecil', role: 'tablist' });
    const panel = el('div', { class: 'krk-ttd-panel' });
    const ralat = el('p', { class: 'kecil', id: 'ralatTtd', style: 'color:var(--bahaya);min-height:1.2em;margin:6px 0 0' });
    const simpan = el('input', { type: 'checkbox', id: 'simpanTtd' });
    simpan.checked = true;
    const blokSimpan = el('label', { class: 'semak-kotak', style: 'margin-top:8px' }, simpan, el('span', { text: 'Simpan tandatangan ini untuk laporan akan datang' }));
    const guna = el('button', { type: 'button', class: 'butang', id: 'gunaTtd', text: 'Guna tandatangan' });
    const batal = el('button', { type: 'button', class: 'butang sekunder', text: 'Batal' });
    d.append(el('h2', { id: 'tajukTtd', text: 'Tandatangan' }), tab, panel, ralat, blokSimpan,
      el('div', { class: 'baris-butang ruang-atas' }, guna, batal));

    // ------------------------------------------------ Lukis
    const kanvas = el('canvas', { id: 'kanvasTtd', class: 'krk-kanvas', 'aria-label': 'Ruang tandatangan. Lukis dengan jari atau tetikus.' });
    const petunjuk = el('div', { class: 'krk-kanvas-petunjuk', text: 'Tandatangan di sini' });
    const bekasKanvas = el('div', { class: 'krk-kanvas-bekas' }, kanvas, petunjuk, el('div', { class: 'krk-kanvas-garis' }));
    let lukis = false, ctx = null;
    function saizKanvas() {
      const dpr = window.devicePixelRatio || 1, w = bekasKanvas.clientWidth || 300;
      kanvas.width = Math.round(w * dpr); kanvas.height = Math.round(160 * dpr);
      ctx = kanvas.getContext('2d');
      ctx.scale(dpr, dpr); ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111827';
      kosong = true; petunjuk.hidden = false;
    }
    const titik = (e) => { const r = kanvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    kanvas.addEventListener('pointerdown', (e) => {
      e.preventDefault(); kanvas.setPointerCapture(e.pointerId); lukis = true;
      const [x, y] = titik(e); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.01, y); ctx.stroke();
      kosong = false; petunjuk.hidden = true;
    });
    kanvas.addEventListener('pointermove', (e) => {
      if (!lukis) return;
      for (const ev of (e.getCoalescedEvents ? e.getCoalescedEvents() : [e])) { const [x, y] = titik(ev); ctx.lineTo(x, y); }
      ctx.stroke();
    });
    const tamat = () => { lukis = false; };
    kanvas.addEventListener('pointerup', tamat); kanvas.addEventListener('pointercancel', tamat);
    const padam = el('button', { type: 'button', class: 'butang sekunder', id: 'padamTtd', text: 'Padam', onclick: () => saizKanvas() });

    // ------------------------------------------------ Upload
    const input = el('input', { type: 'file', id: 'failTtd', accept: 'image/png,image/jpeg,image/webp' });
    const pratonton = el('img', { class: 'krk-ttd-imej', alt: 'Pratonton tandatangan', hidden: '' });
    input.onchange = async () => {
      ralat.textContent = '';
      const f = input.files && input.files[0];
      if (!f) return;
      hasilUpload = await imejKeTandatangan(f).catch(() => null);
      if (!hasilUpload) { ralat.textContent = 'Imej tidak dapat dibaca atau tiada tandatangan dikesan. Guna gambar tandatangan dakwat gelap atas kertas putih.'; return; }
      pratonton.src = hasilUpload; pratonton.hidden = false;
    };

    // ------------------------------------------------ Tersimpan
    const imejSimpan = el('img', { class: 'krk-ttd-imej', alt: 'Tandatangan tersimpan' });
    async function muatTersimpan() {
      if (tersimpan) return;
      const r = await api(A('/karakter/ttd'));
      if (!r.ok || !r.ada) { ralat.textContent = 'Tiada tandatangan tersimpan.'; return; }
      const res = await fetch(A('/karakter/ttd/gambar'), { credentials: 'same-origin' });
      if (!res.ok) { ralat.textContent = 'Tandatangan tersimpan tidak dapat dimuatkan.'; return; }
      tersimpan = { fileId: r.fileId, src: URL.createObjectURL(await res.blob()) };
      imejSimpan.src = tersimpan.src;
    }

    function buka(m) {
      mod = m; ralat.textContent = '';
      tab.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.m === m)));
      panel.textContent = '';
      blokSimpan.hidden = m === 'Tersimpan';
      if (m === 'Lukis') { panel.append(bekasKanvas, el('p', { class: 'baris-butang', style: 'margin-top:8px' }, padam)); saizKanvas(); }
      else if (m === 'Upload') panel.append(el('p', { class: 'redup kecil', text: 'Ambil gambar tandatangan anda atas kertas putih. Latar akan dibuang secara automatik.' }), input, pratonton);
      else { panel.append(imejSimpan); muatTersimpan(); }
    }
    [...(adaTersimpan ? ['Tersimpan'] : []), 'Lukis', 'Upload'].forEach(m => tab.append(el('button', { type: 'button', role: 'tab', 'data-m': m, text: m, onclick: () => buka(m) })));

    const tutup = (hasil) => { d.close(); d.remove(); selesai(hasil); };
    batal.onclick = () => tutup(null);
    d.addEventListener('cancel', (e) => { e.preventDefault(); tutup(null); });
    guna.onclick = () => {
      ralat.textContent = '';
      if (mod === 'Lukis') {
        if (kosong) { ralat.textContent = 'Sila tandatangan dalam ruang di atas dahulu.'; return; }
        const url = pangkasDanKecilkan(kanvas);
        if (!url) { ralat.textContent = 'Tandatangan tidak dapat diproses. Cuba lagi.'; return; }
        return tutup({ dataUrl: url, simpan: simpan.checked });
      }
      if (mod === 'Upload') {
        if (!hasilUpload) { ralat.textContent = 'Pilih gambar tandatangan dahulu.'; return; }
        return tutup({ dataUrl: hasilUpload, simpan: simpan.checked });
      }
      if (!tersimpan) { ralat.textContent = 'Tandatangan tersimpan belum dimuatkan.'; return; }
      return tutup({ tersimpan: true, fileId: tersimpan.fileId, src: tersimpan.src });
    };
    document.body.append(d);
    d.showModal();
    buka(mod);
  });
}
