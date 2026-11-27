// Tangkapan skrin sale page / manual daripada MOD DEMO sebenar (Worker dijalankan
// dalam proses; semua hos luar disekat). Juga berfungsi sebagai ujian asap demo.
// Jalankan:  node tools/tangkap-skrin.mjs   -> public/img/*.jpg
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { handle } from '../src/worker.js';
import { env as binaEnv, googlePalsu, T0 } from '../tests/palsu.js';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require(execSync('npm root -g').toString().trim() + '/playwright'); }

const ASAS = 'https://opr.annurpro.com';
const PUB = new URL('../public/', import.meta.url);
const OUT = new URL('../public/img/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const JENIS = { html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', json: 'application/json', jpg: 'image/jpeg', png: 'image/png', svg: 'image/svg+xml' };
const g = googlePalsu();
const e = binaEnv({ ASSETS: { fetch: async (r) => {
  let p = new URL(r.url).pathname;
  if (p.endsWith('/')) p += 'index.html'; else if (!/\.[a-z]+$/.test(p)) p += '.html';
  try { return new Response(readFileSync(new URL('.' + p, PUB)), { headers: { 'content-type': JENIS[p.split('.').pop()] || 'application/octet-stream' } }); }
  catch (x) { return new Response('Tiada', { status: 404 }); }
} } });

async function pasang(ctx) {
  await ctx.route('**/*', async r => {
    const q = r.request(), u = new URL(q.url());
    if (u.origin !== ASAS) return r.abort();
    const body = ['GET', 'HEAD'].includes(q.method()) ? undefined : q.postDataBuffer();
    const res = await handle(new Request(q.url(), { method: q.method(), headers: q.headers(), body }), e, { fetch: g.f, now: () => T0 });
    const headers = {}; res.headers.forEach((v, k) => { headers[k] = v; });
    return r.fulfill({ status: res.status, headers, body: Buffer.from(await res.arrayBuffer()) });
  });
}

const ralat = [];
const semak = (s, m) => { if (!s) throw new Error('GAGAL: ' + m); console.log('  ok  ' + m); };
const browser = await playwright.chromium.launch();
async function halaman(viewport, dsf = 2) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf, locale: 'ms-MY', timezoneId: 'Asia/Kuala_Lumpur' });
  await pasang(ctx);
  const p = await ctx.newPage();
  p.on('pageerror', x => ralat.push(String(x)));
  p.on('dialog', d => d.accept());
  return p;
}
// SEMAK=1: ujian asap sahaja, jangan tulis semula gambar
const SEMAK = process.env.SEMAK === '1';
const simpan = (p, nama, opsyen = {}) => SEMAK ? Promise.resolve() : p.screenshot({ path: OUT + nama + '.jpg', type: 'jpeg', quality: 82, ...opsyen });
// Lajur pratonton ialah kotak skrol melekat (tinggi = skrin); lepaskan sementara supaya muka A4 dirakam penuh.
async function simpanElemen(p, sel, nama) {
  const gaya = await p.addStyleTag({ content: '.lajur-pratonton{position:static!important}.pratonton-bekas{max-height:none!important;overflow:visible!important}' });
  await p.waitForTimeout(200);
  if (!SEMAK) await p.locator(sel).screenshot({ path: OUT + nama + '.jpg', type: 'jpeg', quality: 85 });
  await gaya.evaluate(n => n.remove());
}
// Sembunyikan jalur demo dan notis lesen untuk gambar sale page yang bersih
const bersih = (p) => p.evaluate(() => { for (const s of ['.jalur-demo', '#notisLesen', '#mesej', '#mesejKarakter']) { const n = document.querySelector(s); if (n) n.style.display = 'none'; } window.scrollTo(0, 0); });

