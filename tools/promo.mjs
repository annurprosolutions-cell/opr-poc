// Video promosi 9:16 (TikTok) disegerakkan dengan audio suara latar.
//   AUDIO=/laluan/suara.wav node tools/promo.mjs            -> .video/promo/promo-tiktok.mp4
//   node tools/promo.mjs rakam 3 5   (rakam semula babak tertentu sahaja)   |   node tools/promo.mjs gabung
// Setiap babak dirakam DUA kali dengan skrip masa yang sama: komputer (1280x720) dan telefon (390x692),
// kemudian digabung dalam satu bingkai 1080x1920 (komputer atas, telefon bawah, sari kata di sebelah telefon).
// Zoom ialah kamera pasca-rakaman (filter perspective, resolusi tinggi); sorotan dan kursor dilukis dalam halaman.
// Worker SEBENAR dijalankan dalam proses; Google, Drive dan KV dipalsukan; semua hos luar disekat.
import { readFileSync, mkdirSync, rmSync, writeFileSync, existsSync, readdirSync, copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execSync, execFileSync } from 'node:child_process';
import { resolve as laluan } from 'node:path';
import { handle } from '../src/worker.js';
import { env as binaEnv, googlePalsu, T0 } from '../tests/palsu.js';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require(execSync('npm root -g').toString().trim() + '/playwright'); }

const ARG = process.argv.slice(2);
const PERINTAH = ['rakam', 'gabung', 'grafik'].includes(ARG[0]) ? ARG[0] : 'semua';
const PILIH = ARG.filter(x => /^\d+$/.test(x)).map(Number);
const AUDIO = process.env.AUDIO || '';
const ASAS = 'https://opr.annurpro.com';
const PUB = new URL('../public/', import.meta.url);
const OUT = new URL('../.video/promo/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const JENIS = { html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', json: 'application/json', jpg: 'image/jpeg', png: 'image/png', svg: 'image/svg+xml', pdf: 'application/pdf' };
const SLUG = 'smkcontohjaya';
const log = (...a) => console.log(...a);

// ------------------------------------------------------------------ masa (saat dalam audio)
const MULA = [0, 12.24, 25.06, 41.27, 51.60, 78.92];
const TAMAT = 93.1;
const BABAK_DUR = MULA.map((m, i) => (i + 1 < MULA.length ? MULA[i + 1] : TAMAT) - m);

// Sari kata: [mula, tamat, teks, perkataan sorot]
const KATA = [
  [0.00, 4.00, 'Setiap kali ada program atau aktiviti, guru perlu sediakan laporan.', ['laporan']],
  [4.24, 8.20, 'Format lain-lain, bertaburan dalam WhatsApp, dan susah dijejak.', ['WhatsApp', 'susah dijejak']],
  [8.65, 12.00, 'Annur OPR satukan semuanya dalam satu sistem.', ['satu sistem']],
  [12.24, 13.95, 'Guru log masuk dengan akaun Google.', ['akaun Google']],
  [14.11, 19.80, 'Admin sekolah tambah guru sekali sahaja, dan semua data disimpan dalam Google Drive sekolah sendiri.', ['tambah guru', 'Google Drive sekolah sendiri']],
  [20.17, 24.90, 'Selepas log masuk, pilih modul: OPR atau Pembentukan Karakter.', ['OPR', 'Pembentukan Karakter']],
  [25.06, 31.60, 'Dalam modul OPR, pilih jenis laporan, isi tajuk, tarikh, objektif dan kekuatan program.', ['jenis laporan', 'objektif']],
  [31.88, 35.95, 'Tambah gambar aktiviti, dan pratonton A4 terus kelihatan di sebelah.', ['gambar aktiviti', 'pratonton A4']],
  [36.13, 40.90, 'Tekan hantar, dan PDF siap dengan logo sekolah serta ruang tandatangan.', ['PDF siap', 'logo sekolah', 'tandatangan']],
  [41.27, 44.70, 'Penyemak nampak laporan yang belum disemak dan boleh menandanya.', ['belum disemak']],
  [44.96, 51.10, 'Admin pula ada dashboard: jumlah laporan, ikut jenis dan peringkat, serta eksport CSV.', ['dashboard', 'eksport CSV']],
  [51.60, 55.50, 'Modul Pembentukan Karakter pula merekod setiap sesi PdP.', ['Pembentukan Karakter']],
  [55.85, 61.80, 'Guru pilih kelas, subjek dan elemen teras, tulis catatan, dan tambah sehingga empat gambar.', ['elemen teras', 'empat gambar']],
  [62.06, 67.30, 'Gambar boleh dilaras, seret, zoom dan pangkas, supaya kemas dalam PDF.', ['dilaras', 'pangkas']],
  [67.73, 72.20, 'Tandatangan dilukis dengan jari sekali sahaja, dan tersimpan untuk laporan seterusnya.', ['dengan jari', 'sekali sahaja']],
  [72.70, 78.60, 'Guru kelas nampak laporan kelasnya, dan admin dapat dashboard dengan carta serta PDF landskap.', ['Guru kelas', 'dashboard', 'PDF landskap']],
  [78.92, 83.40, 'Cuba demo percuma tanpa log masuk, atau daftar sekolah dengan percubaan 14 hari.', ['demo percuma', '14 hari']],
  [83.66, 90.20, 'Selepas itu RM10 sebulan atau RM100 setahun, untuk seluruh sekolah, termasuk OPR dan e-Karakter.', ['RM10 sebulan', 'RM100 setahun']]
];
const CHIP = ['Masalah', 'Log masuk', 'Laporan OPR', 'Semak dan dashboard', 'e-Karakter', 'Cuba sekarang'];

// ------------------------------------------------------------------ backend (sama seperti perakam panduan)
const g = googlePalsu();
const e = binaEnv({ BUY_URL: 'https://annurprosolutions1.bcl.my/form/annur-opr', ASSETS: { fetch: async (r) => {
  let p = new URL(r.url).pathname;
  if (p === '/') p = '/index.html'; else if (p.endsWith('/')) p += 'index.html'; else if (!/\.[a-z]+$/.test(p)) p += '.html';
  try { return new Response(readFileSync(new URL('.' + p, PUB)), { headers: { 'content-type': JENIS[p.split('.').pop()] || 'application/octet-stream' } }); }
  catch (x) { return new Response('Tiada', { status: 404 }); }
} } });
const lencong = (r, ke, kuki) => r.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', ...(kuki.length ? { 'set-cookie': kuki.join('\n') } : {}) },
  body: '<script>location.replace(' + JSON.stringify(ke) + ')</script>' });
