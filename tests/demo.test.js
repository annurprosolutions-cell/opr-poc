import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dataDemo } from '../tools/bina-demo.mjs';

test('public/demo-data.json selari dengan skema (jalankan node tools/bina-demo.mjs jika gagal)', () => {
  const fail = JSON.parse(readFileSync(new URL('../public/demo-data.json', import.meta.url), 'utf8'));
  assert.deepEqual(fail, JSON.parse(JSON.stringify(dataDemo())));
});

test('sale page: pautan dalaman wujud dan tiada dakwaan rekaan', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  for (const m of html.matchAll(/(?:src|href)="(\/img\/[^"]+|\/[a-z]+\.css)"/g)) {
    assert.doesNotThrow(() => readFileSync(new URL('../public' + m[1], import.meta.url)), m[1]);
  }
  for (const p of ['/s/demo', '/daftar', '/privasi']) assert.ok(html.includes(`href="${p}"`), p);
  assert.ok(html.includes('RM20') && html.includes('RM200') && html.includes('14 hari'));
  assert.doesNotMatch(html, /testimoni|\d+\s*(\+\s*)?sekolah (telah|sudah) (guna|menggunakan)/i);
  // Setiap gambar ada width/height (elak anjakan susun atur)
  for (const m of html.matchAll(/<img [^>]+>/g)) assert.match(m[0], /width="\d+" height="\d+"/);
});

test('manual /panduan/: semua gambar, video dan PDF wujud', () => {
  const asas = new URL('../public/panduan/', import.meta.url);
  const html = readFileSync(new URL('index.html', asas), 'utf8');
  const rujukan = [...html.matchAll(/(?:src|href)="((?:img|video)\/[^"]+)"/g)].map(m => m[1]);
  assert.ok(rujukan.length >= 25, 'manual sepatutnya ada banyak gambar dan video');
  for (const r of rujukan) assert.doesNotThrow(() => readFileSync(new URL(r, asas)), r);
  assert.ok(readFileSync(new URL('manual-annur-opr.pdf', asas)).subarray(0, 5).toString() === '%PDF-');
  for (const m of html.matchAll(/<img [^>]+>/g)) assert.match(m[0], /width="\d+" height="\d+"/);
  for (const id of ['daftar', 'guru', 'borang', 'semak', 'langganan', 'masalah', 'video', 'hubungi']) assert.ok(html.includes(`id="${id}"`), id);
});
