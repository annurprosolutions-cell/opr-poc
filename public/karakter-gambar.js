// Gambar aktiviti e-Karakter: pangkas (crop) ke bingkai tetap 3:2 supaya tidak terpenyet dalam PDF.
// Pangkasan dibakar ke dalam gambar sebelum dimuat naik (1200 x 800 JPEG). Pengguna boleh laras
// kedudukan (seret), zoom, putar dan muat penuh sebelum menggunakannya.
import { el } from '/app.js';

export const RASIO_W = 3, RASIO_H = 2;
const KELUAR_W = 1200, KELUAR_H = 800, SISI_ASAL = 2000;
const had = (n, a, b) => Math.min(b, Math.max(a, n));

function muatImej(src) {
  return new Promise((ok, gagal) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => gagal(new Error('Gambar tidak dapat dibaca.'));
    i.src = src;
  });
}

// Lukis imej ke dalam bingkai W x H mengikut tetapan { z: zoom (1 = penuhi bingkai), cx, cy: pusat dalam pecahan imej }.
// Fungsi yang sama digunakan untuk pratonton dan hasil akhir, jadi pangkasan sentiasa sepadan.
export function lukisBingkai(ctx, img, W, H, st) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const s0 = Math.max(W / iw, H / ih), sk = s0 * st.z, w = iw * sk, h = ih * sk;
  const ox = w >= W ? had(W / 2 - st.cx * w, W - w, 0) : (W - w) / 2;
  const oy = h >= H ? had(H / 2 - st.cy * h, H - h, 0) : (H - h) / 2;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, ox, oy, w, h);
  return { ox, oy, w, h };
}
const zoomMin = (img, W = RASIO_W, H = RASIO_H) => {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  return Math.min(1, Math.min(W / iw, H / ih) / Math.max(W / iw, H / ih));
};

function keDataUrl(img, st) {
  const c = document.createElement('canvas'); c.width = KELUAR_W; c.height = KELUAR_H;
  lukisBingkai(c.getContext('2d'), img, KELUAR_W, KELUAR_H, st);
  return c.toDataURL('image/jpeg', 0.86);
}

// Gambar baharu: kecilkan (simpan sebagai sumber untuk laras kemudian) dan pangkas ke tengah.
export async function pangkasAuto(dataUrl) {
  const img = await muatImej(dataUrl);
  const skala = Math.min(1, SISI_ASAL / Math.max(img.naturalWidth, img.naturalHeight));
  let asal = dataUrl, sumber = img;
  if (skala < 1) {
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * skala); c.height = Math.round(img.naturalHeight * skala);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    asal = c.toDataURL('image/jpeg', 0.88);
    sumber = await muatImej(asal);
  }
  const st = { z: 1, cx: 0.5, cy: 0.5 };
  return { asal, st, hasil: keDataUrl(sumber, st) };
}