async function pasang(ctx) {
  await ctx.route('**/*', async r => {
    const q = r.request(), u = new URL(q.url());
    if (u.origin === 'https://accounts.google.com') return lencong(r, ASAS + '/auth/callback?code=kod&state=' + u.searchParams.get('state'), []);
    if (/^fonts\.(googleapis|gstatic)\.com$/.test(u.host)) return r.continue();
    if (u.origin !== ASAS) return r.abort();
    const body = ['GET', 'HEAD'].includes(q.method()) ? undefined : q.postDataBuffer();
    const res = await handle(new Request(q.url(), { method: q.method(), headers: q.headers(), body }), e, { fetch: g.f, now: () => T0 });
    const kuki = res.headers.getSetCookie();
    if (res.status >= 300 && res.status < 400) return lencong(r, new URL(res.headers.get('location'), ASAS).href, kuki);
    const headers = {}; res.headers.forEach((v, k) => { if (k !== 'set-cookie') headers[k] = v; });
    if (kuki.length) headers['set-cookie'] = kuki.join('\n');
    return r.fulfill({ status: res.status, headers, body: Buffer.from(await res.arrayBuffer()) });
  });
}

// ------------------------------------------------------------------ lapisan dalam halaman: kursor, riak, sorotan
const LAPISAN = (o) => {
  if (window.top !== window) return;
  const m = !!o.mobile;
  const css = `#rec-cur{position:fixed;left:0;top:0;width:${m ? 0 : 34}px;height:34px;z-index:2147483647;pointer-events:none;transform:translate(-90px,-90px);display:${m ? 'none' : 'block'}}
  #rec-cur svg{filter:drop-shadow(0 2px 3px rgba(0,0,0,.5))}
  .rec-rip{position:fixed;width:${m ? 54 : 56}px;height:${m ? 54 : 56}px;margin:-${m ? 27 : 28}px 0 0 -${m ? 27 : 28}px;border-radius:50%;border:${m ? 5 : 6}px solid #fbbf24;background:rgba(251,191,36,.25);z-index:2147483646;pointer-events:none;animation:recR .7s ease-out forwards}
  @keyframes recR{from{transform:scale(.3);opacity:1}to{transform:scale(1.8);opacity:0}}
  #rec-hl{position:fixed;z-index:2147483643;pointer-events:none;border:${m ? 5 : 8}px solid #fbbf24;border-radius:${m ? 14 : 16}px;box-shadow:0 0 0 9999px rgba(4,8,22,.5),0 0 28px 6px rgba(251,191,36,.55);transition:left .3s,top .3s,width .3s,height .3s,opacity .25s;opacity:0}
  #rec-hl.on{opacity:1}
  #rec-lbl{position:fixed;z-index:2147483644;pointer-events:none;background:#fbbf24;color:#1c1203;font:700 ${m ? 21 : 34}px/1.1 Inter,system-ui,sans-serif;padding:${m ? '7px 13px' : '9px 18px'};border-radius:999px;white-space:nowrap;opacity:0;transition:opacity .25s,left .3s,top .3s;box-shadow:0 6px 18px rgba(0,0,0,.4)}
  #rec-lbl.on{opacity:1}
  .jalur-demo{display:none!important}
  html{scroll-behavior:auto!important}`;
  const mk = () => {
    if (document.getElementById('rec-cur') || !document.body) return;
    const st = document.createElement('style'); st.textContent = css; document.documentElement.appendChild(st);
    const cur = document.createElement('div'); cur.id = 'rec-cur';
    cur.innerHTML = '<svg width="34" height="34" viewBox="0 0 24 24"><path d="M4 2l15 11-6.6 1.2L16 21l-2.6 1.2-3.6-6.9L4 19z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    const hl = document.createElement('div'); hl.id = 'rec-hl';
    const lbl = document.createElement('div'); lbl.id = 'rec-lbl';
    document.documentElement.append(cur, hl, lbl);
    const mv = (ev) => { if (ev.clientX || ev.clientY) cur.style.transform = `translate(${ev.clientX - 4}px,${ev.clientY - 3}px)`; };
    ['mousemove', 'pointermove'].forEach((t) => window.addEventListener(t, mv, true));
    window.addEventListener('mousedown', (ev) => { const r = document.createElement('div'); r.className = 'rec-rip'; r.style.left = ev.clientX + 'px'; r.style.top = ev.clientY + 'px'; document.documentElement.appendChild(r); setTimeout(() => r.remove(), 750); }, true);
  };
  window.__rec = {
    hl: (b, label) => {
      mk(); const h = document.getElementById('rec-hl'), l = document.getElementById('rec-lbl');
      if (!b) { h.classList.remove('on'); l.classList.remove('on'); return; }
      const p = m ? 8 : 12;
      const bl = b.left != null ? b.left : b.x, bt = b.top != null ? b.top : b.y;
      b = { left: bl, top: bt, width: b.width, height: b.height };
      Object.assign(h.style, { left: b.left - p + 'px', top: b.top - p + 'px', width: b.width + 2 * p + 'px', height: b.height + 2 * p + 'px' }); h.classList.add('on');
      if (label) {
        l.textContent = label; l.classList.add('on');
        const w = l.offsetWidth, hh = l.offsetHeight, vw = window.innerWidth;
        let top = b.top - p - hh - 10; if (top < 6) top = b.top + b.height + p + 10;
        let left = Math.min(Math.max(8, b.left - p), vw - w - 8);
        Object.assign(l.style, { left: left + 'px', top: top + 'px' });
      } else l.classList.remove('on');
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mk); else mk();
};

// ------------------------------------------------------------------ pembantu: jam babak, zoom, sorotan, tindakan
function pembantu(pg, dev, jam, kf) {
  const fon = dev === 'fon';
  let cur = { x: fon ? 195 : 640, y: fon ? 346 : 360 };
  const vp = fon ? { w: 390, h: 692 } : { w: 1280, h: 720 };
  const t = () => (Date.now() - jam.mula) / 1000;
  const W = (ms) => pg.waitForTimeout(ms);
  const sampai = async (s) => { for (;;) { const k = s - t(); if (k <= 0) return; await pg.waitForTimeout(Math.min(120, k * 1000)); } };
  const loc = async (sel, tt) => {
    const l = typeof sel === 'string' ? pg.locator(sel).first() : sel;
    await l.waitFor({ state: 'visible', timeout: tt || 8000 });
    return l;
  };
  const kotak = async (sel) => { try { return await (await loc(sel, 1500)).boundingBox(); } catch (x) { return null; } };
  const gerak = async (x, y) => {
    if (fon) { cur = { x, y }; return; }
    const d = Math.hypot(x - cur.x, y - cur.y), n = Math.max(6, Math.min(26, Math.round(d / 28)));
    for (let i = 1; i <= n; i++) { const k = i / n, s = k * k * (3 - 2 * k); await pg.mouse.move(cur.x + (x - cur.x) * s, cur.y + (y - cur.y) * s); await pg.waitForTimeout(15); }
    cur = { x, y };
  };
  const h = {
    pg, dev, fon, t, W, sampai,
    mark(nama) { log(`    [${dev}] ${t().toFixed(1)}s  ${nama}`); },
    // Kamera: zoom ke elemen (atau kotak) pada masa semasa; sel kosong = kembali penuh
    // Kamera ke elemen atau kotak. z ialah had maksimum; zoom dihadkan supaya sasaran sentiasa muat dalam skrin.
    async zoom(sel, z, d = 0.8) {
      if (!sel) { kf.push({ t: t(), cx: 0.5, cy: 0.5, z: 1, d }); return; }
      const b = (sel && typeof sel.x === 'number') ? sel : await kotak(sel);
      if (!b || !b.width || !b.height) return;
      const muat = 0.9 * Math.min(vp.w / b.width, vp.h / b.height);
      const zz = Math.max(1, Math.min(z, muat));
      kf.push({ t: t(), cx: Math.min(1, Math.max(0, (b.x + b.width / 2) / vp.w)), cy: Math.min(1, Math.max(0, (b.y + b.height / 2) / vp.h)), z: zz, d });
    },
    // Bahagian atas elemen yang tinggi (borang, lajur pratonton), dalam koordinat skrin
    async bahagian(sel, tinggi) {
      const b = await kotak(sel); if (!b) return null;
      const y = Math.max(0, b.y);
      return { x: Math.max(0, b.x), y, width: Math.min(b.width, vp.w), height: Math.min(tinggi, b.height, vp.h - y) };
    },
    cue(nama, sasaran) {
      const lewat = t() - sasaran;
      log(`    [${dev}] ${t().toFixed(1)}s (sasaran ${sasaran.toFixed(1)}s${lewat > 0.4 ? ', LEWAT ' + lewat.toFixed(1) : ''})  ${nama}`);
    },
    // Sorotan mengikut elemen (kedudukan disemak semula supaya kekal tepat jika susun atur bergerak)
    async sorot(sel, saat, label) {
      let b = (sel && typeof sel.x === 'number') ? sel : await kotak(sel);
      if (!b) { await W(saat * 1000); return; }
      const hidup = !(sel && typeof sel.x === 'number');
      await pg.evaluate(([b, l]) => window.__rec.hl(b, l), [b, label || '']);
      const habis = Date.now() + saat * 1000;
      while (Date.now() < habis) {
        await W(Math.min(200, Math.max(20, habis - Date.now())));
        if (hidup) {
          const n = await kotak(sel);
          if (n && (Math.abs(n.x - b.x) > 2 || Math.abs(n.y - b.y) > 2)) { b = n; await pg.evaluate(([b, l]) => window.__rec.hl(b, l), [b, label || '']); }
        }
      }
      await pg.evaluate(() => window.__rec.hl(null));
    },
    async padam() { await pg.evaluate(() => window.__rec && window.__rec.hl(null)); },
    async klik(sel, o = {}) {
      const l = await loc(sel, o.timeout);
      if (fon) { await l.click({ timeout: 6000 }); await W(o.lepas != null ? o.lepas : 500); return; }
      let b = await l.boundingBox();
      // Pengepala melekit menutup elemen di atas skrin: bawa ke tengah dahulu (segera, bukan licin)
      if (b && (b.y < 96 || b.y + b.height > vp.h - 8)) {
        await l.evaluate((n) => n.scrollIntoView({ block: 'center', behavior: 'instant' })).catch(() => {});
        await pg.waitForTimeout(80);
        b = await l.boundingBox();
      }
      if (b) { await gerak(b.x + b.width / 2, b.y + b.height / 2); await W(o.jeda != null ? o.jeda : 160); await pg.mouse.click(b.x + b.width / 2, b.y + b.height / 2); }
      else await l.click();
      await W(o.lepas != null ? o.lepas : 500);
    },
    async hover(sel, ms) { const b = await kotak(sel); if (b) await gerak(b.x + b.width / 2, b.y + b.height / 2); await W(ms || 400); },
    async taip(sel, teks, o = {}) {
      const l = await loc(sel); await h.klik(l, { lepas: 60, jeda: 60 });
      await l.fill('');
      await l.pressSequentially(teks, { delay: o.delay || 22 });
      await W(o.lepas != null ? o.lepas : 200);
    },
    async isi(sel, nilai) { const l = await loc(sel); await h.hover(l, 120); await l.fill(nilai); await W(200); },
    async pilih(sel, nilai) { const l = await loc(sel); await h.hover(l, 150); await l.selectOption(nilai); await W(250); },
    async tab(nama) { await h.klik(`#tab button[data-tab=${nama}]`, { lepas: 500 }); await pg.evaluate(() => window.scrollTo(0, 0)); },
    async skrolKe(sel, blok = 'center', ms = 900) { await pg.locator(sel).first().evaluate((n, b) => n.scrollIntoView({ behavior: 'smooth', block: b }), blok, { timeout: 3000 }).catch(() => {}); await W(ms); },
    async atas(ms = 800) { await pg.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await W(ms); },
    async fail(sel, nama, jenis, buffer) { await (await loc(sel)).setInputFiles({ name: nama, mimeType: jenis, buffer }); await W(300); }
  };
  return h;
}

async function gambarContoh(pg, warna, teks, lebar = 800, tinggi = 560) {
  const b64 = await pg.evaluate(([w, t, lb, tg]) => {
    const c = document.createElement('canvas'); c.width = lb; c.height = tg; const x = c.getContext('2d');
    const gr = x.createLinearGradient(0, 0, lb, tg); gr.addColorStop(0, w[0]); gr.addColorStop(1, w[1]); x.fillStyle = gr; x.fillRect(0, 0, lb, tg);
    x.fillStyle = 'rgba(255,255,255,.18)'; for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(lb * (0.12 + i * 0.15), tg * (0.75 - (i % 2) * 0.16), tg * 0.12, 0, 7); x.fill(); }
    x.fillStyle = '#fff'; x.font = 'bold ' + Math.round(tg * 0.08) + 'px system-ui,sans-serif'; x.textAlign = 'center'; x.fillText(t, lb / 2, tg * 0.45);
    x.font = Math.round(tg * 0.048) + 'px system-ui,sans-serif'; x.fillText('Gambar contoh', lb / 2, tg * 0.54);
    return c.toDataURL('image/jpeg', .85).split(',')[1];
  }, [warna, teks, lebar, tinggi]);
  return Buffer.from(b64, 'base64');
}
const PDF_KECIL = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

