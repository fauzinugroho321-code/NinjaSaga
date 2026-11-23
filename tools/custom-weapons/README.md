# Impor senjata kustom ke Ninja Saga lokal

Jalankan server seperti biasa (`node index.js` dari folder `server`), lalu buka:

http://127.0.0.1:8080/trainer/weapons

1. Pilih PNG transparan atau GIF animasi (maksimal 5 MB).
   PNG mendukung 4096 × 4096 piksel. GIF mendukung 1024 × 1024 piksel, maksimal
   120 frame, total 16 juta piksel setelah semua frame dibuka, dan 30 detik per putaran.
   GIF dengan latar transparan akan tetap transparan; latar yang sudah menyatu
   dengan gambar tidak dihapus otomatis.
2. Seret senjata pada model karakter ke posisi tangan yang diinginkan.
   Bulatan biru memutar senjata; kotak biru mengubah ukuran. Kolom X/Y dan
   tombol panah menggeser lebih presisi (Shift + panah untuk langkah besar).
   **Ke titik tangan** menyelaraskan kembali titik pegangan dengan pergelangan.
   **Urungkan** / Ctrl+Z membatalkan perubahan posisi terakhir.
   Pilih pose profil atau bertarung untuk membandingkan hasil.
   Buka **Titik pegangan pada gambar dan animasi** untuk memilih gagang langsung
   pada gambar sumber. Koordinat pegangan X/Y tetap bisa diisi dengan keyboard.
3. Untuk GIF, pilih kecepatan 0,25× sampai 4×. Gunakan **Jeda animasi** dan
   pemilih frame untuk memeriksa posisi tiap frame. Putar/jeda hanya memengaruhi
   pratinjau; di game, animasi selalu berulang. Durasi tiap frame mengikuti GIF
   dan pengaturan kecepatan. Preferensi reduced motion menjeda pratinjau awal.
4. Isi nama, damage, level minimum, dan deskripsi. Buka **Posisi dan animasi**
   untuk mengatur tinggi, rotasi, dan gerakan serangan yang sudah ada di game.
5. Klik **Impor senjata** dan tunggu proses selesai.
6. Pilih karakter tujuan, lalu **Berikan ke karakter**. Opsi **Langsung pasang**
   memeriksa syarat level dan tetap menyimpan senjata sebelumnya di tas.
7. Buka ulang Ruffle/game agar katalog terbaru dimuat. Buka **Gear → Weapons**.

Untuk senjata yang sudah diimpor melalui alat ini, klik **Atur posisi** pada
kartunya, sesuaikan posisi atau kecepatan GIF, lalu **Simpan posisi**. Proses ini mempertahankan ID,
nama, damage, inventaris karakter, dan katalog. Aset senjata lama dicadangkan.
Senjata khusus Obsidian Twin Claws (wpn9000) memakai perilaku dua tangan tersendiri,
sehingga tidak ditawarkan tombol editor satu tangan.

Pratinjau memakai model standar dari aset game, bukan pakaian karakter yang
sedang dipilih. Transformasi pergelangan model diambil dari runtime Ruffle.
Posisi yang disimpan dihitung dengan matriks yang sama dengan aset SWF; class
`hand-weapon.as` mengikuti pergelangan saat pose/animasi berubah, dan melepas
frame listener saat senjata dilepas. Tombol balik horizontal/vertikal membalik
artwork tanpa mengubah sisi karakter.

PNG menghasilkan senjata statis. GIF menghasilkan animasi gambar yang diputar
ulang pada senjata di profil maupun pertarungan, tetap mengikuti pergelangan.
Ikon inventaris memakai frame pertama agar daftar Gear tetap ringan. Seluruh
frame memakai kanvas dan titik pegangan yang sama; buat GIF dengan gagang pada
posisi yang konsisten agar senjata tidak tampak bergeser.

Gerakan serangan karakter masih memakai pilihan `attack_1` sampai `attack_10`.
Impor GIF tidak menambah gerakan serangan karakter, damage per frame, atau efek
skill baru. Pemasangan ganda memerlukan implementasi AS3 terpisah. Obsidian Twin Claws
(wpn9000) yang sudah ada tetap menggunakan aset dan perilakunya sendiri.

## Hasil dan cadangan

- ID baru dipilih otomatis mulai 9000, melewati ID aset dan registri yang terpakai.
- Aset baru: `web/cdn/swf/latest/swf/items/wpn_<ID>.swf`, dengan linkage
  `weapon` dan `icon` yang dibaca game.
- Daftar senjata: `server/custom-weapons.json`.
- Gambar sumber dan pengaturan: `tools/custom-weapons/imports/wpn<ID>/`.
  GIF asli disimpan sebagai `weapon.gif`, dengan `weapon.png` sebagai thumbnail.
  Edit posisi/kecepatan mempertahankan sumber GIF dan ID senjata.
- Katalog sebelum impor: `backups/custom-weapon-imports/wpn<ID>-<waktu>/`.
- `DataLibraryEN.getWeapon` menerima satu entri tambahan. Instruksi katalog yang
  sudah ada dipertahankan, dan semua bytecode lain diperiksa identik.
- Hanya satu proses impor berjalan pada satu waktu. Jika katalog berubah selama
  proses build, pemasangan dibatalkan. Kegagalan saat memasang mengembalikan
  katalog lama dan menghapus aset yang baru dipasang sebagian.
- Pemberian senjata memakai cache karakter server yang aktif, sehingga tetap
  tersimpan tanpa menghentikan server atau menimpa data karakter dari luar.

Java, Python 3, Node.js, dan `tools/ffdec/ffdec.jar` diperlukan.
Decoder GIF sudah disertakan, sehingga tidak perlu memasang paket Python atau npm tambahan. Jika executable Python
berbeda, jalankan server dengan `NINJA_PYTHON=/path/ke/python3 node index.js`.

## Pengujian

```sh
node --test tests/weapon-importer.test.cjs tests/weapon-position.test.cjs tests/custom-weapon.test.cjs tests/weapon-animation.test.cjs
```

Pengujian membuat salinan katalog dan karakter di direktori sementara. Dua impor
berurutan, validasi PNG, penyimpanan inventaris, pemberian ulang, pemisahan
karakter, serta pemulihan dari kegagalan penulisan registri diuji tanpa menambah
senjata percobaan ke game utama.

Editor juga diuji lewat Chrome: drag, handle putar/ukuran, sentuhan, keyboard,
undo, ganti pose, impor dan edit posisi pada ID yang sama. Uji matriks membandingkan
pratinjau Canvas dengan MATRIX yang dibaca langsung dari SWF hasil build.

Uji GIF membandingkan piksel dengan hasil decoder independen: transparansi,
frame parsial, disposal 1/2/3, palet lokal, interlacing, perubahan ukuran kode LZW,
dan durasi. Uji integrasi membangun SWF animasi, memberi ke karakter pengujian,
serta mengubah kecepatan/posisi tanpa mengganti katalog atau sumber GIF.

Referensi format: [spesifikasi GIF89a](https://www.w3.org/Graphics/GIF/spec-gif89a.txt).
