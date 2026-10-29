# Audit konten Ninja Saga lokal — 25 Oktober 2026

## Kesimpulan

Koleksi aset lokal cukup besar, tetapi banyak panel belum memiliki alur server yang lengkap. Membuka panel atau menerima HTTP 200 belum membuktikan fiturnya bekerja: layanan yang tidak dikenal dijawab sukses dengan data kosong, dan SWF yang hilang dapat diganti klon.

Audit ini memeriksa kode server, seluruh SWF lokal, tabel konten yang diekstrak ulang dari `data_library_en.swf` saat ini, serta log AMF. Tidak ada perubahan pada game atau data karakter. Belum dilakukan pengujian klik seluruh menu di Ruffle, dan audit tidak membandingkan dengan konten terbaru server resmi. “Lengkap” di sini berarti terhadap referensi yang tersedia dalam versi lokal.

## Konten yang belum tersedia atau belum lengkap

| Konten | Kekurangan yang ditemukan | Bukti dan tingkat kepastian |
|---|---|---|
| Arena / PvP | Arena sengaja dimatikan; pertandingan, ranking, dan tiket turnamen belum memiliki alur lengkap. | `SystemData.getPvpServerInit` mengirim `pvpstatus.status=false`, `server/index.js:1406`. Referensi `PVPService.*` ada di klien tetapi tidak ditangani server. |
| PvE / Forge House | Inisialisasi server PvE belum ditangani. Pembelian energy, ranking, status Forge House, dan klaim hadiah belum diimplementasikan. | `SystemData.getPvEServerInit` sudah 7 kali masuk fallback dalam log; empat `PVEService.*` terdapat di `Panel_PVE_2016.swf`. Ini fitur PvE khusus, bukan semua pertarungan lawan komputer. |
| Event ulang tahun ke-9 | Status battle, pembelian energy, dan mulai battle belum ditangani. Pergantian misi Kage dan upgrade paket Kage juga masih referensi tanpa handler. | Tiga aksi battle pernah dipanggil. Pemilihan Kage, status misi, dan klaim hadiah Kage sudah ada. |
| Clan War dan pengelolaan anggota | Daftar perang, lawan, hasil perang, pencarian klan, permohonan anggota, undangan, keluar/bubarkan klan, dan pengumuman belum lengkap. Riwayat klan selalu kosong. | `ClanService.getWarList`, `getMemberRequest`, `getCharacterByUIDs`, dan `buyStamina` pernah masuk fallback. `ClanWar.*` serta sebagian `ClanManagement.*` belum ada. `getHistory`, baris 1633, mengirim array kosong. |
| Mail / kotak surat | Membaca surat belum ditangani; klaim lampiran, hapus surat, dan undangan klan tidak punya implementasi. | `MailService.getMail` pernah dipanggil; sebelas nama layanan Mail ditemukan dalam klien, tidak ada handler Mail pada server. |
| Hadiah login 31 hari | Semua hari memakai hadiah contoh `item1_1`; klaim belum menambah inventaris maupun menyimpan status klaim. | `NewDailyRewardStamp2017.getStatus` dan `claimReward`, baris 1955–1992. Ini berbeda dari scratch card yang sudah memiliki penyimpanan hadiah. |
| Hadiah level, teman, undangan, dan hadiah sosial | Hadiah level-up kosong; hadiah teman bernilai nol; daily gift dan catatan rekrut/challenge belum disimpan. Undangan hanya mempunyai daftar hadiah contoh. | `SpecialReward.getLvUpReward/claimLvUpReward`, `FriendReward.getFriendReward`, serta fallback `getDailygiftStatus`, `saveRecruitRecord`, `saveChallengeRecord`, `GiftService.createGiftRecord`. |
| Toko Prestige / PvP Point dan Friendship Kunai | Pembelian Prestige/PvP belum ditangani; pembayaran pelatihan memakai Friendship Kunai ditolak secara eksplisit. | `CharacterDAO.buyItemWithPrestige` dan `buyItemWithPvpPoint` pernah masuk fallback; `server/index.js:2682`. |
| Belajar skill dari teman | Daftar skill yang bisa dipelajari belum tersedia; status/proses belajar teman belum lengkap. | `VisitFriendService.getLearnedSkill` mengirim `status:-1` dan array kosong, baris 2711. `getLearningStatus`, `learn`, `learnSkillFromFriend` tidak punya handler. |
| Tambahan waktu/nyawa mini-game | Pembayaran mini-game tidak dicatat server. Saldo di layar dan saldo tersimpan berisiko berbeda. | `CharacterDAO.payMinigame` masuk fallback 192 kali sepanjang log; panggilannya ada dalam klien. |
| Tindakan karakter/pet dan preferensi | Upgrade slot inventaris, revive, pengaturan opsi, sejumlah perubahan Emblem belum ditangani. Ganti nama karakter/pet, upgrade/hapus pet, maturity, penghapusan/pemulihan karakter, serta daily task mempunyai referensi tanpa handler. | Tindakan pertama terbukti pernah dipanggil; sisanya ditemukan dari kode/pool string dan perlu uji alur UI. Tidak berarti membeli atau melatih pet dasar belum tersedia. |