// ------------------------------------------------------------------ babak (satu skrip, dua peranti)
// Masa dalam run() ialah saat sejak babak bermula; sampai(s) menunggu jika terlalu awal.
const BABAK = [
  { // 1. Masalah dan penyelesaian (sale page)
    url: '/', sedia: '.hero h1',
    async run(h) {
      const dk = !h.fon;
      await h.zoom('.hero h1', dk ? 1.5 : 1.3, 0.9);
      await h.sorot('.hero h1', 1.8, 'One Page Report');
      await h.sampai(3.7);
      await h.zoom(null, 1, 0.5);
      await h.skrolKe('h2:has-text("Masalah yang biasa berlaku")', 'start', 800);
      const kad = h.pg.locator('.grid-tiga .kad');
      await h.zoom('.grid-tiga', dk ? 1.25 : 1.15, 0.7);
      await h.sorot(kad.nth(0), 1.6, 'Format lain-lain');
      await h.sorot(kad.nth(1), 1.6, 'Hantar guna WhatsApp');
      await h.sampai(8.5);
      await h.zoom(null, 1, 0.5);
      await h.atas(900);
      await h.zoom('.hero-gambar', dk ? 1.35 : 1.0, 0.9);
      await h.sorot(dk ? '.hero-gambar' : '.hero h1', 2.2, 'Satu sistem');
    }
  },
  { // 2. Log masuk, tambah guru, Drive sekolah, pilih modul
    url: '/s/' + SLUG, sedia: '#perluLogin:not(.tersembunyi)', pra: () => { g.senario.email = 'admin@smkcontohjaya.edu.my'; g.senario.nama = 'Cikgu Rahman'; },
    async run(h) {
      const dk = !h.fon, pg = h.pg;
      h.mark('mula');
      await h.zoom('#perluLogin .kaca', dk ? 1.7 : 1.1, 0.6);
      h.mark('selepas zoom');
      await h.sorot('#butangLogin', 0.4, 'Log masuk Google');
      h.mark('klik login');
      await h.klik('#butangLogin', { lepas: 100, jeda: 80 });
      await pg.waitForSelector('#pilihModul:not(.tersembunyi)', { timeout: 20000 });
      h.mark('pilih modul muncul');
      await h.zoom(null, 1, 0.3);
      await h.klik('.kad-modul[data-modul=opr]', { lepas: 100, jeda: 80 });
      await pg.waitForSelector('#tab button', { timeout: 20000 });
      h.mark('app muncul');
      h.cue('tab Guru', 1.9);
      await h.sampai(2.0);
      await h.tab('Guru');
      await h.zoom('#teksGuru', dk ? 1.6 : 1.3, 0.8);
      await h.sorot('#teksGuru', 1.2, 'Tambah guru');
      await h.sampai(5.0);
      await h.tab('Drive');
      await h.zoom('#pautanSheet', dk ? 1.6 : 1.4, 0.8);
      await h.sorot('#pautanSheet', 1.2, 'Sheet dalam Drive sekolah');
      h.cue('tukar modul', 7.4);
      await h.sampai(7.5);
      await h.zoom(null, 1, 0.4);
      h.mark('sebelum tukar modul');
      await h.klik('#tukarModul', { lepas: 300 });
      await pg.waitForSelector('#pilihModul:not(.tersembunyi)');
      h.mark('chooser kedua');
      await h.zoom('#pilihModul .kaca', dk ? 1.6 : 1.1, 0.7);
      await h.sampai(8.3);
      h.mark('kotak opr ' + JSON.stringify(await h.pg.evaluate(() => { const r = document.querySelector('.kad-modul[data-modul=opr]').getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height), innerWidth, innerHeight, document.querySelector('.skrin:not(.tersembunyi)').scrollTop]; })));
      await h.sorot('.kad-modul[data-modul=opr]', 1.8, 'OPR');
      h.mark('kotak opr selepas ' + JSON.stringify(await h.pg.evaluate(() => { const r = document.querySelector('.kad-modul[data-modul=opr]').getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y)]; })));
      await h.sorot('.kad-modul[data-modul=karakter]', 1.8, 'Pembentukan Karakter');
    }
  },
  { // 3. Borang OPR, gambar, pratonton, hantar
    url: '/s/demo?peranan=guru', sedia: '#tab button',
    async run(h) {
      const dk = !h.fon, pg = h.pg;
      if (dk) await h.zoom(await h.bahagian('#borang', 330), 1.7, 0.8);
      await h.pilih('#fJenis', 'KOKURIKULUM');
      await h.taip('#fTajuk', 'Hari Sukan Tahunan 2026', { delay: 20 });
      await h.pilih('#fUnit', { index: 2 });
      await h.pilih('#fPeringkat', 'Sekolah');
      await h.isi('#fTarikh', '2026-10-30');
      await h.skrolKe('#fObjektif', 'center', 500);
      await h.taip('#fObjektif', 'Mencungkil bakat murid dalam olahraga.', { delay: 14 });
      await h.taip('#fKekuatan', 'Penyertaan murid sangat menggalakkan.', { delay: 14 });
      await h.sorot('#fObjektif', 0.9, 'Objektif');
      await h.cue('gambar', 6.8);
      await h.sampai(6.5);
      await h.skrolKe('#failInput', 'center', 600);
      await h.fail('#failInput', 'gambar.jpg', 'image/jpeg', await gambarContoh(pg, ['#0f766e', '#134e4a'], 'Acara 100 Meter'));
      await h.klik('#butangTambahFail', { lepas: 700 });
      await h.sorot('#senaraiLampiran', 0.9, 'Gambar aktiviti');
      await h.sampai(8.0);
      if (h.fon) { await h.klik('#butangPratonton', { lepas: 1000 }); }
      if (dk) await h.zoom(await h.bahagian('.pratonton-bekas', 340), 1.9, 0.9);
      await h.sorot('.pratonton-bekas', 1.4, 'Pratonton A4');
      h.cue('logo', 11.1);
      await h.sampai(11.2);
      await h.sorot('.pv-kepala', 1.2, 'Logo sekolah');
      await h.sampai(12.5);
      await h.padam();
      if (h.fon) await h.klik('#kembaliBorang', { lepas: 500 });
      await h.zoom(null, 1, 0.5);
      h.cue('hantar', 12.6);
      await pg.evaluate(() => { document.getElementById('fConsent').checked = true; });
      await h.skrolKe('[data-hantar=HANTAR]', 'center', 600);
      await h.zoom('[data-hantar=HANTAR]', dk ? 1.7 : 1.3, 0.7);
      await h.klik('[data-hantar=HANTAR]', { lepas: 300 });
      await pg.waitForFunction(() => document.getElementById('mesej').textContent.includes('dihantar'), null, { timeout: 30000 }).catch(() => {});
    }
  },
  { // 4. Semak laporan dan dashboard
    url: '/s/demo', sedia: '#tab button',
    async run(h) {
      const dk = !h.fon, pg = h.pg;
      await h.tab('Laporan');
      await pg.waitForSelector('#senaraiLaporan .item');
      const kad = pg.locator('#senaraiLaporan .item', { hasText: 'Kelas Intervensi' });
      await h.skrolKe('#senaraiLaporan .item:has-text("Kelas Intervensi")', 'center', 500);
      await h.zoom('#senaraiLaporan .item:has-text("Kelas Intervensi")', dk ? 1.6 : 1.4, 0.8);
      await h.sorot('#senaraiLaporan .item:has-text("Kelas Intervensi")', 0.9, 'Belum disemak');
      h.mark('sebelum Semak');
      await h.klik(kad.locator('button:text-is("Semak")'), { lepas: 300 });
      h.mark('selepas Semak');
      await h.sampai(3.4);
      await h.zoom(null, 1, 0.4);
      h.mark('sebelum tab Dashboard ' + await pg.evaluate(() => scrollY));
      await h.tab('Dashboard');
      h.mark('selepas tab; aktif=' + await pg.evaluate(() => (document.querySelector('#tab button[aria-selected=true]') || {}).textContent));
      await pg.waitForSelector('#cartaBulan .lajur');
      await h.zoom('#jubin', dk ? 1.5 : 1.3, 0.7);
      h.cue('dashboard', 3.7);
      await h.sorot('#jubin', 1.1, 'Jumlah laporan');
      await h.skrolKe('#cartaUnit', 'center', 800);
      await h.zoom('#cartaUnit', dk ? 1.35 : 1.1, 0.7);
      await h.sorot('#cartaUnit', 1.1, 'Ikut jenis dan peringkat');
      await h.sampai(8.0);
      await h.zoom(null, 1, 0.4);
      await h.atas(600);
      await h.zoom('#butangEksport', dk ? 1.9 : 1.5, 0.7);
      await h.sorot('#butangEksport', 1.2, 'Eksport CSV');
      await h.klik('#butangEksport', { lepas: 300 });
    }
  },
  { // 5. e-Karakter: borang, laras gambar, tandatangan, guru kelas, dashboard
    url: '/s/demo?m=karakter&peranan=guru', sedia: '#borangKrk',
    async run(h) {
      const dk = !h.fon, pg = h.pg;
      if (dk) await h.zoom(await h.bahagian('#borangKrk', 320), 1.6, 0.8);
      await h.sorot('#tabKarakter', 1.8, 'Pembentukan Karakter');
      await h.sampai(4.2);
      h.cue('borang', 4.25);
      await h.pilih('#kKelas', '5 Ibnu Sina');
      await h.pilih('#kSubjek', 'Sains');
      await h.skrolKe('#kTeras', 'center', 300);
      await h.zoom('#kTeras', dk ? 1.5 : 1.2, 0.5);
      await h.klik('.krk-teras-kad[for=kTeras0]', { lepas: 200 });
      await h.klik('.krk-teras-kad[for=kTeras1]', { lepas: 250 });
      await h.sorot('#kTeras', 0.6, 'Elemen teras');
      await h.taip('#kTajuk', 'Eksperimen tumbesaran pokok', { delay: 10, lepas: 100 });
      await h.skrolKe('#kGambar', 'center', 300);
      await h.zoom('#kGambar', dk ? 1.4 : 1.2, 0.5);
      const gb = [['#0f766e', '#134e4a', 'Menyukat'], ['#b45309', '#78350f', 'Mencatat'], ['#1d4ed8', '#1e3a8a', 'Menyiram'], ['#be123c', '#881337', 'Berbincang']];
      const fail = [];
      for (let i = 0; i < gb.length; i++) fail.push({ name: 'g' + i + '.jpg', mimeType: 'image/jpeg', buffer: await gambarContoh(pg, [gb[i][0], gb[i][1]], gb[i][2], i % 2 ? 1000 : 1600, i % 2 ? 1500 : 1100) });
      await h.hover('#kGambar', 100);
      await pg.locator('#kGambar').setInputFiles(fail);
      await pg.waitForFunction(() => document.querySelectorAll('#kSenaraiGambar img').length === 4, null, { timeout: 15000 });
      await h.zoom('#kSenaraiGambar', dk ? 1.3 : 1.0, 0.5);
      await h.sorot('#kSenaraiGambar', 0.7, 'Sehingga 4 gambar');
      h.cue('laras', 10.4);
      await h.sampai(10.4);
      // Laras gambar
      await h.zoom(null, 1, 0.3);
      await h.klik('#kSenaraiGambar button[data-laras="1"]', { lepas: 500 });
      await pg.waitForSelector('#dialogLaras #kanvasLaras');
      await h.zoom('#kanvasLaras', dk ? 2.0 : 1.5, 0.7);
      await h.sorot('#kanvasLaras', 1.0, 'Seret dan zoom');
      const kv = await pg.locator('#kanvasLaras').boundingBox();
      if (!h.fon) {
        await h.hover('#kanvasLaras', 100);
        await pg.mouse.down();
        for (let i = 1; i <= 10; i++) { await pg.mouse.move(kv.x + kv.width / 2 + i * 7, kv.y + kv.height / 2 + i * 3); await pg.waitForTimeout(40); }
        await pg.mouse.up();
      }
      for (const v of [1.2, 1.5, 1.8]) { await pg.locator('#zoomLaras').evaluate((z, n) => { z.value = n; z.dispatchEvent(new Event('input', { bubbles: true })); }, String(v)); await pg.waitForTimeout(260); }
      await h.sorot('#zoomLaras', 0.8, 'Zoom');
      await h.sampai(14.6);
      await h.klik('#gunaLaras', { lepas: 400 });
      h.cue('tandatangan', 16.1);
      await h.sampai(15.9);
      // Tandatangan
      await h.zoom(null, 1, 0.3);
      await h.skrolKe('#butangTtd', 'center', 500);
      await h.klik('#butangTtd', { lepas: 500 });
      const k = await pg.locator('#kanvasTtd').boundingBox();
      await h.zoom('#kanvasTtd', dk ? 2.0 : 1.5, 0.6);
      await h.sorot('#kanvasTtd', 0.5, 'Tandatangan dengan jari');
      await h.padam();
      await pg.mouse.move(k.x + 20, k.y + 110); await pg.mouse.down();
      for (const [dx, dy] of [[60, 40], [100, 120], [150, 50], [200, 105], [260, 70], [320, 60]]) { await pg.mouse.move(k.x + dx, k.y + dy, { steps: 8 }); await pg.waitForTimeout(40); }
      await pg.mouse.up();
      await h.W(500);
      await h.sampai(18.6);
      await h.klik('#gunaTtd', { lepas: 300 });
      await h.zoom(null, 1, 0.4);
      h.cue('guru kelas', 20.2);
      await h.sampai(20.2);
      // Guru kelas
      await pg.goto(ASAS + '/s/demo?m=karakter&peranan=gurukelas');
      await pg.waitForSelector('#tabKarakter button');
      await h.klik('#tabKarakter button[data-krk=Laporan]', { lepas: 500 });
      await h.klik('#kSkopTab button[data-skop=kelas]', { lepas: 600 });
      await pg.waitForSelector('.krk-ringkasan-kad');
      await h.zoom('.krk-ringkasan', dk ? 1.6 : 1.2, 0.7);
      await h.sorot('.krk-ringkasan', 0.9, 'Laporan kelas saya');
      h.cue('dashboard admin', 23.2);
      await h.sampai(23.2);
      // Dashboard admin dan PDF landskap
      await pg.goto(ASAS + '/s/demo?m=karakter');
      await pg.waitForSelector('#tabKarakter button');
      await h.klik('#tabKarakter button[data-krk=Dashboard]', { lepas: 500 });
      await pg.waitForSelector('.krk-kpi-kad');
      await pg.waitForFunction(() => window.Chart && window.Chart.getChart(document.getElementById('krkDonat'))).catch(() => {});
      await h.zoom('.krk-kpi', dk ? 1.5 : 1.2, 0.6);
      await h.sorot('.krk-kpi', 1.0, 'Dashboard');
      await h.sampai(26.0);
      await h.zoom('#krkPdfDashboard', dk ? 1.8 : 1.4, 0.5);
      await h.sorot('#krkPdfDashboard', 0.7, 'PDF landskap');
    }
  },
  { // 6. Demo, percubaan, harga
    url: '/', sedia: '.hero h1',
    async run(h) {
      const dk = !h.fon;
      await h.zoom('.hero .baris-butang', dk ? 1.9 : 1.3, 0.8, { y: dk ? 0 : 0 });
      await h.sorot('.hero .butang.besar:not(.sekunder)', 1.5, 'Demo percuma');
      await h.sampai(1.9);
      await h.sorot('.hero .butang.sekunder', 1.8, 'Percubaan 14 hari');
      await h.sampai(4.4);
      await h.zoom(null, 1, 0.4);
      await h.skrolKe('#harga', 'start', 900);
      await h.zoom('.grid-harga', dk ? 1.5 : 1.15, 0.8);
      await h.sampai(5.6);
      await h.sorot('.grid-harga .kad:nth-child(1)', 2.3, 'RM10 sebulan');
      await h.sampai(8.0);
      await h.sorot('.grid-harga .kad:nth-child(2)', 2.5, 'RM100 setahun');
      await h.sampai(10.6);
      await h.zoom(null, 1, 0.8);
      await h.atas(1200);
    }
  }
];

