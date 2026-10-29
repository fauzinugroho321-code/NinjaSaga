# Audit konten Ninja Saga lokal — 24 Oktober 2026

## Lingkup dan batas bukti

Audit ini membaca kode server, daftar aset, dan log sesi lokal terakhir; tidak mengklik seluruh layar di Ruffle. Hasil HTTP 200 untuk SWF yang hilang **bukan** bukti konten asli tersedia, karena `server/index.js` dapat mengirim tiruan. Temuan di bawah dibedakan antara akses yang sengaja dimatikan, fungsi yang belum ditangani, aset tiruan, dan risiko yang masih perlu diuji di game.

Pemeriksaan dasar: `/trainer`, `ninja_saga.swf`, `code_library.swf`, panel ujian Lv80, dan `mission_270.swf` merespons HTTP 200. Semua 8.011 SWF di `web/cdn/swf/latest/swf` memiliki header CWS dan panjang hasil dekompresi yang cocok. Seluruh 58 berkas misi ujian yang tercantum dalam `server/chardata.js` tersedia: Chunin 5, Jounin 5, Special Jounin 13 + 13 easy, Sennin 12 + 10 easy. Ini memeriksa integritas berkas, bukan perilaku layar.

## Tidak tersedia atau belum bisa dipakai penuh

| Prioritas | Konten | Bukti | Dampak |
|---|---|---|---|
| Tinggi | Arena/PvP | `SystemData.getPvpServerInit` pada `server/index.js` mengirim `pvpstatus.status=false`; server XMLSocket tidak ada. | Arena sengaja tidak dapat dimainkan. Berkas `arena.swf` ada, tetapi tampilnya panel tidak berarti pertandingan tersedia. |
| Tinggi | Misi S-Level/Lv80 | Hanya `SLevelMission.finishMission` ditangani. `getChapterStatus`, `getBattleStatus`, `startMission`, `buyBigRamen`, dan `useRamen` masih mendapat balasan generik; permintaan ini tercatat dalam `server/amf-log.txt`. | Alur chapter, memulai misi, dan konsumsi ramen belum lengkap. |
| Tinggi | Pertarungan event ulang tahun ke-9 | `Anni9th.getBattleStatus`, `buyBattleEnergy`, `startBattle` tidak punya handler; ketiganya muncul pada sesi terakhir. | Bagian misi hadiah Kage ditangani, tetapi jalur pertarungan event belum utuh. |
| Sedang | Clan War | `ClanService.getWarList` tidak punya handler dan pernah dipanggil tujuh kali. | Daftar/perang klan tidak bisa dianggap berfungsi meski panel klan dasar dapat dibuka. |
| Sedang | Surat/Mail | `MailService.getMail` tidak punya handler; dua permintaan tercatat. | Kotak surat belum punya data nyata. |
| Sedang | Toko PvP/Prestige | `CharacterDAO.buyItemWithPvpPoint` (4 permintaan pada sesi terakhir) dan `buyItemWithPrestige` tidak punya handler. | Pembelian mendapat balasan sukses kosong; barang/saldo tidak terbukti tersimpan. |
| Sedang | Chapter 4 Genzu's Chronicles | `GenzusEvent.getStoryStatus` selalu mengirim `story_status: 3`. Komentar kode menyatakan chapter 4 terkunci sampai nilainya 4. | Chapter 4 tetap “coming soon” dengan konfigurasi sekarang. |

## Konten yang diganti aset tiruan

