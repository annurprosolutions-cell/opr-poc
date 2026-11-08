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
const e = binaEnv({
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
    const res = await handle(new Request(q.url(), { method: q.method(), headers: q.headers(), body }), e, { fetch: g.f, now: () => T0 });
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
  await admin.waitForSelector('#tab button');
  const tabAdmin = await admin.$$eval('#tab button', b => b.map(x => x.textContent));
  semak(JSON.stringify(tabAdmin) === JSON.stringify(['Borang OPR', 'Laporan', 'Dashboard', 'Guru', 'Tetapan', 'Drive']), 'admin utama nampak 6 tab');

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
