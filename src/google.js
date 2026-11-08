// Lapisan akses Google Drive + Sheets untuk Worker.
// Semua fungsi menerima `g` = { at: access token admin, f: fetch }.
// Tiada carian ikut nama fail: semua fail dirujuk melalui ID yang disimpan
// (drive.file hanya nampak fail ciptaan app, dan carian tajuk boleh tersilap).

const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export class RalatGoogle extends Error {
  constructor(status, data, operasi) {
    const e = (data && data.error) || {};
    super((operasi ? operasi + ': ' : '') + (e.message || ('HTTP ' + status)));
    this.name = 'RalatGoogle';
    this.status = status;
    this.sebab = e.status || '';
    // Contoh: projek Google Cloud belum enable Sheets API / Drive API.
    const teks = JSON.stringify(e);
    this.apiTidakAktif = /SERVICE_DISABLED|has not been used in project|is disabled/i.test(teks);
    this.tiadaAkses = status === 401;
  }
}

async function panggil(g, url, opsyen = {}, operasi = '') {
  const headers = { Authorization: 'Bearer ' + g.at, ...(opsyen.headers || {}) };
  const res = await g.f(url, { ...opsyen, headers });
  const teks = await res.text();
  let data = null;
  try { data = teks ? JSON.parse(teks) : null; } catch (e) { data = null; }
  if (!res.ok) throw new RalatGoogle(res.status, data, operasi);
  return data;
}

const jsonBadan = (o) => ({ headers: { 'content-type': 'application/json' }, body: JSON.stringify(o) });

// ---------------------------------------------------------------- Drive
export async function ciptaFolder(g, nama, induk) {
  const meta = { name: nama, mimeType: FOLDER_MIME };
  if (induk) meta.parents = [induk];
  const d = await panggil(g, DRIVE + '/files?fields=id,name,webViewLink', { method: 'POST', ...jsonBadan(meta) }, 'Cipta folder');
  return d.id;
}

// Pindahkan fail (cth Sheet yang baru dicipta di root My Drive) ke dalam folder.
export async function pindahKeFolder(g, fileId, folderId) {
  const meta = await panggil(g, DRIVE + '/files/' + fileId + '?fields=parents', {}, 'Baca fail');
  const buang = (meta.parents || []).join(',');
  const q = new URLSearchParams({ addParents: folderId, fields: 'id,parents' });
  if (buang) q.set('removeParents', buang);
  return panggil(g, DRIVE + '/files/' + fileId + '?' + q, { method: 'PATCH', ...jsonBadan({}) }, 'Pindah fail');
}

export async function infoFail(g, fileId) {
  return panggil(g, DRIVE + '/files/' + fileId + '?fields=id,name,trashed,webViewLink', {}, 'Baca fail');
}

// Muat naik fail (multipart). `kandungan` ialah Uint8Array/ArrayBuffer/Blob.
export async function muatNaik(g, folderId, nama, mime, kandungan) {
  const sempadan = 'oprsempadan' + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({ name: nama, parents: [folderId] });
  const badan = new Blob([
    '--' + sempadan + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta + '\r\n',
    '--' + sempadan + '\r\nContent-Type: ' + mime + '\r\n\r\n', kandungan, '\r\n--' + sempadan + '--'
  ]);
  const d = await panggil(g, UPLOAD + '/files?uploadType=multipart&fields=id,name,size',
    { method: 'POST', headers: { 'content-type': 'multipart/related; boundary=' + sempadan }, body: badan }, 'Muat naik fail');
  return d.id;
}

export async function buangKeTong(g, fileId) {
  return panggil(g, DRIVE + '/files/' + fileId + '?fields=id', { method: 'PATCH', ...jsonBadan({ trashed: true }) }, 'Buang fail');
}

