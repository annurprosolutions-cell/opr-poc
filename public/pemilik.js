// Halaman pemilik AnnurPro: semua sekolah, lesen, bayaran dan log webhook.
// Akses: sesi Google yang emelnya dalam OWNER_EMAILS (disemak di pelayan).
import { $, el, api, mesej, logKeluar } from '/app.js';

const tarikh = (iso) => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '-';
const STATUS = { ok: ['Aktif', 'disemak'], 'tamat-tempoh-ihsan': ['Tempoh ihsan', 'hantar'],
  'percubaan-tamat': ['Percubaan tamat', 'draf'], tamat: ['Tamat', 'draf'], tiada: ['Tiada lesen', 'draf'] };
let DATA = null;

async function muat() {
  const r = await api('/api/pemilik/ringkasan');
  if (r.status === 401) { $('perluLogin').classList.remove('tersembunyi'); return; }
  if (r.status === 403) return mesej($('mesej'), 'bahaya', 'Akaun ini bukan pemilik AnnurPro. Log keluar dan cuba akaun lain.');
  if (!r.ok) return mesej($('mesej'), 'bahaya', r.ralat || 'Gagal memuatkan.');
  DATA = r;
  $('isi').classList.remove('tersembunyi');
  if (!$('pengguna').children.length) $('pengguna').append(el('button', { class: 'butang sekunder', type: 'button', onclick: logKeluar, text: 'Keluar' }));
  const R = r.ringkasan;
  $('jubin').textContent = '';
  [['Sekolah', R.jumlahSekolah], ['Berbayar aktif', R.berbayarAktif], ['Percubaan aktif', R.percubaanAktif], ['Tamat', R.tamat],
    ['MRR (RM)', R.mrr.toFixed(2)], ['Hasil 30 hari (RM)', R.hasil30Hari.toFixed(2)], ['Webhook gagal', R.webhookGagal]]
    .forEach(([n, v]) => $('jubin').append(el('div', { class: 'jubin-item' }, el('div', { class: 'angka', text: String(v) }), el('div', { class: 'nama', text: n }))));
  lukisSekolah(); lukisKredit(); lukisBayaran(); lukisLog();
}

function lukisSekolah() {
  const q = $('cari').value.trim().toLowerCase();
  const tb = $('badanSekolah'); tb.textContent = '';
  DATA.sekolah.filter(s => !q || [s.nama, s.slug, s.adminEmail].join(' ').toLowerCase().includes(q)).forEach(s => {
    const [teks, kelas] = STATUS[s.status.reason] || [s.status.reason, 'draf'];
    const baki = s.status.daysLeft;
    const tindakan = el('div', { class: 'baris-butang' },
      el('button', { class: 'butang sekunder', type: 'button', text: '+1 bulan', onclick: () => lesen(s, { tambahBulan: 1 }) }),
      el('button', { class: 'butang sekunder', type: 'button', text: '+12 bulan', onclick: () => lesen(s, { tambahBulan: 12 }) }),
      el('button', { class: 'butang sekunder', type: 'button', text: 'Tarikh...', onclick: () => tetapTarikh(s) }));
    tb.append(el('tr', {},
      el('td', {}, el('div', { class: 'tajuk', text: s.nama }), el('a', { href: '/s/' + s.slug, target: '_blank', rel: 'noopener', class: 'kecil', text: '/s/' + s.slug }),
        s.sedia ? '' : el('div', { class: 'kecil redup', text: 'Drive belum disediakan' }),
        s.statusToken === 'perlu_sambung' ? el('div', { class: 'kecil', style: 'color:var(--bahaya)', text: 'Google perlu disambung semula' }) : ''),
      el('td', { class: 'kecil', text: s.adminEmail }),
      el('td', { text: s.lesen ? s.lesen.plan : '-' }),
      el('td', {}, el('div', { text: tarikh(s.lesen && s.lesen.expires) }), baki != null ? el('div', { class: 'kecil redup', text: baki >= 0 ? baki + ' hari lagi' : -baki + ' hari lalu' }) : ''),
      el('td', {}, el('span', { class: 'pil ' + kelas, text: teks })),
      el('td', {}, tindakan)));
  });
}

