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
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf });
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
const bersih = (p) => p.evaluate(() => { for (const s of ['.jalur-demo', '#notisLesen', '#mesej']) { const n = document.querySelector(s); if (n) n.style.display = 'none'; } window.scrollTo(0, 0); });

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

  // ---------------------------------------------------------- sale page
  for (const [vp, label] of [[{ width: 1360, height: 860 }, 'desktop'], [{ width: 390, height: 844 }, 'telefon']]) {
    const s = await halaman(vp, 1);
    const res = await s.goto(ASAS + '/');
    semak(res.status() === 200, `sale page dibuka (${label})`);
    await s.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 30)); } });
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