## Diperbaiki setelah audit

Pada 25 Oktober, penanda daftar hadiah Lv80 kini disimpan per karakter dan dipulihkan saat login. `SSTraining.startSSMission` mencatat lima ID misi yang sah; `finishSSMission` menyimpan hasil dan menambah 30 SS sekali per sesi misi yang dimulai. `SSTraining.refreshMission` kini membalas daftar yang dibaca panel. SS Training rank 8 ke atas tetap terbuka dalam mode lokal. Pengujian server dan simulasi muat ulang lulus; tombol di Ruffle belum diuji langsung. Catatan fallback dan CSV di bawah adalah bukti historis sebelum perbaikan.

Misi S-Level/Lv80 kini memiliki status bab dan energi per karakter, regenerasi energi, mulai/selesai misi, pembelian Big Ramen dan pemakaian dua jenis ramen. Kemenangan memberi XP dan gold sesuai tabel Stage 1–5 serta satu Advanced Ramen sebagai hadiah lokal; kekalahan tidak memberi hadiah. Hadiah untuk pengulangan panggilan akhir misi dicegah. Panel lokal mengizinkan semua tahap pada level 80 karena batas karakter lokal 80, sementara urutan lima tahap tetap wajib. Pengujian server lulus untuk semua tahap, ramen, gagal/menang, pemulihan energi, dan muat ulang; klik di Ruffle belum diverifikasi.

Chapter 4 Genzu’s Chronicles sekarang terbuka melalui `GenzusEvent.getStoryStatus` dengan `story_status: 4`. Pemeriksaan kelas `xmas2012_menu` pada `genzu_chronicles.swf` menunjukkan teks dan tombol cerita chapter 4 sudah tersedia. Tombol Battle dan Material House menuju panel umum; SWF ini tidak mendefinisikan misi atau hadiah khusus chapter 4. Respons server dan aset panel telah diverifikasi, tetapi klik langsung di Ruffle belum diuji.

Tindakan karakter, pet, dan preferensi kini ditangani di server lokal: slot inventaris, revive, pengaturan musik/suara (termasuk nilai nol), ganti nama, upgrade/hapus/pakan pet, tipe dan bonus Emblem, serta progres dan klaim daily task dengan hadiah lokal 1.000 gold sekali per hari dan tugas lama kosong saat hari berganti. Hapus karakter memakai kode lokal `DELETE` dan mengarsipkan karakter agar dapat dipulihkan. Pengujian kontrak server dengan karakter contoh lulus; alur klik di Ruffle belum diverifikasi. Baris audit dan jumlah fallback di atas adalah keadaan historis sebelum perbaikan.

## Event dan paket tambahan yang masih mempunyai layanan tanpa implementasi

Daftar ini berasal dari referensi pada SWF; belum semua tombol dibuka langsung. Sebagian adalah event lama, sehingga keberadaan referensi tidak menjamin menunya aktif pada map sekarang.

