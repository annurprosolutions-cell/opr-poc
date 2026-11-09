// Perakam panduan: satu kod babak, dua mod.
//   node tools/rakam.mjs shot            -> public/panduan/img/*.jpg (gambar manual, tiada kursor/kapsyen)
//   node tools/rakam.mjs video [01 03]   -> .video/*.mp4 (kapsyen, kursor, kad tajuk; perlu ffmpeg)
// Worker SEBENAR dijalankan dalam proses; Google, Drive dan KV dipalsukan; semua hos luar disekat.
// Babak 03-06 guna mod demo (/s/demo). Rakam satu babak pada satu masa (rakaman selari = skrin beku).
import { readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execSync, execFileSync } from 'node:child_process';
import { handle } from '../src/worker.js';
import { env as binaEnv, googlePalsu, T0 } from '../tests/palsu.js';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require(execSync('npm root -g').toString().trim() + '/playwright'); }

const MOD = process.argv[2] === 'video' ? 'video' : 'shot';
const PILIH = process.argv.slice(3);
const ASAS = 'https://opr.annurpro.com';
const PUB = new URL('../public/', import.meta.url);
const OUT_SHOT = new URL('../public/panduan/img/', import.meta.url).pathname;
const OUT_VID = new URL('../.video/', import.meta.url).pathname;
mkdirSync(OUT_SHOT, { recursive: true }); mkdirSync(OUT_VID + 'raw', { recursive: true });
const JENIS = { html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', json: 'application/json', jpg: 'image/jpeg', png: 'image/png', svg: 'image/svg+xml', pdf: 'application/pdf' };
const SLUG = 'smkcontohjaya';
const log = (...a) => console.log(...a);

// ------------------------------------------------------------------ backend (dikongsi semua babak)
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

// ------------------------------------------------------------------ lapisan rakaman
const LAPISAN = () => {
  if (window.top !== window) return;
  const css = `#rec-cur{position:fixed;left:0;top:0;width:28px;height:28px;z-index:2147483647;pointer-events:none;transform:translate(-80px,-80px)}
  #rec-cur svg{filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}
  .rec-rip{position:fixed;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;border:4px solid #f59e0b;z-index:2147483646;pointer-events:none;animation:recR .65s ease-out forwards}
  @keyframes recR{from{transform:scale(.3);opacity:1}to{transform:scale(1.7);opacity:0}}
  #rec-cap{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);max-width:88%;width:max-content;background:rgba(15,23,42,.93);color:#fff;font:600 20px/1.42 Inter,system-ui,sans-serif;padding:12px 22px;border-radius:14px;z-index:2147483645;pointer-events:none;text-align:center;opacity:0;transition:opacity .25s;box-shadow:0 8px 30px rgba(0,0,0,.3)}
  #rec-cap.on{opacity:1}
  #rec-title{position:fixed;inset:0;z-index:2147483644;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(135deg,#312e81,#0f172a);color:#fff;font-family:Inter,system-ui,sans-serif;text-align:center;transition:opacity .6s}
  #rec-title .k{font-size:18px;opacity:.85;letter-spacing:.12em;text-transform:uppercase}
  #rec-title .t{font-size:44px;font-weight:800;margin:12px 30px;line-height:1.15}
  #rec-title .s{font-size:20px;opacity:.9;max-width:900px;margin:0 30px}
  #rec-title.off{opacity:0;pointer-events:none}
  #rec-hl{position:fixed;z-index:2147483643;pointer-events:none;border:4px solid #f59e0b;border-radius:12px;box-shadow:0 0 0 9999px rgba(15,23,42,.28);transition:all .35s;opacity:0}
  #rec-hl.on{opacity:1}
  @media (max-width:500px){#rec-cap{font-size:16px;bottom:14px;padding:10px 14px}#rec-title .t{font-size:30px}#rec-title .s{font-size:16px}}`;
  const mk = () => {
    if (document.getElementById('rec-cur') || !document.body) return;
    const st = document.createElement('style'); st.textContent = css; document.documentElement.appendChild(st);
    const cur = document.createElement('div'); cur.id = 'rec-cur';
    cur.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24"><path d="M4 2l15 11-6.6 1.2L16 21l-2.6 1.2-3.6-6.9L4 19z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    const cap = document.createElement('div'); cap.id = 'rec-cap';
    const hl = document.createElement('div'); hl.id = 'rec-hl';
    document.documentElement.append(cur, cap, hl);
    const mv = (ev) => { if (ev.clientX || ev.clientY) cur.style.transform = `translate(${ev.clientX - 3}px,${ev.clientY - 2}px)`; };
    ['mousemove', 'pointermove'].forEach((t) => window.addEventListener(t, mv, true));
    window.addEventListener('mousedown', (ev) => { const r = document.createElement('div'); r.className = 'rec-rip'; r.style.left = ev.clientX + 'px'; r.style.top = ev.clientY + 'px'; document.documentElement.appendChild(r); setTimeout(() => r.remove(), 700); }, true);
  };
  window.__rec = {
    cap: (t) => { mk(); const c = document.getElementById('rec-cap'); if (!t) { c.classList.remove('on'); return; } c.textContent = t; c.classList.add('on'); },
    title: (k, t, s) => {
      mk(); let n = document.getElementById('rec-title');
      if (!n) { n = document.createElement('div'); n.id = 'rec-title'; document.documentElement.appendChild(n); }
      n.innerHTML = ''; for (const [c, x] of [['k', k], ['t', t], ['s', s || '']]) { const d = document.createElement('div'); d.className = c; d.textContent = x; n.appendChild(d); }
      n.classList.remove('off');
    },
    titleOff: () => { const n = document.getElementById('rec-title'); if (n) n.classList.add('off'); },
    hl: (b) => {
      mk(); const h = document.getElementById('rec-hl');
      if (!b) { h.classList.remove('on'); return; }
      Object.assign(h.style, { left: b.left - 6 + 'px', top: b.top - 6 + 'px', width: b.width + 12 + 'px', height: b.height + 12 + 'px' }); h.classList.add('on');
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mk); else mk();
};

// ------------------------------------------------------------------ pembantu babak
function pembantu(pg, mod, nama) {
  const video = mod === 'video';
  const W = (ms) => pg.waitForTimeout(video ? ms : Math.min(ms, 150));
  let cur = { x: 640, y: 360 };
  const loc = async (sel, t) => {
    const l = typeof sel === 'string' ? pg.locator(sel).first() : sel;
    await l.waitFor({ state: 'visible', timeout: t || 8000 });
    await l.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    return l;
  };
  const gerak = async (x, y, laju) => {
    if (!video) return;
    const d = Math.hypot(x - cur.x, y - cur.y);
    await pg.mouse.move(x, y, { steps: laju ? Math.max(6, Math.min(14, Math.round(d / 40))) : Math.max(10, Math.min(36, Math.round(d / 18))) }); cur = { x, y };
  };
  const h = {
    pg, video, W,
    async kata(teks, ms) {
      if (!video) return;
      await pg.evaluate((t) => window.__rec && window.__rec.cap(t), teks);
      await pg.waitForTimeout(ms != null ? ms : Math.max(2300, Math.round(teks.length * 52)));
    },
    async senyap() { if (video) await pg.evaluate(() => window.__rec && window.__rec.cap('')); },
    async tajuk(t, s) {
      if (!video) return;
      await pg.evaluate(([t, s]) => window.__rec.title('Annur OPR · Panduan video', t, s), [t, s]);
      await pg.waitForTimeout(2700);
      await pg.evaluate(() => window.__rec.titleOff()); await pg.waitForTimeout(500);
    },
    async tamat(t) {
      if (!video) return;
      await h.senyap();
      await pg.evaluate((t) => window.__rec.title('Annur OPR', t, 'opr.annurpro.com · WhatsApp 011-2087 9149'), t || 'Selesai');
      await pg.waitForTimeout(2400);
    },
    async sorot(sel, ms) {
      if (!video) return;
      let b; try { b = await (await loc(sel, 1500)).boundingBox(); } catch (x) { return; }
      if (!b) return;
      await pg.evaluate((b) => window.__rec.hl(b), b); await pg.waitForTimeout(ms || 1500); await pg.evaluate(() => window.__rec.hl(null));
    },
    async klik(sel, o = {}) {
      const l = await loc(sel, o.timeout); const b = await l.boundingBox();
      if (video && b) { await gerak(b.x + b.width / 2, b.y + b.height / 2, o.laju); await pg.waitForTimeout(o.laju ? 90 : 260); await pg.mouse.click(b.x + b.width / 2, b.y + b.height / 2); }
      else await l.click();
      await W(o.lepas != null ? o.lepas : 800);
    },
    async hover(sel, ms) {
      if (!video) return;
      try { const l = await loc(sel, 2000); const b = await l.boundingBox(); if (b) await gerak(b.x + b.width / 2, b.y + b.height / 2); await pg.waitForTimeout(ms || 700); } catch (x) { /* abaikan */ }
    },
    async taip(sel, teks, o = {}) {
      const l = await loc(sel); await h.klik(l, { lepas: 120, laju: true });
      await l.fill('');
      if (video) await l.pressSequentially(teks, { delay: o.delay || 45 }); else await l.fill(teks);
      await W(400);
    },
    async isi(sel, nilai) { const l = await loc(sel); await h.hover(l, 250); await l.fill(nilai); await W(500); },
    async pilih(sel, nilai) { const l = await loc(sel); await h.hover(l, 300); await l.selectOption(nilai); await W(700); },
    async tab(nama) { await h.klik(`#tab button[data-tab=${nama}]`, { lepas: 900 }); await pg.evaluate(() => window.scrollTo(0, 0)); },
    async skrol(sel, ms) { await pg.locator(sel).first().evaluate((n) => n.scrollIntoView({ behavior: 'smooth', block: 'center' }), null, { timeout: 3000 }).catch(() => {}); await W(ms || 1100); },
    async atas(ms) { await pg.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await W(ms || 800); },
    async fail(sel, nama, jenis, buffer) { await (await loc(sel)).setInputFiles({ name: nama, mimeType: jenis, buffer }); await W(700); },
    // Gambar manual (mod shot sahaja). o.el = rakam elemen; o.penuh = satu halaman
    async gambar(fail, o = {}) {
      if (mod !== 'shot') return;
      await pg.waitForTimeout(o.tunggu || 400);
      const p = OUT_SHOT + fail + '.jpg';
      if (o.el) {
        const gaya = o.lepasPratonton ? await pg.addStyleTag({ content: '.lajur-pratonton{position:static!important}.pratonton-bekas{max-height:none!important;overflow:visible!important}' }) : null;
        if (gaya) await pg.waitForTimeout(200);
        await pg.locator(o.el).first().screenshot({ path: p, type: 'jpeg', quality: 80 });
        if (gaya) await gaya.evaluate(n => n.remove());
      } else await pg.screenshot({ path: p, type: 'jpeg', quality: 80, fullPage: !!o.penuh });
      log('  gambar ' + fail);
    }
  };
  return h;
}

// Gambar contoh dijana dalam browser (tiada gambar murid sebenar)
async function gambarContoh(pg, warna, teks) {
  const b64 = await pg.evaluate(([w, t]) => {
    const c = document.createElement('canvas'); c.width = 800; c.height = 560; const x = c.getContext('2d');
    const gr = x.createLinearGradient(0, 0, 800, 560); gr.addColorStop(0, w[0]); gr.addColorStop(1, w[1]); x.fillStyle = gr; x.fillRect(0, 0, 800, 560);
    x.fillStyle = 'rgba(255,255,255,.18)'; for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(120 + i * 120, 420 - (i % 2) * 90, 70, 0, 7); x.fill(); }
    x.fillStyle = '#fff'; x.font = 'bold 44px system-ui,sans-serif'; x.textAlign = 'center'; x.fillText(t, 400, 250);
    x.font = '26px system-ui,sans-serif'; x.fillText('Gambar contoh', 400, 300);
    return c.toDataURL('image/jpeg', .85).split(',')[1];
  }, [warna, teks]);
  return Buffer.from(b64, 'base64');
}
const PDF_KECIL = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const bersihDemo = (pg) => pg.addStyleTag({ content: '.jalur-demo{display:none!important}' });

// ------------------------------------------------------------------ babak
const BABAK = [
  {
    id: '01', fail: '01-daftar-sekolah', url: '/daftar', sedia: '#langkahSambung:not(.tersembunyi)',
    sebelum: () => { g.senario.email = 'admin@smkcontohjaya.edu.my'; g.senario.nama = 'Cikgu Rahman'; },
    async run(h) {
      const pg = h.pg;
      await h.tajuk('Daftar sekolah dan tambah guru', 'Untuk admin sekolah · kira-kira 1 minit');
      await h.kata('Admin sekolah buka opr.annurpro.com/daftar dan sambung akaun Google.');
      await h.gambar('daftar-1-sambung');
      await h.klik('text=Sambung dengan Google', { lepas: 400 });
      await pg.waitForSelector('#langkahBorang:not(.tersembunyi)', { timeout: 15000 });
      await h.kata('Guna akaun yang kekal di sekolah. Data OPR disimpan dalam Google Drive akaun ini.', 2600);
      await h.taip('#nama', 'SMK Contoh Jaya');
      await pg.waitForFunction(() => document.getElementById('statusSlug').textContent.startsWith('Tersedia'));
      await h.kata('Pautan sekolah dicadangkan automatik. Pautan ini tidak boleh ditukar selepas daftar.');
      await h.sorot('.awalan', 1300);
      await h.gambar('daftar-2-borang');
      await h.klik('#hantar', { lepas: 400 });
      await pg.waitForURL(/\/s\//, { timeout: 30000 });
      await pg.waitForSelector('#tab button', { timeout: 30000 });
      await h.W(600);
      await h.kata('Siap. Folder dan Google Sheet sekolah dicipta dalam Drive anda. Percubaan 14 hari bermula.');
      await h.sorot('#notisLesen', 1400);
      await h.gambar('daftar-3-siap');
      await h.tab('Drive');
      await h.kata('Tab Drive: buka folder dan Google Sheet sekolah, atau uji sambungan.', 2400);
      await h.gambar('drive');
      await h.tab('Guru');
      await h.kata('Tambah guru: tampal emel guru, satu baris seorang. Nama selepas koma.');
      await h.taip('#teksGuru', 'aminah@gmail.com, Cikgu Aminah\nfaizal@moe-dl.edu.my, Cikgu Faizal', { delay: 25 });
      await h.klik('#tambahGuru', { lepas: 300 });
      await pg.waitForSelector('#hasilGuru .mesej');
      await h.W(900);
      await h.gambar('guru-tambah', { penuh: true });
      await h.kata('Butang di bawah setiap nama: Nyahaktif guru yang berpindah, atau Jadikan admin.', 2800);
      await h.tab('Drive');
      await h.sorot('#pautanGuru', 1500);
      await h.kata('Akhir sekali, kongsi pautan sekolah dalam group WhatsApp guru.', 2600);
      await h.tamat('Sekolah sedia digunakan');
    }
  },
  {
    id: '02', fail: '02-guru-isi-di-telefon', url: '/s/' + SLUG, telefon: true, perlu: '01', sedia: '#perluLogin:not(.tersembunyi)',
    sebelum: () => { g.senario.email = 'aminah@gmail.com'; g.senario.nama = 'Cikgu Aminah'; },
    async run(h) {
      const pg = h.pg;
      await h.tajuk('Guru: isi laporan dari telefon', 'Untuk guru · kira-kira 1 minit');
      await h.kata('Buka pautan sekolah yang admin kongsi, kemudian log masuk dengan Google.');
      await h.gambar('guru-1-log-masuk');
      await h.klik('#butangLogin', { lepas: 300 });
      await pg.waitForSelector('#tab button', { timeout: 20000 });
      await h.W(700);
      await h.kata('Pilih jenis laporan. Label dan pilihan berubah ikut jenis.');
      await h.pilih('#fJenis', 'KOKURIKULUM');
      await h.taip('#fTajuk', 'Program Kitar Semula Sekolah');
      await h.pilih('#fUnit', { index: 1 });
      await h.pilih('#fPeringkat', 'Sekolah');
      await h.isi('#fTarikh', '2026-11-06');
      await h.taip('#fLelaki', '18'); await h.taip('#fPerempuan', '21');
      await h.gambar('guru-2-borang-telefon');
      await h.taip('#fObjektif', 'Memupuk amalan kitar semula dalam kalangan murid.', { delay: 30 });
      await h.kata('Tambah gambar aktiviti terus dari kamera atau galeri.');
      await h.skrol('#failInput', 600);
      await h.fail('#failInput', 'aktiviti.jpg', 'image/jpeg', await gambarContoh(pg, ['#15803d', '#14532d'], 'Kutipan Barang Kitar Semula'));
      await h.taip('#failKeterangan', 'Kutipan barang kitar semula', { delay: 30 });
      await h.klik('#butangTambahFail', { lepas: 600 });
      await pg.waitForFunction(() => document.querySelectorAll('#senaraiLampiran img').length === 1);
      await h.gambar('guru-3-gambar', { el: '#senaraiLampiran' });
      await h.kata('Tekan Lihat pratonton untuk melihat muka A4 sebenar.', 2300);
      await h.klik('#butangPratonton', { lepas: 1500 });
      await h.gambar('guru-4-pratonton');
      await h.skrol('#pvStripSatuMuka', 1500);
      await h.klik('#kembaliBorang', { lepas: 700 });
      await h.kata('Tanda persetujuan PDPA, kemudian Hantar. PDF dijana dan disimpan dalam Drive sekolah.');
      await h.skrol('#fConsent', 500);
      await h.klik('#fConsent', { lepas: 400 });
      await pg.addStyleTag({ content: '#butangPratonton{visibility:hidden}' });
      await h.gambar('guru-5-hantar', { el: '.lajur-borang .kad:last-child' });
      await pg.addStyleTag({ content: '#butangPratonton{visibility:visible}' });
      await h.klik('[data-hantar=HANTAR]', { lepas: 300 });
      await pg.waitForFunction(() => document.getElementById('mesej').textContent.includes('dihantar'), null, { timeout: 60000 });
      await h.atas(600);
      await h.tab('Laporan');
      await pg.waitForSelector('#senaraiLaporan .item');
      await h.kata('Laporan anda tersenarai di tab Laporan dengan status HANTAR.', 2600);
      await h.gambar('guru-6-laporan-saya');
      await h.tamat('Laporan dihantar');
    }
  },
  {
    id: '03', fail: '03-borang-dan-pdf', url: '/s/demo?peranan=guru', sedia: '#tab button', demo: true,
    async run(h) {
      const pg = h.pg;
      await h.tajuk('Borang OPR dan PDF A4', 'Pratonton, Sertakan, gambar dan gaya dokumen');
      await h.kata('Di komputer, borang di kiri dan pratonton A4 di kanan. Pratonton berubah semasa anda menaip.');
      await h.pilih('#fJenis', 'KOKURIKULUM');
      await h.taip('#fTajuk', 'Hari Sukan Tahunan 2026');
      await h.pilih('#fUnit', { index: 2 });
      await h.pilih('#fAnjuran', { index: 1 });
      await h.pilih('#fPeringkat', 'Sekolah');
      await h.isi('#fTarikh', '2026-10-30');
      await h.taip('#fTempat', 'Padang Sekolah');
      await h.taip('#fObjektif', 'Mencungkil bakat murid dalam olahraga.', { delay: 30 });
      await h.atas(400);
      await h.gambar('borang-1-desktop');
      await h.kata('Kotak Sertakan menentukan sama ada medan itu dicetak. Nyahtanda untuk sembunyikan.');
      await h.skrol('#tTempat', 400);
      await h.sorot('label:has(#tTempat)', 1000);
      await h.klik('#tTempat', { lepas: 900 });
      await h.klik('#tTempat', { lepas: 500 });
      await h.kata('Tambah sehingga 5 gambar dalam satu muka. PDF luar juga boleh dilampirkan.', 2500);
      await h.skrol('#failInput', 500);
      for (const [w, t] of [[['#0f766e', '#134e4a'], 'Acara 100 Meter'], [['#b45309', '#78350f'], 'Lompat Jauh']]) {
        await h.fail('#failInput', 'gambar.jpg', 'image/jpeg', await gambarContoh(pg, w, t));
        await h.klik('#butangTambahFail', { lepas: 500, laju: true });
      }
      await pg.waitForFunction(() => document.querySelectorAll('#senaraiLampiran img').length === 2);
      await h.gambar('borang-2-gambar', { el: '#senaraiLampiran' });
      await h.gambar('borang-3-a4-kotak', { el: '#pageOne', lepasPratonton: true, tunggu: 700 });
      await h.kata('Rupa dokumen: pilih gaya Kotak atau Poster, warna kertas dan susun atur gambar.');
      await h.skrol('#fGayaLaporan', 400);
      await h.gambar('borang-4-rupa', { el: '#fGayaLaporan >> xpath=ancestor::div[contains(@class,"kad")][1]' });
      await h.pilih('#fGayaLaporan', 'POSTER');
      await h.W(1500);
      await h.gambar('borang-5-a4-poster', { el: '#posterPage', lepasPratonton: true, tunggu: 700 });
      await h.pilih('#fGayaLaporan', 'KOTAK');
      await h.kata('Simpan draf jika belum siap. Hantar bila sedia untuk disemak.', 2400);
      await h.klik('#fConsent', { lepas: 300 });
      await h.sorot('[data-hantar=SIMPAN]', 900);
      await h.klik('[data-hantar=HANTAR]', { lepas: 300 });
      await pg.waitForFunction(() => document.getElementById('mesej').textContent.includes('dihantar'), null, { timeout: 60000 });
      await h.atas(500);
      await h.tab('Laporan');
      await pg.waitForSelector('#senaraiLaporan .item');
      await h.kata('Di tab Laporan: buka PDF, Edit atau Padam. Laporan yang telah disemak dikunci.');
      await h.gambar('laporan-guru');
      await h.tamat('PDF siap dalam Drive sekolah');
    }
  },
  {
    id: '04', fail: '04-semak-laporan', url: '/s/demo', sedia: '#tab button', demo: true,
    async run(h) {
      const pg = h.pg;
      await h.tajuk('Semak laporan', 'Untuk admin dan penyemak');
      await h.tab('Laporan');
      await pg.waitForSelector('#senaraiLaporan .item');
      await h.kata('Admin nampak semua laporan sekolah. Tapis ikut jenis atau cari tajuk, unit atau nama guru.');
      await h.gambar('semak-1-senarai');
      await h.taip('#cari', 'Matematik');
      await h.W(900);
      await h.isi('#cari', '');
      await h.W(700);
      const kad = pg.locator('#senaraiLaporan .item', { hasText: 'Kelas Intervensi' });
      await h.kata('Cetak PDF, tandatangan, imbas, kemudian tekan Semak pada laporan itu.');
      await h.klik(kad.locator('button:text-is("Semak")'), { lepas: 700 });
      await h.kata('Pilih PDF bertandatangan dan tekan Muat naik & tanda disemak.', 2400);
      await h.fail(kad.locator('input[type=file]'), 'ditandatangan.pdf', 'application/pdf', PDF_KECIL);
      await h.gambar('semak-2-panel', { el: '#senaraiLaporan .item:has-text("Kelas Intervensi")' });
      await h.klik(kad.locator('button:text("Muat naik & tanda disemak")'), { lepas: 400 });
      await pg.waitForFunction(() => [...document.querySelectorAll('#senaraiLaporan .item')].some(x => x.textContent.includes('Intervensi') && x.textContent.includes('PDF bertandatangan')));
      await h.W(600);
      await h.kata('Status bertukar kepada DISEMAK. Kedua-dua PDF, asal dan bertandatangan, boleh dibuka.');
      await h.sorot('#senaraiLaporan .item:has-text("Kelas Intervensi")', 1600);
      await h.gambar('semak-3-disemak', { el: '#senaraiLaporan .item:has-text("Kelas Intervensi")' });
      await h.tamat('Laporan disemak');
    }
  },
  {
    id: '05', fail: '05-dashboard-eksport', url: '/s/demo', sedia: '#tab button', demo: true,
    async run(h) {
      const pg = h.pg;
      await h.tajuk('Dashboard dan eksport', 'Untuk admin');
      await h.tab('Dashboard');
      await pg.waitForSelector('#cartaBulan .lajur');
      await h.kata('Dashboard: jumlah laporan, belum disemak, telah disemak, draf dan murid terlibat.');
      await h.sorot('#jubin', 1500);
      await h.gambar('dashboard', { penuh: true });
      await h.skrol('#cartaUnit', 1200);
      await h.kata('Carta ikut jenis, peringkat, unit, guru paling aktif dan bulan.', 2600);
      await h.skrol('#cartaBulan', 1400);
      await h.atas(600);
      await h.kata('Eksport CSV untuk dibuka dalam Excel atau Google Sheets.', 2300);
      await Promise.all([pg.waitForEvent('download', { timeout: 10000 }).catch(() => null), h.klik('#butangEksport', { lepas: 900 })]);
      await h.tamat('Data sentiasa boleh dieksport');
    }
  },
  {
    id: '06', fail: '06-tetapan-sekolah', url: '/s/demo', sedia: '#tab button', demo: true,
    async run(h) {
      const pg = h.pg;
      await h.tajuk('Tetapan sekolah', 'Identiti, logo, jenis laporan dan senarai pilihan');
      await h.tab('Tetapan');
      await pg.waitForFunction(() => document.getElementById('tNAMA_SEKOLAH') && document.getElementById('tNAMA_SEKOLAH').value);
      await h.kata('Identiti: nama, alamat, telefon dan moto muncul dalam kepala PDF.');
      await h.gambar('tetapan-1-identiti', { penuh: true });
      await h.taip('#tMOTO', 'Berilmu, Berakhlak, Berbakti');
      await h.skrol('[data-simpan-tetapan=setIdentiti]', 500);
      await h.klik('[data-simpan-tetapan=setIdentiti]', { lepas: 900 });
      await h.atas(400);
      await h.klik('#subTetapan button[data-sub=setLogo]', { lepas: 700 });
      await h.kata('Logo: muat naik logo sekolah (slot 1) dan logo tambahan untuk kaki PDF.');
      const slot = pg.locator('#slotLogo .logo-slot').first();
      const logo = Buffer.from(await pg.evaluate(() => { const c = document.createElement('canvas'); c.width = 200; c.height = 200; const x = c.getContext('2d');
        x.fillStyle = '#312e81'; x.beginPath(); x.arc(100, 100, 90, 0, 7); x.fill(); x.fillStyle = '#fbbf24'; x.font = 'bold 70px sans-serif'; x.textAlign = 'center'; x.fillText('SCJ', 100, 125);
        return c.toDataURL('image/png').split(',')[1]; }), 'base64');
      await h.fail(slot.locator('input[type=file]'), 'logo.png', 'image/png', logo);
      await h.klik(slot.locator('button:text("Muat naik")'), { lepas: 400 });
      await pg.waitForFunction(() => document.getElementById('hasilTetapan').textContent.includes('Logo 1 disimpan'));
      await pg.waitForFunction(() => { const i = document.querySelector('#slotLogo img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 5000 });
      await h.W(700);
      await h.gambar('tetapan-2-logo', { penuh: true });
      await h.klik('#subTetapan button[data-sub=setJenis]', { lepas: 700 });
      await h.kata('Jenis laporan: matikan jenis yang tidak digunakan dan tukar tajuk dalam PDF.');
      await h.gambar('tetapan-3-jenis');
      await h.W(800);
      await h.klik('#subTetapan button[data-sub=setSenarai]', { lepas: 700 });
      await h.kata('Senarai: ubah pilihan dropdown seperti unit, peringkat dan tempat.');
      await h.gambar('tetapan-4-senarai');
      await h.W(800);
      await h.tab('Borang');
      await h.kata('Perubahan terus kelihatan dalam borang dan pratonton PDF.', 2400);
      const okLogo = await pg.evaluate(() => { const i = document.getElementById('pvLogo1'); return !!i && i.naturalWidth > 0; });
      if (!okLogo) throw new Error('logo tidak dipapar dalam pratonton demo');
      await h.sorot('#pvSekolah', 1200);
      await h.tamat('Sekolah anda, gaya anda');
    }
  }
];

// ------------------------------------------------------------------ jalankan
const browser = await playwright.chromium.launch();
const selesai = new Set();
async function jalan(b, mod) {
  const telefon = !!b.telefon;
  const saiz = telefon ? { width: 390, height: 844 } : { width: 1280, height: 720 };
  const opsyen = { viewport: saiz, timezoneId: 'Asia/Kuala_Lumpur', locale: 'ms-MY', serviceWorkers: 'block', acceptDownloads: true,
    deviceScaleFactor: mod === 'shot' ? 2 : 1 };
  if (telefon) Object.assign(opsyen, { isMobile: true, hasTouch: true });
  const rawDir = OUT_VID + 'raw/' + b.id;
  if (mod === 'video') { rmSync(rawDir, { recursive: true, force: true }); opsyen.recordVideo = { dir: rawDir, size: saiz }; }
  if (b.sebelum) b.sebelum();
  const ctx = await browser.newContext(opsyen);
  await pasang(ctx);
  const pg = await ctx.newPage();
  const t0 = Date.now();
  await pg.clock.setFixedTime(T0);
  if (mod === 'video') await pg.addInitScript(LAPISAN);
  const ralat = [];
  pg.on('pageerror', x => ralat.push(String(x)));
  pg.on('dialog', d => d.accept());
  const h = pembantu(pg, mod === 'senyap' ? 'senyap' : mod, b.id);
  await pg.goto(ASAS + b.url);
  if (b.demo) await bersihDemo(pg);
  await pg.waitForSelector(b.sedia, { timeout: 30000 });
  await pg.waitForTimeout(400);
  const tMula = (Date.now() - t0) / 1000;
  try { await b.run(h); } catch (x) { ralat.push('babak gagal: ' + x.stack.split('\n').slice(0, 3).join(' | ')); }
  const vid = pg.video();
  await ctx.close();
  selesai.add(b.id);
  if (ralat.length) { log(`  ! [${b.id}] ` + ralat.join('\n    ')); process.exitCode = 1; }
  if (mod === 'video' && vid) {
    const mp4 = OUT_VID + b.fail + '.mp4';
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(Math.max(0, tMula - 0.15)), '-i', await vid.path(),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4]);
    const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4]).toString().trim();
    log(`  video ${b.fail}.mp4 (${(+dur).toFixed(0)} s)`);
  }
}

try {
  for (const b of BABAK.filter(x => !PILIH.length || PILIH.includes(x.id))) {
    if (b.perlu && !selesai.has(b.perlu)) { log(`[${b.perlu}] penyediaan (tidak dirakam)`); await jalan(BABAK.find(x => x.id === b.perlu), 'senyap'); }
    log(`[${b.id}] ${b.fail} (${MOD})`);
    await jalan(b, MOD);
  }
} finally { await browser.close(); }
