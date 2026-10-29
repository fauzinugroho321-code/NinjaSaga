# Menjalankan Ninja Saga di Windows

Panduan ini menjalankan server di komputer teman Anda sendiri. Karakter dan
progres tersimpan di komputernya; ini belum merupakan server multiplayer bersama.

## 1. Siapkan proyek

Unduh branch `fauzi-dev` dari fork:
https://github.com/fauzinugroho321-code/NinjaSaga/tree/fauzi-dev

Pilih **Code → Download ZIP**, lalu ekstrak dan pindahkan isi foldernya ke
`C:\NinjaSaga`. Alternatifnya, gunakan salinan folder proyek yang sudah berjalan.
Pastikan struktur akhirnya:

```text
C:\NinjaSaga\
  Caddyfile
  caddy.exe
  server\index.js
  web\ninja_saga.swf
  web\cdn\swf\latest\swf\...
```

Jangan menjalankannya langsung dari dalam ZIP. Semua folder aset `web` harus ikut.
Data karakter dan log lokal tidak disertakan di branch ini. Teman Anda dapat
membuat karakter baru setelah masuk.

## 2. Pasang pemutar dan Node.js

- Pasang Node.js LTS untuk Windows: https://nodejs.org/en/download
- Unduh **Ruffle Desktop → Windows (64-bit)**: https://ruffle.rs/downloads
  Ekstrak Ruffle dan jalankan `ruffle.exe`.
- `caddy.exe` sudah tersedia di proyek. Jika tidak sesuai arsitektur Windows,
  unduh versi yang sesuai dari https://caddyserver.com/download.

Buka Command Prompt baru dan periksa:

```bat
node --version
```

Server memakai modul bawaan Node.js, sehingga tidak perlu `npm install`.

## 3. Arahkan domain ke komputer lokal

Jalankan Notepad dengan **Run as administrator**, lalu buka:

```text
C:\Windows\System32\drivers\etc\hosts
```

Pada dialog Open, pilih **All Files** agar berkas tanpa ekstensi terlihat.
Tambahkan baris berikut tanpa menghapus baris yang sudah ada:

```text
127.0.0.1 ninjasaga.cc
127.0.0.1 www.ninjasaga.cc
127.0.0.1 cdn.ninjasaga.cc
127.0.0.1 amf.ninjasaga.cc
```

Simpan sebagai `hosts`, bukan `hosts.txt`. Buka Command Prompt sebagai administrator:

```bat
ipconfig /flushdns
ping cdn.ninjasaga.cc
```

Alamat hasil ping harus `127.0.0.1`.

## 4. Jalankan server game

Buka Command Prompt dan biarkan jendelanya tetap terbuka:

```bat
cd /d C:\NinjaSaga\server
node index.js
```

Pastikan log menampilkan `Server jalan di http://127.0.0.1:8080` dan
`ninja_saga.swf : ADA`.

## 5. Jalankan HTTPS lokal

Buka Command Prompt kedua dengan **Run as administrator**:

```bat
cd /d C:\NinjaSaga
caddy.exe run --config Caddyfile
```

Biarkan jendela ini tetap terbuka juga. Setujui pemasangan sertifikat lokal Caddy.
Jika HTTPS belum dipercaya, saat Caddy tetap berjalan buka Command Prompt ketiga
sebagai administrator dan jalankan:

```bat
cd /d C:\NinjaSaga
caddy.exe trust
```

Uji dari Command Prompt:

```bat
curl.exe -I https://cdn.ninjasaga.cc/ninja_saga.swf
```

Hasil yang diharapkan `200 OK`. Selesaikan masalah sertifikat jika pengujian gagal;
tidak perlu mematikan pemeriksaan sertifikat Ruffle.

## 6. Buka game lewat Ruffle

Di Ruffle pilih **File/Berkas → Open/Buka**, lalu masukkan URL ini pada kolom
berkas atau URL:

```text
https://cdn.ninjasaga.cc/ninja_saga.swf?fb_uid=1%26fb_name=Player%26time=0&nocache=1
```

Tekan **Start/Mulai**, lalu buat atau pilih karakter. Membuka alamat root
`http://127.0.0.1:8080/` di Chrome bukan cara menjalankan game Flash ini.

Trainer tersedia di peramban:

```text
http://127.0.0.1:8080/trainer
```

Untuk bermain berikutnya, cukup jalankan kembali server Node.js, Caddy, dan
Ruffle. Pengaturan hosts dan sertifikat cukup dilakukan saat pemasangan awal.

## Jika belum berhasil

- `node` tidak dikenali: pasang Node.js, lalu buka Command Prompt baru.
- `ninja_saga.swf` tidak ditemukan: periksa folder `web` sejajar dengan `server`.
- Port 8080 atau 443 sudah dipakai: hentikan salinan server lama sebelum menjalankan yang baru.
- `404` pada `/`: uji alamat `/ninja_saga.swf` yang lengkap.
- Gagal HTTPS: periksa hasil ping dan jalankan `caddy.exe trust` dengan administrator.
- Halaman masih menampilkan versi lama: tutup Ruffle lalu naikkan `nocache=1` menjadi `nocache=2`.

Java dan Python hanya diperlukan untuk mengimpor atau membangun ulang senjata
kustom. Keduanya tidak diperlukan untuk memainkan aset senjata yang sudah ada.
