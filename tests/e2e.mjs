// Ujian browser hujung-ke-hujung. Worker SEBENAR dijalankan dalam proses ini;
// Google (OAuth, Drive, Sheets) dan KV dipalsukan. Tiada akaun sebenar disentuh.
// Jalankan:  node tests/e2e.mjs   (perlukan Playwright + Chromium)
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { handle } from '../src/worker.js';
import { env as binaEnv, googlePalsu, T0 } from './palsu.js';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch (e) {
  playwright = require(execSync('npm root -g').toString().trim() + '/playwright');
}

const ASAS = 'https://opr.annurpro.com';
const PUB = new URL('../public/', import.meta.url);
const OUT = process.env.E2E_OUT || new URL('../.e2e/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const JENIS_FAIL = { html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css' };
const g = googlePalsu();
let masaKini = T0;   // boleh dimajukan untuk menguji tamat lesen
const KUNCI_BCL = 'k-' + 'y'.repeat(40);
const e = binaEnv({
  BUY_URL: 'https://bcl.my/f/annur-opr', OWNER_EMAILS: 'pemilik@annurpro.com',
  BCL_WEBHOOK_KEY: KUNCI_BCL, BCL_API_TOKEN: 'api', BCL_API_URL: 'https://bcl.test/api', BCL_FORM_ID: '777',
  ASSETS: { fetch: async (r) => {
    let p = new URL(r.url).pathname;
    if (p === '/') p = '/index.html';
    else if (!/\.[a-z]+$/.test(p)) p += '.html';
    try {
      const body = readFileSync(new URL('.' + p, PUB));
      return new Response(body, { headers: { 'content-type': JENIS_FAIL[p.split('.').pop()] || 'application/octet-stream' } });
    } catch (x) { return new Response('Tiada', { status: 404 }); }
  } }
});

// SEMUA permintaan dipintas. Playwright tidak memintas lompatan redirect, jadi
// setiap 3xx ditukar kepada halaman yang menavigasi sendiri (permintaan baharu
// yang dipintas semula). Hos lain disekat supaya ujian tidak pernah menyentuh
// Google sebenar atau laman production.
async function pasangLaluan(ctx) {
  await ctx.route('**/*', async r => {
    const q = r.request();
    const u = new URL(q.url());
    if (u.origin === 'https://accounts.google.com') {
      // Google palsu: terus "bersetuju" dan pulang ke callback
      return lencongHalaman(r, ASAS + '/auth/callback?code=kod&state=' + u.searchParams.get('state'), []);
    }
    if (u.origin !== ASAS) return r.abort();
    const body = ['GET', 'HEAD'].includes(q.method()) ? undefined : q.postDataBuffer();
    const res = await handle(new Request(q.url(), { method: q.method(), headers: q.headers(), body }), e, { fetch: g.f, now: () => masaKini });
    const kuki = res.headers.getSetCookie();
    if (res.status >= 300 && res.status < 400) return lencongHalaman(r, new URL(res.headers.get('location'), ASAS).href, kuki);
    const headers = {};
    res.headers.forEach((v, k) => { if (k !== 'set-cookie') headers[k] = v; });
    if (kuki.length) headers['set-cookie'] = kuki.join('\n');
    return r.fulfill({ status: res.status, headers, body: Buffer.from(await res.arrayBuffer()) });
  });
}

function lencongHalaman(r, ke, kuki) {
  const headers = { 'content-type': 'text/html; charset=utf-8' };
  if (kuki.length) headers['set-cookie'] = kuki.join('\n');
  return r.fulfill({ status: 200, headers, body: '<script>location.replace(' + JSON.stringify(ke) + ')</script>' });
}

const semak = (syarat, mesej) => { if (!syarat) throw new Error('GAGAL: ' + mesej); console.log('  ok  ' + mesej); };
const ralatJs = [];

const browser = await playwright.chromium.launch();
async function pengguna(email) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await pasangLaluan(ctx);
  const p = await ctx.newPage();
  p.on('pageerror', x => ralatJs.push(email + ': ' + x));
  p.on('dialog', d => d.accept());
  p.masuk = async () => { g.senario.email = email; };
  return p;
}

