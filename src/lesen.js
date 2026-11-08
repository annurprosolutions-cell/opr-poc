// Lesen (langganan) sekolah + webhook BCL.
// Logik tarikh, padanan item BCL dan pengesahan pesanan dipindah daripada
// Worker lesen Annur Time Table (annurprosolutions-cell/ruztimetable,
// worker/index.mjs) yang sudah digunakan dengan bayaran sebenar. Beza utama:
// lesen OPR dikunci ikut SEKOLAH (slug), bukan e-mel.
//
// KV (OPR_KV):
//   lesen:<slug>    {plan, expires, day, since, updatedAt}   plan: percubaan | bulanan | tahunan | pilot
//   trial:<email>   tarikh percubaan diberi (sekali sahaja bagi setiap e-mel admin)
//   bcl:<order>     bayaran sudah diproses (idempotensi) {slug|email, months, amount, at, expires}
//   bcl:dd:<ref>    potongan auto-debit sudah diproses
//   mandate:<order> {email, school, at}
//   kredit:<email>  bayaran sebelum sekolah didaftar {months, orders[], school, at}
//   log:<iso>:<id>  log webhook ringkas (luput 90 hari)

export const PLAN_TRIAL = 'percubaan';
const numEnv = (v, d) => (v !== undefined && v !== '' && Number.isFinite(+v) ? +v : d);

// Tarikh ikut waktu Malaysia (UTC+8), format YYYY-MM-DD.
export const hariIni = (now) => new Date(now + 8 * 3600e3).toISOString().slice(0, 10);
const bezaHari = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
export const tambahHari = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
// Tambah bulan kalendar dengan hari berlabuh: 30 Nov + 1 bulan x3 = 30 Dis, 30 Jan, 28 Feb, 30 Mac.
export const tambahBulan = (iso, n, day) => {
  const [y, m, d] = iso.split('-').map(Number), mahu = Math.max(d, day | 0);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const akhir = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(mahu, akhir));
  return t.toISOString().slice(0, 10);
};

const bacaJson = async (env, k) => { try { return JSON.parse((await env.OPR_KV.get(k)) || 'null'); } catch (e) { return null; } };

// Nilai status lesen. ok=false bermakna operasi tulis disekat.
export function nilai(lesen, now, env) {
  const grace = numEnv(env.GRACE_DAYS, 7);
  if (!lesen) return { ok: false, reason: 'tiada' };
  const out = { plan: lesen.plan || '', expires: lesen.expires || '' };
  if (!lesen.expires) return { ...out, ok: true, reason: 'ok', daysLeft: null };
  const baki = bezaHari(hariIni(now), lesen.expires);
  if (baki >= 0) return { ...out, ok: true, reason: 'ok', daysLeft: baki };
  // Tempoh ihsan hanya untuk pelanggan berbayar yang lewat memperbaharui, bukan percubaan
  if (lesen.plan === PLAN_TRIAL) return { ...out, ok: false, reason: 'percubaan-tamat', daysLeft: baki };
  if (-baki <= grace) return { ...out, ok: true, reason: 'tamat-tempoh-ihsan', daysLeft: baki };
  return { ...out, ok: false, reason: 'tamat', daysLeft: baki };
}

// Mulakan percubaan percuma sekali sahaja bagi setiap e-mel admin.
export async function mulaPercubaan(env, slug, email, now) {
  const hari = numEnv(env.TRIAL_DAYS, 14);
  if (hari <= 0 || await env.OPR_KV.get('trial:' + email)) return null;
  const t = hariIni(now);
  const lesen = { plan: PLAN_TRIAL, expires: tambahHari(t, hari - 1), since: t, updatedAt: new Date(now).toISOString() };
  await env.OPR_KV.put('trial:' + email, t);
  await env.OPR_KV.put('lesen:' + slug, JSON.stringify(lesen));
  return lesen;
}

// Lesen sekolah; sekolah lama (sebelum Fasa 4) tanpa lesen diberi percubaan sekali.
export async function lesenSekolah(env, sek, now) {
  return (await bacaJson(env, 'lesen:' + sek.slug)) || (await mulaPercubaan(env, sek.slug, sek.adminEmail, now));
}

// Lanjutkan lesen: dari tarikh tamat semasa jika masih aktif (termasuk baki percubaan), jika tidak dari hari ini.
export async function lanjutLesen(env, slug, bulan, now) {
  const kunci = 'lesen:' + slug, t = hariIni(now);
  const kini = await bacaJson(env, kunci);
  const aktif = kini && kini.expires && kini.expires >= t, asas = aktif ? kini.expires : t;
  const day = aktif && kini.day ? kini.day : +asas.slice(8);
  // Pelan tahunan yang masih aktif kekal tahunan bila bulan tambahan diberi (cth +1 bulan oleh pemilik).
  const plan = bulan >= 12 || (aktif && kini.plan === 'tahunan') ? 'tahunan' : 'bulanan';
  const lesen = { plan, expires: tambahBulan(asas, bulan, day), day,
    since: (kini && kini.since) || t, updatedAt: new Date(now).toISOString() };
  await env.OPR_KV.put(kunci, JSON.stringify(lesen));
  return lesen;
}