// ---------------------------------------------------------------- Sheets
// Cipta spreadsheet dengan tab, baris tajuk, dan data asal dalam SATU panggilan.
// Nilai disimpan sebagai stringValue: tiada formula dinilai (elak formula injection).
export async function ciptaSpreadsheet(g, tajuk, tabs) {
  const sel = (v) => ({ userEnteredValue: { stringValue: String(v ?? '') } });
  const badan = {
    properties: { title: tajuk, locale: 'en_GB', timeZone: 'Asia/Kuala_Lumpur' },
    sheets: tabs.map((t, i) => ({
      properties: { sheetId: i + 1, title: t.nama, index: i, gridProperties: { frozenRowCount: 1 } },
      data: [{ startRow: 0, startColumn: 0, rowData: [t.tajuk, ...(t.baris || [])].map(b => ({ values: b.map(sel) })) }]
    }))
  };
  const d = await panggil(g, SHEETS + '?fields=spreadsheetId,spreadsheetUrl', { method: 'POST', ...jsonBadan(badan) }, 'Cipta Sheet');
  return d.spreadsheetId;
}

const julat = (tab, a1) => encodeURIComponent("'" + tab.replace(/'/g, "''") + "'" + (a1 ? '!' + a1 : ''));

export async function bacaJulat(g, sheetId, tab, a1) {
  const d = await panggil(g, SHEETS + '/' + sheetId + '/values/' + julat(tab, a1) + '?valueRenderOption=UNFORMATTED_VALUE', {}, 'Baca Sheet');
  return (d && d.values) || [];
}

// RAW: nilai disimpan seperti dihantar, tidak dihurai sebagai formula atau tarikh.
export async function tambahBaris(g, sheetId, tab, baris) {
  const url = SHEETS + '/' + sheetId + '/values/' + julat(tab, 'A1') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS';
  const d = await panggil(g, url, { method: 'POST', ...jsonBadan({ values: baris.map(r => r.map(v => v == null ? '' : String(v))) }) }, 'Tambah baris');
  return d && d.updates ? d.updates.updatedRange : '';
}

export async function kemaskiniJulat(g, sheetId, tab, a1, baris) {
  const url = SHEETS + '/' + sheetId + '/values/' + julat(tab, a1) + '?valueInputOption=RAW';
  return panggil(g, url, { method: 'PUT', ...jsonBadan({ values: baris.map(r => r.map(v => v == null ? '' : String(v))) }) }, 'Kemas kini Sheet');
}

// Baca satu tab sebagai senarai objek mengikut baris tajuk sebenar.
export async function bacaObjek(g, sheetId, tab) {
  const v = await bacaJulat(g, sheetId, tab);
  if (!v.length) return [];
  const tajuk = v[0].map(h => String(h).trim());
  return v.slice(1).map((r, i) => {
    const o = { _baris: i + 2 };
    tajuk.forEach((h, j) => { o[h] = r[j] === undefined ? '' : r[j]; });
    return o;
  });
}

export const pautanSheet = (id) => 'https://docs.google.com/spreadsheets/d/' + id + '/edit';
export const pautanFolder = (id) => 'https://drive.google.com/drive/folders/' + id;

// Baca tab dengan susunan tajuk asal (untuk menulis semula satu baris penuh).
export async function bacaJadual(g, sheetId, tab) {
  const v = await bacaJulat(g, sheetId, tab);
  const tajuk = (v[0] || []).map(h => String(h).trim());
  const baris = v.slice(1).map((r, i) => {
    const o = { _baris: i + 2 };
    tajuk.forEach((h, j) => { o[h] = r[j] === undefined ? '' : r[j]; });
    return o;
  });
  return { tajuk, baris };
}

// Muat turun kandungan fail (Response asal dari Google, untuk distrim terus).
export async function muatTurun(g, fileId) {
  const res = await g.f(DRIVE + '/files/' + fileId + '?alt=media', { headers: { Authorization: 'Bearer ' + g.at } });
  if (!res.ok) {
    let data = null; try { data = await res.json(); } catch (e) { /* bukan JSON */ }
    throw new RalatGoogle(res.status, data, 'Muat turun fail');
  }
  return res;
}

// Kosongkan nilai dalam julat (baris kekal; digunakan sebelum menulis semula satu tab kecil).
export async function kosongkanJulat(g, sheetId, tab, a1) {
  return panggil(g, SHEETS + '/' + sheetId + '/values/' + julat(tab, a1) + ':clear', { method: 'POST', ...jsonBadan({}) }, 'Kosongkan julat');
}