// ------------------------------------------------------------------ rakam satu babak pada satu peranti
const PERANTI = {
  dk: { viewport: { width: 1280, height: 720 }, dsf: 1.5, w: 1920, h: 1080 },
  fon: { viewport: { width: 390, height: 692 }, dsf: 2.5, w: 976, h: 1730 }
};
async function rakamBabak(browser, idx, dev) {
  const b = BABAK[idx], P = PERANTI[dev], dur = BABAK_DUR[idx];
  const opsyen = { viewport: P.viewport, deviceScaleFactor: P.dsf, timezoneId: 'Asia/Kuala_Lumpur', locale: 'ms-MY', serviceWorkers: 'block', acceptDownloads: true };
  if (dev === 'fon') Object.assign(opsyen, { isMobile: true, hasTouch: true });
  const ctx = await browser.newContext(opsyen);
  await pasang(ctx);
  const pg = await ctx.newPage();
  await pg.clock.setFixedTime(T0);
  await pg.addInitScript(LAPISAN, { mobile: dev === 'fon' });
  const ralat = [];
  pg.on('pageerror', x => ralat.push(String(x)));
  pg.on('dialog', d => d.accept());
  if (b.pra) b.pra();
  await pg.goto(ASAS + b.url);
  await pg.waitForSelector(b.sedia, { timeout: 30000 });
  await pg.waitForTimeout(600);
  const fdir = OUT + `f-${idx + 1}-${dev}`;
  rmSync(fdir, { recursive: true, force: true }); mkdirSync(fdir, { recursive: true });
  const kerangka = [];
  const cdp = await ctx.newCDPSession(pg);
  cdp.on('Page.screencastFrame', (ev) => {
    writeFileSync(`${fdir}/${String(kerangka.length).padStart(6, '0')}.jpg`, Buffer.from(ev.data, 'base64'));
    kerangka.push(ev.metadata.timestamp);
    cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
  });
  const jam = { mula: Date.now() };
  const kf = [];
  const h = pembantu(pg, dev, jam, kf);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 82, maxWidth: Math.round(P.viewport.width * P.dsf), maxHeight: Math.round(P.viewport.height * P.dsf), everyNthFrame: 1 });
  jam.mula = Date.now();
  const t0 = jam.mula / 1000;
  try { await b.run(h); } catch (x) { ralat.push('babak gagal: ' + x.stack.split('\n').slice(0, 4).join(' | ')); await pg.screenshot({ path: OUT + `gagal-b${idx + 1}-${dev}.png` }).catch(() => {}); }
  const lebih = h.t() - dur;
  if (lebih > 0.05) log(`    ! [${dev}] babak ${idx + 1} lewat ${lebih.toFixed(1)}s (dipotong)`);
  await h.sampai(dur);
  await cdp.send('Page.stopScreencast').catch(() => {});
  await ctx.close();
  if (ralat.length) { log(`  ! ${ralat.join('\n    ')}`); process.exitCode = 1; }
  if (!kerangka.length) throw new Error('tiada bingkai');
  const baris = [];
  for (let i = 0; i < kerangka.length; i++) {
    const mula = Math.max(kerangka[i], t0), tamat = Math.min(i + 1 < kerangka.length ? kerangka[i + 1] : t0 + dur, t0 + dur);
    if (tamat - mula <= 0.0005) continue;
    baris.push(`file '${laluan(fdir, String(i).padStart(6, '0') + '.jpg')}'`, `duration ${(tamat - mula).toFixed(4)}`);
  }
  if (!baris.length) throw new Error('bingkai tidak sah');
  baris.push(baris[baris.length - 2]);
  writeFileSync(fdir + '/senarai.txt', baris.join('\n') + '\n');
  const mp4 = OUT + `b${idx + 1}-${dev}.mp4`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', fdir + '/senarai.txt',
    '-vf', `fps=30,scale=${P.w}:${P.h}:flags=lanczos,setsar=1`, '-t', dur.toFixed(3),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '15', '-pix_fmt', 'yuv420p', '-an', mp4]);
  writeFileSync(OUT + `b${idx + 1}-${dev}.json`, JSON.stringify(kf));
  rmSync(fdir, { recursive: true, force: true });
  log(`  b${idx + 1}-${dev}.mp4  ${dur.toFixed(1)}s  ${kf.length} zoom`);
}