- **Soccer Fever 2018**: data kartu, membeli kartu, klaim, dan riwayat kartu (`Football2018`).
- **Father’s Day 2015/2016/2017**: status battle, material, Shrine Key, hadiah rahasia, paket skill, dan upgrade paket.
- **Children’s Day 2018**: paket pakaian/skill dan status special battle.
- **Mother’s Day 2016**: status special battle.
- **Easter 2017**: pembelian dan upgrade skill; referensi Easter Festival untuk hasil event juga belum ditangani.
- **Paket 2019**: Iron Man Clothing, Phantom Impulse, serta paket skill701 memakai `LimitedPackage201904.*` yang belum ditangani.
- **Event lain**: sebagian Anniversary 4/7, hadiah Olympus, Wishing Tree, Sakura, Halloween 2015, lucky draw, roulette lama, dan token undangan.
- **Crew**: membuka Crew, menerima undangan, dan hasil Land Hunt masih mempunyai referensi tanpa handler; belum diverifikasi apakah jalurnya dapat dijangkau di map aktif.

Paket `SpecialReward.claim…Package` tidak otomatis dihitung belum ada. Server mempunyai handler umum yang mencoba membaca isi paket dari SWF. Bila pembacaan tidak menemukan paket, server masih membalas “Paket ini belum tersedia”; setiap paket tetap perlu uji klaim dan login ulang.

## Aset asli yang belum ada

**Pernah diminta dan diganti klon:**

- `panels/Panel_tokenBank.swf`: panel bank token asli belum tersedia.
- `panels/popup_reset_skill.swf`: panel reset skill asli belum tersedia. Ini berbeda dari tombol Clear pilihan jutsu.
- `library/engage_2.swf`: pernah diganti dengan `popup.swf`.
- NPC `npc_3`, `npc_4`, `npc_7`, `npc_8`, `npc_9`, `npc_10`: berkas aslinya tidak ada. NPC 3/4 sekarang menggunakan donor NPC 5/6; karakter yang tampil dapat berbeda dari NPC aslinya.

**Terdaftar dalam tabel konten, tetapi berkas modelnya tidak ada:**

- Fire Star Windmill Shuriken (`wpn775` → `items/wpn_775.swf`).
- Azure Dragon Armor Set laki-laki/perempuan (`set1844/1845` → `items/set_970_0.swf` dan `set_970_1.swf`).
- Entri `wpn695`, GM Weapon, dan skill929 bernama “coming coon” juga menunjuk berkas yang tidak ada. Ketiganya dipisahkan dari konten normal karena nama/tujuannya menunjukkan placeholder atau alat pengembang; belum terbukti muncul dalam alur pemain.

Tabel masih memuat banyak entri `development:1`, nama dummy, dan referensi pasif. Lampiran CSV mencantumkan setiap referensi tersebut beserta kategorinya; jumlah baris bukan jumlah berkas unik atau jumlah konten yang wajib dipulihkan.

## Talent dan Sage: batas konten asli

- Data lokal mendefinisikan **11 pohon Talent**. Referensi Bloodline 12 belum mempunyai definisi pohon; skill 1040 “Acupuncture: Needle Barrage” bertanda development dan animasinya tidak ada. Ini bukan talent tambahan yang tinggal diaktifkan.
- Mode Sage yang mempunyai rangkaian data nyata adalah **Toad** dan **Snake**. Data juga memuat “Other” serta 11 entri Sage kosong yang menunjuk `0.swf`. Entri kosong itu belum merupakan mode ketiga yang bisa dimainkan.
- Temuan lama “20 SWF skill rusak” terlalu luas. Sepuluh tanpa SymbolClass bertanda development; enam lainnya adalah skill pasif, tiga milik Bloodline 12 yang belum selesai, dan skill895 memiliki simbol huruf kecil. Klien saat ini mempunyai fallback huruf kecil untuk jutsu biasa. Tidak adanya kelas animasi aktif pada skill pasif bukan bukti skill pasif rusak.
- Tiga belas referensi Talent pasif tidak mempunyai SWF tersendiri. Efeknya dikelola melalui data pasif, sehingga audit tidak menggolongkannya sebagai tiga belas serangan yang hilang. Efektivitas setiap efek tetap memerlukan uji pertarungan.

