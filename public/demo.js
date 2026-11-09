// MOD DEMO (/s/demo): aplikasi sebenar, tetapi panggilan /api/s/demo/* dijawab
// dalam browser dengan data contoh. Tiada log masuk Google, tiada data ke pelayan.
// Data hilang bila halaman ditutup. Dimuat SEBELUM /sekolah.js (skrip modul
// dijalankan ikut susunan dokumen), jadi fetch sudah dipintas bila aplikasi bermula.

const DEMO = location.pathname.replace(/\/+$/, '') === '/s/demo';

if (DEMO) {
  const asal = window.fetch.bind(window);
  const D = await asal('/demo-data.json').then(r => r.json());
  const q = new URLSearchParams(location.search);
  const peranan = q.get('peranan') === 'guru' ? 'guru' : 'admin';
  const AKU = peranan === 'admin'
    ? { email: 'admin.demo@contoh.edu.my', nama: 'Cikgu Admin Demo' }
    : { email: 'guru.demo@contoh.edu.my', nama: 'Cikgu Aminah' };
  const hari = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const kiniIso = () => new Date().toISOString();

  // ---------------------------------------------------------------- data contoh
  const fail = new Map();   // id -> Blob
  let kira = 0;
  const idBaru = (p) => p + String(++kira).padStart(10, '0');

  // Gambar contoh dilukis dalam browser (tiada gambar murid sebenar)
  async function gambarContoh(warna, teks) {
    const c = document.createElement('canvas'); c.width = 800; c.height = 560;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 800, 560); g.addColorStop(0, warna[0]); g.addColorStop(1, warna[1]);
    x.fillStyle = g; x.fillRect(0, 0, 800, 560);
    x.fillStyle = 'rgba(255,255,255,.18)';
    for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(120 + i * 120, 420 - (i % 2) * 90, 70, 0, 7); x.fill(); }
    x.fillStyle = '#fff'; x.font = 'bold 44px system-ui, sans-serif'; x.textAlign = 'center';
    x.fillText(teks, 400, 250); x.font = '26px system-ui, sans-serif'; x.fillText('Gambar contoh', 400, 300);
    const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.85));
    const id = idBaru('gbr'); fail.set(id, blob); return id;
  }
  const g1 = await gambarContoh(['#0f766e', '#134e4a'], 'Latihan Bola Sepak');
  const g2 = await gambarContoh(['#312e81', '#1e1b4b'], 'Penyampaian Hadiah');
  const g3 = await gambarContoh(['#b45309', '#78350f'], 'Sesi Kumpulan');

  const asas = (o) => ({ id: idBaru('lap-'), timestamp: o.timestamp || kiniIso(), nama: 'Cikgu Aminah', pemilik: 'guru.demo@contoh.edu.my',
    unit: '', anjuran: '', peringkat: '', tarikhProgram: '', jumLelaki: '', jumPerempuan: '', objektif: '', kaedah: '',
    penambahbaikan: '', rumusan: '', masa: '', tempat: '', ucapanBertema: '', kekuatan: '', penyemak: '', pengesah: '',
    slotTtd: 'SEDIA,SEMAK', warnaKertas: '', susunGambar: 'AUTO', gayaLaporan: 'KOTAK', logoFooter: '', disemakOleh: '', disemakPada: '',
    pdfFileId: '', pdfNama: '', pdfDisemakId: '', lampiranIds: [], status: 'HANTAR', ...o });
  const laporan = [
    asas({ jenis: 'KOKURIKULUM', tajuk: 'Kejohanan Bola Sepak MSSD Peringkat Daerah', unit: 'Bola Sepak', anjuran: 'Pejabat Pendidikan Daerah',
      peringkat: 'Daerah', tarikhProgram: hari(-12), masa: '08:00', tempat: 'Stadium Mini Kajang', jumLelaki: '22', jumPerempuan: '0',
      objektif: 'Memberi pendedahan pertandingan kepada pemain sekolah dan memilih pemain untuk peringkat negeri.', kaedah: 'Bersemuka',
      kekuatan: 'Pemain berdisiplin dan menepati masa.', penambahbaikan: 'Latihan stamina perlu dimulakan lebih awal.',
      rumusan: 'Pasukan sekolah mara ke separuh akhir.', penyemak: 'Penolong Kanan Kokurikulum', lampiranIds: [g1, g2],
      status: 'TELAH DISEMAK', disemakOleh: 'Cikgu Admin Demo', disemakPada: hari(-8), timestamp: hari(-11) + 'T03:00:00.000Z' }),
    asas({ jenis: 'SUBJEK', tajuk: 'Kelas Intervensi Matematik Tingkatan 5', unit: 'Matematik', anjuran: 'Sekolah', peringkat: 'Tingkatan 5',
      tarikhProgram: hari(-5), masa: '14:30', tempat: 'Bilik 5 Bestari', jumLelaki: '14', jumPerempuan: '17', kaedah: 'Bersemuka',
      objektif: 'Meningkatkan penguasaan topik Fungsi dan Persamaan Kuadratik.', rumusan: '80% murid lulus ujian pasca.',
      penyemak: 'Ketua Panitia', lampiranIds: [g3], timestamp: hari(-4) + 'T06:00:00.000Z' }),
    asas({ jenis: 'EVENT', tajuk: 'Majlis Anugerah Cemerlang 2026', unit: 'Jawatankuasa Sambutan / Majlis', anjuran: 'Sekolah', peringkat: 'Sekolah',
      tarikhProgram: hari(-20), tempat: 'Dewan Sekolah', jumLelaki: '180', jumPerempuan: '210', objektif: 'Menghargai kecemerlangan murid.',
      kaedah: 'Bersemuka', slotTtd: 'SEDIA,SEMAK,SAH', penyemak: 'Pengerusi Jawatankuasa', pengesah: 'Pengetua',
      nama: 'Cikgu Faizal', pemilik: 'faizal.demo@contoh.edu.my', timestamp: hari(-19) + 'T02:00:00.000Z' }),
    asas({ jenis: 'HEM', tajuk: 'Program Sekolah Selamat', unit: 'Program Sekolah Selamat', anjuran: 'Agensi Kerajaan', peringkat: 'Sekolah',
      tarikhProgram: hari(-2), jumLelaki: '95', jumPerempuan: '102', status: 'SIMPAN', nama: 'Cikgu Faizal', pemilik: 'faizal.demo@contoh.edu.my',
      timestamp: hari(-2) + 'T01:00:00.000Z' })
  ];
  const guru = [
    { email: 'admin.demo@contoh.edu.my', nama: 'Cikgu Admin Demo', peranan: 'admin', aktif: true, pemilik: true },
    { email: 'guru.demo@contoh.edu.my', nama: 'Cikgu Aminah', peranan: 'guru', aktif: true, pemilik: false },
    { email: 'faizal.demo@contoh.edu.my', nama: 'Cikgu Faizal', peranan: 'guru', aktif: true, pemilik: false }
  ];
  const tetapan = D.tetapan, jenis = D.jenis, senarai = D.senarai, logo = {};

  // ---------------------------------------------------------------- jawapan
  const J = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  const R = (m, status = 400) => J({ ok: false, ralat: m }, status);
  const admin = peranan === 'admin';
  const bolehLihat = (l) => admin || l.pemilik === AKU.email;
  const ringkas = (l) => ({ id: l.id, timestamp: l.timestamp, jenis: l.jenis, tajuk: l.tajuk, unit: l.unit, peringkat: l.peringkat,
    tarikhProgram: l.tarikhProgram, nama: l.nama, pemilik: l.pemilik, status: l.status, adaPdf: !!l.pdfFileId,
    adaPdfDisemak: !!l.pdfDisemakId, disemakOleh: l.disemakOleh });

  async function jawab(laluan, kaedah, init) {
    const url = new URL(laluan, location.href), p = url.pathname.replace('/api/s/demo', '');
    const badanMentah = init && init.body;
    const badan = typeof badanMentah === 'string' ? JSON.parse(badanMentah || '{}') : {};
    if (p === '' ) return J({ ok: true, slug: 'demo', nama: tetapan.NAMA_SEKOLAH });
    if (p === '/me') return J({ ok: true, ...AKU, peranan, pemilik: admin, adminEmail: 'admin.demo@contoh.edu.my', sedia: true, statusToken: 'ok',
      pautanSheet: '#', pautanFolder: '#', buyUrl: '/#harga',
      lesen: { ok: true, reason: 'ok', plan: 'percubaan', expires: hari(13), daysLeft: 13 } });
    if (p === '/config') return J({ ok: true, tetapan, jenis, senarai, logo });
    if (p === '/health' || p === '/setup') return J({ ok: true, drive: true, tulis: true, namaDalamSheet: tetapan.NAMA_SEKOLAH, pautanSheet: '#', pautanFolder: '#' });

    if (p === '/fail' && kaedah === 'POST') {
      const id = idBaru('upl'); fail.set(id, badanMentah instanceof Blob ? badanMentah : new Blob([badanMentah])); return J({ ok: true, fileId: id });
    }
    let m = p.match(/^\/laporan\/([^/]+)\/fail\/([^/]+)$/);
    if (m) { const b = fail.get(m[2]); return b ? new Response(b, { headers: { 'content-type': b.type || 'application/octet-stream' } }) : R('Tiada fail.', 404); }

    if (p === '/laporan' && kaedah === 'GET') {
      const jn = url.searchParams.get('jenis') || '', c = (url.searchParams.get('carian') || '').toLowerCase();
      const data = laporan.filter(bolehLihat).filter(l => !jn || l.jenis === jn)
        .filter(l => !c || [l.tajuk, l.unit, l.nama].join(' ').toLowerCase().includes(c))
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp)).map(ringkas);
      return J({ ok: true, jumlah: data.length, data, admin });
    }
    if (p === '/laporan' && kaedah === 'POST') {
      const d = badan.data || {};
      if (!String(d.tajuk || '').trim()) return R('Sila isi nama program / aktiviti.');
      const status = badan.status === 'HANTAR' ? 'HANTAR' : 'SIMPAN';
      const fail2 = {};
      if (badan.pdfFileId !== undefined) { fail2.pdfFileId = badan.pdfFileId; fail2.pdfNama = badan.pdfNama || 'laporan.pdf'; }
      if (Array.isArray(badan.lampiranIds)) fail2.lampiranIds = badan.lampiranIds;
      if (badan.id) {
        const l = laporan.find(x => x.id === badan.id);
        if (!l) return R('Laporan tidak dijumpai.', 404);
        if (!bolehLihat(l)) return R('Anda hanya boleh mengemas kini laporan sendiri.', 403);
        if (l.status === 'TELAH DISEMAK' && !admin) return R('Laporan yang telah disemak tidak boleh diubah.', 403);
        Object.assign(l, d, fail2, { status: l.status === 'TELAH DISEMAK' ? l.status : status });
        return J({ ok: true, id: l.id, status: l.status });
      }
      if (!badan.consent) return R('Sila tanda persetujuan notis PDPA sebelum menyimpan.');
      const l = asas({ ...d, ...fail2, nama: d.nama || AKU.nama, pemilik: AKU.email, status, timestamp: kiniIso() });
      laporan.push(l);
      return J({ ok: true, id: l.id, status });
    }
    m = p.match(/^\/laporan\/([^/]+)(\/padam|\/semak)?$/);
    if (m) {
      const l = laporan.find(x => x.id === m[1]);
      if (!l || !bolehLihat(l)) return R('Laporan tidak dijumpai.', 404);
      if (!m[2]) return J({ ok: true, data: { ...l } });
      if (m[2] === '/padam') { if (l.status === 'TELAH DISEMAK' && !admin) return R('Laporan yang telah disemak tidak boleh dipadam.', 403); laporan.splice(laporan.indexOf(l), 1); return J({ ok: true }); }
      if (!admin) return R('Hanya admin.', 403);
      if (!badan.pdfFileId && tetapan.WAJIB_PDF_SEMAK !== 'TIDAK') return R('Salinan PDF bertandatangan wajib dimuat naik (tetapan sekolah).');
      Object.assign(l, { status: 'TELAH DISEMAK', disemakOleh: AKU.nama, disemakPada: hari(0), pdfDisemakId: badan.pdfFileId || l.pdfDisemakId });
      return J({ ok: true, status: l.status });
    }

    if (!admin) return R('Hanya admin.', 403);
    if (p === '/guru' && kaedah === 'GET') return J({ ok: true, guru });
    if (p === '/guru' && kaedah === 'POST') {
      const ditambah = [], diabaikan = [];
      String(badan.teks || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean).forEach(b => {
        const [e, ...n] = b.split(/[,\t;]/); const email = e.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return diabaikan.push({ teks: b, sebab: 'Format emel tidak sah' });
        if (guru.some(x => x.email === email)) return diabaikan.push({ teks: email, sebab: 'Sudah ada dalam senarai' });
        guru.push({ email, nama: n.join(' ').trim(), peranan: badan.peranan === 'admin' ? 'admin' : 'guru', aktif: true, pemilik: false });
        ditambah.push(email);
      });
      return J({ ok: true, ditambah, diabaikan });
    }
    if (p === '/guru/kemaskini') {
      const g = guru.find(x => x.email === badan.email);
      if (!g || g.pemilik) return R('Admin utama tidak boleh diubah.', 403);
      if (badan.aktif !== undefined) g.aktif = !!badan.aktif;
      if (badan.peranan) g.peranan = badan.peranan;
      return J({ ok: true });
    }
    if (p === '/statistik') {
      const s = { ok: true, jumlah: 0, draf: 0, hantar: 0, disemak: 0, muridLelaki: 0, muridPerempuan: 0, unit: {}, peringkat: {}, jenis: {}, bulan: {}, guru: {} };
      const k = (o, x) => { o[x] = (o[x] || 0) + 1; };
      laporan.forEach(l => {
        s.jumlah++; if (l.status === 'HANTAR') s.hantar++; else if (l.status === 'TELAH DISEMAK') s.disemak++; else s.draf++;
        k(s.unit, l.unit || 'Tidak dinyatakan'); k(s.peringkat, l.peringkat || 'Tidak dinyatakan'); k(s.jenis, l.jenis); k(s.guru, l.nama);
        s.muridLelaki += +l.jumLelaki || 0; s.muridPerempuan += +l.jumPerempuan || 0;
        k(s.bulan, (l.tarikhProgram || l.timestamp).slice(0, 7));
      });
      return J(s);
    }
    if (p === '/eksport') {
      const kol = ['ID', 'Jenis', 'Tajuk', 'Unit', 'Peringkat', 'TarikhProgram', 'Nama', 'Status'];
      const sel = (v) => { let t = String(v ?? ''); if (/^[=+\-@]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };
      const csv = [kol.map(sel).join(','), ...laporan.map(l => [l.id, l.jenis, l.tajuk, l.unit, l.peringkat, l.tarikhProgram, l.nama, l.status].map(sel).join(','))].join('\r\n');
      return new Response('﻿' + csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="OPR_demo.csv"' } });
    }
    if (p === '/tetapan' && kaedah === 'GET') return J({ ok: true, tetapan, jenis, senarai, logo });
    if (p === '/tetapan' && kaedah === 'POST') {
      const t = badan.tetapan || {};
      for (const [k, v] of Object.entries(t)) {
        if (k === 'JENIS_TETAPAN') Object.assign(jenis, v); else if (!/_ID$/.test(k)) tetapan[k] = String(v);
      }
      return J({ ok: true, disimpan: Object.keys(t), ditolak: [] });
    }
    if (p === '/senarai' && kaedah === 'POST') {
      const kat = String(badan.kategori || '').toUpperCase().replace(/[^A-Z0-9_]/g, '_');
      const item = (Array.isArray(badan.item) ? badan.item : String(badan.item || '').split('\n')).map(x => String(x).trim()).filter(Boolean);
      if (!item.length) return R('Senarai mesti ada sekurang-kurangnya satu item.');
      senarai[kat] = [...new Set(item)]; return J({ ok: true, kategori: kat, bilangan: senarai[kat].length });
    }
    if (p === '/senarai/padam') { delete senarai[badan.kategori]; return J({ ok: true }); }
    m = p.match(/^\/logo\/([1-6])(\/padam)?$/);
    if (m && kaedah === 'POST' && m[2]) { delete logo[m[1]]; return J({ ok: true }); }
    if (m && kaedah === 'POST') { const id = idBaru('logo'); fail.set(id, badanMentah); logo[m[1]] = id; return J({ ok: true, fileId: id }); }
    if (m) { const b = fail.get(logo[m[1]]); return b ? new Response(b, { headers: { 'content-type': b.type || 'image/png' } }) : R('Tiada logo.', 404); }
    return R('Tidak tersedia dalam demo.', 404);
  }

  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin === location.origin && url.pathname.startsWith('/api/s/demo')) return jawab(url.href, (init.method || 'GET').toUpperCase(), init);
    if (url.origin === location.origin && url.pathname === '/auth/logout') { location.href = '/'; return J({ ok: true }); }
    return asal(input, init);
  };

  // <img src="/api/s/demo/logo/N"> tidak melalui fetch; tukar kepada blob URL
  const urlLogo = new Map();
  const tukarImej = (img) => {
    const m = (img.getAttribute('src') || '').match(/\/api\/s\/demo\/logo\/([1-6])\b/);
    const b = m && logo[m[1]] && fail.get(logo[m[1]]);
    if (!b) return;
    if (!urlLogo.has(logo[m[1]])) urlLogo.set(logo[m[1]], URL.createObjectURL(b));
    img.src = urlLogo.get(logo[m[1]]);
  };
  new MutationObserver(rek => rek.forEach(r => {
    if (r.type === 'attributes') return r.target.tagName === 'IMG' && tukarImej(r.target);
    r.addedNodes.forEach(n => { if (n.nodeType !== 1) return; if (n.tagName === 'IMG') tukarImej(n); n.querySelectorAll && n.querySelectorAll('img').forEach(tukarImej); });
  })).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });

  // Jalur demo: jelaskan dan benarkan tukar peranan
  const jalur = document.createElement('div');
  jalur.className = 'jalur-demo';
  const t = document.createElement('span');
  t.textContent = 'MOD DEMO: data contoh, tidak disimpan. ' + (admin ? 'Anda melihat sebagai admin.' : 'Anda melihat sebagai guru.');
  const a = document.createElement('a');
  a.href = admin ? '/s/demo?peranan=guru' : '/s/demo';
  a.textContent = admin ? 'Lihat sebagai guru' : 'Lihat sebagai admin';
  const b = document.createElement('a'); b.href = '/daftar'; b.textContent = 'Daftar percubaan 14 hari';
  jalur.append(t, a, b);
  document.body.prepend(jalur);
}
