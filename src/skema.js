// Struktur Google Sheet setiap sekolah + data asal (dibawa dari OPR v2 setupSistem()).
// Sheet ini ialah pangkalan data sekolah; ia duduk dalam Drive admin sekolah.
//
// PENTING: tajuk tab dan susunan kolum dirujuk oleh kod. Kolum baharu hanya
// ditambah di HUJUNG senarai, dan VERSI_SKEMA dinaikkan.

export const VERSI_SKEMA = 1;

export const TAB = {
  GURU: 'Guru',
  LAPORAN: 'Laporan',
  SENARAI: 'Senarai',
  TETAPAN: 'Tetapan',
  AUDIT: 'AuditLog'
};

export const KOLUM = {
  [TAB.GURU]: ['Email', 'Nama', 'Peranan', 'Aktif', 'Ditambah', 'DitambahOleh'],
  [TAB.LAPORAN]: ['ID', 'Timestamp', 'DikemaskiniPada', 'PemilikEmail', 'Nama', 'Jenis', 'Tajuk',
    'Unit', 'Anjuran', 'Peringkat', 'TarikhProgram', 'JumLelaki', 'JumPerempuan',
    'Objektif', 'Kaedah', 'Penambahbaikan', 'Rumusan', 'PdfFileId', 'PdfNama',
    'LampiranIds', 'Status', 'DisemakOleh', 'DisemakPada', 'Dipadam',
    'Penyemak', 'Pengesah', 'SlotTtd', 'WarnaKertas', 'SusunGambar', 'PdfDisemakId',
    'Masa', 'Tempat', 'UcapanBertema', 'Kekuatan', 'GayaLaporan', 'LogoFooter'],
  [TAB.SENARAI]: ['Kategori', 'Nilai', 'Susunan', 'Aktif'],
  [TAB.TETAPAN]: ['Kunci', 'Nilai'],
  [TAB.AUDIT]: ['Masa', 'Email', 'Peranan', 'Tindakan', 'Sasaran', 'Status', 'Nota']
};

export const SUBFOLDER = { PDF: 'Laporan PDF', LAMPIRAN: 'Lampiran', ASET: 'Aset' };

export const JENIS_SAH = ['KOKURIKULUM', 'KELAS', 'EVENT', 'SUBJEK',
  'AKADEMIK', 'PENTADBIRAN', 'HEM', 'GURU_BERTUGAS_MINGGUAN'];

export function jenisLalai() {
  return {
    KOKURIKULUM: { aktif: true, nama: 'Kokurikulum', kategori: 'UNIT_UNIFORM,UNIT_KELAB,UNIT_SUKAN',
      tajuk: 'Laporan Aktiviti Kokurikulum', penyemak: 'Penolong Kanan Kokurikulum', pengesah: 'Pengetua', slot: 'SEDIA,SEMAK' },
    KELAS: { aktif: true, nama: 'Kelas', kategori: 'KELAS',
      tajuk: 'Laporan Aktiviti Kelas', penyemak: 'Penolong Kanan Pentadbiran', pengesah: 'Pengetua', slot: 'SEDIA,SEMAK' },
    EVENT: { aktif: true, nama: 'Event', kategori: 'JAWATANKUASA',
      tajuk: 'Laporan Program / Majlis', penyemak: 'Pengerusi Jawatankuasa', pengesah: 'Pengetua', slot: 'SEDIA,SEMAK,SAH' },
    SUBJEK: { aktif: true, nama: 'Subjek', kategori: 'SUBJEK',
      tajuk: 'Laporan Mata Pelajaran', penyemak: 'Ketua Panitia', pengesah: 'Penolong Kanan Pentadbiran', slot: 'SEDIA,SEMAK' },
    AKADEMIK: { aktif: true, nama: 'Akademik', kategori: 'BIDANG',
      tajuk: 'Laporan Kurikulum & Akademik', penyemak: 'Ketua Bidang', pengesah: 'Penolong Kanan Pentadbiran', slot: 'SEDIA,SEMAK,SAH' },
    PENTADBIRAN: { aktif: true, nama: 'Pentadbiran', kategori: 'UNIT_PENTADBIRAN',
      tajuk: 'Laporan Pengurusan & Pentadbiran', penyemak: 'Penolong Kanan Pentadbiran', pengesah: 'Pengetua', slot: 'SEDIA,SEMAK,SAH' },
    HEM: { aktif: true, nama: 'Hal Ehwal Murid', kategori: 'UNIT_HEM',
      tajuk: 'Laporan Hal Ehwal Murid', penyemak: 'Penolong Kanan HEM', pengesah: 'Pengetua', slot: 'SEDIA,SEMAK' },
    GURU_BERTUGAS_MINGGUAN: { aktif: true, nama: 'Guru Bertugas Mingguan', kategori: 'MINGGU_BERTUGAS',
      tajuk: 'Laporan Guru Bertugas Mingguan', penyemak: 'Penolong Kanan Pentadbiran', pengesah: 'Pengetua', slot: 'SEDIA,SEMAK' }
  };
}