// Dialog laras. Pulangkan { dataUrl, st, asal } atau null (batal).
export function bukaLaras(sumber, tetapanAwal) {
  return new Promise((selesai) => {
    let img = null, st = { z: 1, cx: 0.5, cy: 0.5, ...(tetapanAwal || {}) }, asal = sumber, zMin = 1;
    const d = el('dialog', { class: 'krk-dialog', id: 'dialogLaras', 'aria-labelledby': 'tajukLaras' });
    const kanvas = el('canvas', { class: 'krk-laras-kanvas', id: 'kanvasLaras', tabindex: '0',
      'aria-label': 'Pratonton pangkasan. Seret untuk menggerakkan gambar. Anak panah menggerak, tanda tambah dan tolak untuk zoom.' });
    const zoom = el('input', { type: 'range', id: 'zoomLaras', min: '0.5', max: '3', step: '0.01', value: '1', 'aria-label': 'Zoom' });
    const ralat = el('p', { class: 'kecil', style: 'color:var(--bahaya);min-height:1.2em;margin:6px 0 0' });
    const guna = el('button', { type: 'button', class: 'butang', id: 'gunaLaras', text: 'Guna pangkasan' });
    const batal = el('button', { type: 'button', class: 'butang sekunder', text: 'Batal' });
    const putar = el('button', { type: 'button', class: 'butang sekunder kecil-butang', id: 'putarLaras', text: 'Putar 90°' });
    const muat = el('button', { type: 'button', class: 'butang sekunder kecil-butang', id: 'muatLaras', text: 'Muat penuh' });
    const isi = el('button', { type: 'button', class: 'butang sekunder kecil-butang', id: 'isiLaras', text: 'Penuhi bingkai' });
    d.append(el('h2', { id: 'tajukLaras', text: 'Laras gambar' }),
      el('p', { class: 'redup kecil', text: 'Bingkai tetap 3:2 seperti dalam PDF. Seret gambar untuk mengubah kedudukan, guna slider untuk zoom.' }),
      kanvas,
      el('div', { class: 'krk-laras-kawal' }, el('label', { for: 'zoomLaras', class: 'kecil', style: 'margin:0', text: 'Zoom' }), zoom),
      el('div', { class: 'baris-butang', style: 'margin-top:8px' }, putar, muat, isi),
      ralat, el('div', { class: 'baris-butang ruang-atas' }, guna, batal));

    const ctx = () => kanvas.getContext('2d');
    function lukis() {
      if (!img) return;
      lukisBingkai(ctx(), img, kanvas.width, kanvas.height, st);
    }
    function saiz() {
      const dpr = window.devicePixelRatio || 1, w = kanvas.clientWidth || 360;
      kanvas.width = Math.round(w * dpr); kanvas.height = Math.round(w * dpr * RASIO_H / RASIO_W);
      lukis();
    }
    function tetapZoom(z) {
      st.z = had(z, zMin, 3); zoom.value = String(st.z); lukis();
    }
    async function muatSumber(src) {
      img = await muatImej(src);
      zMin = Math.min(zoomMin(img), 1);
      zoom.min = String(Math.min(0.5, zMin).toFixed(2));
      st.z = had(st.z, zMin, 3); zoom.value = String(st.z);
      lukis();
    }

    // Seret
    let titik = null;
    kanvas.addEventListener('pointerdown', (e) => { kanvas.setPointerCapture(e.pointerId); titik = [e.clientX, e.clientY]; kanvas.classList.add('menyeret'); });
    kanvas.addEventListener('pointermove', (e) => {
      if (!titik || !img) return;
      const dx = e.clientX - titik[0], dy = e.clientY - titik[1]; titik = [e.clientX, e.clientY];
      const k = kanvas.width / kanvas.clientWidth;
      const W = kanvas.width, H = kanvas.height, iw = img.naturalWidth, ih = img.naturalHeight;
      const sk = Math.max(W / iw, H / ih) * st.z;
      st.cx = had(st.cx - (dx * k) / (iw * sk), 0, 1); st.cy = had(st.cy - (dy * k) / (ih * sk), 0, 1);
      lukis();
    });
    const lepas = () => { titik = null; kanvas.classList.remove('menyeret'); };
    kanvas.addEventListener('pointerup', lepas); kanvas.addEventListener('pointercancel', lepas);
    kanvas.addEventListener('wheel', (e) => { e.preventDefault(); tetapZoom(st.z * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); }, { passive: false });
    kanvas.addEventListener('keydown', (e) => {
      const langkah = 0.03 / st.z;
      if (e.key === 'ArrowLeft') st.cx = had(st.cx - langkah, 0, 1);
      else if (e.key === 'ArrowRight') st.cx = had(st.cx + langkah, 0, 1);
      else if (e.key === 'ArrowUp') st.cy = had(st.cy - langkah, 0, 1);
      else if (e.key === 'ArrowDown') st.cy = had(st.cy + langkah, 0, 1);
      else if (e.key === '+' || e.key === '=') tetapZoom(st.z * 1.1);
      else if (e.key === '-') tetapZoom(st.z / 1.1);
      else return;
      e.preventDefault(); lukis();
    });
    zoom.oninput = () => tetapZoom(parseFloat(zoom.value));
    muat.onclick = () => { st.cx = 0.5; st.cy = 0.5; tetapZoom(zMin); };
    isi.onclick = () => { st.cx = 0.5; st.cy = 0.5; tetapZoom(1); };
    putar.onclick = async () => {
      try {
        const c = document.createElement('canvas'); c.width = img.naturalHeight; c.height = img.naturalWidth;
        const x = c.getContext('2d'); x.translate(c.width, 0); x.rotate(Math.PI / 2); x.drawImage(img, 0, 0);
        asal = c.toDataURL('image/jpeg', 0.9);
        st = { z: 1, cx: 0.5, cy: 0.5 };
        await muatSumber(asal);
      } catch (e) { ralat.textContent = 'Gambar tidak dapat diputar.'; }
    };

    const tutup = (hasil) => { d.close(); d.remove(); window.removeEventListener('resize', saiz); selesai(hasil); };
    guna.onclick = () => { if (img) tutup({ dataUrl: keDataUrl(img, st), st: { ...st }, asal }); };
    batal.onclick = () => tutup(null);
    d.addEventListener('cancel', (e) => { e.preventDefault(); tutup(null); });
    document.body.append(d);
    d.showModal();
    window.addEventListener('resize', saiz);
    saiz();
    muatSumber(sumber).catch(() => { ralat.textContent = 'Gambar tidak dapat dimuatkan.'; });
  });
}