try {
  // ---------------------------------------------------------- admin daftar sekolah
  const admin = await pengguna('admin@sekolah.edu.my');
  await admin.masuk();
  await admin.goto(ASAS + '/daftar');
  await admin.click('text=Sambung dengan Google');
  await admin.waitForSelector('#langkahBorang:not(.tersembunyi)');
  await admin.fill('#nama', 'SMK Wakanda');
  await admin.waitForFunction(() => document.getElementById('statusSlug').textContent.startsWith('Tersedia'));
  await admin.click('#hantar');
  await admin.waitForURL(/\/s\/smkwakanda/);
  // Admin: pilih modul dahulu (OPR / Pembentukan Karakter)
  await admin.waitForSelector('#pilihModul:not(.tersembunyi)');
  semak((await admin.$$eval('#pilihModul .kad-modul-tajuk', n => n.map(x => x.textContent))).join() === 'OPR,Pembentukan Karakter', 'admin nampak skrin pilihan modul: OPR dan Pembentukan Karakter');
  await admin.click('.kad-modul[data-modul=opr]');
  await admin.waitForSelector('#tab button');
  semak(admin.url().includes('m=opr') && (await admin.textContent('#labelModul')) === 'Modul: OPR', 'modul OPR dibuka, pautan ?m=opr dan label modul dipapar');
  semak((await admin.textContent('#notisLesen')).includes('Tempoh percubaan percuma tamat 13 hari lagi (21/11/2026)'), 'admin nampak notis percubaan 14 hari');
  semak((await admin.getAttribute('#notisLesen a.butang', 'href')) === 'https://bcl.my/f/annur-opr', 'butang Langgan menuju borang BCL');
  semak((await admin.textContent('#notisLesen')).includes('admin@sekolah.edu.my'), 'notis memberitahu emel untuk diisi dalam borang BCL');
  const tabAdmin = await admin.$$eval('#tab button', b => b.map(x => x.textContent));
  semak(JSON.stringify(tabAdmin) === JSON.stringify(['Borang OPR', 'Laporan', 'Dashboard', 'Guru', 'Tetapan', 'Drive']), 'admin utama nampak 6 tab');
  const sekDaftar = await e.OPR_KV.get('school:smkwakanda', 'json');
  semak(sekDaftar.karakter && sekDaftar.karakter.sheetId && sekDaftar.karakter.sheetId !== sekDaftar.sheetId && g.sheet.size === 2,
    'daftar sekolah mencipta dua Sheet berasingan: OPR dan e-Karakter');

  // ---------------------------------------------------------- tambah guru
  await admin.click('#tab button[data-tab=Guru]');
  await admin.fill('#teksGuru', 'ali@gmail.com, Cikgu Ali\naminah@moe-dl.edu.my, Cikgu Aminah\nbukan-emel');
  await admin.click('#tambahGuru');
  await admin.waitForSelector('#hasilGuru .mesej');
  semak((await admin.textContent('#hasilGuru')).includes('2 guru ditambah'), 'tambah 2 guru, 1 baris tidak sah diabaikan');
  await admin.waitForFunction(() => document.querySelectorAll('#senaraiGuru .item').length === 3);
  semak(true, 'senarai guru memaparkan 3 akaun (termasuk admin utama)');
  await admin.screenshot({ path: OUT + '1-guru.png', fullPage: true });

  // ---------------------------------------------------------- admin isi borang
  await admin.click('#tab button[data-tab=Borang]');
  await admin.selectOption('#fJenis', 'SUBJEK');
  semak((await admin.textContent('label[for=fUnit]')) === 'Mata Pelajaran', 'label berubah ikut jenis (Subjek -> Mata Pelajaran)');
  semak((await admin.$$eval('#fPeringkat option', o => o.map(x => x.value))).includes('Tingkatan 5'), 'dropdown peringkat jadi Tingkatan untuk Subjek');
  await admin.fill('#fTajuk', 'Kelas Intervensi Matematik T5');
  await admin.selectOption('#fUnit', 'Matematik');
  await admin.fill('#fTarikh', '2026-11-08');
  await admin.fill('#fLelaki', '12');
  await admin.check('#fConsent');
  await admin.click('[data-hantar=HANTAR]');
  await admin.waitForFunction(() => document.getElementById('mesej').textContent.includes('dihantar'));
  semak(true, 'admin hantar laporan');

  // ---------------------------------------------------------- guru log masuk
  const ali = await pengguna('ali@gmail.com');
  await ali.masuk();
  await ali.goto(ASAS + '/s/smkwakanda');
  await ali.click('#butangLogin');
  await ali.waitForSelector('#tab button');
  semak(await ali.$eval('#pilihModul', n => n.classList.contains('tersembunyi')), 'guru terus ke OPR (pilihan modul belum dipapar kepada guru dalam Fasa 1)');
  const tabGuru = await ali.$$eval('#tab button', b => b.map(x => x.textContent));
  semak(JSON.stringify(tabGuru) === JSON.stringify(['Borang OPR', 'Laporan']), 'guru hanya nampak tab Borang dan Laporan');
  semak((await ali.inputValue('input[name=nama]')) === 'Cikgu Ujian', 'nama penyedia diisi automatik dari akaun Google');
  semak(await ali.isVisible('#butangPratonton'), 'butang "Lihat pratonton" terapung di telefon');
  await ali.click('#butangPratonton');
  await ali.waitForFunction(() => document.getElementById('butangPratonton').classList.contains('tersembunyi'));
  semak(true, 'butang terapung menatal ke pratonton dan hilang bila pratonton kelihatan');
  await ali.click('#kembaliBorang');
  await ali.fill('#fTajuk', 'Kejohanan Bola Sepak MSSD');
  await ali.selectOption('#fUnit', 'Bola Sepak');
  await ali.fill('#fObjektif', 'Memupuk semangat kesukanan dalam kalangan murid.');
  semak((await ali.textContent('#pvTajuk')) === 'Kejohanan Bola Sepak MSSD', 'pratonton A4 dikemas kini semasa menaip');
  await ali.uncheck('#tObjektif');
  semak(await ali.$eval('#pvKotakObjektif', n => getComputedStyle(n).display === 'none'), '"Sertakan" dinyahtanda menyembunyikan kotak dalam pratonton');
  await ali.check('#tObjektif');

  // Tambah gambar (PNG 64x48 dijana dalam browser)
  const png = await ali.evaluate(() => { const c = document.createElement('canvas'); c.width = 64; c.height = 48;
    const x = c.getContext('2d'); x.fillStyle = '#0f766e'; x.fillRect(0, 0, 64, 48); return c.toDataURL('image/png').split(',')[1]; });
  await ali.setInputFiles('#failInput', { name: 'aktiviti.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await ali.fill('#failKeterangan', 'Sesi latihan');
  await ali.click('#butangTambahFail');
  await ali.waitForFunction(() => document.querySelectorAll('#senaraiLampiran img').length === 1);
  semak(await ali.isVisible('#pvStripSatuMuka .strip-kad'), 'gambar muncul dalam jalur satu muka (gaya Kotak)');
  await ali.screenshot({ path: OUT + '3-borang-pratonton.png', fullPage: true });

  await ali.check('#fConsent');
  const bilFailAwal = g.fail.size;
  await ali.click('[data-hantar=SIMPAN]');
  await ali.waitForFunction(() => document.getElementById('mesej').textContent.includes('Draf disimpan'), null, { timeout: 60000 });
  const sekA = await e.OPR_KV.get('school:smkwakanda', 'json');
  const failBaru = [...g.fail.entries()].slice(-2);
  const pdfFail = failBaru.find(([, f]) => f.mimeType === 'application/pdf');
  const gbrFail = failBaru.find(([, f]) => f.mimeType.startsWith('image/'));
  semak(g.fail.size === bilFailAwal + 2 && pdfFail && gbrFail, 'PDF dan gambar dimuat naik ke Drive');
  semak(new TextDecoder().decode(pdfFail[1].data.slice(0, 5)) === '%PDF-', 'fail PDF sah (dijana oleh html2pdf)');
  semak(pdfFail[1].parents[0] === sekA.subfolder.PDF && gbrFail[1].parents[0] === sekA.subfolder.LAMPIRAN, 'PDF dalam "Laporan PDF", gambar dalam "Lampiran"');
  await ali.click('#tab button[data-tab=Laporan]');
  await ali.waitForSelector('#senaraiLaporan .item');
  semak((await ali.$$('#senaraiLaporan .item')).length === 1, 'guru hanya nampak laporan sendiri (1, bukan 2)');
  semak((await ali.textContent('#senaraiLaporan .pil')) === 'DRAF', 'status DRAF dipaparkan');

  // Butang PDF memuat turun fail sebenar
  const [muatTurun] = await Promise.all([ali.waitForEvent('download'), ali.click('#senaraiLaporan button:text("PDF")')]);
  const laluanPdf = await muatTurun.path();
  semak(readFileSync(laluanPdf).subarray(0, 5).toString() === '%PDF-', 'butang PDF memuat turun PDF yang sah');

  await ali.click('#senaraiLaporan button:text("Edit")');
  await ali.waitForFunction(() => document.getElementById('fTajuk').value === 'Kejohanan Bola Sepak MSSD');
  semak(await ali.isVisible('#lencanaEdit'), 'mod edit memuatkan laporan ke borang');
  semak((await ali.$$('#senaraiLampiran img')).length === 1, 'gambar sedia ada dimuat semula dari Drive');
  const bilSebelumEdit = g.fail.size;
  await ali.uncheck('#tJanaPdf');
  await ali.fill('#fTajuk', 'Kejohanan Bola Sepak MSSD 2026');
  await ali.click('[data-hantar=HANTAR]');
  await ali.waitForFunction(() => document.getElementById('mesej').textContent.includes('dihantar'));
  semak(g.fail.size === bilSebelumEdit, 'edit tanpa jana PDF: gambar sedia ada tidak dimuat naik semula');
  await ali.click('#tab button[data-tab=Laporan]');
  await ali.waitForFunction(() => document.querySelector('#senaraiLaporan .tajuk')?.textContent === 'Kejohanan Bola Sepak MSSD 2026');
  semak((await ali.$$('#senaraiLaporan .item')).length === 1, 'edit mengemas kini laporan sama (tiada pendua)');
  await ali.screenshot({ path: OUT + '2-laporan-guru.png', fullPage: true });

  // ---------------------------------------------------------- admin nampak semua, nyahaktif guru
  await admin.click('#tab button[data-tab=Laporan]');
  await admin.waitForFunction(() => document.querySelectorAll('#senaraiLaporan .item').length === 2);
  semak(true, 'admin nampak semua laporan (2)');

  // ---------------------------------------------------------- semakan dengan PDF bertandatangan
  const kadLap = admin.locator('#senaraiLaporan .item', { hasText: 'Kejohanan Bola Sepak MSSD 2026' });
  await kadLap.locator('button:text-is("Semak")').click();
  await kadLap.locator('input[type=file]').setInputFiles({ name: 'ditandatangan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 ditandatangan') });
  await kadLap.locator('button:text("Muat naik & tanda disemak")').click();
  await admin.waitForFunction(() => [...document.querySelectorAll('#senaraiLaporan .item')].some(x => x.textContent.includes('MSSD 2026') && x.textContent.includes('DISEMAK') && x.textContent.includes('PDF bertandatangan')));
  semak(true, 'admin tanda disemak dengan PDF bertandatangan');

  // ---------------------------------------------------------- dashboard
  await admin.click('#tab button[data-tab=Dashboard]');
  await admin.waitForSelector('#jubin .jubin-item');
  const jubin = await admin.$$eval('#jubin .jubin-item', n => n.map(x => x.textContent));
  semak(jubin[0].startsWith('2') && jubin[2].startsWith('1'), 'dashboard: 2 laporan, 1 telah disemak');
  semak((await admin.$$('#cartaUnit .bar-baris')).length === 2 && (await admin.$$('#cartaBulan .lajur')).length === 12, 'carta unit dan carta 12 bulan dilukis');
  await admin.screenshot({ path: OUT + '4-dashboard.png', fullPage: true });

  // ---------------------------------------------------------- tetapan
  await admin.click('#tab button[data-tab=Tetapan]');
  await admin.waitForFunction(() => document.getElementById('tNAMA_SEKOLAH').value === 'SMK Wakanda');
  await admin.fill('#tALAMAT_SEKOLAH', 'Jalan Vibranium, 10000 Wakanda');
  await admin.click('[data-simpan-tetapan=setIdentiti]');
  await admin.waitForFunction(() => document.getElementById('hasilTetapan').textContent.includes('disimpan'));
  semak((await admin.textContent('#pvAlamat')) === 'Jalan Vibranium, 10000 Wakanda', 'alamat baharu terus muncul dalam kepala PDF');

  await admin.click('#subTetapan button[data-sub=setLogo]');
  const logo = await admin.evaluate(() => { const c = document.createElement('canvas'); c.width = 120; c.height = 120;
    const x = c.getContext('2d'); x.fillStyle = '#b45309'; x.beginPath(); x.arc(60, 60, 50, 0, 7); x.fill(); return c.toDataURL('image/png').split(',')[1]; });
  await admin.locator('#slotLogo .logo-slot').first().locator('input[type=file]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(logo, 'base64') });
  await admin.locator('#slotLogo .logo-slot').first().locator('button:text("Muat naik")').click();
  await admin.waitForFunction(() => document.getElementById('hasilTetapan').textContent.includes('Logo 1 disimpan'));
  semak(await admin.$eval('#pvLogo1', n => !n.classList.contains('hidden') && n.src.includes('/logo/1?v=')), 'logo sekolah dimuat naik dan dipapar dalam kepala PDF');
  const sekT = await e.OPR_KV.get('school:smkwakanda', 'json');
  semak([...g.fail.values()].some(f => f.name.startsWith('logo-1-') && f.parents[0] === sekT.subfolder.ASET), 'logo disimpan dalam folder Aset');

  await admin.click('#subTetapan button[data-sub=setJenis]');
  await admin.uncheck('#kotakJenis [data-jenis=KELAS] [data-j=aktif]');
  await admin.click('#simpanJenis');
  await admin.waitForFunction(() => document.getElementById('hasilTetapan').textContent.includes('Jenis laporan disimpan'));
  semak(!(await admin.$$eval('#fJenis option', o => o.map(x => x.value))).includes('KELAS'), 'jenis Kelas dimatikan: hilang dari borang');

  await admin.click('#subTetapan button[data-sub=setSenarai]');
  const kadSukan = admin.locator('#kotakSenarai .item', { hasText: 'UNIT_SUKAN' });
  await kadSukan.locator('textarea').fill('Bola Sepak\nRagbi\nHoki');
  await kadSukan.locator('button:text-is("Simpan")').click();
  await admin.waitForFunction(() => document.getElementById('hasilTetapan').textContent.includes('3 item'));
  await admin.click('#tab button[data-tab=Borang]');
  await admin.selectOption('#fJenis', 'KOKURIKULUM');
  semak((await admin.$$eval('#fUnit option', o => o.map(x => x.value))).includes('Ragbi'), 'senarai dropdown baharu terus dalam borang');

  // PDF dengan logo dijana tanpa ralat
  await admin.fill('#fTajuk', 'Program dengan logo');
  await admin.check('#fConsent');
  await admin.click('[data-hantar=HANTAR]');
  await admin.waitForFunction(() => document.getElementById('mesej').textContent.includes('dihantar'), null, { timeout: 60000 });
  semak(true, 'PDF dengan logo sekolah dijana dan disimpan');
  await admin.click('#tab button[data-tab=Guru]');
  await admin.waitForSelector('#senaraiGuru .item');
  const kadAli = admin.locator('#senaraiGuru .item', { hasText: 'ali@gmail.com' });
  await kadAli.locator('button:text("Nyahaktif")').click();
  await admin.waitForFunction(() => [...document.querySelectorAll('#senaraiGuru .item')].some(x => x.textContent.includes('ali@gmail.com') && x.classList.contains('tidak-aktif')));
  semak(true, 'admin nyahaktif guru');

  await ali.reload();
  await ali.waitForSelector('#bukanAhli:not(.tersembunyi)');
  semak((await ali.textContent('#tajukBukan')) === 'Akaun dinyahaktifkan', 'guru yang dinyahaktif terus hilang akses');

  // ---------------------------------------------------------- Sheet dikemas kini
  const sek = await e.OPR_KV.get('school:smkwakanda', 'json');
  const lap = g.sheet.get(sek.sheetId).tabs.get('Laporan');
  semak(lap.length === 4, 'Google Sheet: 3 baris laporan + tajuk');
  const audit = g.sheet.get(sek.sheetId).tabs.get('AuditLog').map(r => r[3]);
  semak(['TAMBAH_GURU', 'SIMPAN_LAPORAN', 'KEMASKINI_GURU', 'TANDA_DISEMAK', 'SIMPAN_TETAPAN', 'MUAT_NAIK_LOGO', 'SIMPAN_SENARAI'].every(x => audit.includes(x)), 'AuditLog merekod semua tindakan');

  // ---------------------------------------------------------- e-Karakter Fasa 1: setup oleh admin (telefon 390px)
  await admin.goto(ASAS + '/s/smkwakanda');
  await admin.waitForSelector('#pilihModul:not(.tersembunyi)');
  semak(await admin.$eval('.kad-modul[data-modul=opr] .lencana-terakhir', n => !n.classList.contains('tersembunyi')), 'pilihan terakhir (OPR) ditanda "Terakhir digunakan"');
  await admin.click('.kad-modul[data-modul=karakter]');
  await admin.waitForSelector('#krkPanduan .krk-langkah-item');
  const siapAwal = await admin.$$eval('.krk-langkah-item.siap', n => n.map(x => x.dataset.langkah));
  semak(siapAwal.join() === 'guru,teras', 'panduan mula pantas: guru dan teras siap, langkah lain belum');
  await admin.click('.krk-langkah-item[data-langkah=kelas] button');
  await admin.waitForSelector('#senaraiKrk .krk-baris');
  await admin.locator('#senaraiKrk .krk-baris').first().locator('button[aria-label^="Buang"]').click();
  await admin.fill('#tampalKrk', ['5 Ibnu Sina', '5 Al-Biruni' + String.fromCharCode(9) + '30 murid', '5 ibnu sina'].join(String.fromCharCode(10)));
  await admin.click('#tambahKrk');
  semak((await admin.textContent('#mesejKarakter')).includes('1 kelas ditambah'), 'tampal pukal: lajur kedua Excel diabaikan, pendua tidak ditambah');
  await admin.click('#simpanKrk');
  await admin.waitForFunction(() => document.getElementById('mesejKarakter').textContent.includes('Senarai kelas disimpan'));
  const sekK = await e.OPR_KV.get('school:smkwakanda', 'json');
  const kelasSheet = g.sheet.get(sekK.karakter.sheetId).tabs.get('Senarai').filter(r => r[0] === 'KARAKTER_KELAS').map(r => r[1]);
  semak(kelasSheet.includes('5 Al-Biruni') && !kelasSheet.includes('1 Arif') && kelasSheet.length === 9, 'senarai kelas disimpan dalam Sheet e-Karakter (bukan Sheet OPR)');
  await admin.click('#subKarakter button[data-sub=subjek]');
  await admin.click('#simpanKrk');
  await admin.waitForFunction(() => document.getElementById('mesejKarakter').textContent.includes('Senarai mata pelajaran disimpan'));
  await admin.click('#subKarakter button[data-sub=gurukelas]');
  await admin.locator('.krk-gk-baris[data-kelas="5 Al-Biruni"] select').selectOption('aminah@moe-dl.edu.my');
  await admin.click('#simpanGuruKelas');
  await admin.waitForFunction(() => document.getElementById('mesejKarakter').textContent.includes('1 pemetaan'));
  semak(g.sheet.get(sekK.karakter.sheetId).tabs.get('KarakterGuruKelas').some(r => r[0] === '5 Al-Biruni' && r[1] === 'aminah@moe-dl.edu.my'), 'guru kelas dipetakan dan disimpan');
  await admin.click('#subKarakter button[data-sub=tetapan]');
  await admin.fill('#krk_KRK_KOD_SEKOLAH', 'BEA1234');
  await admin.fill('#krk_KRK_NAMA_PENGESAH', 'Puan Rohana');
  await admin.click('#simpanTetapanKrk');
  await admin.waitForFunction(() => document.getElementById('mesejKarakter').textContent.includes('Tetapan e-Karakter disimpan'));
  await admin.click('#tabKarakter button[data-krk=Panduan]');
  semak((await admin.$$('.krk-langkah-item.siap')).length === 6, 'panduan mula pantas: semua 6 langkah siap');
  semak(await admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'setup e-Karakter: tiada skrol mendatar pada 390px');
  semak(await admin.$eval('#butangPratonton', n => n.classList.contains('tersembunyi')), 'butang pratonton OPR tidak muncul dalam modul e-Karakter');

  // ---------------------------------------------------------- e-Karakter Fasa 2: borang dan laporan (telefon)
  await admin.click('#tabKarakter button[data-krk=Borang]');
  await admin.waitForSelector('#borangKrk');
  semak((await admin.textContent('#kGuru')) === 'Cikgu Ujian', 'guru pelaksana diisi daripada akaun (tidak boleh diubah)');
  semak((await admin.$$eval('#kKelas option', o => o.map(x => x.value))).includes('5 Al-Biruni'), 'dropdown kelas ikut senarai yang baru disimpan');
  await admin.selectOption('#kKelas', '__lain__');
  await admin.fill('#kKelasLain', '5 Kelas Pemulihan');
  await admin.selectOption('#kSubjek', 'Sains');
  await admin.check('#kTeras0', { force: true });
  await admin.check('#kTeras2', { force: true });
  await admin.fill('#kTajuk', 'Eksperimen tumbesaran pokok');
  await admin.click('#cadanganAyat');
  semak((await admin.inputValue('#kCatatan')).includes('5 Kelas Pemulihan'), 'cadangan ayat menyisip teks ikut kelas dan teras');
  // Draf setempat: muat semula halaman, teks borang kekal
  await admin.reload();
  await admin.waitForSelector('#tabKarakter button[data-krk=Borang]');
  await admin.click('#tabKarakter button[data-krk=Borang]');
  await admin.waitForSelector('#borangKrk');
  semak((await admin.inputValue('#kTajuk')) === 'Eksperimen tumbesaran pokok' && (await admin.inputValue('#kKelasLain')) === '5 Kelas Pemulihan', 'draf setempat dipulihkan selepas muat semula');
  const gbr = await admin.evaluate(() => [['#0f766e', 'A'], ['#b45309', 'B']].map(([w, t]) => { const c = document.createElement('canvas'); c.width = 1600; c.height = 1200;
    const x = c.getContext('2d'); x.fillStyle = w; x.fillRect(0, 0, 1600, 1200); x.fillStyle = '#fff'; x.font = '200px sans-serif'; x.fillText(t, 700, 650); return c.toDataURL('image/png').split(',')[1]; }));
  await admin.setInputFiles('#kGambar', gbr.map((b64, i) => ({ name: 'aktiviti' + i + '.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') })));
  await admin.waitForFunction(() => document.querySelectorAll('#kSenaraiGambar img').length === 2);
  await admin.fill('#kSenaraiGambar .krk-gambar-item >> nth=0 >> input', 'Kumpulan menyukat');
  await admin.click('#hantarKrk');
  semak((await admin.textContent('#mesejKarakter')).includes('akuan'), 'tanpa akuan kebenaran: tidak dihantar');
  await admin.check('#kAkuan');
  const bilFailSebelum = g.fail.size;
  await admin.click('#hantarKrk');
  await admin.waitForFunction(() => /Laporan dihantar \(ID KRK-/.test(document.getElementById('mesejKarakter').textContent), null, { timeout: 30000 });
  const sekR = await e.OPR_KV.get('school:smkwakanda', 'json');
  const rekodRows = g.sheet.get(sekR.karakter.sheetId).tabs.get('KarakterRekod');
  const rk = Object.fromEntries(rekodRows[0].map((h, i) => [h, rekodRows[1][i]]));
  semak(rekodRows.length === 2 && rk.Kelas === '5 Kelas Pemulihan' && rk.BilGambar === '2' && rk.PemilikEmail === 'admin@sekolah.edu.my', 'laporan disimpan dalam Sheet e-Karakter dengan kelas Lain-lain dan 2 gambar');
  const gbrDrive = [...g.fail.values()].slice(-2);
  semak(g.fail.size === bilFailSebelum + 2 && gbrDrive.every(f => f.mimeType === 'image/jpeg' && f.parents[0] === sekR.karakter.subfolder.LAMPIRAN), 'gambar dimampat ke JPEG dan disimpan dalam e-Karakter/Lampiran');
  semak(gbrDrive.every(f => f.data.length < 200000), 'gambar 1600px dikecilkan (bawah 200KB)');
  semak((await admin.inputValue('#kTajuk')) === '', 'borang dikosongkan selepas hantar');
  await admin.click('#tabKarakter button[data-krk=Laporan]');
  await admin.waitForSelector('#kSenaraiLaporan .krk-item');
  semak((await admin.textContent('#kSenaraiLaporan')).includes('Eksperimen tumbesaran pokok'), 'laporan muncul dalam Laporan saya');
  await admin.click('#kSenaraiLaporan .krk-item button:text("Lihat")');
  await admin.waitForFunction(() => [...document.querySelectorAll('.krk-gambar-butiran img')].filter(i => i.complete && i.naturalWidth > 0).length === 2);
  semak((await admin.textContent('.krk-gambar-butiran')).includes('Kumpulan menyukat'), 'butiran: 2 gambar dimuat melalui Worker, kapsyen dipapar');
  await admin.click('button:text-is("Edit")');
  await admin.waitForSelector('#borangKrk');
  await admin.waitForFunction(() => document.querySelectorAll('#kSenaraiGambar img').length === 2);
  await admin.fill('#kTajuk', 'Eksperimen tumbesaran pokok (dibetulkan)');
  await admin.click('#kSenaraiGambar .krk-gambar-item >> nth=1 >> button');
  await admin.click('#hantarKrk');
  await admin.waitForFunction(() => document.getElementById('mesejKarakter').textContent.includes('Perubahan disimpan'), null, { timeout: 30000 });
  const selepasEdit = g.sheet.get(sekR.karakter.sheetId).tabs.get('KarakterRekod');
  semak(selepasEdit.length === 2 && selepasEdit[1][10].endsWith('(dibetulkan)') && selepasEdit[1][12] === '1', 'edit mengemas kini baris yang sama, gambar dibuang');
  semak(await admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'borang dan laporan e-Karakter: tiada skrol mendatar pada 390px');
  await admin.click('#tukarModul');
  await admin.click('.kad-modul[data-modul=opr]');
  await admin.waitForSelector('#tab button');
  semak(!(await admin.$eval('#aplikasi', n => n.classList.contains('tersembunyi'))), 'tukar modul kembali ke OPR');

  // ---------------------------------------------------------- lesen: tamat percubaan -> bayar -> buka semula
  masaKini = T0 + 20 * 864e5;
  await admin.goto(ASAS + '/s/smkwakanda?m=opr');
  await admin.waitForSelector('#notisLesen .mesej');
  semak((await admin.textContent('#notisLesen')).includes('Tempoh percubaan percuma telah tamat'), 'selepas 14 hari: notis percubaan tamat');
  semak(await admin.evaluate(() => document.body.classList.contains('lesen-tamat')), 'butang simpan disekat bila lesen tamat');
  await admin.click('#tab button[data-tab=Laporan]');
  await admin.waitForSelector('#senaraiLaporan .item');
  semak((await admin.$$('#senaraiLaporan .item')).length === 3, 'laporan sedia ada masih boleh dibaca selepas tamat');

  g.senario.bclPesanan = { 'OPR-1': { order_number: 'OPR-1', status: 'success', status_code: 3, amount: 201, items: [{ name: 'Langganan Tahunan Annur OPR', amount: 200 }] } };
  const hook = await handle(new Request(ASAS + '/bcl/' + KUNCI_BCL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    event: 'payment-success', data: { formable_id: 777, record_type: 'Transaction', record_id: 'OPR-1',
      main_data: { order_number: 'OPR-1', payer_email: 'bendahari@gmail.com', transaction_type: 'live', subtotal_amount: '200.00', amount: '201.00', status: 3, is_paid: 1 },
      custom_fields_data: { 'E-mel Google untuk sistem': 'admin@sekolah.edu.my' } } }) }), e, { fetch: g.f, now: () => masaKini });
  semak((await hook.json()).months === 12, 'webhook BCL tahunan diterima dan disahkan');
  await admin.goto(ASAS + '/s/smkwakanda?m=opr');
  await admin.waitForSelector('#tab button');
  semak(!(await admin.evaluate(() => document.body.classList.contains('lesen-tamat'))) && (await admin.textContent('#notisLesen')) === '', 'selepas bayar: sistem dibuka semula, tiada notis');

  // ---------------------------------------------------------- halaman pemilik
  masaKini = T0;   // id_token palsu luput sejam selepas T0; kembalikan masa untuk log masuk baharu
  const pemilik = await pengguna('pemilik@annurpro.com');
  await pemilik.masuk();
  await pemilik.goto(ASAS + '/pemilik');
  await pemilik.click('#perluLogin a.butang');
  await pemilik.waitForSelector('#badanSekolah tr');
  const baris = await pemilik.textContent('#badanSekolah');
  semak(baris.includes('SMK Wakanda') && baris.includes('tahunan') && baris.includes('Aktif'), 'pemilik nampak sekolah dengan pelan tahunan aktif');
  semak((await pemilik.textContent('#badanBayaran')).includes('OPR-1'), 'pemilik nampak bayaran');
  await pemilik.click('#badanSekolah button:text("+1 bulan")');
  await pemilik.waitForFunction(() => document.getElementById('mesej').textContent.includes('SMK Wakanda: tahunan'));
  semak(true, 'pemilik tambah 1 bulan secara manual');
  await pemilik.screenshot({ path: OUT + '5-pemilik.png', fullPage: true });
  const bukanPemilik = await admin.evaluate(() => fetch('/api/pemilik/ringkasan').then(r => r.status));
  semak(bukanPemilik === 403, 'admin sekolah tidak boleh membuka API pemilik');

  semak(ralatJs.length === 0, 'tiada ralat JavaScript' + (ralatJs.length ? ': ' + ralatJs.join(' | ') : ''));
  const lebar = await admin.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  semak(!lebar, 'tiada skrol mendatar pada lebar telefon (390px)');
  console.log('\nSEMUA LULUS. Tangkapan skrin: ' + OUT);
} catch (x) {
  for (const ctx of browser.contexts()) for (const p of ctx.pages()) {
    console.log('-- halaman:', p.url());
    console.log((await p.textContent('body').catch(() => '')).replace(/\s+/g, ' ').slice(0, 400));
    await p.screenshot({ path: OUT + 'gagal.png', fullPage: true }).catch(() => {});
  }
  console.log('Ralat JS:', ralatJs);
  throw x;
} finally {
  await browser.close();
}