// Pakai kredit (bayaran sebelum sekolah didaftar) kepada sekolah.
export async function pakaiKredit(env, slug, email, now) {
  const k = await bacaJson(env, 'kredit:' + email);
  if (!k || !k.months) return null;
  const lesen = await lanjutLesen(env, slug, k.months, now);
  for (const o of k.orders || []) {
    const b = await bacaJson(env, 'bcl:' + o);
    if (b) await env.OPR_KV.put('bcl:' + o, JSON.stringify({ ...b, slug, kreditDipakai: hariIni(now) }));
  }
  await env.OPR_KV.delete('kredit:' + email);
  return lesen;
}

// ---------------------------------------------------------------- BCL
const EMEL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// E-mel Google admin: medan borang yang menyebut google/emel/log masuk; jika tiada, e-mel pembayar.
export function pilihEmel(custom, fallback) {
  const entri = Object.entries(custom || {}).map(([k, v]) => [k, String(v == null ? '' : v).trim().toLowerCase()]).filter(([, v]) => EMEL.test(v));
  const hit = entri.find(([k]) => /google|login|log ?masuk|akaun|e-?mel|email/i.test(k)) || entri[0];
  const v = hit ? hit[1] : String(fallback || '').trim().toLowerCase();
  return EMEL.test(v) ? v : '';
}
export function pilihSekolah(custom) {
  const e = Object.entries(custom || {}).find(([k, v]) => /sekolah|school|institusi/i.test(k) && String(v || '').trim());
  return e ? String(e[1]).trim().slice(0, 120) : '';
}
// Pautan sekolah dalam mana-mana medan (cth "opr.annurpro.com/s/smkwakanda") mengatasi padanan e-mel.
export function pilihSlug(custom) {
  for (const v of Object.values(custom || {})) {
    const m = String(v || '').toLowerCase().match(/\/s\/([a-z0-9][a-z0-9-]{1,28}[a-z0-9])\b/);
    if (m) return m[1];
  }
  return '';
}
const bulanSeunit = (it) => {
  const teks = [it.item, it.name, it.option, it.sku].filter(Boolean).join(' ');
  return /tahun|year|annual|12 ?bulan/i.test(teks) ? 12 : /bulan|month/i.test(teks) ? 1 : 0;
};
const jumlahBulan = (items) => {
  let n = 0;
  for (const it of items || []) { const u = bulanSeunit(it || {}); if (u) n += u * Math.min(120, Math.max(1, parseInt(it.quantity, 10) || 1)); }
  return n;
};
export function bulanPelan(items, amount, env, alt) {
  return jumlahBulan(items) || jumlahBulan(alt) || (parseFloat(amount) >= numEnv(env.YEARLY_MIN_AMOUNT, 150) ? 12 : 1);
}

// BCL tidak menandatangani webhook: sahkan setiap pesanan dengan API BCL sebelum memberi lesen.
export async function sahkanPesanan(env, order, f) {
  if (!env.BCL_API_TOKEN) return { paid: false, reason: 'tiada-token-api' };
  const asas = String(env.BCL_API_URL || 'https://api.bcl.my/v1').replace(/\/$/, '');
  const res = await f(asas + '/transactions/' + encodeURIComponent(order), {
    headers: { authorization: 'Bearer ' + env.BCL_API_TOKEN, accept: 'application/json', 'user-agent': 'AnnurOPR-Lesen/1.0' }
  });
  if (!res.ok) return { paid: false, reason: 'api-' + res.status };
  let j; try { j = await res.json(); } catch (e) { return { paid: false, reason: 'api-bukan-json' }; }
  const d = (j && j.data) || j || {}, t = d.main_data || d;
  const kod = Number(t.status_code != null ? t.status_code : t.status);
  const paid = kod === 3 || t.is_paid === true || Number(t.is_paid) === 1 || /^(success|successful|approved|completed)$/i.test(String(t.status || ''));
  if (String(t.order_number || d.record_id || order) !== String(order)) return { paid: false, reason: 'pesanan-tidak-sepadan' };
  return { paid, amount: t.amount, items: t.items, payer_email: t.payer_email, custom: d.custom_fields_data || t.custom_fields_data || null };
}

// Cari sekolah untuk bayaran: pautan /s/<slug> dalam borang, jika tiada, e-mel admin.
async function cariSekolahBayaran(env, custom, email) {
  const slug = pilihSlug(custom);
  if (slug && await env.OPR_KV.get('school:' + slug)) return slug;
  return email ? (await env.OPR_KV.get('admin:' + email)) || '' : '';
}