async function lesen(s, badan) {
  if (badan.tambahBulan && !confirm('Tambah ' + badan.tambahBulan + ' bulan untuk ' + s.nama + '?')) return;
  const r = await api('/api/pemilik/lesen', { method: 'POST', body: { slug: s.slug, ...badan } });
  if (!r.ok) return mesej($('mesej'), 'bahaya', r.ralat || 'Gagal.');
  mesej($('mesej'), 'ok', s.nama + ': ' + r.lesen.plan + ', tamat ' + tarikh(r.lesen.expires) + '.');
  muat();
}

function tetapTarikh(s) {
  const t = prompt('Tarikh tamat baharu untuk ' + s.nama + ' (YYYY-MM-DD):', (s.lesen && s.lesen.expires) || '');
  if (!t) return;
  const plan = prompt('Pelan (percubaan, bulanan, tahunan, pilot):', (s.lesen && s.lesen.plan) || 'tahunan');
  if (!plan) return;
  lesen(s, { expires: t.trim(), plan: plan.trim().toLowerCase() });
}

function lukisKredit() {
  const tb = $('badanKredit'); tb.textContent = '';
  if (!DATA.kredit.length) { tb.append(el('tr', {}, el('td', { colspan: '4', class: 'redup', text: 'Tiada.' }))); return; }
  DATA.kredit.forEach(k => {
    const input = el('input', { type: 'text', placeholder: 'smkwakanda', 'aria-label': 'Pautan sekolah', style: 'max-width:180px' });
    tb.append(el('tr', {}, el('td', { text: k.email }), el('td', { text: String(k.months) }), el('td', { text: k.school || '-' }),
      el('td', {}, el('div', { class: 'baris-butang' }, input, el('button', { class: 'butang sekunder', type: 'button', text: 'Pindah', onclick: async () => {
        const r = await api('/api/pemilik/kredit', { method: 'POST', body: { email: k.email, slug: input.value.trim().toLowerCase() } });
        if (!r.ok) return mesej($('mesej'), 'bahaya', r.ralat || 'Gagal.');
        mesej($('mesej'), 'ok', 'Kredit ' + k.email + ' dipindah. Tamat ' + tarikh(r.lesen.expires) + '.');
        muat();
      } })))));
  });
}

function lukisBayaran() {
  const tb = $('badanBayaran'); tb.textContent = '';
  if (!DATA.bayaran.length) { tb.append(el('tr', {}, el('td', { colspan: '6', class: 'redup', text: 'Belum ada bayaran.' }))); return; }
  DATA.bayaran.forEach(b => tb.append(el('tr', {}, el('td', { text: tarikh(b.at) }), el('td', { class: 'kecil', text: b.order }),
    el('td', { class: 'kecil', text: b.email || '-' }), el('td', { text: b.slug || (b.kredit ? '(kredit)' : '-') }),
    el('td', { text: String(b.months || '') }), el('td', { text: b.amount != null ? Number(b.amount).toFixed(2) : '-' }))));
}

function lukisLog() {
  const tb = $('badanLog'); tb.textContent = '';
  if (!DATA.log.length) { tb.append(el('tr', {}, el('td', { colspan: '3', class: 'redup', text: 'Tiada log.' }))); return; }
  DATA.log.forEach(l => {
    const r = l.result || {};
    const teks = r.ok === false ? 'GAGAL: ' + (r.reason || r.message || '') : r.duplicate ? 'Pendua (diabaikan)' : r.ignored ? 'Diabaikan: ' + r.ignored
      : r.kredit ? 'Kredit untuk ' + r.email : r.slug ? r.slug + ' +' + r.months + ' bulan, tamat ' + tarikh(r.expires) : JSON.stringify(r).slice(0, 80);
    tb.append(el('tr', {}, el('td', { class: 'kecil', text: String(l.kunci).slice(0, 19).replace('T', ' ') }), el('td', { class: 'kecil', text: l.event || '' }),
      el('td', { class: 'kecil', style: r.ok === false ? 'color:var(--bahaya)' : '', text: teks })));
  });
}

$('cari').oninput = () => DATA && lukisSekolah();
$('muatSemula').onclick = muat;
muat();