// ------------------------------------------------------------------ sediakan sekolah contoh (tidak dirakam)
async function sediakanSekolah(browser) {
  g.senario.email = 'admin@smkcontohjaya.edu.my'; g.senario.nama = 'Cikgu Rahman';
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Kuala_Lumpur', locale: 'ms-MY', serviceWorkers: 'block' });
  await pasang(ctx);
  const pg = await ctx.newPage();
  await pg.clock.setFixedTime(T0);
  await pg.goto(ASAS + '/daftar');
  await pg.waitForSelector('#langkahSambung:not(.tersembunyi)');
  await pg.click('text=Sambung dengan Google');
  await pg.waitForSelector('#langkahBorang:not(.tersembunyi)');
  await pg.fill('#nama', 'SMK Contoh Jaya');
  await pg.waitForFunction(() => document.getElementById('statusSlug').textContent.startsWith('Tersedia'));
  await pg.click('#hantar');
  await pg.waitForURL(/\/s\//, { timeout: 30000 });
  await pg.waitForSelector('#pilihModul:not(.tersembunyi)', { timeout: 30000 });
  await ctx.close();
}

// ------------------------------------------------------------------ lapisan grafik (PNG) dan gabungan akhir
const FRAME = { dk: { x: 40, y: 206, w: 1000, h: 564 }, fon: { x: 52, y: 842, w: 486, h: 860 } };
const KOL = { x: 585, y: 842, w: 400, h: 860 };
const CSS = `@import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}html,body{background:transparent;font-family:Inter,system-ui,sans-serif;color:#fff}
.logo{width:56px;height:56px;border-radius:50%;background:#e1252f url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M7 3h7l4 4v14H7z'/%3E%3Cpath d='M14 3v4h4M10 12h5M10 16h5'/%3E%3C/svg%3E") center/28px no-repeat;box-shadow:0 8px 22px rgba(225,37,47,.45)}`;
async function janaGrafik(browser, cahaya) {
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await ctx.route('**/*', r => /^fonts\.(googleapis|gstatic)\.com$/.test(new URL(r.request().url()).host) || r.request().url().startsWith('data:') ? r.continue() : r.abort());
  const pg = await ctx.newPage();
  const sedia = async (html) => { await pg.setContent(`<style>${CSS}</style>${html}`, { waitUntil: 'networkidle' }); await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(300); };
  const ambil = (fail, klip) => pg.screenshot({ path: OUT + fail, omitBackground: true, ...(klip ? { clip: klip } : {}) });

  // Latar tetap: gradien gelap, garisan cahaya, kepala, bingkai komputer dan telefon, label
  const dk = FRAME.dk, fn = FRAME.fon;
  await sedia(`<div style="position:relative;width:1080px;height:1920px;overflow:hidden;background:radial-gradient(1200px 900px at 50% 38%,#12275c 0%,#070b17 62%,#04060c 100%)">
    <div style="position:absolute;inset:0;opacity:.38">${cahaya}</div>
    <div style="position:absolute;left:0;top:0;width:1080px;height:160px;background:linear-gradient(#04060c 40%,rgba(4,6,12,0))"></div>
    <div style="position:absolute;left:40px;top:62px;display:flex;align-items:center;gap:16px"><div class="logo"></div><div><div style="font:700 36px 'Inter Tight';letter-spacing:-.01em">Annur OPR</div><div style="font:600 19px Inter;letter-spacing:.14em;color:rgba(232,236,245,.65);margin-top:2px">LAPORAN SEKOLAH, SIAP DALAM MINIT</div></div></div>
    <div style="position:absolute;left:${dk.x - 2}px;top:${dk.y - 40}px;width:${dk.w + 4}px;height:${dk.h + 44}px;border-radius:20px;background:#1a2542;border:2px solid rgba(255,255,255,.14);box-shadow:0 30px 80px rgba(0,0,0,.55)">
      <div style="position:absolute;left:18px;top:11px;display:flex;gap:8px"><i style="width:12px;height:12px;border-radius:50%;background:#ff5f57"></i><i style="width:12px;height:12px;border-radius:50%;background:#febc2e"></i><i style="width:12px;height:12px;border-radius:50%;background:#28c840"></i></div>
      <div style="position:absolute;left:50%;top:6px;transform:translateX(-50%);padding:4px 26px;border-radius:999px;background:rgba(255,255,255,.1);font:500 17px Inter;color:rgba(232,236,245,.8)">opr.annurpro.com</div>
    </div>
    <div style="position:absolute;left:${dk.x}px;top:${dk.y - 40}px;display:none"></div>
    <div style="position:absolute;right:${1080 - dk.x - dk.w + 16}px;top:${dk.y - 34}px;padding:3px 14px;border-radius:999px;background:rgba(251,191,36,.18);color:#fbbf24;font:700 15px Inter;letter-spacing:.14em">KOMPUTER</div>
    <div style="position:absolute;left:${fn.x - 16}px;top:${fn.y - 16}px;width:${fn.w + 32}px;height:${fn.h + 32}px;border-radius:62px;background:#0b1226;border:3px solid #2a3a66;box-shadow:0 30px 90px rgba(0,0,0,.6),inset 0 0 0 2px rgba(255,255,255,.05)"></div>
    <div style="position:absolute;left:${fn.x + fn.w / 2 - 70}px;top:${fn.y - 14}px;width:130px;height:11px;border-radius:8px;background:#05070f"></div>
    <div style="position:absolute;left:${fn.x - 16}px;top:${fn.y - 60}px;padding:6px 18px;border-radius:999px;background:rgba(251,191,36,.16);color:#fbbf24;font:700 20px Inter;letter-spacing:.12em">TELEFON</div>
    <div style="position:absolute;left:0;right:0;bottom:60px;text-align:center;font:600 26px Inter;color:rgba(232,236,245,.7);letter-spacing:.04em">opr.annurpro.com</div>
  </div>`);
  await ambil('bg.png');

  // Topeng bucu bulat
  const topeng = async (fail, w, h, r) => { await sedia(`<div style="width:${w}px;height:${h}px;border-radius:${r}px;background:#fff"></div>`); await pg.evaluate(() => { document.documentElement.style.background = '#000'; document.body.style.background = '#000'; }); await pg.screenshot({ path: OUT + fail, clip: { x: 0, y: 0, width: w, height: h } }); };
  await topeng('mask-dk.png', dk.w, dk.h, 14);
  await topeng('mask-fon.png', fn.w, fn.h, 46);

  // Sari kata (lajur di sebelah telefon)
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  for (let i = 0; i < KATA.length; i++) {
    let teks = esc(KATA[i][2]);
    for (const k of KATA[i][3]) teks = teks.replace(esc(k), `<b style="color:#fbbf24">${esc(k)}</b>`);
    await sedia(`<div style="width:${KOL.w}px;min-height:${KOL.h}px;display:flex;align-items:center"><div style="font:600 43px/1.34 'Inter Tight';letter-spacing:-.01em;text-shadow:0 3px 18px rgba(0,0,0,.7)">${teks}</div></div>`);
    await ambil(`kata${i}.png`, { x: 0, y: 0, width: KOL.w, height: KOL.h });
  }
  // Cip babak (kanan atas kepala)
  for (let i = 0; i < CHIP.length; i++) {
    await sedia(`<div style="display:inline-flex;align-items:center;gap:12px;padding:11px 22px;border-radius:999px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);font:700 26px Inter;white-space:nowrap"><span style="color:#fbbf24">${i + 1}/${CHIP.length}</span>${CHIP[i]}</div>`);
    const kotak = await pg.locator('div').first().boundingBox();
    await ambil(`cip${i}.png`, { x: 0, y: 0, width: Math.ceil(kotak.width) + 2, height: Math.ceil(kotak.height) + 2 });
    writeFileSync(OUT + `cip${i}.w`, String(Math.ceil(kotak.width) + 2));
  }
  // Kad akhir
  await sedia(`<div style="position:relative;width:1080px;height:1920px;background:radial-gradient(1000px 900px at 50% 40%,#17338a 0%,#070b17 70%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;text-align:center">
    <div class="logo" style="width:120px;height:120px;background-size:60px"></div>
    <div style="font:800 84px/1.02 'Inter Tight';letter-spacing:-.03em">Annur OPR</div>
    <div style="font:500 40px/1.3 'Inter Tight';color:rgba(232,236,245,.85);max-width:820px">OPR dan e-Karakter, dalam satu sistem sekolah</div>
    <div style="margin-top:20px;padding:22px 54px;border-radius:24px;background:linear-gradient(180deg,#2167ff,#0a44e0);font:700 54px 'Inter Tight';box-shadow:0 18px 50px rgba(10,68,224,.55)">opr.annurpro.com</div>
    <div style="font:600 32px Inter;color:#fbbf24;margin-top:8px">Demo percuma · Percubaan 14 hari</div>
    <div style="font:500 30px Inter;color:rgba(232,236,245,.75)">RM10 sebulan · RM100 setahun</div></div>`);
  await ambil('akhir.png');
  await ctx.close();
}

// Ungkapan zoom: Z(t) = 1 + jumlah (z_i - z_{i-1}) * smoothstep((t - t_i) / d_i); sama untuk pusat
function ungkapan(kf, ofset, n = 'in/30') {
  const T = `(${n}+0)`; // masa input (klip CFR 30fps bermula dari 0)
  let z = [], x = [], y = [], pz = 1, px = 0.5, py = 0.5;
  for (const k of [...kf].sort((a, b) => a.t - b.t)) {
    const u = `clip((${T}-${(k.t + ofset).toFixed(3)})/${Math.max(0.05, k.d).toFixed(3)},0,1)`;
    const S = `(pow(${u},2)*(3-2*${u}))`;
    z.push(`(${(k.z - pz).toFixed(4)})*${S}`); x.push(`(${(k.cx - px).toFixed(4)})*${S}`); y.push(`(${(k.cy - py).toFixed(4)})*${S}`);
    pz = k.z; px = k.cx; py = k.cy;
  }
  return { Z: 'max(1,1+' + (z.join('+') || '0') + ')', X: '(0.5+' + (x.join('+') || '0') + ')', Y: '(0.5+' + (y.join('+') || '0') + ')' };
}
function tapisZoom(dev, kf, ofset) {
  const { Z, X, Y } = ungkapan(kf, ofset);
  const x0 = `clip(${X}*W-W/(2*${Z}),0,W-W/${Z})`, y0 = `clip(${Y}*H-H/(2*${Z}),0,H-H/${Z})`;
  return `perspective=x0='${x0}':y0='${y0}':x1='${x0}+W/${Z}':y1='${y0}':x2='${x0}':y2='${y0}+H/${Z}':x3='${x0}+W/${Z}':y3='${y0}+H/${Z}':eval=frame:interpolation=linear`;
}

async function gabung() {
  // 1. zoom setiap klip babak (kamera pasca-rakaman) ke saiz panel, kemudian sambung mengikut peranti
  for (const dev of ['dk', 'fon']) {
    const senarai = [];
    const pane = FRAME[dev];
    for (let i = 0; i < BABAK.length; i++) {
      const f = OUT + `b${i + 1}-${dev}.mp4`, z = OUT + `z${i + 1}-${dev}.mp4`;
      if (!existsSync(f)) throw new Error('tiada ' + f + ' (jalankan rakam dahulu)');
      const kf = JSON.parse(readFileSync(OUT + `b${i + 1}-${dev}.json`));
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', f, '-vf', `${tapisZoom(dev, kf, 0)},scale=${pane.w}:${pane.h}:flags=lanczos,setsar=1`,
        '-r', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '15', '-pix_fmt', 'yuv420p', '-an', z]);
      senarai.push(`file '${z}'`);
    }
    writeFileSync(OUT + `senarai-${dev}.txt`, senarai.join('\n') + '\n');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', OUT + `senarai-${dev}.txt`, '-c', 'copy', OUT + `semua-${dev}.mp4`]);
    log('  zoom ' + dev + ' siap');
  }
  // 2. senarai input dan graf penapis
  const masuk = ['-loop', '1', '-framerate', '30', '-t', String(TAMAT), '-i', OUT + 'bg.png',
    '-i', OUT + 'semua-dk.mp4', '-i', OUT + 'semua-fon.mp4',
    '-loop', '1', '-framerate', '30', '-t', String(TAMAT), '-i', OUT + 'mask-dk.png',
    '-loop', '1', '-framerate', '30', '-t', String(TAMAT), '-i', OUT + 'mask-fon.png'];
  let idx = 5;
  const F = [];
  const dk = FRAME.dk, fn = FRAME.fon;
  F.push(`[1:v]format=yuv420p[dv]`);
  F.push(`[3:v]format=gray,scale=${dk.w}:${dk.h}[md]`);
  F.push(`[dv][md]alphamerge[da]`);
  F.push(`[2:v]format=yuv420p[fv]`);
  F.push(`[4:v]format=gray,scale=${fn.w}:${fn.h}[mf]`);
  F.push(`[fv][mf]alphamerge[fa]`);
  F.push(`[0:v][da]overlay=${dk.x}:${dk.y}:shortest=0[a1]`);
  F.push(`[a1][fa]overlay=${fn.x}:${fn.y}:shortest=0[a2]`);
  let akhir = 'a2';
  const tambah = (fail, x, y, a, b) => {
    masuk.push('-loop', '1', '-framerate', '30', '-t', String(TAMAT), '-i', OUT + fail);
    const n = idx++, nama = 'o' + n;
    F.push(`[${akhir}][${n}:v]overlay=${x}:${y}:enable='between(t,${a.toFixed(2)},${b.toFixed(2)})':shortest=0[${nama}]`);
    akhir = nama;
  };
  for (let i = 0; i < CHIP.length; i++) {
    const w = Number(readFileSync(OUT + `cip${i}.w`, 'utf8'));
    tambah(`cip${i}.png`, 1080 - 40 - w, 70, MULA[i], i + 1 < MULA.length ? MULA[i + 1] : 90.3);
  }
  for (let i = 0; i < KATA.length; i++) tambah(`kata${i}.png`, KOL.x, KOL.y, KATA[i][0] - 0.05, KATA[i][1]);
  tambah('akhir.png', 0, 0, 90.35, TAMAT);
  if (AUDIO) masuk.push('-i', AUDIO);
  writeFileSync(OUT + 'graf.txt', F.join(';\n'));
  const keluar = OUT + 'promo-tiktok.mp4';
  const arg = ['-y', '-loglevel', 'error', '-stats', ...masuk, '-filter_complex_script', OUT + 'graf.txt', '-map', `[${akhir}]`];
  if (AUDIO) arg.push('-map', `${idx}:a`, '-c:a', 'aac', '-b:a', '160k', '-af', 'apad');
  arg.push('-t', String(TAMAT), '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', keluar);
  execFileSync('ffmpeg', arg, { stdio: 'inherit' });
  log('Siap: ' + keluar);
}

// ------------------------------------------------------------------ jalankan
if (PERINTAH !== 'gabung') {
  const browser = await playwright.chromium.launch();
  try {
    if (PERINTAH !== 'grafik') await sediakanSekolah(browser);
    for (let i = 0; i < BABAK.length && PERINTAH !== 'grafik'; i++) {
      if (PILIH.length && !PILIH.includes(i + 1)) continue;
      log(`[babak ${i + 1}] ${BABAK_DUR[i].toFixed(1)}s ${CHIP[i]}`);
      for (const dev of ['dk', 'fon']) await rakamBabak(browser, i, dev);
    }
    if (PERINTAH === 'grafik' || (PERINTAH === 'semua' && !PILIH.length)) {
      const cahaya = readFileSync(new URL('../public/sekolah.html', import.meta.url), 'utf8').match(/<svg class="latar-svg"[\s\S]*?<\/svg>/)[0].replace('class="latar-svg"', 'width="1080" height="1920"');
      await janaGrafik(browser, cahaya);
    }
  } finally { await browser.close(); }
}
if (PERINTAH === 'semua' || PERINTAH === 'gabung') await gabung();