try {
  // ---------------------------------------------------------- desktop: borang + pratonton
  const d = await halaman({ width: 1360, height: 860 });
  await d.goto(ASAS + '/s/demo');
  await d.waitForSelector('#tab button');
  semak((await d.$$eval('#tab button', b => b.map(x => x.textContent))).includes('Dashboard'), 'demo admin memaparkan tab admin');
  await d.click('#tab button[data-tab=Laporan]');
  await d.waitForSelector('#senaraiLaporan .item');
  semak((await d.$$('#senaraiLaporan .item')).length === 4, 'demo ada 4 laporan contoh');
  await bersih(d);
  await simpan(d, 'senarai-laporan');
  await d.locator('#senaraiLaporan .item', { hasText: 'Kejohanan Bola Sepak' }).locator('button:text("Edit")').click();
  await d.waitForFunction(() => document.querySelectorAll('#senaraiLampiran img').length === 2);
  await bersih(d);
  await d.waitForTimeout(400);
  await simpan(d, 'borang-pratonton');
  await simpanElemen(d, '#pageOne', 'a4-kotak');

  // Jana PDF sebenar dalam demo
  await d.click('[data-hantar=HANTAR]');
  await d.waitForFunction(() => document.getElementById('mesej').textContent.includes('dihantar'), null, { timeout: 60000 });
  await d.click('#tab button[data-tab=Laporan]');
  await d.waitForSelector('#senaraiLaporan button:text("PDF")');
  semak(true, 'demo menjana PDF sebenar dan menyimpannya dalam memori');

  // Gaya poster
  await d.locator('#senaraiLaporan .item', { hasText: 'Kelas Intervensi' }).locator('button:text("Edit")').click();
  await d.waitForFunction(() => document.getElementById('fTajuk').value.includes('Intervensi'));
  await d.selectOption('#fGayaLaporan', 'POSTER');
  await d.waitForTimeout(300);
  await simpanElemen(d, '#posterPage', 'poster');

  await d.click('#tab button[data-tab=Dashboard]');
  await d.waitForSelector('#cartaBulan .lajur');
  await bersih(d);
  await simpan(d, 'dashboard');
  await d.click('#tab button[data-tab=Guru]');
  await d.waitForSelector('#senaraiGuru .item');
  await bersih(d);
  await simpan(d, 'guru');

  // ---------------------------------------------------------- telefon: guru
  const t = await halaman({ width: 390, height: 844 }, 3);
  await t.goto(ASAS + '/s/demo?peranan=guru');
  await t.waitForSelector('#tab button');
  semak((await t.$$eval('#tab button', b => b.map(x => x.textContent))).join() === 'Borang OPR,Laporan', 'demo guru hanya nampak Borang dan Laporan');
  await t.click('#tab button[data-tab=Laporan]');
  await t.waitForSelector('#senaraiLaporan .item');
  semak((await t.$$('#senaraiLaporan .item')).length === 2, 'demo guru hanya nampak laporan sendiri');
  await t.click('#tab button[data-tab=Borang]');
  await t.fill('#fTajuk', 'Program Kitar Semula Sekolah');
  await bersih(t);
  await simpan(t, 'telefon-borang');
  await t.click('#butangPratonton');
  await t.waitForTimeout(800);
  await simpan(t, 'telefon-pratonton');

  // ---------------------------------------------------------- e-Karakter (demo): admin desktop
  const k = await halaman({ width: 1360, height: 860 });
  await k.goto(ASAS + '/s/demo?m=karakter');
  await k.waitForSelector('#tabKarakter button');
  semak((await k.$$eval('#tabKarakter button', b => b.map(x => x.textContent))).join() === 'Borang,Laporan,Dashboard,Panduan Mula,Setup', 'demo e-Karakter admin: 5 tab');
  await k.waitForSelector('#borangKrk');
  await k.selectOption('#kKelas', '5 Ibnu Sina');
  await k.selectOption('#kSubjek', 'Sains');
  await k.check('#kTeras0', { force: true }); await k.check('#kTeras1', { force: true });
  await k.fill('#kTajuk', 'Eksperimen tumbesaran pokok berkumpulan');
  await k.click('#cadanganAyat');
  const gbrK = await k.evaluate(() => [['#0f766e', 'Menyukat tumbesaran'], ['#b45309', 'Pembentangan kumpulan']].map(([w, t]) => { const c = document.createElement('canvas'); c.width = 900; c.height = 600;
    const x = c.getContext('2d'); const gr = x.createLinearGradient(0, 0, 900, 600); gr.addColorStop(0, w); gr.addColorStop(1, '#0f172a'); x.fillStyle = gr; x.fillRect(0, 0, 900, 600);
    x.fillStyle = 'rgba(255,255,255,.18)'; for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(130 + i * 130, 470 - (i % 2) * 90, 70, 0, 7); x.fill(); }
    x.fillStyle = '#fff'; x.font = 'bold 54px sans-serif'; x.textAlign = 'center'; x.fillText(t, 450, 280); x.font = '28px sans-serif'; x.fillText('Gambar contoh', 450, 330);
    return c.toDataURL('image/png').split(',')[1]; }));
  await k.setInputFiles('#kGambar', gbrK.map((b64, i) => ({ name: 'g' + i + '.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') })));
  await k.waitForFunction(() => document.querySelectorAll('#kSenaraiGambar img').length === 2);
  await k.check('#kAkuan');
  await k.click('#butangTtd');
  await k.waitForSelector('#dialogTtd[open] #kanvasTtd');
  const kotak = await k.locator('#kanvasTtd').boundingBox();
  await k.mouse.move(kotak.x + 40, kotak.y + 110); await k.mouse.down();
  for (const [dx, dy] of [[90, 40], [140, 120], [200, 50], [260, 105], [330, 70], [420, 60]]) await k.mouse.move(kotak.x + dx, kotak.y + dy, { steps: 8 });
  await k.mouse.up();
  await k.click('#gunaTtd');
  await k.waitForSelector('#kA4 .a4k-ttd-ruang img');
  await bersih(k);
  await k.waitForTimeout(500);
  await simpan(k, 'krk-borang');
  await simpanElemen(k, '#kA4 .krk-a4-skala', 'krk-a4');
  await k.click('#hantarKrk');
  await k.waitForFunction(() => /Laporan dihantar.*PDF disimpan/.test(document.getElementById('mesejKarakter').textContent), null, { timeout: 60000 });
  semak(true, 'demo e-Karakter: hantar dengan tandatangan, PDF dijana dalam memori');
  await k.click('#tabKarakter button[data-krk=Dashboard]');
  await k.waitForSelector('.krk-kpi-kad');
  await k.waitForFunction(() => window.Chart && window.Chart.getChart(document.getElementById('krkDonat')));
  semak(Number((await k.textContent('.krk-kpi-kad .krk-kpi-nilai')).trim()) === 41, 'demo dashboard: 40 laporan contoh + 1 baharu');
  await k.waitForTimeout(600);
  await bersih(k);
  await simpan(k, 'krk-dashboard');

  // ---------------------------------------------------------- e-Karakter (demo): guru dan guru kelas di telefon
  const kg = await halaman({ width: 390, height: 844 }, 3);
  await kg.goto(ASAS + '/s/demo?m=karakter&peranan=guru');
  await kg.waitForSelector('#borangKrk');
  semak((await kg.$$eval('#tabKarakter button', b => b.map(x => x.textContent))).join() === 'Borang,Laporan', 'demo e-Karakter guru: Borang dan Laporan sahaja');
  await kg.click('#tabKarakter button[data-krk=Laporan]');
  await kg.waitForSelector('#kSenaraiLaporan .krk-item');
  semak((await kg.$$('#kSkopTab')).length === 0 && (await kg.$$('#kSenaraiLaporan .krk-item')).length > 0, 'demo guru: laporan sendiri, tiada sub-tab Kelas Saya');
  await kg.click('#tabKarakter button[data-krk=Borang]');
  await kg.check('#kTeras0', { force: true }); await kg.check('#kTeras3', { force: true });
  await kg.evaluate(() => document.getElementById('kTeras').scrollIntoView({ block: 'start' }));
  await bersih(kg);
  await kg.evaluate(() => window.scrollBy(0, document.getElementById('kTeras').getBoundingClientRect().top - 120));
  await kg.waitForTimeout(300);
  await simpan(kg, 'krk-telefon-borang');
  await kg.click('#butangTtd');
  await kg.waitForSelector('#dialogTtd[open] #kanvasTtd');
  const kt = await kg.locator('#kanvasTtd').boundingBox();
  await kg.mouse.move(kt.x + 20, kt.y + 110); await kg.mouse.down();
  for (const [dx, dy] of [[60, 40], [100, 120], [150, 50], [200, 105], [260, 70], [320, 60]]) await kg.mouse.move(kt.x + dx, kt.y + dy, { steps: 8 });
  await kg.mouse.up();
  await kg.waitForTimeout(300);
  await simpan(kg, 'krk-telefon-ttd');
  await kg.click('#gunaTtd');
  const kk = await halaman({ width: 390, height: 844 });
  await kk.goto(ASAS + '/s/demo?m=karakter&peranan=gurukelas');
  await kk.waitForSelector('#tabKarakter button');
  await kk.click('#tabKarakter button[data-krk=Laporan]');
  await kk.click('#kSkopTab button[data-skop=kelas]');
  await kk.waitForSelector('.krk-ringkasan-kad[data-kelas="5 Ibnu Sina"]');
  await kk.waitForSelector('#kSenaraiLaporan .krk-item');
  semak((await kk.textContent('#kSenaraiLaporan')).includes('Cikgu') && (await kk.$$eval('#kSenaraiLaporan .meta', n => n.every(x => x.textContent.includes('5 Ibnu Sina')))), 'demo guru kelas: Kelas Saya hanya 5 Ibnu Sina');
  semak(await kk.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'demo e-Karakter: tiada skrol mendatar pada 390px');

  // ---------------------------------------------------------- sale page
  for (const [vp, label] of [[{ width: 1360, height: 860 }, 'desktop'], [{ width: 390, height: 844 }, 'telefon']]) {
    const s = await halaman(vp, 1);
    const res = await s.goto(ASAS + '/');
    semak(res.status() === 200, `sale page dibuka (${label})`);
    await s.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } });
    semak(await s.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `tiada skrol mendatar (${label})`);
    semak(await s.evaluate(() => [...document.images].every(i => i.complete && i.naturalWidth > 0)), `semua gambar dimuatkan (${label})`);
    semak(await s.evaluate(() => [...document.querySelectorAll('.muncul')].every(n => n.classList.contains('nampak'))), `semua seksyen muncul selepas skrol (${label})`);
    if (label === 'desktop') {
      const pautan = await s.$$eval('a[href^="/"]', a => [...new Set(a.map(x => x.getAttribute('href').split('#')[0]))]);
      // Panggil Worker dalam proses terus (page.request TIDAK melalui ctx.route dan akan menyentuh laman sebenar)
      for (const h of pautan) { const r = await handle(new Request(ASAS + h), e, { fetch: g.f, now: () => T0 }); semak(r.status < 400, `pautan ${h} -> ${r.status}`); }
    }
  }

  semak(ralat.length === 0, 'tiada ralat JavaScript' + (ralat.length ? ': ' + ralat.join(' | ') : ''));
  console.log('Tangkapan skrin disimpan dalam public/img/');
} finally { await browser.close(); }