export const SENARAI_ASAL = {
  UNIT_UNIFORM: ['Persekutuan Pengakap Malaysia', 'Pasukan Kor Kadet Polis', 'Kadet Remaja Sekolah (KRS)',
    'Pergerakan Puteri Islam Malaysia (PPIM)', 'St John Ambulans Malaysia', 'Kadet Bomba dan Penyelamat',
    'Pasukan Kadet Bersatu Malaysia (Darat)', 'KASPA', 'Kadet Koreksional', 'Lain-lain (Unit Uniform)'],
  UNIT_KELAB: ['Kelab STEM', 'Kelab Komputer', 'Kelab SPBT', 'Kelab Kerjaya', 'Kelab Koperasi/Pelaburan Bijak',
    'Kelab Pelancongan', 'Kelab Kitar Semula', 'Kelab Kebudayaan/Rukunegara', 'Kelab KKQ', 'Kelab Fotografi',
    'Kelab Doktor Muda', 'Kelab TV Nilam/PSS', 'Persatuan Pendidikan Islam', 'Persatuan Sejarah/Geografi',
    'Persatuan Bahasa Melayu', 'Persatuan Bahasa Inggeris', 'Persatuan Bahasa Arab', 'Persatuan Seni Visual',
    'Lain-lain (Kelab/Persatuan)'],
  UNIT_SUKAN: ['Badminton', 'Bola Jaring', 'Bola Sepak', 'Bola Tampar', 'Bola Baling', 'Sepak Takraw', 'Catur',
    'Hoki', 'Frisbee', 'Petanque', 'Silat', 'Ping Pong', 'Olahraga', 'Lain-lain (Sukan/Permainan)'],
  ANJURAN: ['Kementerian Pendidikan Malaysia', 'Jabatan Pendidikan Negeri', 'Pejabat Pendidikan Daerah',
    'Agensi Kerajaan', 'Agensi Bukan Kerajaan', 'Universiti', 'Sekolah', 'Lain-lain'],
  PERINGKAT: ['Antarabangsa', 'Kebangsaan', 'Negeri', 'Daerah', 'Sekolah'],
  KAEDAH: ['Bersemuka', 'Dalam Talian', 'Hibrid'],
  KELAS: ['1 Amanah', '1 Bestari', '2 Amanah', '2 Bestari', '3 Amanah', '3 Bestari', '4 Sains', '4 Sastera',
    '5 Sains', '5 Sastera', 'Peralihan', 'Lain-lain (Kelas)'],
  JAWATANKUASA: ['Jawatankuasa Induk', 'Unit Hal Ehwal Murid', 'Unit Kurikulum', 'Unit Kokurikulum',
    'Unit Bimbingan & Kaunseling', 'Persatuan Ibu Bapa dan Guru (PIBG)', 'Jawatankuasa Sambutan / Majlis',
    'Jawatankuasa Sukan', 'Lain-lain (Jawatankuasa)'],
  SUBJEK: ['Bahasa Melayu', 'Bahasa Inggeris', 'Matematik', 'Sains', 'Pendidikan Islam', 'Pendidikan Moral',
    'Sejarah', 'Geografi', 'Reka Bentuk dan Teknologi', 'Asas Sains Komputer', 'Matematik Tambahan', 'Fizik',
    'Kimia', 'Biologi', 'Perniagaan', 'Prinsip Perakaunan', 'Ekonomi', 'Pendidikan Seni Visual',
    'Pendidikan Jasmani dan Kesihatan', 'Bahasa Arab', 'Bahasa Cina', 'Bahasa Tamil', 'Lain-lain (Mata Pelajaran)'],
  TINGKATAN: ['Peralihan', 'Tingkatan 1', 'Tingkatan 2', 'Tingkatan 3', 'Tingkatan 4', 'Tingkatan 5',
    'Tingkatan 6', 'Semua Tingkatan'],
  BIDANG: ['Bidang Bahasa', 'Bidang Sains & Matematik', 'Bidang Teknik & Vokasional', 'Bidang Kemanusiaan',
    'Bidang Agama', 'Bidang Kesenian & Kesihatan', 'Jawatankuasa Kurikulum Sekolah', 'Pusat Sumber Sekolah',
    'Lain-lain (Bidang)'],
  UNIT_PENTADBIRAN: ['Pengurusan Sekolah', 'Pengurusan Kewangan', 'Pengurusan Sumber Manusia',
    'Pengurusan Aset & Stor', 'Pengurusan ICT', 'Pengurusan Fizikal & Kebersihan', 'Keselamatan Sekolah',
    'Perhubungan Awam & Media', 'Latihan Dalam Perkhidmatan (LADAP)', 'Lain-lain (Pentadbiran)'],
  UNIT_HEM: ['Unit Disiplin', 'Unit Bimbingan & Kaunseling', 'Unit Kesihatan', 'Unit Biasiswa & Bantuan',
    'Unit SPBT', 'Unit Kantin & Pemakanan', 'Unit Kebajikan Murid', 'Unit Pendaftaran & Rekod',
    'Unit Keselamatan Jalan Raya', 'Program Sekolah Selamat', 'Lain-lain (HEM)'],
  // v2 merujuk kategori ini tetapi tidak pernah mengisinya (dropdown kosong). Diisi di sini.
  MINGGU_BERTUGAS: Array.from({ length: 45 }, (_, i) => 'Minggu ' + (i + 1))
};

