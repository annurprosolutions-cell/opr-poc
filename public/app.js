// Pembantu kecil dikongsi semua halaman. Semua teks pengguna melalui
// textContent, bukan innerHTML, supaya tiada laluan XSS.

export const $ = (id) => document.getElementById(id);

export function el(tag, attrs = {}, ...anak) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  anak.flat().forEach(a => n.append(a instanceof Node ? a : document.createTextNode(String(a))));
  return n;
}

export async function api(laluan, opsyen = {}) {
  const res = await fetch(laluan, {
    method: opsyen.method || 'GET',
    credentials: 'same-origin',
    headers: opsyen.body ? { 'content-type': 'application/json' } : {},
    body: opsyen.body ? JSON.stringify(opsyen.body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch (e) { /* bukan JSON */ }
  return { status: res.status, ...data };
}

export function mesej(bekas, jenis, teks) {
  bekas.textContent = '';
  if (!teks) return;
  bekas.append(el('div', { class: 'mesej ' + jenis, text: teks }));
}

export async function logKeluar() {
  await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' });
  location.reload();
}

// Mesej untuk kod ralat yang dihantar Worker melalui ?ralat=
export const MESEJ_RALAT = {
  access_denied: 'Log masuk dibatalkan.',
  state_tidak_sepadan: 'Sesi log masuk tidak sepadan. Sila cuba sekali lagi dari halaman ini.',
  state_luput: 'Sesi log masuk telah tamat (lebih 10 minit). Sila cuba lagi.',
  tukar_token_gagal: 'Google tidak dapat mengesahkan log masuk. Sila cuba lagi.',
  id_token_rosak: 'Respons Google tidak sah. Sila cuba lagi.',
  id_token_tidak_sah: 'Respons Google tidak sah. Sila cuba lagi.',
  emel_tidak_disahkan: 'Emel akaun Google ini belum disahkan.',
  drive_tidak_dibenarkan: 'Kebenaran Google Drive tidak diberikan. Pada skrin Google, pastikan kotak untuk Google Drive ditanda, kemudian cuba lagi.',
  tiada_refresh_token: 'Google tidak memberi akses berterusan. Sila cuba sambung semula.'
};

export function ralatDariUrl() {
  const q = new URLSearchParams(location.search);
  const kod = q.get('ralat');
  const butiran = String(q.get('d') || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40);
  if (!kod) return '';
  const asas = MESEJ_RALAT[kod] || 'Log masuk tidak berjaya (' + kod + ').';
  return butiran ? asas + ' [kod: ' + butiran + ']' : asas;
}
