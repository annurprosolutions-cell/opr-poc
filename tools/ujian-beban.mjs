// Ujian beban kasar e-Karakter (IPD 5.6): N laporan palsu dalam Sheet e-Karakter palsu,
// ukur masa pemprosesan Worker untuk dashboard, senarai, butiran dan eksport.
//   node tools/ujian-beban.mjs [N=8000]
// NOTA: Google dipalsukan dalam memori. Masa di sini TIDAK termasuk masa rangkaian Google
// Sheets sebenar; saiz data yang dibaca dicetak supaya anggaran itu boleh dibuat.
import { handle } from '../src/worker.js';
import { env as binaEnv, googlePalsu, T0, ASAS } from '../tests/palsu.js';
import { KOLUM_KRK, TAB_KRK } from '../src/skema.js';

const N = Number(process.argv[2]) || 8000;
const e = binaEnv(); const g = googlePalsu();
const deps = { fetch: g.f, now: () => T0 };
const kuki = (res) => Object.fromEntries(res.headers.getSetCookie().map(k => k.split(';')[0].split('=')).map(([a, b]) => [a, decodeURIComponent(b)]));
const minta = (laluan, opt = {}) => {
  const h = new Headers({ Cookie: Object.entries(opt.kuki || {}).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('; ') });
  if (opt.body) { h.set('Origin', ASAS); h.set('content-type', 'application/json'); }
  return handle(new Request(ASAS + laluan, { method: opt.body ? 'POST' : 'GET', headers: h, body: opt.body ? JSON.stringify(opt.body) : undefined }), e, deps);
};

// Log masuk admin dan daftar sekolah (Sheet OPR + Sheet e-Karakter dicipta)
const r1 = await minta('/auth/login?mode=admin');
const state = new URL(r1.headers.get('location')).searchParams.get('state');
const r2 = await minta('/auth/callback?code=kod&state=' + state, { kuki: kuki(r1) });
const sesi = kuki(r2).opr_sesi;
await minta('/api/schools', { kuki: { opr_sesi: sesi }, body: { nama: 'SMK Beban', slug: 'smkbeban' } });
const sek = await e.OPR_KV.get('school:smkbeban', 'json');
const tab = g.sheet.get(sek.karakter.sheetId).tabs.get(TAB_KRK.REKOD);

// N laporan: 80 guru, 40 kelas, 12 subjek, 1-3 teras, catatan ~400 aksara
const teras = ['Penyayang', 'Berdaya Tahan', 'Berupaya Memimpin', 'Warganegara Aktif'];
const catatan = 'Murid melaksanakan aktiviti berkumpulan dan menunjukkan sikap bekerjasama. '.repeat(5);
const kol = KOLUM_KRK[TAB_KRK.REKOD];
for (let i = 0; i < N; i++) {
  const hari = String(1 + (i % 28)).padStart(2, '0'), bulan = String(1 + (i % 11)).padStart(2, '0');
  const o = { ID: 'KRK-20261108-' + String(i).padStart(5, '0').replace(/\d/g, d => 'ABCDEFGHJK'[d]), Timestamp: '2026-' + bulan + '-' + hari + 'T01:00:00.000Z',
    DikemaskiniPada: '2026-' + bulan + '-' + hari + 'T01:00:00.000Z', PemilikEmail: 'guru' + (i % 80) + '@sekolah.edu.my', NamaGuru: 'Cikgu ' + (i % 80),
    TarikhISO: '2026-' + bulan + '-' + hari, Masa: '08:30', Kelas: (1 + i % 5) + ' Kelas ' + (i % 8), Subjek: 'Subjek ' + (i % 12),
    Teras: teras.slice(0, 1 + (i % 3)).join(', '), Tajuk: 'Aktiviti ' + i, Catatan: catatan, BilGambar: '2', GambarIds: 'uplA' + i + ',uplB' + i,
    Kapsyen: '["",""]', TtdFileId: i % 2 ? 'ttd' + i : '', TtdPada: '', KandunganHash: 'a'.repeat(64), TahunSesi: '2026',
    Dipadam: i % 50 === 0 ? 'YA' : '', DipadamPada: '', AkuanGambar: 'YA', PdfFileId: 'pdf' + i, PdfPada: '2026-12-01T00:00:00.000Z' };
  tab.push(kol.map(k => o[k] ?? ''));
}
const saizKb = Math.round(JSON.stringify(tab).length / 1024);
console.log(N + ' laporan dalam KarakterRekod (anggaran ' + saizKb + ' KB JSON dibaca setiap permintaan)\n');

async function ukur(label, laluan, ulang = 3) {
  const masa = [];
  let saiz = 0, status = 0;
  for (let i = 0; i < ulang; i++) {
    const t = performance.now();
    const res = await minta(laluan, { kuki: { opr_sesi: sesi } });
    saiz = (await res.arrayBuffer()).byteLength; status = res.status;
    masa.push(performance.now() - t);
  }
  masa.sort((a, b) => a - b);
  console.log(label.padEnd(44) + String(status).padEnd(5) + (Math.round(masa[1]) + ' ms').padStart(8) + (Math.round(saiz / 1024) + ' KB').padStart(9));
  return masa[1];
}
console.log('Laluan'.padEnd(44) + 'HTTP' + '  median'.padStart(9) + 'respons'.padStart(9));
const hasil = {
  statistik: await ukur('Dashboard: statistik (tanpa tapisan)', '/api/s/smkbeban/karakter/statistik'),
  statistikTapis: await ukur('Dashboard: statistik (kelas + teras)', '/api/s/smkbeban/karakter/statistik?kelas=1%20Kelas%200&teras=Penyayang'),
  jadual: await ukur('Dashboard: jadual halaman 1', '/api/s/smkbeban/karakter/rekod?skop=semua'),
  pdf: await ukur('PDF dashboard: semua baris (had 1000)', '/api/s/smkbeban/karakter/rekod?skop=semua&saiz=semua'),
  saya: await ukur('Laporan saya (admin)', '/api/s/smkbeban/karakter/rekod'),
  butiran: await ukur('Butiran satu laporan', '/api/s/smkbeban/karakter/rekod/' + tab[N - 1 + 1][0]),
  eksport: await ukur('Eksport CSV (semua)', '/api/s/smkbeban/karakter/eksport')
};
const lulus = hasil.statistik < 4000 && hasil.jadual < 4000;
console.log('\nPemprosesan Worker ' + (lulus ? 'di bawah' : 'MELEBIHI') + ' sasaran 4 saat untuk dashboard.');
console.log('Masa sebenar = masa di atas + masa Google Sheets membaca ' + saizKb + ' KB (belum diukur; perlu disahkan di production).');
process.exitCode = lulus ? 0 : 1;