## Fitur ada, tetapi simulasinya belum penuh

- **Teman lokal:** delapan karakter contoh untuk rekrut, challenge, dan anggota klan sudah disediakan. Ini belum merupakan sistem sosial antar akun. Riwayat rekrut/challenge masih perlu disimpan.
- **Halloween 2016:** heart selalu penuh; mulai battle dan beli heart hanya mengirim sukses. Pengelolaan energy/biaya belum menyerupai ekonomi game asli.
- **Hunting/Eudemon:** daftar dan jalur hadiah tersedia, tetapi batas waktu/biaya masih disederhanakan; `EudemonGarden.buyHuntingTime` belum ditangani.
- **Forge:** `ItemDAO.forgeObject` ada, tetapi belum memotong material, membalas sukses untuk jenis yang tidak tertangani, dan jalur pet/item memanggil fungsi dengan bentuk argumen yang tidak cocok. Perubahan langsung pada tas weapon/set/back/hair/skill tidak memanggil penyimpanan di handler itu. Perlu uji forge → muat ulang, bukan dianggap lengkap hanya karena tombol mengirim sukses. Bukti: `server/index.js:2345`, `chardata.js:813` dan `:1087`.
- **Mysterious Merchant:** paket dapat memberikan barang, tetapi `buySkillLimit` hanya mengembalikan biaya tanpa mengurangi saldo di server. Konsistensi biaya setelah login ulang belum lengkap.
- **Hadiah pet pembayaran / Tail Pet:** `SpecialReward.claimPaymentPet` hanya respons kosong dan `Anni5th.getTailPet` mengirim array kosong. Pembelian pet dasar dan `Anni5th.buyPet` mempunyai jalur terpisah yang sudah ada.

## Bagian yang tersedia dan koreksi terhadap audit lama

- **8.012 SWF aset + 1 SWF utama** diperiksa: dekompresi, panjang berkas, dan pembacaan tag dasar berhasil. Ini tidak menjamin seluruh animasi atau perilaku benar.
- Semua berkas yang dirujuk **232 definisi misi** tersedia; **58 misi ujian** yang dirujuk server juga tersedia. Tombol/layanan misi tetap perlu dibedakan dari keberadaan berkas.
- Berkas yang dirujuk **170 pet**, **575 gaya rambut**, dan seluruh bundel ikon item yang dihitung dari tabel tersedia. Komentar lama “hanya pet184 yang ada” sudah tidak sesuai dengan folder sekarang.
- Bundel `library/icons/skill_icon_3491-3500.swf` sekarang ada (113.827 byte). Catatan kehilangan lama bukan bukti masih hilang saat ini.
- Scratch card sudah memilih hadiah lokal dan menyimpan hasil; daftar hadiah tersebut bukan probabilitas resmi server asli.
- Server sudah memiliki jalur penyimpanan pilihan jutsu, Talent, Sage, lima elemen, trainer SP, klan dasar/bangunan/donasi, pembelian pet, serta sejumlah hadiah boss. Audit ini tidak mengulang uji interaktif semua fitur tersebut.
- Sejumlah 404 di log berasal dari `/`, favicon, `/play`, `/account`, URL trainer lama, atau path salah; tidak dihitung sebagai aset misi yang hilang.

## Urutan pengerjaan yang disarankan

1. Lengkapi **PvE** agar konten pertarungan yang asetnya tersedia dapat diakses.
2. Implementasikan **hadiah harian, Mail, serta penyimpanan transaksi/progres** agar hasil permainan tidak semu atau kembali setelah login ulang.
3. Lengkapi **Clan War** dan battle **Anniversary 9**, lalu event/paket pilihan.
4. Pulihkan **panel token bank/reset, NPC asli, dan model item yang hilang**.
5. Uji satu siklus untuk setiap fitur: buka → gunakan/beli/klaim → tutup → muat ulang → periksa saldo, inventaris, dan progres.