export const CONSENT_ASAL = 'Maklumat yang anda isi (nama guru, unit, butiran program dan gambar aktiviti) '
  + 'dikumpul semata-mata untuk tujuan rekod dan pelaporan sekolah. Data disimpan dalam Google Drive akaun '
  + 'admin sekolah dan hanya boleh diakses oleh guru serta pentadbir sekolah melalui Annur OPR. Data akan '
  + 'disimpan selama tempoh yang ditetapkan dalam polisi sekolah dan dipadam selepas itu. Untuk gambar yang '
  + 'memaparkan murid, pastikan kebenaran ibu bapa/penjaga telah diperoleh sebelum dimuat naik.';

export function tetapanAsal(namaSekolah, tahun) {
  return [
    ['NAMA_SEKOLAH', namaSekolah],
    ['ALAMAT_SEKOLAH', ''],
    ['NAMA_SISTEM', 'Sistem One Page Report'],
    ['TAJUK_DOKUMEN', 'One Page Report (OPR)'],
    ['SINGKATAN', 'OPR'],
    ['TELEFON', ''], ['FAKS', ''], ['MOTO', ''],
    ['WARNA_1', '#0f766e'], ['WARNA_2', '#312e81'], ['WARNA_AKSEN', '#f59e0b'],
    ['LOGO1_ID', ''], ['LOGO2_ID', ''], ['LOGO3_ID', ''], ['LOGO4_ID', ''], ['LOGO5_ID', ''], ['LOGO6_ID', ''],
    ['LOGO3_LABEL', 'Logo 3'], ['LOGO4_LABEL', 'Logo 4'], ['LOGO5_LABEL', 'Logo 5'], ['LOGO6_LABEL', 'Logo 6'],
    ['LOGO_FOOTER_ALIGN', 'TENGAH'],
    ['FOOTER_PDF', '© ' + namaSekolah],
    ['PREFIX_FAIL', 'OPR'],
    ['RETENTION_BULAN', '36'],
    ['MAX_UPLOAD_MB', '10'],
    ['TAHUN_SESI', String(tahun)],
    ['NAMA_PENGETUA', ''],
    ['JAWATAN_PENYEMAK', 'Penolong Kanan Kokurikulum'],
    ['JAWATAN_PENGESAH', 'Pengetua'],
    ['JENIS_DEFAULT', 'KOKURIKULUM'],
    ['WAJIB_PDF', 'TIDAK'],
    ['WAJIB_PDF_SEMAK', 'YA'],
    ['WARNA_KERTAS', '#fffbeb'],
    ['SUSUN_GAMBAR', 'AUTO'],
    ['GAYA_LAPORAN', 'KOTAK'],
    ['JENIS_TETAPAN', JSON.stringify(jenisLalai())],
    ['CONSENT_TEXT', CONSENT_ASAL],
    ['VERSI_SKEMA', String(VERSI_SKEMA)]
  ];
}

export function barisSenaraiAsal() {
  const baris = [];
  for (const [kat, item] of Object.entries(SENARAI_ASAL)) {
    item.forEach((v, i) => baris.push([kat, v, String(i + 1), 'YA']));
  }
  return baris;
}