- `panels/Panel_tokenBank.swf` dan `panels/popup_reset_skill.swf` tidak ada. Log menunjukkan keduanya dikloning dari `daily_login.swf`. Jadi panel asli bank token dan reset skill belum tersedia.
- `library/engage_2.swf` tidak ada; log menunjukkan tiruan dari `popup.swf`. Ini berisiko menampilkan layar/animasi pertarungan yang salah.
- Folder NPC lokal hanya berisi `npc_1`, `npc_2`, `npc_5`, dan `npc_6`; berkas asli `npc_3`, `npc_4`, dan `npc_7`–`npc_10` tidak ada. Server mengganti `npc_3`/`npc_4` dengan donor `npc_5`/`npc_6`; sisanya memakai donor umum. Nama/ID NPC dapat berbeda dari tampilannya.
- Pemindai `server/periksa-aset.js` menandai 20 dari 1.070 SWF skill karena tidak memiliki kelas utama `Skill_<id>`. Sepuluh di antaranya bahkan tidak punya `SymbolClass`: 459, 461, 465, 466, 470, 472, 475, 477, 479, 482. Ini risiko kuat untuk pemuatan skill berbasis kelas, tetapi tiap skill belum diuji langsung di Ruffle.
- **Jangan** memakai angka “5.547 item bermasalah” dari pemindai sebagai bukti bug item. Banyak aset item asli memakai simbol umum seperti `accessory`; aturan pemindai terlalu ketat untuk kategori itu.

## Bug atau fungsi kosong yang sudah tampak di log/kode

- Pada sesi server terakhir terdapat 541 panggilan AMF; 210 dijawab oleh fallback kosong. Sebanyak 183 di antaranya adalah `CharacterDAO.payMinigame`. Di kode klien mini-game, pembelian tambahan waktu/nyawa langsung mengurangi token di memori, sedangkan server tidak mencatat transaksi. Saldo berisiko kembali setelah login ulang.
- `Lvl80Exam.markRewardListRead` dipanggil 5 kali pada sesi terakhir tetapi tidak punya handler. Penanda hadiah sudah dibaca mungkin tidak tersimpan; efek UI perlu diuji.
- `CharacterDAO.startMission` dipanggil 13 kali dan tidak punya handler, tetapi setiap contoh yang diperiksa diikuti `CharacterService.startMission` yang **ditangani**. Karena itu belum ada bukti bahwa panggilan kosong pertama sendiri memblokir misi.
- Hadiah login harian masih placeholder: 31 entri `item1`, sedangkan `NewDailyRewardStamp2017.claimReward` tidak memperbarui inventaris. Hadiah level-up dan hadiah teman juga dibalas kosong/nilai nol. Panel bisa terbuka tanpa hadiah sungguhan.
- Aksi auto-finish yang baru ditambahkan mencakup **10 mini-game Sennin 10 tahap** (`mission_247`–`251`, `266`–`270`). Ini belum merupakan jaminan semua 58 misi ujian memiliki tombol atau alur auto-selesai. Log mencatat keberhasilan `msn269` dan `msn270`, tetapi 8 mini-game lain belum diklik satu per satu dalam audit ini.

## Bukan temuan bug saat ini

- Log HTTP 404 yang terlihat adalah `/`, favicon, dan ikon Apple; bukan berkas game inti. `trainer/api/char` pernah 404 pada log lama karena itu bukan endpoint trainer saat ini. Halaman `/trainer` dan API yang benar, `/api/trainer/status`, sama-sama merespons HTTP 200.
- Peringatan `TIPE FIELD TIDAK COCOK (3)` berasal dari validator internal yang menyebut tiga field tambahan `character_equipped_*`. Log tidak menunjukkan exception AMF/server akibatnya, jadi belum layak dinyatakan penyebab kerusakan game.
- Tidak ditemukan `HANDLER ERROR`, `ERROR MEMPROSES AMF`, atau `ERROR TAK TERTANGANI` pada log yang diperiksa. Ini tidak membuktikan semua alur klien bebas bug.

## Urutan perbaikan yang paling masuk akal

1. Implementasikan layanan yang memblokir konten: S-Level/Lv80, pertarungan Anni9th, lalu Clan War/Mail sesuai prioritas bermain.
2. Dapatkan atau bangun aset asli panel token bank/reset skill dan NPC yang hilang; hentikan ketergantungan pada klon untuk konten penting.
3. Perbaiki `payMinigame` dan hadiah placeholder agar saldo dan progres konsisten setelah login ulang.
4. Uji interaktif semua tipe ujian, skill yang ditandai, dan panel fallback di Ruffle sambil mencocokkan log klien dengan log AMF.