Tidak perlu mengunduh ulang seluruh koleksi. Prioritasnya melengkapi layanan dan beberapa aset yang memang terbukti tidak ada.

## Angka pemeriksaan dan batas interpretasi

- Snapshot audit: 2026-10-25 13:59:06 WIB.
- Log historis: 2,369 panggilan AMF, 111 nama layanan; 368 fallback historis. Delapan nama layanan yang dahulu masuk fallback sekarang sudah ditangani.
- **33 nama layanan** pernah dipanggil tanpa handler pada saat audit; **25** masih belum ditangani setelah delapan perbaikan di atas. Ini bukan 33 menu: beberapa adalah diagnostik atau satu tahap dari alur yang juga memiliki layanan lain.
- Sesi server terakhir dimulai http://127.0.0.1:8080 — 10/25/2026, 1:38:07 PM; ada 60 panggilan dan 0 fallback. Nol fallback pada sesi ini tidak membuktikan fitur lain lengkap karena baru 15 nama layanan dikunjungi.
- Pemindaian string ABC menemukan 187 kandidat tanpa handler. Tiga string yang jelas bukan layanan dikeluarkan; lampiran memuat **184 referensi**: 33 pernah dipanggil, 42 tambahan terlihat sebagai pemanggilan langsung dalam dekompilasi, dan 109 masih kandidat string. Jangan menjumlahkannya sebagai 184 bug terkonfirmasi.
- Handler umum `SpecialReward.claim…Package` diperhitungkan; tidak disalahklasifikasikan sebagai handler hilang.
- Tidak ditemukan penanda `HANDLER ERROR`, `ERROR MEMPROSES AMF`, atau `ERROR TAK TERTANGANI` pada log AMF yang dibaca. Respons sukses kosong tetap dapat menyebabkan masalah di klien.
- `CharacterDAO.startMission` belum ditangani tetapi alur juga menggunakan `CharacterService.startMission` yang tersedia. Karena itu audit tidak menyatakan semua misi gagal dimulai.

## Lampiran lengkap

- `AUDIT_LAYANAN_2026-10-25.csv`: seluruh 184 referensi, tingkat bukti, jumlah fallback historis, dan SWF sumber.
- `AUDIT_ASET_2026-10-25.csv`: referensi berkas yang tidak ada, dipisahkan antara model, klon, pengembangan, pasif, dan kebutuhan konteks. Bukan daftar unduhan wajib.

### Referensi layanan menurut keluarga