// Beri bulan kepada sekolah, atau simpan sebagai kredit jika e-mel belum mendaftar sekolah.
async function beriBulan(env, { custom, email, bulan, now, order, school }) {
  const slug = await cariSekolahBayaran(env, custom, email);
  if (slug) {
    const lesen = await lanjutLesen(env, slug, bulan, now);
    return { slug, expires: lesen.expires };
  }
  if (!email) return { gagal: 'tiada-emel' };
  const k = (await bacaJson(env, 'kredit:' + email)) || { months: 0, orders: [], school: '' };
  k.months += bulan; if (order) k.orders.push(order); k.school = school || k.school; k.at = hariIni(now);
  await env.OPR_KV.put('kredit:' + email, JSON.stringify(k));
  return { kredit: true, email };
}

export async function prosesBcl(body, env, o) {
  const ev = String((body && body.event) || ''), d = (body && body.data) || {}, md = d.main_data || {};
  const rid = String(d.record_id || md.order_number || '');
  if (!rid) return { ok: false, reason: 'tiada-rekod' };
  const formId = d.formable_id != null ? d.formable_id : d.form_id;
  if (env.BCL_FORM_ID && String(formId) !== String(env.BCL_FORM_ID)) return { ok: true, ignored: 'borang-lain' };
  if (md.transaction_type === 'test' && env.BCL_ACCEPT_TEST !== '1') return { ok: true, ignored: 'transaksi-ujian' };
  const school = pilihSekolah(d.custom_fields_data);

  // Auto-debit: mandat diluluskan. Simpan e-mel; lesen dilanjutkan pada setiap potongan berjaya.
  if (ev === 'payment-success' && d.record_type === 'DirectDebit') {
    const email = pilihEmel(d.custom_fields_data, md.payer_email);
    if (!email) return { ok: false, reason: 'tiada-emel' };
    await env.OPR_KV.put('mandate:' + rid, JSON.stringify({ email, school, slug: pilihSlug(d.custom_fields_data), at: hariIni(o.now) }));
    return { ok: true, mandate: rid, email };
  }
  if (ev === 'direct-debit') {
    const ref = String(md.order_number || md.bayarcash_transaction_id || '');
    if (!ref) return { ok: false, reason: 'tiada-rujukan-potongan' };
    if (await env.OPR_KV.get('bcl:dd:' + ref)) return { ok: true, duplicate: true };
    if (Number(md.status) !== 3) return { ok: true, ignored: 'potongan-gagal' };
    const m = await bacaJson(env, 'mandate:' + rid);
    const email = (m && m.email) || pilihEmel(d.custom_fields_data, md.payer_email);
    const custom = m && m.slug ? { pautan: '/s/' + m.slug } : d.custom_fields_data;
    const h = await beriBulan(env, { custom, email, bulan: 1, now: o.now, school });
    if (h.gagal) return { ok: false, reason: h.gagal };
    await env.OPR_KV.put('bcl:dd:' + ref, JSON.stringify({ email, mandate: rid, slug: h.slug || '', amount: parseFloat(md.amount) || null, at: hariIni(o.now), expires: h.expires || '' }));
    return { ok: true, email, months: 1, ...h };
  }
  if (ev !== 'payment-success') return { ok: true, ignored: ev || 'tiada-event' };

  if (await env.OPR_KV.get('bcl:' + rid)) return { ok: true, duplicate: true };
  const v = await sahkanPesanan(env, rid, o.fetch);
  if (!v.paid) return { ok: false, reason: v.reason || 'belum-dibayar' };
  // Jumlah dalam webhook mesti sama dengan API (webhook palsu dengan pesanan lain ditolak)
  if (v.amount != null && md.amount != null && Math.abs(parseFloat(v.amount) - parseFloat(md.amount)) > 0.009 &&
      Math.abs(parseFloat(v.amount) - parseFloat(md.subtotal_amount)) > 0.009) return { ok: false, reason: 'jumlah-tidak-sepadan' };
  const custom = v.custom || d.custom_fields_data;
  const email = pilihEmel(custom, v.payer_email || md.payer_email);
  const bulan = bulanPelan(v.items, md.subtotal_amount != null ? md.subtotal_amount : md.amount, env, md.items);
  const h = await beriBulan(env, { custom, email, bulan, now: o.now, order: rid, school });
  if (h.gagal) return { ok: false, reason: h.gagal };
  await env.OPR_KV.put('bcl:' + rid, JSON.stringify({ email, slug: h.slug || '', kredit: !!h.kredit, months: bulan,
    amount: parseFloat(v.amount != null ? v.amount : md.amount) || null, at: hariIni(o.now), expires: h.expires || '' }));
  return { ok: true, email, months: bulan, ...h };
}
