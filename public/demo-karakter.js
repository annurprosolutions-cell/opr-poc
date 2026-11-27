// MOD DEMO e-Karakter: menjawab /api/s/demo/karakter/* dalam browser dengan data contoh.
// Meniru peraturan pelayan (src/karakter.js) secara ringkas: akses ikut peranan, guru kelas
// terhad kepada kelasnya, penapis dikongsi antara jadual, statistik dan eksport.
// Peranan demo: ?peranan=admin (lalai) | guru | gurukelas.

export function bina({ D, AKU, peranan, fail, idBaru, gambar, guru, hari, J, R }) {
  const K = D.karakter;
  const admin = peranan === 'admin';
  const senarai = {};
  for (const [k, v] of Object.entries(K.senarai)) senarai[k] = v.map(nilai => ({ nilai, aktif: true }));
  const huraian = { ...K.huraian };
  const tetapan = { ...K.tetapan };
  const pemetaan = [{ kelas: '4 Sains', email: 'faizal.demo@contoh.edu.my' }];
  if (peranan === 'gurukelas') pemetaan.push({ kelas: '5 Ibnu Sina', email: AKU.email });
  const ttdSimpan = new Map();

  // Tandatangan contoh (dilukis dalam browser)
  const kanvas = document.createElement('canvas'); kanvas.width = 360; kanvas.height = 110;
  const x = kanvas.getContext('2d'); x.strokeStyle = '#111827'; x.lineWidth = 3.2; x.lineCap = 'round';
  x.beginPath(); x.moveTo(14, 78); x.bezierCurveTo(60, 8, 90, 120, 140, 50); x.bezierCurveTo(170, 14, 200, 96, 240, 54); x.lineTo(330, 40); x.stroke();
  const ttdContoh = idBaru('ttd');
  const ttdSedia = new Promise(ok => kanvas.toBlob(b => { fail.set(ttdContoh, b); ok(); }, 'image/png'));

  // ---------------------------------------------------------------- 40 laporan contoh
  const guruKrk = [...guru.map(g => ({ email: g.email, nama: g.nama })),
    { email: 'siti.demo@contoh.edu.my', nama: 'Cikgu Siti Nurhaliza' }, { email: 'lim.demo@contoh.edu.my', nama: 'Cikgu Lim Wei Ling' }];
  const teras = K.senarai.KARAKTER_TERAS, kelas = K.senarai.KARAKTER_KELAS, subjek = K.senarai.KARAKTER_SUBJEK;
  const AKTIVITI = [
    ['Projek kebun sayur kelas', 'Murid bergilir menyiram dan menjaga tanaman. Kumpulan yang lewat dibantu oleh rakan tanpa disuruh.'],
    ['Pembentangan berkumpulan', 'Setiap kumpulan memilih ketua dan membahagikan tugas. Murid yang pendiam diberi peranan mencatat.'],
    ['Kuiz pantas bertema', 'Murid tidak berputus asa walaupun salah pada pusingan awal dan berjaya meningkatkan markah.'],
    ['Gotong-royong bilik darjah', 'Murid membersihkan kelas dan menyusun semula sudut bacaan. Mereka mengingatkan rakan tentang jadual tugas.'],
    ['Simulasi mesyuarat murid', 'Murid berbincang dengan hormat, mendengar pandangan rakan dan membuat keputusan secara undian.'],
    ['Aktiviti eksperimen ringkas', 'Murid mengulang eksperimen yang gagal dengan sabar dan mencatat pemerhatian dengan teliti.']
  ];
  const rekod = [];
  for (let i = 0; i < 40; i++) {
    const gu = guruKrk[(i * 7) % guruKrk.length], [tajuk, catatan] = AKTIVITI[i % AKTIVITI.length];
    const t = teras.filter((_, j) => (i + j) % 3 === 0 || j === i % teras.length);
    const bil = i % 5 === 0 ? 2 : i % 4 === 0 ? 1 : 0;
    rekod.push({ id: 'KRK-' + hari(0).replace(/-/g, '') + '-DM' + String(100 + i).replace(/0/g, 'Q'),
      timestamp: hari(-(i % 45)) + 'T0' + (1 + i % 8) + ':00:00.000Z', tarikh: hari(-(i % 45)), masa: String(7 + i % 6).padStart(2, '0') + ':' + (i % 2 ? '30' : '00'),
      kelas: kelas[(i * 2) % kelas.length], subjek: subjek[(i * 5) % subjek.length], teras: t.length ? t : [teras[0]],
      tajuk, catatan, nama: gu.nama, email: gu.email, gambar: [gambar[0], gambar[1], gambar[2]].slice(i % 3, i % 3 + bil).map((fileId, k) => ({ fileId, kapsyen: k ? '' : 'Murid menjalankan aktiviti' })),
      ttdFileId: i % 3 === 0 ? ttdContoh : '', ttdPada: i % 3 === 0 ? hari(-(i % 45)) + 'T09:00:00.000Z' : '', pdfFileId: '', pdfPada: '', dipadam: false, akuanGambar: bil > 0 });
  }
  // Pastikan guru demo ada laporan sendiri dan kelas 5 Ibnu Sina ada laporan guru lain
  rekod[1].email = 'guru.demo@contoh.edu.my'; rekod[1].nama = 'Cikgu Aminah';
  rekod[2].email = 'guru.demo@contoh.edu.my'; rekod[2].nama = 'Cikgu Aminah'; rekod[2].kelas = '5 Ibnu Sina';
  rekod[3].kelas = '5 Ibnu Sina'; rekod[5].kelas = '5 Ibnu Sina';

  // ---------------------------------------------------------------- pembantu
  const dipeta = (email) => [...new Set(pemetaan.filter(m => m.email === email).map(m => m.kelas))];
  const aktif = (k) => (senarai[k] || []).filter(v => v.aktif).map(v => v.nilai);
  const statusPdf = (r) => !r.pdfFileId ? 'tiada' : r.pdfPada ? 'siap' : 'lapuk';
  const ringkas = (r) => ({ id: r.id, tarikh: r.tarikh, masa: r.masa, kelas: r.kelas, subjek: r.subjek, teras: r.teras, tajuk: r.tajuk, nama: r.nama, email: r.email,
    catatanRingkas: r.catatan.slice(0, 160), bilGambar: r.gambar.length, adaTtd: !!r.ttdFileId, adaPdf: !!r.pdfFileId, pdf: statusPdf(r), dikemaskini: r.timestamp });
  const tapis = (baris, q, { abaiKelas = false, guruTapis = false } = {}) => {
    const cari = (q.get('cari') || '').toLowerCase(), dari = q.get('dari') || '', hingga = q.get('hingga') || '';
    return baris.filter(r => (abaiKelas || !q.get('kelas') || r.kelas === q.get('kelas')) && (!q.get('subjek') || r.subjek === q.get('subjek'))
      && (!q.get('teras') || r.teras.includes(q.get('teras'))) && (!guruTapis || !q.get('guru') || r.email === q.get('guru'))
      && (!dari || r.tarikh >= dari) && (!hingga || r.tarikh <= hingga)
      && (!cari || [r.tajuk, r.catatan, r.kelas, r.subjek, r.nama, r.id].join(' ').toLowerCase().includes(cari)))
      .sort((a, b) => b.tarikh.localeCompare(a.tarikh) || b.timestamp.localeCompare(a.timestamp));
  };
  const bolehBaca = (r) => admin || r.email === AKU.email || dipeta(AKU.email).includes(r.kelas);
  const kira = (arr) => { const m = new Map(); arr.forEach(k => m.set(k, (m.get(k) || 0) + 1)); return [...m].map(([nama, bil]) => ({ nama, bil })).sort((a, b) => b.bil - a.bil || a.nama.localeCompare(b.nama)); };
  const sel = (v) => { let t = String(v ?? ''); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };

  return async function jawabKarakter(p, kaedah, url, init) {
    await ttdSedia;
    const s = p.slice('/karakter'.length) || '/';
    const q = url.searchParams;
    const mentah = init && init.body;
    const badan = typeof mentah === 'string' ? JSON.parse(mentah || '{}') : {};
    const hanyaAdmin = () => R('Anda tidak dibenarkan membuka bahagian ini.', 403);

    if (s === '/config') return J({ ok: true, admin, kelas: aktif('KARAKTER_KELAS'), subjek: aktif('KARAKTER_SUBJEK'),
      teras: aktif('KARAKTER_TERAS').map(nama => ({ nama, huraian: huraian[nama] || '' })), tetapan, guruKelas: dipeta(AKU.email),
      adaTtd: ttdSimpan.has(AKU.email), nama: AKU.nama, hariIni: hari(0), tarikhAwal: admin ? '' : hari(-Number(tetapan.KRK_HAD_MUNDUR_HARI || 30)),
      aktifUntukGuru: tetapan.KRK_AKTIF !== 'TIDAK', ...(admin ? { setupBelumLengkap: false } : {}) });

    // ------------------------------------------------ setup (admin)
    if (['/setup', '/senarai', '/gurukelas', '/tetapan', '/struktur', '/skema/pasang', '/statistik', '/eksport'].includes(s) && !admin && !(s === '/statistik' && q.get('skop') === 'kelas')) return hanyaAdmin();
    if (s === '/setup') return J({ ok: true,
      senarai: { kelas: senarai.KARAKTER_KELAS.map((v, i) => ({ ...v, susunan: i + 1 })), subjek: senarai.KARAKTER_SUBJEK.map((v, i) => ({ ...v, susunan: i + 1 })),
        teras: senarai.KARAKTER_TERAS.map((v, i) => ({ ...v, susunan: i + 1, huraian: huraian[v.nilai] || '' })) },
      tetapan, pemetaan, yatim: [], guru: guruKrk.map(g => ({ ...g, peranan: g.email === 'admin.demo@contoh.edu.my' ? 'admin' : 'guru' })),
      panduan: [['guru', 'Tambah guru'], ['kelas', 'Senarai kelas'], ['subjek', 'Senarai mata pelajaran'], ['gurukelas', 'Guru kelas', true], ['teras', 'Elemen teras'], ['tetapan', 'Tetapan dokumen']]
        .map(([kod, tajuk, pilihan]) => ({ kod, tajuk, siap: true, pilihan: !!pilihan, nota: 'Siap dalam demo.' })),
      struktur: { versiSkema: 1, sediaPada: hari(-60) + 'T00:00:00.000Z', pautanSheet: '#', pautanFolder: '#' },
      lainLain: { kelas: [], subjek: [] } });
    if (s === '/senarai' && kaedah === 'POST') {
      const kat = String(badan.kategori || '');
      if (!senarai[kat]) return R('Kategori tidak sah.');
      const item = (badan.item || []).map(v => ({ nilai: String(v.nilai || '').trim(), aktif: v.aktif !== false })).filter(v => v.nilai);
      if (!item.some(v => v.aktif)) return R('Sekurang-kurangnya satu item mesti aktif.');
      senarai[kat] = item;
      if (kat === 'KARAKTER_TERAS' && badan.huraian) Object.assign(huraian, badan.huraian);
      return J({ ok: true, kategori: kat, bilangan: item.length, pendua: 0 });
    }
    if (s === '/gurukelas' && kaedah === 'POST') { pemetaan.length = 0; (badan.pemetaan || []).forEach(m => pemetaan.push(m)); return J({ ok: true, bilangan: pemetaan.length }); }
    if (s === '/tetapan' && kaedah === 'POST') { Object.assign(tetapan, badan.tetapan || {}); return J({ ok: true, disimpan: Object.keys(badan.tetapan || {}), ditolak: [] }); }
    if (s === '/struktur') return J({ ok: true, versiSkema: 1, sediaPada: hari(-60) + 'T00:00:00.000Z', pautanSheet: '#', pautanFolder: '#', tabHilang: [] });
    if (s === '/skema/pasang') return J({ ok: true, dicipta: [], dibaiki: [], sediaAda: ['Semua struktur e-Karakter sudah lengkap'], versiSkema: 1 });

    // ------------------------------------------------ fail dan tandatangan
    if (s === '/fail' && kaedah === 'POST') { const id = idBaru(q.get('jenis') === 'ttd' ? 'ttd' : 'upl'); fail.set(id, mentah); return J({ ok: true, fileId: id }); }
    let m = s.match(/^\/fail\/([^/]+)$/);
    if (m) { const r = rekod.find(z => z.id === q.get('rekod') && !z.dipadam); if (!r || !bolehBaca(r)) return R('Tiada kebenaran.', 403);
      const b = fail.get(m[1]); return b ? new Response(b, { headers: { 'content-type': b.type || 'image/jpeg' } }) : R('Tiada fail.', 404); }
    if (s === '/ttd' && kaedah === 'GET') return J({ ok: true, ada: ttdSimpan.has(AKU.email), fileId: ttdSimpan.get(AKU.email) || '' });
    if (s === '/ttd' && kaedah === 'POST') { ttdSimpan.set(AKU.email, String(badan.fileId)); return J({ ok: true, fileId: badan.fileId }); }
    if (s === '/ttd/padam') { ttdSimpan.delete(AKU.email); return J({ ok: true }); }
    if (s === '/ttd/gambar') { const b = fail.get(ttdSimpan.get(AKU.email)); return b ? new Response(b, { headers: { 'content-type': 'image/png' } }) : R('Tiada tandatangan tersimpan.', 404); }

    // ------------------------------------------------ rekod
    if (s === '/rekod' && kaedah === 'POST') {
      const d = badan.data || {};
      if (!d.kelas || !d.subjek || !d.tajuk || !d.catatan) return R('Sila lengkapkan borang.');
      if (!Array.isArray(d.teras) || !d.teras.length) return R('Pilih sekurang-kurangnya satu elemen teras.');
      if (d.tarikh > hari(0)) return R('Tarikh tidak boleh melebihi hari ini.');
      if (!badan.ttdFileId && tetapan.KRK_WAJIB_TTD === 'YA') return R('Sekolah anda mewajibkan tandatangan guru sebelum laporan dihantar.');
      const g = Array.isArray(badan.gambar) ? badan.gambar.slice(0, 4) : [];
      if (g.length && badan.akuanGambar !== true) return R('Sila tanda akuan kebenaran ibu bapa atau penjaga bagi gambar murid.');
      const kini = new Date().toISOString();
      let r = badan.id ? rekod.find(z => z.id === badan.id && !z.dipadam) : null;
      if (badan.id && (!r || r.email !== AKU.email)) return R('Anda hanya boleh mengedit laporan sendiri.', 403);
      if (!r) { r = { id: 'KRK-' + hari(0).replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 7).toUpperCase().replace(/[^A-Z0-9]/g, 'X'), timestamp: kini, email: AKU.email, nama: AKU.nama, pdfFileId: '', pdfPada: '', dipadam: false }; rekod.push(r); }
      Object.assign(r, { tarikh: d.tarikh, masa: d.masa || '', kelas: d.kelas, subjek: d.subjek, teras: teras.filter(t => d.teras.includes(t)).concat(d.teras.filter(t => !teras.includes(t))),
        tajuk: d.tajuk, catatan: d.catatan, gambar: g.map(z => ({ fileId: z.fileId, kapsyen: z.kapsyen || '' })), akuanGambar: g.length > 0,
        ttdFileId: badan.ttdFileId || '', ttdPada: badan.ttdFileId ? kini : '', pdfPada: '' });
      return J({ ok: true, id: r.id, baharu: !badan.id, rekod: { ...ringkas(r), hash: 'demo' + r.id.slice(-4).toLowerCase(), timestamp: r.timestamp, ttdPada: r.ttdPada, ttdFileId: r.ttdFileId } });
    }
    if (s === '/rekod' && kaedah === 'GET') {
      const skop = q.get('skop') || 'saya';
      if (skop === 'semua' && !admin) return hanyaAdmin();
      let asas = rekod.filter(r => !r.dipadam);
      let kelasDipeta = null;
      if (skop === 'kelas') {
        kelasDipeta = dipeta(AKU.email);
        if (!kelasDipeta.length || (q.get('kelas') && !kelasDipeta.includes(q.get('kelas')))) return R('Anda bukan guru kelas bagi kelas ini.', 403);
        const dibenar = q.get('kelas') ? [q.get('kelas')] : kelasDipeta;
        asas = asas.filter(r => dibenar.includes(r.kelas));
      } else if (skop === 'saya') asas = asas.filter(r => r.email === AKU.email);
      const f = tapis(asas, q, { abaiKelas: skop === 'kelas', guruTapis: skop === 'semua' });
      const saiz = skop === 'semua' && q.get('saiz') === 'semua' ? 1000 : 20;
      const halaman = Math.min(Math.max(1, parseInt(q.get('halaman'), 10) || 1), Math.max(1, Math.ceil(f.length / saiz)));
      return J({ ok: true, skop, jumlah: f.length, halaman, saiz, data: f.slice((halaman - 1) * saiz, halaman * saiz).map(ringkas), ...(kelasDipeta ? { kelasDipeta } : {}) });
    }
    m = s.match(/^\/rekod\/([^/]+)(\/padam|\/pdf)?$/);
    if (m) {
      const r = rekod.find(z => z.id === m[1] && !z.dipadam);
      if (!r) return R('Laporan tidak dijumpai.', 404);
      if (!bolehBaca(r)) return R('Anda tiada kebenaran untuk laporan ini.', 403);
      const pemilik = r.email === AKU.email;
      if (m[2] === '/padam') { if (!pemilik && !admin) return R('Anda hanya boleh memadam laporan sendiri.', 403); r.dipadam = true; return J({ ok: true }); }
      if (m[2] === '/pdf' && kaedah === 'POST') {
        if (!pemilik && !admin) return R('Anda hanya boleh menjana PDF bagi laporan sendiri.', 403);
        if (!r.pdfFileId) r.pdfFileId = idBaru('pdf');
        fail.set(r.pdfFileId, mentah); r.pdfPada = new Date().toISOString();
        return J({ ok: true, pdfFileId: r.pdfFileId, pdf: 'siap' });
      }
      if (m[2] === '/pdf') { const b = fail.get(r.pdfFileId); return b ? new Response(b, { headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="Laporan_Karakter_' + r.id + '.pdf"' } }) : R('PDF belum dijana untuk laporan ini.', 404); }
      return J({ ok: true, rekod: { ...ringkas(r), catatan: r.catatan, timestamp: r.timestamp, gambar: r.gambar, akuanGambar: r.akuanGambar, hash: 'demo' + r.id.slice(-4).toLowerCase(),
        tahunSesi: r.tarikh.slice(0, 4), ttdFileId: r.ttdFileId, ttdPada: r.ttdPada, pdfPada: r.pdfPada },
        boleh: { edit: pemilik, padam: pemilik || admin, janaPdf: pemilik || admin }, bacaSahaja: !pemilik && !admin });
    }

    // ------------------------------------------------ statistik dan eksport
    if (s === '/statistik' && q.get('skop') === 'kelas') {
      const dp = dipeta(AKU.email);
      if (!dp.length) return R('Anda bukan guru kelas bagi mana-mana kelas.', 403);
      const ks = q.get('kelas') ? [q.get('kelas')] : dp;
      return J({ ok: true, kelasDipeta: dp, kelas: ks.map(k => { const rs = rekod.filter(r => !r.dipadam && r.kelas === k);
        return { kelas: k, bil: rs.length, guru: kira(rs.map(r => r.nama)), teras: kira(rs.flatMap(r => r.teras)), terakhir: rs.map(r => r.tarikh).sort().pop() || '' }; }) });
    }
    if (s === '/statistik') {
      const sah = rekod.filter(r => !r.dipadam), f = tapis(sah, q, { guruTapis: true });
      const t = kira(f.flatMap(r => r.teras)), mT = new Map(t.map(x => [x.nama, x.bil]));
      const guruMap = new Map(); f.forEach(r => { const g = guruMap.get(r.email) || { email: r.email, nama: r.nama, bil: 0 }; g.bil++; guruMap.set(r.email, g); });
      return J({ ok: true, kpi: { jumlah: f.length, kelas: new Set(f.map(r => r.kelas)).size, guru: guruMap.size, terasTertinggi: t[0] || null },
        teras: teras.filter(n => mT.has(n)).map(nama => ({ nama, bil: mT.get(nama) })), kelas: kira(f.map(r => r.kelas)), subjek: kira(f.map(r => r.subjek)),
        topGuru: [...guruMap.values()].sort((a, b) => b.bil - a.bil || a.nama.localeCompare(b.nama)).slice(0, 5),
        pilihan: { kelas: [...new Set(sah.map(r => r.kelas))].sort(), subjek: [...new Set(sah.map(r => r.subjek))].sort(),
          guru: [...new Map(sah.map(r => [r.email, r.nama]))].map(([email, nama]) => ({ email, nama })).sort((a, b) => a.nama.localeCompare(b.nama)), teras },
        jumlahSemua: sah.length });
    }
    if (s === '/eksport') {
      const f = tapis(rekod.filter(r => !r.dipadam), q, { guruTapis: true });
      const kol = ['ID', 'Tarikh', 'Masa', 'Kelas', 'Mata Pelajaran', 'Guru', 'Emel', 'Elemen Teras', 'Tajuk', 'Catatan', 'Bil Gambar', 'Bertandatangan', 'Status PDF'];
      const csv = '﻿' + [kol, ...f.map(r => [r.id, r.tarikh, r.masa, r.kelas, r.subjek, r.nama, r.email, r.teras.join(', '), r.tajuk, r.catatan, r.gambar.length, r.ttdFileId ? 'YA' : 'TIDAK', statusPdf(r)])]
        .map(b => b.map(sel).join(',')).join('\r\n') + '\r\n';
      return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="e-Karakter_demo_' + hari(0) + '.csv"' } });
    }
    return R('Tidak tersedia dalam demo.', 404);
  };
}
