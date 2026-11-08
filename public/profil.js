// Profil jenis laporan (dipindah dari OPR v2 PROFIL_JENIS). Hanya LABEL dan
// SUMBER DROPDOWN berbeza antara jenis; struktur data sama untuk semua.

const L = (o) => ({
  Tajuk: 'Nama Program / Pertandingan', Unit: 'Unit Kokurikulum', Anjuran: 'Anjuran', Peringkat: 'Peringkat',
  Tarikh: 'Tarikh Pelaksanaan', Lelaki: 'Murid Lelaki', Perempuan: 'Murid Perempuan', Objektif: 'Objektif',
  Kaedah: 'Kaedah Pelaksanaan', Improve: 'Penambahbaikan', Rumusan: 'Rumusan', Masa: 'Masa', Tempat: 'Tempat',
  Kekuatan: 'Kekuatan Program', Ucapan: 'Ucapan / Nota Tambahan', ...o
});

export const PROFIL_JENIS = {
  KOKURIKULUM: { nota: 'Untuk unit beruniform, kelab/persatuan dan sukan.', peringkat: 'PERINGKAT',
    petunjuk: 'Contoh: Kejohanan Bola Sepak MSSD', label: L({}) },
  KELAS: { nota: 'Untuk aktiviti atau program peringkat kelas.', peringkat: 'PERINGKAT',
    petunjuk: 'Contoh: Program Motivasi Kelas 4 Sains',
    label: L({ Tajuk: 'Nama Aktiviti / Program Kelas', Unit: 'Kelas', Tarikh: 'Tarikh Aktiviti', Objektif: 'Objektif Aktiviti', Rumusan: 'Rumusan & Impak' }) },
  EVENT: { nota: 'Untuk majlis, sambutan dan program peringkat sekolah.', peringkat: 'PERINGKAT',
    petunjuk: 'Contoh: Majlis Anugerah Cemerlang 2026',
    label: L({ Tajuk: 'Nama Event / Majlis', Unit: 'Unit / Jawatankuasa', Anjuran: 'Penganjur', Tarikh: 'Tarikh Event',
      Lelaki: 'Peserta Lelaki', Perempuan: 'Peserta Perempuan', Objektif: 'Objektif Event', Rumusan: 'Rumusan & Impak', Ucapan: 'Ucapan Bertema' }) },
  SUBJEK: { nota: 'Untuk program panitia, intervensi dan aktiviti PdP.', peringkat: 'TINGKATAN',
    petunjuk: 'Contoh: Kelas Intervensi Matematik Tingkatan 5',
    label: L({ Tajuk: 'Nama Aktiviti / Intervensi', Unit: 'Mata Pelajaran', Peringkat: 'Tingkatan',
      Objektif: 'Objektif Pembelajaran', Kaedah: 'Strategi PdP', Rumusan: 'Refleksi & Impak' }) },
  AKADEMIK: { nota: 'Untuk program kurikulum peringkat bidang atau sekolah.', peringkat: 'PERINGKAT',
    petunjuk: 'Contoh: Program Peningkatan Prestasi SPM',
    label: L({ Tajuk: 'Nama Program Akademik', Unit: 'Bidang / Panitia', Objektif: 'Objektif Akademik', Rumusan: 'Pencapaian & Impak' }) },
  PENTADBIRAN: { nota: 'Untuk urusan pengurusan, kewangan, aset dan LADAP.', peringkat: 'PERINGKAT',
    petunjuk: 'Contoh: Kursus LADAP Pengurusan Kewangan',
    label: L({ Tajuk: 'Nama Aktiviti / Urusan', Unit: 'Unit Pentadbiran', Lelaki: 'Peserta Lelaki', Perempuan: 'Peserta Perempuan',
      Objektif: 'Objektif Pengurusan', Rumusan: 'Rumusan & Tindakan Susulan' }) },
  HEM: { nota: 'Untuk disiplin, kebajikan, kesihatan dan bantuan murid.', peringkat: 'PERINGKAT',
    petunjuk: 'Contoh: Program Sekolah Selamat 2026',
    label: L({ Tajuk: 'Nama Program / Intervensi', Unit: 'Unit HEM', Objektif: 'Objektif Program', Rumusan: 'Rumusan & Impak' }) },
  GURU_BERTUGAS_MINGGUAN: { nota: 'Laporan mingguan guru bertugas: perhimpunan, ucapan bertema dan pemantauan.', peringkat: 'PERINGKAT',
    petunjuk: 'Contoh: Laporan Guru Bertugas Minggu 3',
    label: L({ Tajuk: 'Tajuk Laporan / Minggu Bertugas', Unit: 'Minggu Bertugas', Lelaki: 'Kehadiran Murid (L)',
      Perempuan: 'Kehadiran Murid (P)', Objektif: 'Objektif Program', Rumusan: 'Rumusan Program', Ucapan: 'Ucapan Bertema' }) }
};

export const SENARAI_JENIS = Object.keys(PROFIL_JENIS);

export const LABEL_SENARAI = {
  UNIT_UNIFORM: 'Unit Beruniform', UNIT_KELAB: 'Kelab / Persatuan', UNIT_SUKAN: 'Sukan / Permainan',
  KELAS: 'Kelas', JAWATANKUASA: 'Unit / Jawatankuasa', SUBJEK: 'Mata Pelajaran', TINGKATAN: 'Tingkatan',
  BIDANG: 'Bidang / Panitia', UNIT_PENTADBIRAN: 'Unit Pentadbiran', UNIT_HEM: 'Unit HEM', ANJURAN: 'Anjuran',
  PERINGKAT: 'Peringkat Pelibatan', KAEDAH: 'Kaedah Pelaksanaan', MINGGU_BERTUGAS: 'Minggu Bertugas'
};

export const SLOT_TTD = [
  { kod: 'SEDIA', label: 'Disediakan Oleh', medan: 'nama' },
  { kod: 'SEMAK', label: 'Disemak Oleh', medan: 'penyemak' },
  { kod: 'SAH', label: 'Disahkan Oleh', medan: 'pengesah' }
];

export const STATUS_PAPAR = {
  'SIMPAN': ['DRAF', 'draf'], 'HANTAR': ['HANTAR', 'hantar'], 'TELAH DISEMAK': ['DISEMAK', 'disemak']
};