- **Achievement**: `flushBattleStat` [kandidat], `updateData` [kandidat], `validate` [kode].
- **Anni4th**: `cakehair` [kandidat], `cancelcakehair` [kandidat], `claimStickerGift` [kandidat].
- **Anni7th**: `finishBattle` [kode].
- **Anni9th**: `buyBattleEnergy` [log], `changeKageMission` [kandidat], `getBattleStatus` [log], `startBattle` [log], `upgradeKageSkillPackacge` [kandidat].
- **AnniReward**: `claimOlympusDailyLogin` [kode].
- **BloodlineService**: `useTalentPill` [kode].
- **CharacterDAO**: `addTrialEmblemThirdSkillType` [kode], `applySkillProfile` [kandidat], `buyItemWithPrestige` [log], `buyItemWithPvpPoint` [log], `checkMiniGameTimeKick` [kandidat], `claimEmblemType2XpBonus` [log], `claimLevelUp` [kandidat], `convertCrystal` [kandidat], `deleteCharacter` [kode], `deleteCharactersOnRemoveTrialEmblem` [kode], `deletePet` [kode], `downgradeEmblemType` [log], `getPvpCharacter` [kode], `instantTrainByToken` [kode], `makeBattleBetter` [kode], `payMinigame` [log], `payMissiongame` [kandidat], `rankup` [log], `requestDeleteCode` [kode], `startMission` [log], `train_hp_cp_ap` [kode], `updateDailyTask` [kode], `upgradeEmblemType` [log], `upgradeInvSlot` [log], `upgradePet` [kode], `verify_hp_cp_ap` [kode].
- **CharacterManagement**: `recoverCharacter` [kode].
- **CharacterService**: `changeName` [kode], `changePetName` [kode], `checkFacebookFan` [kandidat], `completeDailyTask` [kode], `exchangeTokenToGold` [kandidat], `getNewsfeedReward` [kode], `reviveBattleCharacter` [log], `startNTExam` [kandidat], `startSJExam` [kode], `useFriendshipBox` [kode].
- **CharacterValidation**: `validateSkill` [kandidat].
- **CharacterXX**: `verifyTrainingSkill` [kandidat].
- **ChildrensDay2018**: `buyPackage` [kandidat], `buySkillPackage` [kandidat], `getSpecialBattleStatus` [kandidat].
- **ClanManagement**: `acceptClanInvite` [kandidat], `acceptMemberRequest` [kandidat], `changeClanName` [kandidat], `dismissClan` [kandidat], `quitClan` [kandidat], `rejectAllMemberRequest` [kandidat], `rejectMemberRequest` [kandidat], `removeMember` [kandidat], `saveAnnouncement` [kandidat].
- **ClanService**: `buyStamina` [log], `getCharacterByUIDs` [log], `getClanList` [kandidat], `getMemberRequest` [log], `getWarList` [log], `joinTournament` [kandidat], `requestMembership` [kandidat], `searchClan` [kandidat].
- **ClanWar**: `generateBattleResult` [kode], `getBattleDefender` [kandidat], `getMemberList` [kandidat], `searchClan` [kandidat].
- **CrewManagement**: `acceptCrewInvite` [kandidat].
- **CrewService**: `getCrewOpen` [kandidat].
- **CrewWar**: `finishLandHunt` [kode].
- **EasterEvent2017**: `buySkill2` [kandidat], `upgradeSkill2` [kandidat].
- **EasterFestival**: `sendBattleEvent` [kode].
- **EudemonGarden**: `buyHuntingTime` [kandidat].
- **FacebookService**: `claimInviteReward` [kandidat], `saveChallengeRecord` [log], `saveRecruitRecord` [log].
- **FathersDay2015**: `buyMotherMaterial` [kandidat], `buyShrineKey` [kandidat], `claimPackage` [kandidat], `claimSecretReward` [kandidat], `getBattleStatus` [kandidat].
- **FathersDay2016**: `buySkillPackage` [kandidat], `upgradeSkillPackacge` [kandidat].
- **FathersDayPackage2017**: `buyPackage` [kandidat].
- **FileChecking**: `checkHackActivity` [kandidat].
- **Football2018**: `buyFootballCard` [kandidat], `claimCard` [kandidat], `getFootballCardHistory` [kandidat], `getFootballData` [kandidat].
- **FriendReward**: `getDailygiftStatus` [log], `publishDailyFeed` [kandidat].
- **Gashapon**: `claimDailyLogin` [kandidat].
- **GiftService**: `confirmDailyItemReward` [kandidat], `createGiftRecord` [log].
- **GodSnap**: `updateGodSnap` [kode].
- **Halloween**: `checkRequestSent` [kandidat].
- **HalloweenEvent2015**: `finishBattle` [kode].
- **InviteToken**: `getTokenClaimStatus` [kandidat].
- **IronMan2016**: `buyPackage` [kandidat].
- **ItemDAO**: `getDailyHuntingPassport` [kode].
- **LimitedPackage201904**: `buyPackage` [kandidat], `buySkillPackage` [kandidat], `buySkillPackage2` [kandidat], `upgradeSkillPackacge` [kandidat], `upgradeSkillPackacge2` [kandidat].
- **Lvl80Exam (sudah diperbaiki)**: `markRewardListRead` [log historis].
- **MailService**: `claimBackItem` [kandidat], `claimClothing` [kandidat], `claimMagatama` [kandidat], `claimMail` [kandidat], `claimRewards` [kandidat], `claimSkill` [kandidat], `claimWeapon` [kandidat], `deleteMail` [kandidat], `getMail` [log], `sendClanInvite` [kandidat], `sendClanInviteById` [kandidat].
- **MothersDay2016**: `getSpecialBattleStatus` [kandidat].
- **OptionData**: `setOption` [log].
- **PVEService**: `buyEnergy` [kandidat], `claimPVEForgeHouseReward` [kandidat], `getForgeHouseStatus` [kandidat], `getRankingList` [kandidat].
- **PVPService**: `buyTournamentTicket` [kandidat], `getMyRanking` [kandidat], `getRankingList` [kandidat], `pvpFinishRecord` [kode].
- **PVPServiceDebug**: `logData` [kandidat].
- **PetDAO**: `addPetMaturityByItem` [kode].
- **ReportService**: `pvpActionHitLog` [log], `pvpSyncLog` [kandidat], `pvpTimeLog` [kandidat], `reportAmfError` [kandidat], `reportBug2` [kode], `reportFriendError` [kandidat], `saveLog` [kode], `submitData` [log], `submitSkillTrainingError` [kode].
- **RequestIndexService**: `acceptGift` [kandidat], `acceptGiftAll` [kandidat], `ignoreGift` [kandidat], `ignoreGiftAll` [kandidat].
- **RouletteService**: `getNewReward` [kandidat], `getReward` [kandidat], `luckySpin` [kandidat].
- **SLevelMission**: `buyBigRamen` [log], `getBattleStatus` [log], `getChapterStatus` [log], `startMission` [log], `useRamen` [log].
- **SSTraining (sudah diperbaiki)**: `refreshMission` [kandidat historis], `startSSMission` [log historis].
- **SakuraEvent**: `skillClickButton` [kandidat].
- **SmallEvent**: `getLuckyDrawStatus1` [kandidat], `getLuckyDrawStatus3` [kandidat], `gotoWelcomePackageLink` [kandidat], `replyAmazingDraw2014` [kode].
- **SocialNetwork**: `getFriends` [kode], `saveRecruitRecord` [kode].
- **SpecialReward**: `claimTrialEmblem` [kode], `molPromotionGift` [kandidat], `premiumDailyToken` [kandidat].
- **SystemData**: `getPvEServerInit` [log], `getPvpServer` [kandidat].
- **Tracking**: `clickIngameLoginBanner` [kode], `generated` [kandidat], `posted` [kode], `tutTracking` [kode].
- **ValentinesDay2014**: `vDayCheckPopupLog` [kandidat].
- **VisitFriendService**: `getLearningStatus` [kode], `learn` [kandidat], `learnSkillFromFriend` [kandidat].
- **WishingTree**: `claimWishingTreeReward` [kandidat].

### Identitas berkas inti yang diaudit

- `server/index.js` — SHA-256 `46966159ec1c51414e2133a5835cdd296759e5d2ffb632a9b10c3c808d774ff1`.
- `server/chardata.js` — SHA-256 `1a8b8ecbeef200358b9ab9f6ba0f016eb0843ae40ddda09f4de48d0d62f9c242`.
- `web/ninja_saga.swf` — SHA-256 `4fbbe3ed1416a270efa982639ca7c70b3c0d5271d1903b034a55b93e07fdefe0`.
- `web/cdn/swf/latest/swf/library/code_library.swf` — SHA-256 `33b989cbd6543a1e0c2936741fb1602afcb917ccfb468004ae6f54cf12067529`.
- `web/cdn/swf/latest/swf/library/menu.swf` — SHA-256 `2f5949aec3b9f1a0a2dd9ebcee3419c985b719d0d8ed9fc91663eed0a13285f0`.
- `web/cdn/swf/latest/swf/language/data_library_en.swf` — SHA-256 `a77d5c968449d3b6b4bcc2c0c12bc47edf085e9f3d7a362eeb625c3bf4d73649`.
