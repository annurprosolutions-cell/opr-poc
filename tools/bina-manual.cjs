// Jana PDF (A4) dan versi HTML satu fail (gambar dibenam) daripada manual HTML.
//   node build_manual.js <input.html> <output.pdf> [<output-satu-fail.html>]
'use strict';
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright')); }
const fs = require('fs');
const path = require('path');

const [inp, pdf, single] = process.argv.slice(2);
if (!inp || !pdf) { console.error('guna: node build_manual.js <input.html> <output.pdf> [<satu-fail.html>]'); process.exit(1); }

(async () => {
  const src = path.resolve(inp);
  const b = await chromium.launch();
  const pg = await b.newPage();
  await pg.route(/^https?:\/\//, (r) => r.abort()); // tiada rangkaian: semua aset setempat
  await pg.goto('file://' + src, { waitUntil: 'load' });
  await pg.evaluate(() => document.fonts.ready);
  const title = await pg.title();
  await pg.pdf({
    path: path.resolve(pdf), format: 'A4', printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: `<div style="width:100%;font:8px Inter,Arial,sans-serif;color:#64748b;padding:0 14mm;display:flex;justify-content:space-between"><span>${title.replace(/</g, '&lt;')}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`
  });
  await b.close();
  console.log('PDF', pdf, (fs.statSync(pdf).size / 1048576).toFixed(1) + ' MB');
  if (single) {
    const dir = path.dirname(src);
    const html = fs.readFileSync(src, 'utf8').replace(/(<img[^>]+src=")([^"]+\.(jpg|png|svg))"/g, (m, a, rel, ext) => {
      const f = path.join(dir, rel);
      if (!fs.existsSync(f)) return m;
      const mime = { jpg: 'image/jpeg', png: 'image/png', svg: 'image/svg+xml' }[ext];
      return `${a}data:${mime};base64,${fs.readFileSync(f).toString('base64')}"`;
    });
    fs.writeFileSync(single, html);
    console.log('HTML satu fail', single, (fs.statSync(single).size / 1048576).toFixed(1) + ' MB');
  }
})().catch((e) => { console.error(e); process.exit(1); });
