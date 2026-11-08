// Palsu dikongsi: KV, aset, Google OAuth + Drive + Sheets dalam memori.
// Digunakan oleh ujian unit (worker.test.js) dan ujian browser (e2e.mjs).
import assert from 'node:assert/strict';
import { b64url } from '../src/lib.js';

export const ASAS = 'https://opr.annurpro.com';
export const CLIENT_ID = 'ujian.apps.googleusercontent.com';
export const DRIVE = 'https://www.googleapis.com/auth/drive.file';
export const T0 = Date.UTC(2026, 10, 8, 2, 0, 0);

// ---------------------------------------------------------------- palsu
export function kvPalsu() {
  const m = new Map();
  return {
    m,
    async get(k, jenis) { const v = m.has(k) ? m.get(k) : null; return v !== null && jenis === 'json' ? JSON.parse(v) : v; },
    async put(k, v) { m.set(k, String(v)); },
    async delete(k) { m.delete(k); },
    async list({ prefix = '', cursor } = {}) {
      const semua = [...m.keys()].filter(k => k.startsWith(prefix)).sort();
      const mula = cursor ? Number(cursor) : 0, had = 2;   // halaman kecil supaya paging diuji
      const keys = semua.slice(mula, mula + had).map(name => ({ name }));
      const tamat = mula + had >= semua.length;
      return { keys, list_complete: tamat, cursor: tamat ? undefined : String(mula + had) };
    }
  };
}

export function env(lebih = {}) {
  return {
    BASE_URL: ASAS,
    GOOGLE_CLIENT_ID: CLIENT_ID,
    GOOGLE_CLIENT_SECRET: 'rahsia-ujian',
    APP_SECRET: 'a'.repeat(48),
    OPR_KV: kvPalsu(),
    ASSETS: { fetch: async (r) => new Response('ASET ' + new URL(r.url).pathname, { headers: { 'content-type': 'text/html' } }) },
    ...lebih
  };
}

export function idToken(tuntutan) {
  const bhg = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  return bhg({ alg: 'RS256' }) + '.' + bhg(tuntutan) + '.sig';
}

