// Utiliti kecil yang dikongsi oleh Worker. Tiada kebergantungan luar,
// supaya boleh diuji terus dengan `node --test` tanpa bundler.

const enc = new TextEncoder();
const dec = new TextDecoder();

// ---------------------------------------------------------------- base64url
export function b64url(bytes) {
  let s = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(str) {
  const pad = '='.repeat((4 - (str.length % 4)) % 4);
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomId(bytes = 32) {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256b64url(text) {
  return b64url(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

// ---------------------------------------------------------------- sulitan
// Refresh token admin disimpan dalam KV dalam bentuk tersulit (AES-GCM).
// Kunci diterbitkan daripada secret APP_SECRET melalui HKDF, jadi KV yang
// bocor sahaja tidak cukup untuk menggunakan token itu.
async function kunciToken(appSecret) {
  if (!appSecret || appSecret.length < 32) {
    throw new Error('APP_SECRET belum ditetapkan atau terlalu pendek (min 32 aksara).');
  }
  const bahan = await crypto.subtle.importKey('raw', enc.encode(appSecret), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('annur-opr'), info: enc.encode('refresh-token-v1') },
    bahan, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

export async function sulit(teks, appSecret) {
  const kunci = await kunciToken(appSecret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kunci, enc.encode(teks));
  return 'v1.' + b64url(iv) + '.' + b64url(ct);
}

export async function nyahsulit(blob, appSecret) {
  const [ver, iv, ct] = String(blob || '').split('.');
  if (ver !== 'v1' || !iv || !ct) throw new Error('Format token tersulit tidak sah.');
  const kunci = await kunciToken(appSecret);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64urlDecode(iv) }, kunci, b64urlDecode(ct));
  return dec.decode(pt);
}

// ---------------------------------------------------------------- kuki
export function bacaKuki(req, nama) {
  const h = req.headers.get('Cookie') || '';
  for (const bahagian of h.split(';')) {
    const i = bahagian.indexOf('=');
    if (i === -1) continue;
    if (bahagian.slice(0, i).trim() === nama) return decodeURIComponent(bahagian.slice(i + 1).trim());
  }
  return '';
}

export function kuki(nama, nilai, umurSaat) {
  const asas = `${nama}=${encodeURIComponent(nilai)}; Path=/; HttpOnly; Secure; SameSite=Lax`;
  return umurSaat === 0 ? asas + '; Max-Age=0' : asas + `; Max-Age=${umurSaat}`;
}

// ---------------------------------------------------------------- slug
// Nama terpelihara: laluan sistem sekarang dan yang dirancang, serta nama
// yang boleh mengelirukan pengguna. Slug sekolah tidak boleh guna nama ini.
export const SLUG_TERPELIHARA = new Set([
  'admin', 'api', 'auth', 'daftar', 'login', 'logout', 'masuk', 'keluar',
  'panduan', 'privasi', 'privacy', 'terma', 'harga', 'salepage', 'demo',
  'bantuan', 'support', 'sokongan', 'pemilik', 'owner', 'annur', 'annurpro',
  'opr', 'sistem', 'static', 'assets', 'public', 'www', 'test', 'ujian',
  'sekolah', 'stats', 'status', 'lesen', 'bcl', 'webhook', 'app', 's'
]);

export function semakSlug(slug) {
  const s = String(slug || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(s)) {
    return { ok: false, slug: s, sebab: 'Guna 3-30 aksara: huruf kecil, nombor dan sengkang (-). Tidak boleh bermula atau berakhir dengan sengkang.' };
  }
  if (s.includes('--')) return { ok: false, slug: s, sebab: 'Tidak boleh ada dua sengkang berturut-turut.' };
  if (SLUG_TERPELIHARA.has(s)) return { ok: false, slug: s, sebab: 'Nama ini dikhaskan untuk sistem. Sila pilih nama lain.' };
  return { ok: true, slug: s };
}

export function bersihNama(nama, maks = 120) {
  return String(nama || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, maks);
}

// ---------------------------------------------------------------- respons
export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
  });
}

export function ralat(mesej, status = 400, extra = {}) {
  return json({ ok: false, ralat: mesej, ...extra }, status);
}

export function decodeJwtPayload(jwt) {
  const bahagian = String(jwt || '').split('.');
  if (bahagian.length !== 3) throw new Error('id_token tidak sah.');
  return JSON.parse(dec.decode(b64urlDecode(bahagian[1])));
}
