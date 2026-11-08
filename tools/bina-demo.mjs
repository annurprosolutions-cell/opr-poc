// Jana public/demo-data.json daripada skema sebenar (src/skema.js) supaya mod demo
// sentiasa sama dengan apa yang sekolah dapat semasa mendaftar.
// Jalankan semula selepas mengubah skema:  node tools/bina-demo.mjs
import { writeFileSync } from 'node:fs';
import { tetapanAsal, jenisLalai, SENARAI_ASAL } from '../src/skema.js';

export function dataDemo() {
  const tetapan = Object.fromEntries(tetapanAsal('SMK Contoh Demo', 2026));
  Object.assign(tetapan, {
    ALAMAT_SEKOLAH: 'Jalan Pendidikan 1, 43000 Kajang, Selangor',
    TELEFON: '03-8000 0000', MOTO: 'Ilmu, Amal, Bakti', NAMA_PENGETUA: 'Puan Rohana binti Ahmad',
    FOOTER_PDF: '© SMK Contoh Demo'
  });
  delete tetapan.JENIS_TETAPAN; delete tetapan.VERSI_SKEMA;
  return { tetapan, jenis: jenisLalai(), senarai: SENARAI_ASAL };
}

if (import.meta.url === 'file://' + process.argv[1]) {
  writeFileSync(new URL('../public/demo-data.json', import.meta.url), JSON.stringify(dataDemo()) + '\n');
  console.log('public/demo-data.json dikemas kini');
}