// Google palsu: OAuth + Drive + Sheets dalam memori. Rekod setiap panggilan.
export function googlePalsu(senario = {}) {
  senario = senario || {};
  const panggilan = [];
  const fail = new Map();      // id -> { name, mimeType, parents, trashed }
  const sheet = new Map();     // id -> { title, tabs: Map(nama -> rows[][]) }
  let kiraan = 0;
  const gagalSheetKali = { n: senario.gagalSheetKali || 0 };

  const f = async (url, opt = {}) => {
    const u = String(url);
    const kaedah = (opt.method || 'GET').toUpperCase();
    const teks = opt.body instanceof Blob ? '' : (opt.body ? String(opt.body) : '');
    const badanForm = u.startsWith('https://oauth2.googleapis.com/token') ? new URLSearchParams(teks) : null;
    panggilan.push({ url: u, kaedah, badan: badanForm });

    if (u === 'https://oauth2.googleapis.com/token' && badanForm.get('grant_type') === 'authorization_code') {
      const email = senario.email || 'admin@sekolah.edu.my';
      return Response.json({
        access_token: 'akses-1',
        refresh_token: senario.tiadaRefresh ? undefined : 'refresh-' + email,
        scope: senario.skop || ('openid https://www.googleapis.com/auth/userinfo.email ' + DRIVE),
        id_token: idToken({
          iss: 'https://accounts.google.com', aud: senario.aud || CLIENT_ID,
          exp: Math.floor(T0 / 1000) + 3600, email, email_verified: true, name: 'Cikgu Ujian'
        })
      });
    }
    if (u === 'https://oauth2.googleapis.com/token' && badanForm.get('grant_type') === 'refresh_token') {
      if (senario.refreshMati) return Response.json({ error: 'invalid_grant' }, { status: 400 });
      return Response.json({ access_token: 'akses-2', scope: DRIVE });
    }
    // ---- API BCL palsu: senario.bclPesanan = { ORDER: data transaksi }
    const mBcl = u.match(/^https:\/\/bcl\.test\/api\/transactions\/([^/?]+)$/);
    if (mBcl) {
      const o = (senario.bclPesanan || {})[decodeURIComponent(mBcl[1])];
      return o ? Response.json({ success: true, data: o }) : Response.json({ success: false }, { status: 404 });
    }
    if (u.startsWith('https://oauth2.googleapis.com/tokeninfo')) {
      return Response.json({ scope: DRIVE, email: senario.email || 'admin@sekolah.edu.my' });
    }

    if (senario.refreshMati && /googleapis\.com\/(drive|upload|v4\/spreadsheets)|sheets\.googleapis\.com/.test(u)) {
      return Response.json({ error: { code: 401, message: 'Invalid Credentials' } }, { status: 401 });
    }
    // ---- Drive: muat naik multipart (metadata JSON + kandungan)
    if (u.startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
      const raw = new Uint8Array(await opt.body.arrayBuffer());
      // Tukar bait->aksara satu-satu (TextDecoder 'latin1' ialah windows-1252; ia merosakkan 0x80-0x9F)
      let teksPenuh = '';
      for (let i = 0; i < raw.length; i++) teksPenuh += String.fromCharCode(raw[i]);
      const sempadan = (opt.headers['content-type'].match(/boundary=(.+)$/) || [])[1];
      const bhg = teksPenuh.split('--' + sempadan);
      const meta = JSON.parse(bhg[1].split('\r\n\r\n')[1].trim());
      const [kepala, ...isi] = bhg[2].split('\r\n\r\n');
      const mime = kepala.match(/Content-Type: ([^\r\n]+)/)[1];
      const kandungan = isi.join('\r\n\r\n').replace(/\r\n$/, '');
      const data = Uint8Array.from(kandungan, c => c.charCodeAt(0));
      const nid = 'upl' + String(++kiraan).padStart(8, '0');
      fail.set(nid, { name: meta.name, mimeType: mime, parents: meta.parents || ['root'], trashed: false, data });
      return Response.json({ id: nid, name: meta.name, size: String(data.length) });
    }
    // ---- Drive
    const mDrive = u.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files(?:\/([^?]+))?(?:\?(.*))?$/);
    if (mDrive) {
      const [, id, qs] = mDrive; const q = new URLSearchParams(qs || '');
      if (!id && kaedah === 'POST') {
        const meta = JSON.parse(teks);
        const nid = 'fold-' + (++kiraan);
        fail.set(nid, { name: meta.name, mimeType: meta.mimeType, parents: meta.parents || ['root'], trashed: false });
        return Response.json({ id: nid, name: meta.name });
      }
      const rec = fail.get(id);
      if (!rec) return Response.json({ error: { code: 404, message: 'File not found: ' + id } }, { status: 404 });
      if (kaedah === 'GET' && q.get('alt') === 'media') return new Response(rec.data || new Uint8Array(), { headers: { 'content-type': rec.mimeType } });
      if (kaedah === 'GET') return Response.json({ id, name: rec.name, parents: rec.parents, trashed: rec.trashed });
      if (kaedah === 'PATCH') {
        const tambah = q.get('addParents'), buang = q.get('removeParents');
        if (buang) rec.parents = rec.parents.filter(x => !buang.split(',').includes(x));
        if (tambah) rec.parents.push(...tambah.split(','));
        const meta = teks ? JSON.parse(teks) : {};
        if (meta.trashed) rec.trashed = true;
        return Response.json({ id, parents: rec.parents });
      }
    }

    // ---- Sheets
    if (u.startsWith('https://sheets.googleapis.com/v4/spreadsheets')) {
      if (kaedah === 'POST' && /\/spreadsheets\?/.test(u)) {
        if (gagalSheetKali.n > 0) {
          gagalSheetKali.n--;
          return Response.json({ error: { code: 403, status: 'PERMISSION_DENIED',
            message: 'Google Sheets API has not been used in project 98079080039 before or it is disabled.' } }, { status: 403 });
        }
        const badan = JSON.parse(teks);
        const sid = 'sheet-' + (++kiraan);
        const tabs = new Map();
        badan.sheets.forEach(sh => {
          const rows = (sh.data[0].rowData || []).map(r => r.values.map(c => {
            assert.ok('stringValue' in c.userEnteredValue, 'semua sel mesti stringValue');
            return c.userEnteredValue.stringValue;
          }));
          tabs.set(sh.properties.title, rows);
        });
        sheet.set(sid, { title: badan.properties.title, tabs });
        fail.set(sid, { name: badan.properties.title, mimeType: 'sheet', parents: ['root'], trashed: false });
        return Response.json({ spreadsheetId: sid });
      }
      if (senario.tolak401Sekali) { senario.tolak401Sekali = false; return Response.json({ error: { code: 401, message: 'Invalid Credentials' } }, { status: 401 }); }
      const m = u.match(/\/spreadsheets\/([^/]+)\/values\/([^?:]+)(:append|:clear)?/);
      const sh = m && sheet.get(m[1]);
      if (!sh) return Response.json({ error: { code: 404, message: 'Requested entity was not found.' } }, { status: 404 });
      const tab = decodeURIComponent(m[2]).replace(/^'|'(!.*)?$/g, '').replace(/''/g, "'");
      const rows = sh.tabs.get(tab);
      if (m[3] === ':clear') {
        const dari = Number(decodeURIComponent(m[2]).match(/!A(\d+):/)[1]);
        rows.length = Math.min(rows.length, dari - 1);
        return Response.json({ clearedRange: tab });
      }
      if (kaedah === 'PUT') {
        assert.match(u, /valueInputOption=RAW/);
        const baris = Number(decodeURIComponent(m[2]).match(/!A(\d+):/)[1]);
        JSON.parse(teks).values.forEach((v, i) => { rows[baris - 1 + i] = v; });
        return Response.json({ updatedRange: tab });
      }
      if (m[3]) {
        assert.match(u, /valueInputOption=RAW/);
        rows.push(...JSON.parse(teks).values);
        return Response.json({ updates: { updatedRange: tab + '!A' + rows.length } });
      }
      return Response.json({ values: rows });
    }
    return new Response('tidak dijangka: ' + u, { status: 599 });
  };
  return { f, panggilan, fail, sheet, senario };
}

