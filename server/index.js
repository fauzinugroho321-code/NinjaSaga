'use strict';
/* Gateway AMF Ninja Saga — respons login sesuai hasil pembongkaran bytecode.
 *
 * Rantai verifikasi yang direkonstruksi dari client_library.swf:
 *   Account.setupAccount(result, signature)
 *     result = [ account_id, account_type, account_balance, session_key ]
 *     cek: signature == SHA1( id + "|" + type + "|" + balance + SALT + session_key )
 *     lolos jika account_id > 0
 */

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { decodePacket, encodePacket } = require('./amf');
const { buildStub } = require('./stub');
const chars = require('./chardata');
const { cloneFrom } = require('./assetclone');
const HARGA = require('./harga');   // id -> [gold, crystal]
const trainer = require('./trainer');
const localFriends = require('./local-friends');
const scratchRewards = require('./scratch-rewards');
const dailyRewards = require('./daily-rewards').createDailyRewards(chars);
const eudemonGarden = require('./eudemon-garden').createEudemonGarden(chars);
const { HAIR_DATA } = require('./hairdata');
const PET_UPGRADES = {
  "pet125": {"path":"125:40,136:9999","token":0,"material":""},
  "pet126": {"path":"126:40,132:9999","token":0,"material":""},
  "pet127": {"path":"127:40,133:9999","token":0,"material":""},
  "pet128": {"path":"128:40,134:9999","token":0,"material":""},
  "pet129": {"path":"129:40,135:9999","token":0,"material":""},
  "pet132": {"path":"","token":0,"material":"829:10,830:3,836:20"},
  "pet133": {"path":"","token":0,"material":"829:3,830:10,836:20"},
  "pet134": {"path":"","token":0,"material":"831:10,832:3,836:20"},
  "pet135": {"path":"","token":0,"material":"828:3,832:10,836:20"},
  "pet136": {"path":"","token":0,"material":"828:12,831:8,836:25"},
  "pet93": {"path":"93:20,97:9999","token":0,"material":""},
  "pet94": {"path":"94:20,95:40,96:60","token":0,"material":""},
  "pet95": {"path":"94:20,95:40,96:60","token":1500,"material":""},
  "pet96": {"path":"94:20,95:40,96:60","token":2500,"material":""},
  "pet97": {"path":"93:20,97:9999","token":1000,"material":""},
};

const PORT = 8080;
const LOG = path.join(__dirname, 'amf-log.txt');

// Salt dari slot ClientLibrary._s
const SALT = 'Vmn34aAciYK00Hen26nT01';

// ---- Ubah ke 1 kalau ingin klien masuk ke pembuatan karakter ----
const IS_NEW_ACCOUNT = 0;

// Ninja Emblem = keanggotaan premium. Ubah ke false untuk kembali biasa.
// Nilainya dikonfirmasi dari konstanta kelas ninjasaga:Account di
// network_library.swf:  FREE = 1,  PREMIUM = 2
const EMBLEM = true;

const ACCOUNT = {
  id: 1,
  // Dibaca Account.setupAccount() sebagai result[1] lalu disimpan ke
  // account_type; Account.getAccountType() memverifikasinya terhadap
  // accountTypeHash = SHA1(String(account_type)) yang dihitung klien sendiri,
  // jadi tidak ada yang perlu kita tandatangani untuk bagian ini.
  type: EMBLEM ? 2 : 1,
  balance: 10000000,       // saldo token
  sessionKey: 'localdevsession0001',
};
ACCOUNT.balance += chars.allCharacters().reduce((total, c) =>
  total + (Number(c.scratchAccountDelta) || 0) - (Number(c.academyTokenSpent) || 0) -
    (Number(c.sLevelTokenSpent) || 0) - (Number(c.utilityTokenSpent) || 0), 0);

// Versi aset. Klien memetakan tiap entri ke AppData[type + "Ver"],
// dan nilainya dipakai LANGSUNG sebagai nama folder di path:
//   cdn/swf/<version>/swf/<kategori>/<nama>.swf
// Karena folder Anda bernama "latest", nilainya harus "latest" juga.
// Kategori di bawah ini terkonfirmasi dari permintaan nyata klien.
const SWF_VERSIONS = [
  'data', 'library', 'language', 'panels', 'items', 'actions',
  'sns', 'skills', 'npc', 'enemies', 'mission', 'pets', 'icons', 'sound',
].map(type => ({ type, version: 'latest' }));

const sha1 = s => crypto.createHash('sha1').update(s, 'binary').digest('hex');

// penghitung id pertarungan, dinaikkan tiap misi dimulai
let battleSeq = 0;

function signAccount(a) {
  return sha1(`${a.id}|${a.type}|${a.balance}` + SALT + a.sessionKey);
}

function activeCharacter() {
  return chars.characterById(chars.getActiveId()) || chars.firstCharacter();
}

function spendUtilityToken(cost) {
  const amount = Number(cost);
  if (!Number.isSafeInteger(amount) || amount < 0 || ACCOUNT.balance < amount) return false;
  const changed = chars.updateCharacter(null, c => {
    c.utilityTokenSpent = (Number(c.utilityTokenSpent) || 0) + amount;
  });
  if (!changed) return false;
  ACCOUNT.balance -= amount;
  return true;
}

function log(...a) {
  const line = a.map(x => typeof x === 'string' ? x : JSON.stringify(x, null, 1)).join(' ');
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
}


/* Field yang dibaca parseSystemData.
 * Data berat (skill/item/weapon/enemy) TIDAK dikirim di sini karena
 * Data.TEST_VERSION = false, sehingga klien mengambilnya dari
 * data_library_en.swf lewat dataLib.getSkill(), dst.
 */
function systemDataFields() {
  const now = Math.floor(Date.now() / 1000);
  return {
    server_time: now,
    current_date: now,
    // kalau diisi, klien memanggil socket.setServer(nilai ini)
    pvp_server_status: 0,
    animation: [],
    news: [],
    ads_path: [],
    special_ads: [],
    proc: null,
  };
}

// ---------------------------------------------------------------
/* Bahan yang dibutuhkan tiap slot implant gauntlet.
 *
 * Dibaca dari GAUNTLET_UPGRADE_COST di konstruktor Gauntleluptade @3-143:
 *     item1144 Fire Stone Fragment       220 + 100.000 gold
 *     item1145 Wind Stone Fragment       220 + 200.000 gold
 *     item1146 Water Stone Fragment      220 + 300.000 gold
 *     item1147 Lightning Stone Fragment  220 + 400.000 gold
 *     item1148 Earth Stone Fragment      220 + 500.000 gold
 *     item1150 Chakra Stone Fragment     220 + 700.000 gold
 *
 * Tombol Implant (uBtn1..uBtn6) baru hidup kalau SEMUA syarat ini terpenuhi
 * (setPanelContent @1875-1995):
 *     toolkit.hasItem('wpn1596')
 *     stateObj<N> != 2                       slot belum ter-implant
 *     toolkit.getItemCount(<batu>) >= 220     bahannya cukup
 *
 * Batu-batu ini tidak dijual lewat servis AMF mana pun di panel -- di server
 * aslinya didapat dari event. Karena itu disediakan di sini: setel true untuk
 * membekali karakter 220 batu tiap jenis saat login, sehingga tombol Implant
 * bisa ditekan. Setel false kalau mau mengumpulkannya sendiri.
 */
// HARUS false. Memenuhi syarat 220 batu berarti menaruh 220 x 6 = 1320 entri
// di inventaris, dan MapMenu.countArrItems menelusuri seluruh entri tiap kali
// panel dibuka -- akibatnya
//     Error #1502: A script has executed for longer than 15 seconds
//         at MapMenu/countArrItems()
// dan Gear tidak pernah selesai digambar (tab barang tampak kosong).
//
const BATU_GAUNTLET = ['1144', '1145', '1146', '1147', '1148', '1150'];

/* Mysterious Merchant / Legendary Skill Package
 * (swf/panels/limited_package_store_2018.swf, kelas LimitSkill2018).
 *
 * Papan "under construction" muncul kalau paketnya dianggap tidak ada.
 * getstatus @16-43 memutuskan begini:
 *
 *     if (result.package_data != null && result.package_type != 9) {
 *         typeleft   = result.package_type
 *         packageDataleft = result.package_data
 *         countdownRemainTimeleft = result.time_limit
 *         haveleft   = true
 *     } else if (typeleft == 9) haveleft = false
 *
 * Jadi package_type 9 (atau package_data null) = tutup. Nilai lainnya
 * memilih tata letak di check() @100-624:
 *     1 -> kotak tunggal 'leftone'
 *     2 -> 'twoboxleft' / 'threeboxleft' / 'fourboxleft'  menurut
 *          package_data.length (2 / 3 / selain itu)
 *     3 -> versi "update" dari ketiganya
 *
 * Tiap entri package_data cuma perlu DUA field:
 *     id    dipakai buyPackage @158-173 (packageIdForBuy) dan dikirim ke
 *           SkillPackageLimit.buySkillLimit([sessionKey, id])
 *     cost  STRING "hargaEmblem_hargaNormal", dipecah dengan "_".
 *           buyPackage @103-155: pemilik Emblem membayar potongan [0],
 *           pengguna biasa potongan [1]. display() @18-64 memakai keduanya
 *           untuk menghitung teks diskon: (normal - emblem) / normal * 100.
 *
 * Isi hadiahnya TIDAK ada di panel (gambar kotaknya tertanam di timeline),
 * jadi ditentukan di sini. buySkillLimit membalas res.cost yang dipakai
 * getBuyPackage @16-29 untuk mengurangi saldo akun di layar.
 */
const PAKET_MERCHANT = {
  // JANGAN pakai tipe 2 dengan daftar datar.
  //
  // getstatus @85-121: kalau typeleft == 2, klien menjalankan
  //     packageDataright = result.package_data[1]
  // sedangkan field packageDataright DIDEKLARASIKAN bertipe Array. Jadi
  // elemen ke-2 harus berupa LARIK (daftar paket untuk sisi kanan panel),
  // bukan satu entri paket. Mengirim daftar datar menghasilkan
  //     #1034 Type Coercion failed: cannot convert Object to Array
  //         at LimitSkill2018/getstatus()
  // dan panel berhenti sebelum sempat digambar.
  //
  // Tipe 1 hanya memakai sisi kiri ('leftone') dan tidak pernah menyentuh
  // cabang itu, jadi paling aman. Isi `daftar` boleh lebih dari satu entri;
  // dengan tipe 1 yang ditampilkan entri pertama (display() @18-27 membaca
  // packageDataleft[0].cost).
  tipe: 1,               // 1 = satu kotak (aman), 3 = versi "update", 9 = tutup
  batas_waktu: 604800,   // hitung mundur di panel, dalam detik (7 hari)

  // `id` HARUS STRING, dan isinya NOMOR SKILL saja (tanpa awalan "skill").
  //
  //   setPanelContent @483-498 menjalankan  packageDataleft[i].id.split('_')
  //   -> mengirim angka menghasilkan "#1006 value is not a function",
  //      karena Number tidak punya metode split.
  //
  //   @523-547 lalu mencari  SKILL_DATA['skill' + id]  dan @601-624 memakai
  //   hasilnya untuk mengisi teks skillName. Jadi id "902" -> skill902,
  //   yaitu Kinjutsu: Unstoppable Rage. Nama dan ikonnya diambil klien
  //   sendiri dari data_library, server tidak perlu mengirimnya.
  //
  // Catatan: sisi KANAN panel memakai bentuk berbeda (@3935-3957 memeriksa
  // potongan pertama terhadap 'skill', jadi id di sana berbentuk
  // "skill_902"). Sisi kanan belum dipakai karena butuh package_type 2.
  daftar: [
    { id: '902', cost: '1039_1299', isi: ['skill_902'] },
  ],
};

/* ====================================================================
 * DAFTAR MUSUH: Eudemon Garden dan Hunting House
 *
 * Pakai kolom "kunci" dari database/enemy.csv (enemy1 ... enemy346).
 * Hanya 209 di antaranya berstat lengkap; yang tidak lengkap tetap tampil
 * tapi bisa aneh saat bertarung.
 * ==================================================================== */

/* Eudemon Garden's preview and actual rewards share server/eudemon-garden.js.
 * OldHuntingHouse sends the zero-based room index in start/finishHunting args[1].
 */

/* Hunting House (HuntingHouse2) -- dikelompokkan per zona di peta panel.
 *
 * getHuntingListResponse @54-122 membaca hunting_list, hunting_cost,
 * update_time, get_hunting_passport, dan show_item (STRING dipisah koma).
 *     zone0  diperlakukan khusus: hanya elemen pertama tiap sub-larik
 *     zoneN  larik id musuh; N memilih movieclip EasyBoss<N> di peta
 */
const HUNTING_ZONE = {
  zone0: [],
  zone1: ['enemy338', 'enemy339'],
  zone2: ['enemy340', 'enemy341'],
};

/* Hadiah yang tampil di jendela akhir pertarungan.
 *
 * MissionResult.init(..., rewardList, rewardGetList, ...):
 *     rewardList    <- field `reward`      = yang DIGAMBAR
 *     rewardGetList <- field `reward_get`  = penanda mana yang DIDAPAT
 * rewardDisplay @45-100 hanya mengulang rewardList. Batas 10 barang
 * (panel cuma punya rewardIcon_0 sampai rewardIcon_9).
 *
 * Entri berupa STRING "<jenis>_<nilai>", dipecah klien dengan "_".
 * Urutan pemeriksaannya memakai indexOf dan KRITIS: petxp diperiksa
 * sebelum xp, karena "petxp" mengandung "xp".
 *     petxp_N / xp_N / gold_N  -> masuk penghitung, TIDAK jadi ikon
 *     item_N / wpn_N / set_N / hair_N / back_N / skill_N / pet_N -> ikon
 */
const HADIAH_BOS = ['xp_1000', 'gold_500'];
const HADIAH_MATERIAL = ['item_600', 'item_604'];

const semuaHadiah  = () => HADIAH_BOS.concat(HADIAH_MATERIAL);
const barangHadiah = () => semuaHadiah().filter(h => !/^(xp|gold|petxp)_/.test(h));

/* Berikan satu hadiah ke karakter aktif.
 * Bentuknya "<jenis>_<nomor>"; skill dan pet punya jalur sendiri di
 * chardata.js, sisanya lewat addItem yang sudah mengenali awalannya.
 */
function beriHadiah(id) {
  const sk = String(id).match(/^skill_?(\d+)$/);
  if (sk) return chars.addSkill(sk[1]);
  const pt = String(id).match(/^pet_?(\d+)$/);
  if (pt) return chars.addPet({ id: pt[1] });
  return chars.addItem(String(id).replace('_', ''), 1);
}

/* Balasan baku untuk semua servis akhir-pertarungan.
 *
 * Battle memakai TIGA callback tergantung jalurnya:
 *     callBattleFinishHAV -> getBossRewardResponse02   (paling ketat)
 *     actionFinish_CB     -> getBossRewardResponse04
 *     jalur bos lain      -> getBossRewardResponse03
 *
 * Syarat Response02:
 *   reward, reward_get   WAJIB larik. @329/@342 di-coerce Array lalu @878
 *                        dibaca .length -> field hilang = null = #1009.
 *   result               null ATAU objek. @356 hanya menjaga terhadap null
 *                        lalu membaca result.add_favorability; mengirim
 *                        angka menghasilkan #1069 pada Number.
 *   extra_reward, extra_reward_get, pet
 *                        diuji Boolean(). Larik kosong bernilai TRUE di
 *                        AS3, jadi dikirim null supaya bloknya dilewati.
 */
function balasanHadiah(tambahan) {
  return Object.assign({
    status: 1, error: null,
    result: null,                  // JANGAN angka
    reward: semuaHadiah(),         // WAJIB larik -- yang DIGAMBAR
    reward_get: barangHadiah(),    // WAJIB larik -- penanda DIDAPAT
    reward_items: [],
    player_pet: [],
    extra_reward: null,
    extra_reward_get: null,
    pet: null,
    gold: 0, xp: 0, dmg: 0,
    double_reward: false,
    message: '',
    z9f: null,
  }, tambahan || {});
}

// Battle.getBossRewardResponse02 menambah XP/Gold di klien dari `reward`,
// lalu memanggil updateCharacter dengan 0/0. Simpan jumlah yang sama di sini;
// updateCharacter berikutnya hanya menyinkronkan total absolutnya.
function selesaikanHadiahBos(args, layanan) {
  if (Number(args && args[3]) !== 0) {
    return balasanHadiah({ reward: [], reward_get: [] });
  }

  const xp = Number(HADIAH_BOS.find(h => h.startsWith('xp_'))?.slice(3)) || 0;
  const gold = Number(HADIAH_BOS.find(h => h.startsWith('gold_'))?.slice(5)) || 0;
  const hasil = chars.addProgress(xp, gold);
  if (!hasil) return { status: 0, error: 'Karakter aktif tidak ditemukan' };

  for (const hadiah of barangHadiah()) {
    try { beriHadiah(hadiah); }
    catch (e) { log('   !! hadiah ' + hadiah + ': ' + e.message); }
  }
  log('   ' + layanan + ': +' + xp + ' XP, +' + gold + ' Gold -> ' +
      'xp=' + hasil.c.xp + ' gold=' + hasil.c.gold);
  return balasanHadiah();
}

/* Peta nomor ekor -> id pet, disalin dari tailPetArr di konstruktor
 * paymentTailPet: [0,146,141,131,86,74,73,71,68,65]. Indeks 0 dibuang,
 * jadi elemen ke-0 di sini = ekor 1.
 *     1 Ichibi  2 Nibi   3 Sanbi   4 Yobi    5 Gobi
 *     6 Rokubi  7 Nanabi 8 Hachibi 9 Kyubi
 */
const EKOR_KE_PET = ['146', '141', '131', '86', '74', '73', '71', '68', '65'];

/* ====================================================================
 * PAKET KLAIM (tombol PackageBtnNN di peta)
 *
 * Tiap tombol memuat popup_4th_claim_code_pNN.swf yang berbeda, tapi
 * semuanya kelas Anni4_ClaimCode dengan alur yang sama:
 *     gotoClaimPanel     -> SpecialReward.claim<Nama>Package([sessionKey])
 *     ClaimItemResponse  -> HANYA membaca res.message:
 *         == 'You do not have a claim for this package.'  -> buka toko
 *         selain itu                                       -> showOk(message)
 * Tanpa `message`, showOk(undefined) melempar #2007 di ConfirmationDoc.
 *
 * Isi paket dibaca dari show() tiap popup, yang menimpa ClaimRewardArr
 * menurut CHAR_GENDER (daftar di konstruktor cuma sisa salinan -- jangan
 * dipakai). Urutan: set, wpn, hair, back, skill, pet. Semua id sudah
 * dicocokkan ke data_library_en.
 * ==================================================================== */
const PAKET_KLAIM = {
  // popup_4th_claim_code_p8
  'SpecialReward.claimAugustPackage': { nama: 'August Package',
    g0: ['set_2248', 'wpn_1343', 'hair_683', 'back_557', 'skill_719', 'pet_71'],
    g1: ['set_2249', 'wpn_1343', 'hair_684', 'back_557', 'skill_719', 'pet_71'] },
  // popup_4th_claim_code_p11
  'SpecialReward.claimPatriotPackage': { nama: 'Patriot Package',
    g0: ['set_1430', 'wpn_1109', 'hair_429', 'back_427', 'skill_896', 'pet_205'],
    g1: ['set_1431', 'wpn_1109', 'hair_430', 'back_427', 'skill_896', 'pet_205'] },
  // popup_4th_claim_code_p15 -- Magic Emissary Set
  'SpecialReward.claimMagicPackage': { nama: 'Magic Package',
    g0: ['set_2424', 'wpn_1502', 'hair_765', 'back_688', 'skill_914', 'pet_157'],
    g1: ['set_2425', 'wpn_1502', 'hair_766', 'back_688', 'skill_914', 'pet_157'] },
  // popup_4th_claim_code_p16 -- Kendo Ronin Set + Hachibi
  'SpecialReward.claimSpookyPackage': { nama: 'Spooky Package',
    g0: ['set_2202','wpn_1329','hair_671','back_601','skill_721','pet_67'],
    g1: ['set_2203','wpn_1329','hair_672','back_601','skill_721','pet_67'] },
  'SpecialReward.claimSeptemberPackage': { nama: 'September Package',
    g0: ['set_2218', 'wpn_1342', 'hair_679', 'back_606', 'skill_703', 'pet_68'],
    g1: ['set_2219', 'wpn_1342', 'hair_680', 'back_606', 'skill_703', 'pet_68'] },
};

const KANTONG_PAKET = { set: 'bodysets', wpn: 'weapons', hair: 'hairs',
                        back: 'backitems', skill: 'skills' };

/* Apakah karakter sudah memiliki barang "<jenis>_<nomor>"? */
function sudahPunya(c, id) {
  const m = String(id).match(/^([a-z]+)_?(\d+)$/);
  if (!m) return false;
  const [, jenis, no] = m;
  if (jenis === 'pet') return (c.pets || []).some(p => String(p.id) === no);
  const bag = KANTONG_PAKET[jenis];
  return !!bag && (c[bag] || []).map(String).includes(no);
}

/* Isi paket dibaca otomatis dari swf panelnya kalau belum ada di PAKET_KLAIM.
 *
 * Tiap popup_4th_claim_code_pNN.swf (kelas Anni4_ClaimCode) menyimpan isinya
 * di Anni4_ClaimCode.show:
 *     if (CHAR_GENDER == 0) ClaimRewardArr = ['set_..','wpn_..',...];   // cowok
 *     else                  ClaimRewardArr = ['set_..','wpn_..',...];   // cewek
 * Dalam bytecode itu dua deret  pushstring ... newarray N  yang berdekatan.
 * Server mencari berkas panel yang memuat nama servisnya, lalu mengambil
 * pasangan larik tersebut. Hasilnya disimpan di memori (sekali baca).
 */
const zlib = require('zlib');
const POLA_ID_HADIAH = /^(set|wpn|hair|back|acsy|skill|pet|item|essence|material)_\d+$/;
const _cachePaketSwf = {};

function abcDariSwf(buf) {
  const sig = buf.toString('latin1', 0, 3);
  let raw;
  if (sig === 'FWS') raw = buf;
  else if (sig === 'CWS') raw = Buffer.concat([buf.subarray(0, 8), zlib.inflateSync(buf.subarray(8))]);
  else return [];
  const nbits = raw[8] >> 3;
  let p = 8 + Math.ceil((5 + nbits * 4) / 8) + 4;
  const out = [];
  while (p + 2 <= raw.length) {
    const th = raw.readUInt16LE(p); p += 2;
    const kode = th >> 6; let pj = th & 0x3f;
    if (pj === 0x3f) { pj = raw.readUInt32LE(p); p += 4; }
    if (kode === 82) { const z = raw.indexOf(0, p + 4); out.push(raw.subarray(z + 1, p + pj)); }
    else if (kode === 72) out.push(raw.subarray(p, p + pj));
    p += pj;
    if (kode === 0) break;
  }
  return out;
}

function stringPoolAbc(abc) {
  let p = 4;
  const u30 = () => { let v = 0, s = 0, b; do { b = abc[p++]; v |= (b & 0x7f) << s; s += 7; } while (b & 0x80 && s < 35); return v >>> 0; };
  let n = u30(); for (let i = 1; i < n; i++) u30();          // int
  n = u30(); for (let i = 1; i < n; i++) u30();              // uint
  n = u30(); p += Math.max(0, n - 1) * 8;                    // double
  n = u30(); const str = [''];
  for (let i = 1; i < n; i++) { const l = u30(); str.push(abc.toString('utf8', p, p + l)); p += l; }
  return str;
}

function larikIdDalamAbc(abc) {
  const str = stringPoolAbc(abc);
  const hasil = [];
  for (let i = 0; i < abc.length; i++) {
    if (abc[i] !== 0x2c) continue;
    let p = i; const isi = [];
    while (abc[p] === 0x2c) {
      let q = p + 1, v = 0, s = 0, b;
      do { b = abc[q++]; v |= (b & 0x7f) << s; s += 7; } while (b & 0x80 && s < 35);
      const t = str[v];
      if (typeof t !== 'string' || !POLA_ID_HADIAH.test(t)) break;
      isi.push(t); p = q;
    }
    if (isi.length && abc[p] === 0x56 && abc[p + 1] === isi.length) {
      hasil.push({ awal: i, akhir: p + 2, isi });
      i = p + 1;
    }
  }
  return hasil;
}

function paketDariSwf(servis) {
  if (servis in _cachePaketSwf) return _cachePaketSwf[servis];
  let hasil = null;
  try {
    const dir = path.join(WEB_ROOT, 'cdn', 'swf', 'latest', 'swf', 'panels');
    const daftar = fs.readdirSync(dir).filter(f => /^popup_4th_claim_code_p\d+\.swf$/i.test(f));
    for (const f of daftar) {
      const abcs = abcDariSwf(fs.readFileSync(path.join(dir, f)));
      const abc = abcs.find(a => a.includes(Buffer.from(servis)));
      if (!abc) continue;
      const lar = larikIdDalamAbc(abc);
      for (let k = 0; k + 1 < lar.length; k++) {
        if (lar[k + 1].awal - lar[k].akhir <= 40) {
          hasil = { nama: servis.replace(/^SpecialReward\.claim/, '').replace(/Package$/, ' Package'),
                    g0: lar[k].isi, g1: lar[k + 1].isi, dari: f };
          break;
        }
      }
      if (!hasil && lar.length) {
        const terakhir = lar[lar.length - 1].isi;
        hasil = { nama: servis.replace(/^SpecialReward\.claim/, '').replace(/Package$/, ' Package'),
                  g0: terakhir, g1: terakhir, dari: f };
      }
      if (hasil) break;
    }
  } catch (e) { log('   !! baca isi paket dari swf gagal: ' + e.message); }
  if (hasil) log('   isi ' + hasil.nama + ' dibaca dari ' + hasil.dari + ': ' + hasil.g0.join(', ') +
                 ' | cewek: ' + hasil.g1.join(', '));
  _cachePaketSwf[servis] = hasil;
  return hasil;
}

function klaimPaket(servis) {
  const p = PAKET_KLAIM[servis] || paketDariSwf(servis);
  const c = chars.characterById(chars.getActiveId()) || chars.firstCharacter();
  if (!p) {
    log('   paket belum dikenal: ' + servis);
    return { status: 1, error: null, result: null,
             message: 'Paket ini belum tersedia di server.' };
  }
  if (!c) return { status: 1, error: null, result: null, message: 'Karakter tidak ditemukan.' };

  const isi  = Number(c.gender) === 1 ? p.g1 : p.g0;
  const baru = isi.filter(id => !sudahPunya(c, id));
  if (!baru.length) {
    log('   ' + p.nama + ': semua isi sudah dimiliki');
    // JANGAN pakai kalimat 'You do not have a claim for this package.' --
    // kalimat persis itu membuat klien membuka toko, bukan menampilkan pesan.
    return { status: 1, error: null, result: null,
             message: p.nama + ' sudah pernah kamu klaim.' };
  }
  for (const id of baru) {
    try { beriHadiah(id); } catch (e) { log('   !! ' + id + ': ' + e.message); }
  }
  log('   ' + p.nama + ' diberikan: ' + baru.join(', '));
  return { status: 1, error: null, result: null,
           message: p.nama + ' berhasil diklaim!\n' +
                    'Muat ulang game untuk melihat semua barangnya.' };
}

/* ------------------------------------------------------------------ *
 * PANEL KAGE (kage_menu.swf, kelas ninjasaga.linkage.nine_kage)
 *
 *   Anni9th.kageMissionStatus([sk])            -> showResponseFunction
 *   Anni9th.selectKageMission([sk, guru 1..5]) -> getStatus
 *   Anni9th.claimKageMissionReward([sk, id])   -> getmissionStatus
 *
 * Bentuk balasan yang dibaca klien:
 *   kage          null = layar pilih guru; 'e1' Earth, 'l1' Lightning,
 *                 'f1' Fire, 'wa1' Water, 'wi1' Wind
 *   mission       14 entri { mission_id:'<prefix><1..14>', reward:['jenis_no'],
 *                 target:{item_112x:n}, claim_status:0/1/2 }
 *                 (2 = sudah diklaim/centang; misi ke-n baru bisa dibuka
 *                 kalau misi sebelumnya 2). getmissionStatus menentukan guru
 *                 dari mission[0].mission_id, jadi larik ini tidak boleh
 *                 kosong di balasan klaim.
 *   learned_kaga  larik prefix guru yang sudah tamat (isKageLearned)
 *   completed     SELALU false: true membuka popup 'kageskill_package'
 *                 yang swf-nya tidak ada.
 *   target        essence yang disyaratkan tombol Claim (getItemCount >= n).
 *                 Essence aslinya didapat dari 'kage_battle' yang swf-nya
 *                 tidak ada, jadi syaratnya dikosongkan (KAGE_BUTUH_ESSENCE).
 * Klien TIDAK menambahkan hadiah ke tas sendiri -> server yang menyimpan.
 * ------------------------------------------------------------------ */
const KAGE_BUTUH_ESSENCE = false;   // true = tiap misi minta 1 essence elemennya
const KAGE_GURU = {
  1: { prefix: 'e1',  huruf: 'e',  nama: 'Earth',     essence: 'item_1127', skill: ['skill_892', 'skill_893', 'skill_915'] },
  2: { prefix: 'l1',  huruf: 'l',  nama: 'Lightning', essence: 'item_1128', skill: ['skill_890', 'skill_891', 'skill_914'] },
  3: { prefix: 'f1',  huruf: 'f',  nama: 'Fire',      essence: 'item_1126', skill: ['skill_888', 'skill_889', 'skill_913'] },
  4: { prefix: 'wa1', huruf: 'wa', nama: 'Water',     essence: 'item_1129', skill: ['skill_896', 'skill_897', 'skill_916'] },
  5: { prefix: 'wi1', huruf: 'wi', nama: 'Wind',      essence: 'item_1130', skill: ['skill_894', 'skill_899', 'skill_917'] },
};
const KAGE_JUMLAH_MISI = 14;
// Misi ke-5, ke-10 dan ke-14 memberi tiga skill guru; sisanya essence elemennya.
const KAGE_MISI_SKILL = { 5: 0, 10: 1, 14: 2 };

function guruDariPrefix(prefix) {
  for (const n of Object.keys(KAGE_GURU)) if (KAGE_GURU[n].prefix === prefix) return KAGE_GURU[n];
  return null;
}

function hadiahMisiKage(guru, no) {
  return (no in KAGE_MISI_SKILL) ? guru.skill[KAGE_MISI_SKILL[no]] : guru.essence;
}

function daftarMisiKage(guru, misi) {
  const out = [];
  for (let no = 1; no <= KAGE_JUMLAH_MISI; no++) {
    const id = guru.huruf + no;
    const target = {};
    if (KAGE_BUTUH_ESSENCE && !(no in KAGE_MISI_SKILL)) target[guru.essence] = 1;
    out.push({ mission_id: id, reward: [hadiahMisiKage(guru, no)], target,
               claim_status: Number(misi[id]) === 2 ? 2 : 1 });
  }
  return out;
}

function karakterKage() {
  return chars.characterById(chars.getActiveId()) || chars.firstCharacter();
}

function balasanKage(st, guruPaksa) {
  const guru = guruPaksa || (st.kage ? guruDariPrefix(st.kage) : null);
  return {
    status: 1, error: null, result: null,
    kage: st.kage || null,
    mission: guru ? daftarMisiKage(guru, st.misi) : [],
    learned_kaga: st.learned.slice(),
    completed: false,
  };
}

function kageStatus() {
  return balasanKage(chars.stateKage(karakterKage()));
}

function kagePilih(args) {
  const n = Number(args && args[1]);
  const guru = KAGE_GURU[n];
  const st = chars.stateKage(karakterKage());
  if (!guru) { log('   Kage: guru tak dikenal (' + (args && args[1]) + ')'); return balasanKage(st); }
  if (st.kage !== guru.prefix) { st.kage = guru.prefix; st.misi = {}; }
  chars.setKage(st);
  log('   Kage dipilih: ' + guru.nama + ' (' + guru.prefix + ')');
  return balasanKage(st);
}

function kageKlaim(args) {
  const id = String((args && args[1]) || '');
  const st = chars.stateKage(karakterKage());
  const guru = st.kage ? guruDariPrefix(st.kage) : null;
  if (!guru) {
    // Klik ganda setelah guru tamat: getmissionStatus tetap membaca
    // mission[0].mission_id, jadi kirim ulang 14 misi guru itu (semua centang).
    log('   Kage: klaim tanpa guru aktif (' + id + ')');
    const hm = id.match(/^([a-z]+)\d+$/);
    const lama = hm && Object.values(KAGE_GURU).find(g => g.huruf === hm[1]);
    if (!lama) return balasanKage(st);
    const semua = {};
    for (let i = 1; i <= KAGE_JUMLAH_MISI; i++) semua[lama.huruf + i] = st.learned.includes(lama.prefix) ? 2 : 1;
    return balasanKage({ kage: null, misi: semua, learned: st.learned }, lama);
  }

  const m = id.match(/^([a-z]+)(\d+)$/);
  const no = m && m[1] === guru.huruf ? Number(m[2]) : 0;
  if (!(no >= 1 && no <= KAGE_JUMLAH_MISI)) {
    log('   Kage: misi ' + id + ' bukan milik guru ' + guru.nama);
    return balasanKage(st);
  }
  if (Number(st.misi[id]) === 2) { log('   Kage: ' + id + ' sudah diklaim'); return balasanKage(st); }
  if (no > 1 && Number(st.misi[guru.huruf + (no - 1)]) !== 2) {
    log('   Kage: ' + id + ' terkunci (misi sebelumnya belum diklaim)');
    return balasanKage(st);
  }

  const hadiah = hadiahMisiKage(guru, no);
  try { beriHadiah(hadiah); } catch (e) {
    log('   !! hadiah ' + hadiah + ': ' + e.message);
    return { status: 0, error: 'Hadiah Kage gagal diberikan.' };
  }
  st.misi[id] = 2;
  log('   Kage ' + guru.nama + ' misi ' + no + ' diklaim -> ' + hadiah);

  // Semua misi selesai: guru ditandai tamat dan layar kembali ke pilih guru.
  // Balasan kali ini tetap membawa 14 misi (klien membaca guru dari
  // mission[0]); status baru baru terlihat saat panel dibuka lagi.
  let selesai = true;
  for (let i = 1; i <= KAGE_JUMLAH_MISI; i++) if (Number(st.misi[guru.huruf + i]) !== 2) selesai = false;
  const balas = balasanKage(st, guru);
  // validateAmfResponse memakai update_inventory untuk menambah hadiah ke
  // inventaris klien yang sedang berjalan. Tanpa ini hadiah baru terlihat
  // sesudah Ruffle dimuat ulang, walaupun sudah tersimpan di characters.json.
  balas.update_inventory = {
    add_item_id: [hadiah.replace('_', '')],
    showPopup: false,
  };
  if (selesai) {
    if (!st.learned.includes(guru.prefix)) st.learned.push(guru.prefix);
    st.kage = null; st.misi = {};
    balas.learned_kaga = st.learned.slice();
    log('   Kage ' + guru.nama + ' TAMAT');
  }
  chars.setKage(st);
  return balas;
}

const handlers = {

  // Event Halloween 2016 (swf/panels/Halloween_battle_2016.swf, kelas
  // Halloween2016Battle). getEventResponse membaca
  //   result.remain_heart        jumlah heart (maks 5, atau 8 untuk Emblem)
  //   result.heart_refill_remain detik menuju heart berikutnya (0 = penuh)
  //   reward_list                opsional; null = hadiah bawaan swf dipakai
  // Balasan kosong sebelumnya membuat heart terbaca 0 sehingga pemain harus
  // "beli heart" dulu tiap kali. Sekarang heart selalu penuh.
  'HalloweenEvent2016.getBattleStatus': () => ({
    status: 1, error: null,
    result: { remain_heart: 8, heart_refill_remain: 0 },
    reward_list: null,
  }),
  // getBuyHeartResponse cukup status valid; klien mengisi heart ke maksimum.
  'HalloweenEvent2016.buyBattleHeart': () => ({ status: 1, error: null, result: null }),
  // reduceHeartResponse cukup status valid, lalu klien masuk battle.
  'HalloweenEvent2016.startBattle': (args) => {
    log('   battle Halloween 2016 melawan: ' + ((args && args[1]) || '?'));
    return { status: 1, error: null, result: null };
  },

  // Panel Kage -- lihat blok PANEL KAGE di atas.
  'Anni9th.kageMissionStatus':      () => kageStatus(),
  'Anni9th.selectKageMission':      (args) => kagePilih(args),
  'Anni9th.claimKageMissionReward': (args) => kageKlaim(args),

  'SystemService.requireLogin': () => ({ status: 1, error: null }),

  // args: [uid, snsType, build, "", tokenSha1, null, null, lang]
  'SystemService.snsLogin': (args) => {
    const lang = (args && args[7]) || 'en';
    return {
      status: 1,
      error: null,
      result: [ACCOUNT.id, ACCOUNT.type, ACCOUNT.balance, ACCOUNT.sessionKey],
      signature: signAccount(ACCOUNT),
      country_area: 'ID',
      isNewAccount: IS_NEW_ACCOUNT,
      promote_id: 0,
      isTrialEmblem: 0,
      isExpired: 0,
      account_lock: null,

      // Status security password akun. NinjaSaga.onAmfLoginResult @705-708:
      //     Main.accRegActiveStatus = res.account_registered_password;
      //     Main.accRegTutStatus    = res.account_registered_tutored;
      // Konstanta di ninjasaga::Main:
      //     ACC_REG_ACTIVE_STATUS_NOT_REGISTERED = 0
      //     ACC_REG_ACTIVE_STATUS_ACTIVE         = 1
      //     ACC_REG_TUT_STATUS_NONE = 0, ACC_REG_TUT_STATUS_READ = 1
      //
      // ClanPanel.confirmDonateTokenPromptSecurity @7-18 membandingkannya:
      //     if (accRegActiveStatus == ACC_REG_ACTIVE_STATUS_ACTIVE)
      //         showSecurityPasswordConfirmation(..., confirmDonateToken, ...)
      //     else
      //         showSecurityPasswordSignupInvitation(...)   <-- notice signup
      //
      // Selama nilainya 0, donasi TOKEN tidak pernah sampai ke
      // ClanManagement.donateToken -- klien berhenti di tawaran pendaftaran.
      // Donasi GOLD tidak lewat jalur ini, makanya gold sudah bisa.
      account_registered_password: 1,   // 1 = ACTIVE
      account_registered_tutored:  1,   // 1 = READ, lewati tutorialnya

      swf_versions: SWF_VERSIONS,
      lang,
      serverTime: Math.floor(Date.now() / 1000),
    };
  },

  'ReportService.reportAmfError2': () => ({ status: 1, error: null }),

  // --- Karakter -----------------------------------------------

  // args: [sessionKey, nama, gender, elemen, warnaKulit, rambut, wajah]
  'CharacterDAO.createCharacter': (args) => {
    const preparing = args && args[7] === 'prepare';
    const activeId = chars.getActiveId();
    const pending = !preparing && activeId && chars.characterById(activeId);
    const samePending = pending && pending.tutorialPending === true &&
      pending.name === String(args[1]) &&
      pending.gender === Number(args[2]) &&
      pending.hair === String(args[5]) &&
      pending.face === String(args[6]);
    const c = samePending ? pending : chars.createCharacter(args);
    const ready = chars.updateCharacter(c.character_id, character => {
      if (preparing) character.tutorialPending = true;
      else if (samePending) character.tutorialBattleFinished = true;
      else if (!samePending) character.xp = 1;
    });
    chars.setActiveCharacter(c.character_id);
    log('   karakter ' + (preparing ? 'disiapkan' : samePending ? 'melanjutkan tutorial' : 'dibuat') +
        ': ' + c.name + ' (id ' + c.character_id + ')');
    return {
      status: 1, error: null,
      result: chars.databaseCharacter(ready.character),
      character_id: c.character_id,
    };
  },

  // PENTING: klien membaca tiap entri sebagai ARRAY BERINDEKS ANGKA,
  // bukan objek. Dari SelectCharMenu.setupSelectMenu:
  //
  //   charactersList[i][0]  -> character_id
  //   charactersList[i][1]  -> charName.text
  //   charactersList[i][2]  -> charLevel.text
  //   charactersList[i][3]  -> gender (0 = pria, selain itu wanita)
  //
  // Mengirim objek dengan nama field lengkap membuat slot tampil kosong
  // (tulisan "text" bawaan TextField tidak pernah tergantikan).
  'CharacterDAO.getCharactersList': () => {
    const list = chars.listCharacters();
    log('   jumlah karakter: ' + list.length +
        (list.length ? '  ->  ' + list.map(c => c.name + ' lv' + c.level).join(', ') : ''));
    return {
      status: 1,
      error: null,
      result: list.map(c => [
        c.character_id,
        c.name,
        String(c.level),
        Number(c.gender) || 0,
      ]),
    };
  },

  'CharacterDAO.upgradeInvSlot': (args) => {
    const kind = String(args && args[1]);
    const count = Number(args && args[2]);
    if (!['weapon','body_set','back','item','essence','material','accessory','pet'].includes(kind) ||
        !Number.isSafeInteger(count) || count < 1 || count > 1000 || !activeCharacter())
      return { status: 0, error: 'Invalid inventory upgrade' };
    if (!spendUtilityToken(count * (ACCOUNT.type === 2 ? 75 : 100)))
      return { status: 0, error: 'Insufficient token' };
    chars.updateCharacter(null, c => {
      c.inventorySlotAdditions ||= {};
      c.inventorySlotAdditions[kind] = (Number(c.inventorySlotAdditions[kind]) || 0) +
        count;
    });
    return { status: 1, error: null, result: true };
  },

  'CharacterService.reviveBattleCharacter': () => {
    if (!spendUtilityToken(50)) return { status: 0, error: 'Insufficient token' };
    return { status: 1, error: null, result: true,
      update_inventory: { token: ACCOUNT.balance } };
  },

  'OptionData.setOption': (args) => {
    const musicIndex = Number(args && args[1]);
    const musicVolume = Number(args && args[2]);
    const soundVolume = Number(args && args[3]);
    if (![musicIndex,musicVolume,soundVolume].every(Number.isFinite))
      return { status: 0, error: 'Invalid option' };
    chars.updateCharacter(null, c => {
      c.optionData = { music_index: Math.max(0, Math.floor(musicIndex)),
        music_volume: Math.max(0, Math.min(1, musicVolume)),
        sound_on: Math.max(0, Math.min(1, soundVolume)) };
    });
    return { status: 1, error: null, result: true };
  },

  'CharacterService.changeName': (args) => {
    const name = String(args && args[1] || '').trim();
    if (!name || name.length > 30 || !activeCharacter())
      return { status: 0, error: 'Invalid name' };
    if (!spendUtilityToken(ACCOUNT.type === 2 ? 600 : 1000))
      return { status: 0, error: 'Insufficient token' };
    chars.updateCharacter(null, c => { c.name = name; });
    return { status: 1, error: null, result: true };
  },

  'CharacterService.changePetName': (args) => {
    const id = String(args && args[1]);
    const name = String(args && args[2] || '').trim();
    const c = activeCharacter();
    if (!name || name.length > 30 || !c || !(c.pets || []).some(p => String(p.id) === id))
      return { status: 0, error: 'Invalid pet or name' };
    if (!spendUtilityToken(ACCOUNT.type === 2 ? 600 : 1000))
      return { status: 0, error: 'Insufficient token' };
    chars.updateCharacter(null, character => {
      character.pets.find(p => String(p.id) === id).name = name;
    });
    return { status: 1, error: null, result: true };
  },

  'CharacterDAO.deletePet': (args) => {
    const id = String(args && args[2]);
    const changed = chars.updateCharacter(null, c => {
      const i = (c.pets || []).findIndex(p => String(p.id) === id);
      if (i < 0) return false;
      c.deletedPets ||= [];
      c.deletedPets.push({ ...c.pets[i], deletedAt: Date.now() });
      c.pets.splice(i, 1);
    });
    return changed ? { status: 1, error: null, result: true } :
      { status: 0, error: 'Pet not found' };
  },

  'CharacterDAO.upgradePet': (args) => {
    const sourceId = String(args && args[1]);
    const targetId = String(args && args[2]);
    const c = activeCharacter();
    const source = c && (c.pets || []).find(p => String(p.id) === sourceId);
    const sourceData = PET_UPGRADES['pet' + sourceId];
    const targetData = PET_UPGRADES['pet' + targetId];
    const path = sourceData && String(sourceData.path || '').split(',')
      .map(x => x.split(':').map(Number));
    const index = path && path.findIndex(([id]) => id === Number(sourceId));
    if (!source || !targetData || !path || index < 0 || !path[index + 1] ||
        path[index + 1][0] !== Number(targetId) || Number(source.level) < path[index][1] ||
        !chars.petById(targetId)) return { status: 0, error: 'Invalid pet upgrade' };
    const materials = String(targetData.material || '')
      .split(',').filter(Boolean).map(s => s.split(':').map(Number));
    if (materials.some(([id, count]) => (Number((c.materials || {})[id]) || 0) < count))
      return { status: 0, error: 'Missing material' };
    const cost = Number(targetData.token) || 0;
    if (!spendUtilityToken(cost)) return { status: 0, error: 'Insufficient token' };
    const changed = chars.updateCharacter(null, character => {
      const i = character.pets.findIndex(p => String(p.id) === sourceId);
      if (i < 0) return false;
      character.pets[i] = { ...character.pets[i], id: targetId };
      for (const [id, count] of materials) character.materials[id] -= count;
      return character.pets[i];
    });
    return { status: 1, error: null,
      result: chars.petBuyResult(changed.result, ACCOUNT.sessionKey) };
  },

  'PetDAO.addPetMaturityByItem': (args) => {
    const id = String(args && args[1]);
    const item = String(args && args[2]).replace(/^item/, '');
    const gains = { 200:13, 201:12, 202:11, 203:10, 204:30, 1000:50 };
    const changed = chars.updateCharacter(null, c => {
      const pet = (c.pets || []).find(p => String(p.id) === id);
      const bag = Array.isArray(c.essences) ? c.essences : [];
      const i = bag.findIndex(x => String(x) === item);
      if (!pet || !gains[item] || i < 0) return false;
      c.essences.splice(i, 1);
      pet.maturity = Math.min(100, (Number(pet.maturity) || 0) + gains[item]);
      return pet.maturity;
    });
    return changed ? { status: 1, error: null, pet_maturity: changed.result } :
      { status: 0, error: 'Pet food not found' };
  },

  'CharacterDAO.upgradeEmblemType': () => {
    chars.updateCharacter(null, c => {
      c.emblemType = 2; c.emblemXpBonusClaim = true; c.emblemXpBonusTimes = 0;
    });
    return { status: 1, error: null, days_left: 0 };
  },
  'CharacterDAO.downgradeEmblemType': () => {
    chars.updateCharacter(null, c => {
      c.emblemType = 1; c.emblemXpBonusClaim = false; c.emblemXpBonusTimes = 0;
    });
    return { status: 1, error: null, days_left: 0 };
  },
  'CharacterDAO.claimEmblemType2XpBonus': () => {
    chars.updateCharacter(null, c => {
      c.emblemXpBonusClaim = false; c.emblemXpBonusTimes = 30;
    });
    return { status: 1, error: null, result: true };
  },
  'CharacterDAO.claimLevelUp': () => {
    const c = activeCharacter();
    if (!c) return { status: 0, error: 'Character not found' };
    const today = new Date().toISOString().slice(0, 10);
    if (c.premiumClaimLevelDate === today) return { status: 0, error: 'Already claimed' };
    const reward = Number(c.level) >= 80 ? 0 :
      Math.max(0, chars.xpForLevel(Number(c.level) + 1) - (Number(c.xp) || 0));
    chars.updateCharacter(null, character => { character.premiumClaimLevelDate = today; });
    if (reward) chars.addProgress(reward, 0, c.character_id);
    return { status: 1, error: null, xp_reward: reward };
  },
  'CharacterDAO.addTrialEmblemThirdSkillType': (args) => {
    const type = String(args && args[1] || '');
    if (!type) return { status: 0, error: 'Invalid skill type' };
    chars.updateCharacter(null, c => {
      c.trialEmblemSkillTypes ||= [];
      if (!c.trialEmblemSkillTypes.includes(type)) c.trialEmblemSkillTypes.push(type);
    });
    return { status: 1, error: null };
  },
  'CharacterDAO.deleteCharactersOnRemoveTrialEmblem': () => {
    for (const c of chars.allCharacters().filter(x => x.trialEmblem === true && !x.deletedAt)) {
      chars.updateCharacter(c.character_id, character => { character.deletedAt = Date.now(); });
    }
    chars.updateCharacter(null, c => { c.emblemType = 1; });
    return { status: 1, error: null, result: true };
  },

  'CharacterDAO.updateDailyTask': (args) => {
    const id = String(args && args[1]);
    const task = args && args[2];
    if (!task || typeof task !== 'object') return { status: 0, error: 'Invalid daily task' };
    const today = new Date().toISOString().slice(0, 10);
    const changed = chars.updateCharacter(id, c => {
      if (c.dailyTaskClaimDay === today) return false;
      c.dailyTaskDate = today;
      c.dailyTask = { total: Math.max(0, Number(task.total) || 0),
        amount: Math.max(0, Number(task.amount) || 0),
        completeTime: Number(task.completeTime) || 0, type: String(task.type || '') };
    });
    return { status: changed ? 1 : 0, error: changed ? null : 'Character not found' };
  },
  'CharacterService.completeDailyTask': () => {
    const today = new Date().toISOString().slice(0, 10);
    const changed = chars.updateCharacter(null, c => {
      const d = c.dailyTask || {};
      if (c.dailyTaskDate !== today || !d.total || d.amount < d.total || d.claimed ||
          c.dailyTaskClaimDay === today) return false;
      d.claimed = true;
      d.completeTime = Math.floor(Date.now() / 1000);
      c.dailyTask = d;
      c.dailyTaskClaimDay = today;
      c.gold = (Number(c.gold) || 0) + 1000;
    });
    return changed ? { status: 1, error: null, dt_reward: { type: 'gold', amount: 1000 } } :
      { status: 0, error: 'Daily task not complete' };
  },

  'CharacterDAO.requestDeleteCode': (args) => {
    const id = String(args && args[1]);
    const c = chars.characterById(id);
    return c && !c.deletedAt ? { status: 1, error: null, result: true,
      delete_code: 'DELETE' } : { status: 0, error: 'Character not found' };
  },
  'CharacterDAO.deleteCharacter': (args) => {
    const code = String(args && args[1] || '').trim();
    const id = String(args && args[2]);
    if (code !== 'DELETE') return { status: 1, error: 'Use DELETE for local confirmation', msg: 'wrong_code' };
    const changed = chars.updateCharacter(id, c => { c.deletedAt = Date.now(); });
    return changed ? { status: 1, error: null, result: true } :
      { status: 0, error: 'Character not found' };
  },
  'CharacterManagement.recoverCharacter': (args) => {
    const id = String(args && args[1]);
    const changed = chars.updateCharacter(id, c => {
      if (!c.deletedAt) return false;
      delete c.deletedAt;
    }, true);
    return changed ? { status: 1, error: null, result: true } :
      { status: 0, error: 'Character not found' };
  },

  // Dipanggil saat pemain mengklik slot karakter.
  // Responsnya diproses DataParser.parseRawCharacter, yang memakai
  // format MENTAH (baris database) — bukan format databaseCharacter().
  // Lihat rawCharacter() di chardata.js.
  'CharacterDAO.getCharacterById': (args) => {
    // args[1] = id karakter yang dipilih pemain di layar Select Character.
    // Ini WAJIB dipakai: sebelumnya server selalu mengembalikan karakter
    // pertama, sehingga setelah membuat karakter kedua semua progres
    // (xp, gold, misi) tetap tertulis ke karakter lama dan karakter yang
    // sedang dimainkan seolah tidak pernah tersimpan.
    const idDiminta = args && args[1];
    const dipakai = chars.setActiveCharacter(idDiminta);
    const c = dipakai ? chars.characterById(dipakai) : chars.firstCharacter();
    if (!c) return { status: 1, error: null, result: null };
    if (!dipakai && idDiminta != null) {
      log('   !! id karakter ' + idDiminta + ' tidak ada, memakai karakter pertama');
    }
    dailyRewards.getStatus(c.character_id);
    log('   karakter dipilih: ' + c.name + ' lv' + c.level +
        ' (id=' + (chars.getActiveId() || '?') + ')');

    // Batu disimpan sebagai material. Bersihkan salinan lama yang pernah
    // masuk ke inventaris barang agar panel Gear tidak kelebihan kapasitas.
    const dibuang = chars.bersihkanBatuGauntlet(BATU_GAUNTLET);
    if (dibuang) log('   batu gauntlet salah tempat dibersihkan: ' + dibuang + ' entri');

    return { status: 1, error: null,
             result: chars.rawCharacter(chars.characterById(chars.getActiveId()) || c,
                                        args && args[0]) };
  },

  // Pemilihan kelas Special Jounin. args: [sessionKey, nomorKelas]
  //
  // ExamPanel.onAmfSPClassResult() hanya butuh status=1; setelah itu klien
  // sendiri yang menulis kelasnya ke DBCharacterData.CONTROL, memberi skill
  // kelas dari CLASS_SKILL_ARR[spClass-1], plus set1090/set1091 dan skill345.
  // Tapi semua itu hanya di memori — server WAJIB menyimpannya dan
  // mengirimkannya balik lewat character_control (lihat rawCharacter),
  // kalau tidak kelasnya hilang setiap relogin.
  'CharacterDAO.SJClassSelect': (args) => {
    const kelas = args && args[1];
    const hasil = chars.simpanKelasSJ(kelas);
    if (hasil) {
      log('   kelas Special Jounin dipilih: ' + hasil.kelas +
          (hasil.berubah ? ' (sebelumnya ' + hasil.lama + ')' : ' (tidak berubah)'));
    } else {
      log('   !! nomor kelas tidak dikenali: ' + kelas);
    }
    return { status: 1, error: null };
  },

  // Pembelian pet dari Pet Centre.
  // Argumen (dari PetShop.amfBuyItem @73):
  //     [sessionKey, petId, namaPet, bahasa]     mis. ["...", "2", "Chiko", "en"]
  //
  // PetShop.onAmfBuyItemResult TIDAK lewat Main.validateAmfResponse -- yang
  // dibaca cuma response.result, dan hanya kalau result.equipped bernilai
  // true. Lihat komentar di chardata.petBuyResult() untuk rinciannya.
  //
  // Klien selalu MENGAKTIFKAN pet yang baru dibeli (deactivatePet lalu
  // initPet), jadi server mencatat hal yang sama supaya keduanya sepakat
  // setelah muat ulang.
  'CharacterDAO.buyPet': (args) => {
    const id   = String((args && args[1]) != null ? args[1] : '');
    const nama = String((args && args[2]) != null ? args[2] : '');
    if (!id) {
      log('   !! buyPet tanpa id: ' + JSON.stringify(args));
      return { status: 1, error: null, result: null };
    }

    // swfName/clsName dari PET_DATA (petdata.js) -- sumber yang sama dengan
    // yang dipakai klien, jadi grafis dan hash-nya pasti cocok.
    const a = chars.petAsset(id);
    const bisa = chars.petBisaBertarung(id);
    const pet = chars.addPet({
      id, name: nama || a.name, level: 1, xp: 0,
      equipped: true,                 // pet baru selalu jadi pet aktif
    });
    if (!bisa) {
      log('   !! PET_DATA tidak punya blok skill untuk pet ' + id + ' -- pet ini ' +
          'TIDAK BISA bertarung (giliran pet akan membekukan pertarungan). ' +
          'Disimpan sebagai cadangan saja.');
    }

    const bayar = chars.bayarPet(id);
    // equipped hanya true kalau pet-nya memang bisa bertarung; kalau tidak,
    // klien melewati blok initPet dan pet cukup muncul setelah muat ulang.
    const hasil = chars.petBuyResult(pet, ACCOUNT.sessionKey);
    hasil.equipped = !!pet.equipped;

    log('   pet dibeli: id=' + id + ' "' + pet.name + '" swf=' + a.swfName +
        ' cls=' + a.clsName + ' (dipasang sebagai pet aktif)' +
        '  total=' + chars.listPets().length);
    if (bayar) {
      log('   harga: ' + bayar.gold + ' gold + ' + bayar.token + ' token  ->  ' +
          'sisa ' + bayar.sisaGold + ' gold, ' + bayar.sisaToken + ' token');
    }
    log('   hash pet: ' + [hasil.id, hasil.swfName, hasil.clsName,
                           hasil.level, hasil.xp].join(',') + '  -> ' + hasil.hash);

    return { status: 1, error: null, result: hasil };
  },

  // Status misi latihan Sennin, dipanggil MissionPanel_2.getSagaMissionStatus
  // setiap kali panel misi dibuka. args: [sessionKey]
  //
  // Balasan generik {result: []} membuat sageMissionResponse melempar #1010
  // SEBELUM hideAmfLoading(), sehingga layar loading tidak pernah ditutup dan
  // panel misi tampak blank. result WAJIB objek dengan status + array mission
  // -- lihat komentar di chardata.statusMisiSennin().
  'SSTraining.getMissionStatus': () => {
    const aktif = chars.getActiveId();
    const c = (aktif && chars.characterById(aktif)) || chars.firstCharacter();
    const hasil = chars.statusMisiSennin(c || {});
    log('   misi Sennin: status=' + hasil.status +
        (hasil.status === 0 ? ' (terbuka)' : ' (terkunci, rank <= 7)') +
        '  misi=' + hasil.mission.map(m => m.id).join(','));
    return { status: 1, error: null, result: hasil };
  },

  'SSTraining.startSSMission': (args) => {
    const hasil = chars.mulaiMisiSennin(args && args[1]);
    if (hasil.gagal) return { status: 0, error: hasil.gagal };
    log('   mulai misi SS: ' + hasil.id);
    return { status: 1, error: null, result: { mission_id: hasil.id } };
  },

  'SSTraining.refreshMission': () => {
    const hasil = chars.segarkanMisiSennin();
    if (hasil.gagal) return { status: 0, error: hasil.gagal };
    log('   daftar misi SS disegarkan: ' + hasil.result.mission.map(m => m.id).join(','));
    return { status: 1, error: null, result: hasil.result };
  },

  'Lvl80Exam.markRewardListRead': () => {
    const hasil = chars.tandaiHadiahLv80Dibaca();
    if (!hasil) return { status: 0, error: 'Karakter aktif tidak ditemukan.' };
    log('   daftar hadiah Lv80 ditandai dibaca' + (hasil.sudah ? ' (sudah tersimpan)' : ''));
    return { status: 1, error: null, result: 1 };
  },

  // Mengaktifkan pet dari panel Pets. args: [sessionKey, petId]
  // Klien sudah menukar pet aktifnya sendiri; ini yang membuat pilihannya
  // bertahan setelah muat ulang.
  'CharacterDAO.activatePet': (args) => {
    const id = (args && args[1]) != null ? String(args[1]) : null;
    const hasil = chars.setPetEquipped(id);
    if (hasil && hasil.ditolak) {
      log('   !! aktivasi pet ' + id + ' ditolak: tidak ada data skill di PET_DATA');
      return { status: 0, error: 'pet has no skill data' };
    }
    if (hasil && hasil.ketemu) log('   pet aktif -> id=' + hasil.id);
    else log('   pet dilepas (tidak ada yang aktif), id diminta=' + id);
    return { status: 1, error: null, result: 0 };
  },

  // Menonaktifkan pet aktif. args: [sessionKey]
  'CharacterDAO.deactivatePet': () => {
    chars.setPetEquipped(null);
    log('   semua pet dinonaktifkan');
    return { status: 1, error: null, result: 0 };
  },

  // Melatih skill pet dari panel Pets.
  // args: [sessionKey, petId, indeksSkill, mataUang]   mis. ["...", 13, 0, "token"]
  //
  // MapMenu.trainPetSkillResult meneruskan response.result ke
  // Pet.setupAvailableSkills -> PetBase.setupAvailableSkills, yang di @97-102
  // membaca `skills.length`. Kalau result bukan Array, koersi `as Array`
  // menghasilkan null -> #1009 dan panel membeku. Jadi result WAJIB berupa
  // ARRAY indeks skill, bukan angka.
  'CharacterDAO.trainPetSkill': (args) => {
    const petId = (args && args[1]) != null ? String(args[1]) : '';
    const index = (args && args[2]) != null ? Number(args[2]) : 0;
    const mata  = (args && args[3]) != null ? String(args[3]) : 'gold';

    const hasil = chars.latihSkillPet(petId, index, mata);
    if (!hasil) {
      log('   !! trainPetSkill: pet ' + petId + ' tidak ada di koleksi');
      // Tetap kirim ARRAY supaya klien tidak melempar #1009.
      return { status: 1, error: null, result: [] };
    }
    if (hasil.ditolak) {
      log('   !! trainPetSkill ditolak: ' + hasil.ditolak);
      return { status: 1, error: null, result: hasil.skills };
    }

    log('   latih skill pet ' + petId + ' indeks ' + index +
        ' (butuh level ' + hasil.levelMin + ', bayar ' +
        hasil.biaya.gold + ' gold + ' + hasil.biaya.token + ' token)' +
        '  ->  skills=[' + hasil.skills.join(',') + ']' +
        '  sisa ' + hasil.sisaGold + ' gold, ' + hasil.sisaToken + ' token');

    return { status: 1, error: null, result: hasil.skills };
  },

  // Status klan, dipanggil MapMenu sebelum memuat clan_panel.swf.
  // args: [sessionKey]. Balasan generik tidak memicu error, tapi handler ini
  // membuat tombol Clan menampilkan keadaan yang benar.
  // Graduasi Sennin / Lv80 exam. args: [sessionKey]
  //
  // Dipanggil SenninExamPanel.amfClaimReward(). Callback-nya
  // confirmClaimReward() membaca satu field:
  //
  //     rewardStatus = int(response.character_reward);
  //     ... rewardList[rewardStatus - 1].length ...     <- #1010 kalau 0
  //
  // Jadi character_reward WAJIB 1, 2, atau 3 -- JANGAN 0/null/undefined.
  // Kalau memang mau menolak klaim, balas status 0 + error terisi; klien
  // berhenti di validateAmfResponse sebelum menyentuh rewardList.
  //
  // Tier ditentukan dari riwayat misi: EXAM_SENNIN (hard) -> 3 (rank 9),
  // EXAM_SENNIN_EASY -> 2 (rank 8), selain itu 1.
  'CharacterDAO.NTClassSelect': () => {
    const hasil = chars.graduasiSennin();
    if (hasil) {
      log('   graduasi Sennin: tier=' + hasil.tier +
          ' rank=' + hasil.rankLama + '->' + hasil.rank +
          ' gender=' + hasil.gender +
          ' barang=' + hasil.barang.join(','));
      return { status: 1, error: null, character_reward: hasil.tier };
    }
    // Karakter tidak ketemu: tetap kirim tier valid supaya panel tidak crash.
    log('   !! graduasi Sennin: karakter aktif tidak ditemukan, kirim tier 1');
    return { status: 1, error: null, character_reward: 1 };
  },

  // Notice ujian Special Jounin sudah dilihat. args: [sessionKey]
  //
  // Dikirim Main.SJENoticeOk saat tombol OK di popup ditekan.
  // Main.onSJENoticeResult @19-26 hanya menaikkan Central.main.sje_notice di
  // MEMORI, jadi tanpa handler ini notice-nya kembali setiap kali halaman
  // dimuat ulang -- Main.updateMapSideBtn membacanya dari
  // sje_end_date_notice yang dikirim server.
  'CharacterDAO.watchSJENotice': () => {
    const hasil = chars.tandaiSJENotice();
    if (hasil) {
      log(hasil.sudah
        ? '   notice SJE: sudah ditandai sebelumnya'
        : '   notice SJE ditandai sudah dilihat -- tidak muncul lagi setelah reload');
    }
    return { status: 1, error: null, result: 0 };
  },

  // Status klan, dipanggil MapBase.onClickClan sebelum panel dibuka.
  // args: [sessionKey]
  //
  // MapBase.getClanStatus (map_1.swf, method 283):
  //
  //     Central.main.hideAmfLoading();
  //     Central.main.ClanStatus = res.clan_status;        // @17  TINGKAT ATAS
  //     if (res.result.account_locked) {                  // @24-30
  //         Central.main.showOk(res.result.lock_message, new Function());
  //         return;                                       // panel TIDAK dibuka
  //     }
  //     this.onShowClan();                                // @57 -> panel.show("clan_panel")
  //
  // Dua hal yang gampang salah:
  //  1. `clan_status` dibaca di TINGKAT ATAS response, bukan di dalam result.
  //  2. `result` harus OBJEK. Kalau berupa angka, res.result.account_locked
  //     melempar #1069 (Number kelas tertutup, tidak punya properti itu).
  //     Pada Object dinamis, properti tak dikenal cuma jadi undefined.
  //
  // account_locked falsy -> onShowClan() dipanggil dan clan_panel dibuka.
  'ClanService.getClanStatus': () => {
    const punya = !!chars.klanAktif();
    log('   status klan: akun tidak dikunci, panel dibuka' +
        (punya ? ' (sudah punya klan)' : ' (belum punya klan)'));
    return {
      status: 1,
      error: null,
      clan_status: punya ? 1 : 0,
      result: {
        account_locked: 0,     // truthy = akun dikunci, panel tidak dibuka
        lock_message: '',
      },
    };
  },

  // Data klan untuk ClanPanel. args: [sessionKey]
  //
  // ClanPanel.getClanResponse (clan_panel.swf, method 1153):
  //
  //     if (!validateAmfResponse(res)) return;
  //     if (res.getclan_key != null) clanGetKey = String(res.getclan_key);
  //     Server_Time = res.server_time;
  //     st = int(res.result as int);                       // @64-72
  //     clanDate = res.clan_lang[ lang == ZH ? 0 : 1 ];    // @87-114  <-- #1010
  //     switch (st) {
  //       case 0: gotoAndPlay(NO_CLAN_TL); break;          // belum punya klan
  //       case 1:
  //       case 3: Clan.clanData    = res.clan_data;
  //               Clan.buildingData = res.building_data;
  //               gotoBase(); break;
  //       case 2: showOk(res.message, hide); break;
  //     }
  //     remainingTime = res.remaining_time;
  //     bonusBoardReputationArr = [res.today_reputation,
  //                                res.target_reputation,
  //                                res.extra_reputation];
  //     showBonusBoard = res.daily_reputation_show;
  //
  // `clan_lang` dibaca DI LUAR switch, jadi WAJIB ada berapa pun nilai result,
  // dan harus array dengan minimal 2 elemen (indeks 0 untuk bahasa ZH, 1 untuk
  // selainnya). Tanpa itu res.clan_lang[1] -> #1010, callback berhenti sebelum
  // gotoAndPlay, dan panel tidak pernah digambar -- itulah layar putihnya.
  //
  // result 0 = belum punya klan; panel membuka layar buat/cari klan.
  'ClanService.getClan': () => {
    const now = Math.floor(Date.now() / 1000);
    const clan = chars.klanAktif();

    // result: 0 = belum punya klan (panel ke layar buat/cari),
    //         1 = punya klan (panel ke gotoBase -> updateClanStatus),
    //         2 = tampilkan pesan.
    // clan_data WAJIB objek berisi field ClanData saat result 1 --
    // updateClanStatus membacanya tanpa penjagaan null.
    const dasar = {
      status: 1,
      error: null,
      getclan_key: null,
      server_time: now,
      clan_lang: ['', ''],          // [ZH, selain ZH] -> lbl_date
      remaining_time: 0,
      today_reputation: 0,
      target_reputation: 0,
      extra_reputation: 0,
      daily_reputation_show: false,
      stamina_item: 0,
      group_id: null,
      message: '',
    };

    if (!clan) {
      log('   data klan: result=0 (belum punya klan)');
      return Object.assign(dasar, { result: 0, clan_data: {}, building_data: [] });
    }
    const jumlahAnggota = 1 + localFriends.friends.length;
    log('   data klan: result=1 "' + clan.name + '" anggota ' +
        jumlahAnggota + '/' + clan.member_slots);
    // building_data null aman -- Clan.getAttackerBonus mengembalikan 0.
    // getClanResponse @164-171: Clan.buildingData = res.building_data as Array.
    // Entri {id, level} dipakai Clan.getBuildingBonus (code_library method
    // 1229) untuk menghitung bonus stamina/HP/CP/damage.
    const bangunan = chars.daftarBangunan();
    if (bangunan.length) {
      log('   bangunan klan: ' +
          bangunan.map(b => chars.BUILDING_DATA[b.id].name + ' Lv' + b.level).join(', '));
    }
    return Object.assign(dasar, { result: 1, clan_data: { ...clan, member_number: jumlahAnggota }, building_data: bangunan });
  },

  // Sinkronisasi sisa waktu musim klan. args: [sessionKey]
  //
  // ClanPanel.updateSeasonTimer (method 1339) @98-128 mengurangi intervalTime
  // 15 tiap tick; begitu <= 0 ia memanggil syncRemainingTime (method 1342),
  // yang memanggil AMF ini. Callback-nya syncRemainingTimeResponse (1343)
  // @26-54 hanya membaca satu field:
  //     remainingTime = res.remaining_time;
  //     lastSyncTime  = new Date().time / 1000;
  // Tidak ada koersi berbahaya, jadi balasan generik pun tidak crash --
  // handler ini ada supaya nilainya konsisten dengan getClan dan log tidak
  // penuh "handler BELUM ADA".
  'ClanService.getRemainingTime': () => {
    return { status: 1, error: null, remaining_time: 0 };
  },

  // Penyerahan hasil misi latihan Sennin (grade S / SS training).
  // args: [sessionKey, idMisi, itemDipakai, gagal(0|1), hash]
  //        mis. [..., "msn280", [], 0, ...]
  //
  // Mission.completeMission @3306 memasang callback ANONIM (code_library
  // method 844) sebagai penerima balasan:
  //
  //      0: getlocal1                     res
  //      1: getproperty update_inventory  <-- TANPA penjagaan
  //      4: pushfalse
  //      5: setproperty showPopup         <-- #1010 kalau update_inventory tidak ada
  //     15: validateAmfResponse(res)
  //     36: getproperty SENJUTSU_SS
  //     64: pushbyte 30
  //     67: updateData(SENJUTSU_SS, int(...) + 30)
  //
  // Beda dengan Mission.getSGradeResponse yang @6 punya
  // `if (res.update_inventory)`, di sini baris PERTAMA langsung menulis ke
  // properti objek yang tidak ada. Jadi update_inventory wajib berupa objek;
  // isinya boleh apa saja, klien menyetel showPopup sendiri.
  //
  // args[3]: 0 dari completeMission, 1 dari failMission.
  'SSTraining.finishSSMission': (args) => {
    const idMisi = (args && args[1]) ? String(args[1]) : '';
    const gagal = Number(args && args[3]) === 1;
    const hasil = chars.selesaikanMisiSennin(idMisi, gagal);
    if (hasil.gagal) return { status: 0, error: hasil.gagal };
    if (hasil.diabaikan) {
      log('   hasil misi SS diabaikan karena tidak ada sesi aktif: ' + idMisi);
    } else {
      log('   misi SS ' + (gagal ? 'gagal' : 'selesai') + ': ' + idMisi +
          '  SS=' + hasil.ssLama + ' -> ' + hasil.ssBaru);
    }
    const c = chars.characterById(chars.getActiveId());
    return {
      status: 1, error: null, result: 0,
      update_inventory: {
        showPopup: false,
        xp: c ? c.xp : 0,
        gold: c ? c.gold : 0,
        token: c ? (c.token || 0) : 0,
      },
    };
  },

  // --- Senjutsu / Sage Mode (SenjutsuService) --------------------

  // Mempelajari sistem senjutsu di Sage Shop.
  // args (SagaShop2015.onClickLearn @95-106):
  //     [sessionKey, skillID, sequence, hash(sessionKey + skillID)]
  //
  // SagaShop2015.amfClientLearnSageModeResponse (method 666):
  //      8: if (!validateAmfResponse(res)) return;
  //     22: Central.main.senjutsuSystem = res.senjutsu_system_id;   <-- WAJIB
  //     50: setGold(getGold() - 2000000);   klien memotong 2 juta gold sendiri
  //     65: if (senjutsuSystem == 2) isToad = true; else isSnake = true;
  //    125: panel.show("Panel_2015_Sage_Profile");
  //
  // Tanpa senjutsu_system_id, senjutsuSystem jadi undefined: pilihan Toad
  // selalu jatuh ke cabang Snake dan tidak ada yang tersimpan.
  'SenjutsuService.discoverSenjutsu': (args) => {
    const skillID = (args && args[1] != null) ? String(args[1]) : '';
    const h = chars.pelajariSenjutsu(skillID);

    if (!h || h.gagal) {
      log('   !! pelajari senjutsu ditolak: ' + ((h && h.gagal) || 'karakter tidak ada'));
      // Tetap kirim senjutsu_system_id yang tersimpan (kalau ada) supaya
      // tampilan panel tidak jadi undefined.
      return {
        status: 1, error: null,
        senjutsu_system_id: (h && h.sistem) || 0,
      };
    }

    log('   senjutsu dipelajari: skillID=' + h.skillId +
        ' sistem=' + h.sistem + ' (' + (h.sistem === 2 ? 'Toad' : 'Snake') + ')' +
        '  biaya ' + h.biaya + ' gold, sisa ' + h.sisaGold);

    return {
      status: 1,
      error: null,
      senjutsu_system_id: h.sistem,
    };
  },

  // Konversi token menjadi poin Senjutsu (SS).
  // args (SagaProfile2015.buyConfirm @119-129):
  //     [sessionKey, jumlahToken, sequence, hash(sessionKey+accountId+charId+jumlah)]
  //     mis. [..., "400", ...] -> paket keempat, 400 token = 250 SS
  //
  // convertResponse (method 750) @31-34:
  //     updateData(SENJUTSU_SS, res.final_sen_spirit)
  // lalu @55 loadPanelContent() memasang nilai itu ke TextField. Kalau
  // final_sen_spirit tidak ada, SENJUTSU_SS jadi undefined dan
  // TextField.text menolaknya -> #2007 Parameter text must be non-null.
  //
  // Klien memotong tokennya sendiri di @42 (balance - currBtnNum), jadi
  // server memotong jumlah yang sama supaya keduanya tetap sepakat.
  'SenjutsuService.convertSS': (args) => {
    const jumlah = (args && args[1] != null) ? args[1] : 0;
    const h = chars.konversiSS(jumlah);
    if (!h || h.gagal) {
      log('   !! konversi SS ditolak: ' + ((h && h.gagal) || 'karakter tidak ada'));
      // Tetap kirim angka supaya TextField tidak menerima null.
      const c = chars.characterById(chars.getActiveId());
      return { status: 1, error: null,
               final_sen_spirit: Number(c && c.senjutsuSS) || 0 };
    }
    log('   konversi SS: ' + h.bayar + ' token -> +' + h.dapat + ' SS' +
        '  (total ' + h.totalSS + ' SS, sisa ' + h.sisaToken + ' token)');
    return { status: 1, error: null, final_sen_spirit: h.totalSS };
  },

  // Naikkan level skill senjutsu.
  // args (onClickUpGrade @152-162): [sessionKey, skillId, sequence, hash]
  //
  // upgradeResponse (method 747) tidak membaca satu pun field dari balasan --
  // level baru dan pengurangan SS dihitung klien sendiri (@99-140). Handler
  // ini hanya menyimpan hasilnya supaya bertahan setelah muat ulang.
  'SenjutsuService.skillUpdate': (args) => {
    const skillId = (args && args[1] != null) ? String(args[1]) : '';
    const h = chars.naikkanSkillSenjutsu(skillId);
    if (!h || h.gagal) {
      log('   !! upgrade skill senjutsu ditolak: ' + ((h && h.gagal) || 'karakter tidak ada'));
      return { status: 1, error: null, result: 0 };
    }
    log('   skill senjutsu ' + h.skillId + ' -> Lv' + h.level);
    return { status: 1, error: null, result: 0 };
  },

  'SenjutsuService.skillUpdateMax': (args) => {
    const skillId = (args && args[1] != null) ? String(args[1]) : '';
    const result = chars.maksimalkanSkillSenjutsu(skillId);
    if (!result || result.gagal) {
      log('   !! Upgrade Max Sage ditolak: ' + ((result && result.gagal) || 'karakter tidak ada'));
      return { status: 1, error: null, upgraded: false,
               message: (result && result.gagal) || 'Upgrade Max gagal.' };
    }
    log('   Upgrade Max Sage: skill ' + result.skillId + ' -> Lv10, biaya ' + result.cost + ' SS');
    return { status: 1, error: null, upgraded: true,
             senjutsu_level: result.level, final_sen_spirit: result.sisaSS };
  },

  // --- Bloodline / Talent (BloodlineService) ---------------------

  // Membuka satu bloodline di Bloodline Shop.
  // args (BloodlineShop.ConfirmDiscover @114-123):
  //     [sessionKey, bloodlineId, sequence, hash(sessionKey + bloodlineId)]
  //
  // BloodlineShop.BloodlineDiscoverResponse (method 649) tidak membaca satu
  // pun field balasan: @59 hanya validateAmfResponse, lalu harga dipotong dari
  // selectObj di klien (@215-245 token, @495-548 gold) dan saveTP(20) @800.
  // Kalau validate gagal, @1186 menampilkan "TEST cannot discover".
  'BloodlineService.discoverBloodline': (args) => {
    const id = (args && args[1] != null) ? String(args[1]) : '';
    const h = chars.bukaBloodline(id);
    if (!h || h.gagal) {
      log('   !! buka bloodline ditolak: ' + ((h && h.gagal) || 'karakter tidak ada'));
      // status 1 tetap, supaya klien tidak menampilkan "cannot discover"
      // hanya karena bloodline itu sudah dimiliki.
      return { status: 1, error: null, result: 0 };
    }
    log('   bloodline dibuka: id=' + h.bloodlineId + ' (total ' + h.total + ')');
    return { status: 1, error: null, result: 0 };
  },

  // Konversi token menjadi poin bloodline (BP).
  // args (BloodlineProfile.ConfirmConvert):
  //     [sessionKey, idxPaket, idxPaket, jumlahToken, sequence, hash]
  //     mis. [..., "1", "1", "400", ...]
  //
  // convertResponse (method 720) tidak membaca field balasan -- @55-86
  // menambah BLOODLINE sebanyak BPPackage dan @90-108 mengurangi
  // Account.balance sebanyak tokenPackage, keduanya nilai klien. Server
  // memakai tabel yang sama supaya keduanya sepakat setelah muat ulang.
  'BloodlineService.convertBP': (args) => {
    const jumlah = (args && args[3] != null) ? args[3] : 0;
    const h = chars.konversiBP(jumlah);
    if (!h || h.gagal) {
      log('   !! konversi BP ditolak: ' + ((h && h.gagal) || 'karakter tidak ada'));
      return { status: 1, error: null, result: 0, remain_bp: chars.bloodlinePoin() };
    }
    log('   konversi BP: ' + h.bayar + ' token -> +' + h.dapat + ' BP' +
        '  (total ' + h.totalBP + ' BP, sisa ' + h.sisaToken + ' token)');
    return { status: 1, error: null, result: 0, remain_bp: h.totalBP };
  },

  // Naikkan level skill bloodline.
  // args (BloodlineProfile.ConfirmUpgrade):
  //     [sessionKey, characterId, bloodlineId, skillId, levelTujuan,
  //      sequence, hash]. Level tujuan ada di args[4].
  //
  // upgradeResponse (method 723) @544-572:
  //     updateData(BLOODLINE, int(res.remain_bp));
  // SATU-SATUNYA field yang dibaca. Tanpa itu int(undefined) = 0 dan poin
  // bloodline pemain jadi nol setiap kali menaikkan skill.
  'BloodlineService.skillUpdate': (args) => {
    const skillId = (args && args[3] != null) ? String(args[3]) : '';
    const tujuan  = (args && args[4] != null) ? Number(args[4]) : NaN;

    const h = chars.naikkanSkillBloodline(skillId, tujuan);
    if (!h || h.gagal) {
      const alasan = (h && h.gagal) || 'karakter tidak ada';
      log('   !! upgrade skill bloodline ditolak: ' + alasan);
      return { status: 0, error: alasan, remain_bp: chars.bloodlinePoin() };
    }
    log('   skill bloodline ' + h.skillId + ' -> Lv' + h.level +
        ' (biaya ' + h.biayaBP + ' TP, sisa ' + h.sisaBP + ')');
    return { status: 1, error: null, remain_bp: h.sisaBP };
  },

  // --- Arena / PvP (SystemData) ----------------------------------

  // Inisialisasi server PvP. args: [sessionKey, bahasa]
  //
  // ArenaPanel2.setPvpServer (arena.swf, method 1157):
  //     11: Out.debug("setPvpServer", "#1")
  //     24: result.pvpstatus.status        <-- #1010 kalau pvpstatus tidak ada
  //     48: if (result == null || status == null || status == false) {
  //             Central.main.pvpstatus = result.pvpstatus;
  //             Central.main.checkPVPinvite();
  //             this.hide();                  <-- panel DITUTUP dengan rapi
  //             return;
  //         }
  //     ... selain itu lanjut ke:
  //     190: socket.stx(result.handoff_token)
  //     207: socket.stn(result.handoff_nonce)
  //     240: Main.pvpTimeList = result.time_list
  //     261: result.pvpstatus.mode[0..2]  -> 1v1 / 2v2 / 3v3
  //     568: socket.setUpServer(result.pvp_server, charId, startConnectPVPServer)
  //     614: result.ads, 635: result.pvp_layout,
  //     661: result.daily_first_bonus, 754: result.choose_room_message
  //
  // Balasan generik membuat result berupa Array kosong; result.pvpstatus
  // undefined lalu .status melempar #1010 -- callback berhenti sebelum
  // hideAmfLoading, jadi Arena "loading terus".
  //
  // KENAPA status: false
  // Ninja Saga menjalankan Arena lewat XMLSocket, bukan AMF. Alamat servernya
  // di-hardcode di code_library (xmlsocket://8.19.33.107:843 dan seterusnya)
  // dan server ini hanya melayani AMF di port 8080. Kalau status diisi true,
  // klien akan meneruskan ke socket.setUpServer() lalu menggantung di
  // connectTimeoutTimer -- loading yang sama, hanya lebih lama.
  //
  // Dengan status false, Main.checkPVPinvite (code_library method 160)
  // @57-133 mengambil pvpstatus["status_" + AppData.lang] (jatuh ke
  // status_en kalau kosong) dan menampilkannya lewat showGeneralNotice.
  // Jadi pemain dapat pesan yang jelas, bukan layar menggantung.
  'SystemData.getPvpServerInit': (args) => {
    const lang = (args && args[1]) ? String(args[1]) : 'en';
    log('   PvP init: status=false (Arena butuh server socket, tidak tersedia)');
    return {
      status: 1,
      error: null,
      result: {
        pvpstatus: {
          status: false,
          status_en: 'Arena is not available on this server.',
          ['status_' + lang]: 'Arena is not available on this server.',
        },
      },
    };
  },

  // --- Kartu gosok harian (RouletteService) ----------------------

  // Data awal panel kartu gosok. args: [sessionKey]
  //
  // daily_login4.show (daily_login_4.swf, method 786):
  //     Central.main.showAmfLoading();
  //     amfClient.service("RouletteService.getScratchCardData",
  //                       [session_key], getEventResponse);
  //
  // getEventResponse (method 787):
  //      8: if (!validateAmfResponse(res)) return;      <-- kalau gagal, BERHENTI
  //     30: remainScratchTime = res.dailyRoulette_remainTime;
  //     37: if (res.bouns_discount) scratchTokenPrice = 3;
  //     67: Central.main.hideAmfLoading();
  //     77: this.gotoAndPlay(Timeline.SHOW);
  //
  // hideAmfLoading DAN gotoAndPlay(SHOW) dua-duanya ada DI DALAM cabang
  // validateAmfResponse. Jadi kalau balasannya tidak lolos, layar loading
  // tidak pernah ditutup dan panel tidak pernah pindah ke frame isinya --
  // yang terlihat: panel putih kosong.
  'RouletteService.getScratchCardData': () => {
    log('   data kartu gosok dikirim');
    return {
      status: 1,
      error: null,
      // JUMLAH gosokan gratis yang tersisa -- bukan hitungan waktu.
      // updateIdlePanel @236-258:
      //     if (remainScratchTime != 0 || remainSpcScratchTime != 0) {
      //         scratchType = "free";
      //         scratch1/2/3.gotoAndStop("button");
      //         initButton(scratchBtn, checkScratch);     <-- tombol AKTIF
      //     }
      // Nilai 0 membuat ketiga tombol tetap disabled dan panel tampak kosong.
      dailyRoulette_remainTime: chars.scratchRemaining(
        chars.characterById(chars.getActiveId())),
      bouns_discount: false,         // true -> harga gosok jadi 3 token
    };
  },

  // Penambahan kartu gosok acak setelah menyelesaikan misi. args: [sessionKey]
  // Dipanggil dari Character.updateCharacterResponse @175 dengan callback
  // ScratchAddAmfGetResult. Balasan sederhana sudah cukup.
  'RouletteService.randomAddScatchCard': () => {
    return { status: 1, error: null, result: 0, add_card: 0 };
  },

  // Menggosok satu kartu.
  // args: [sessionKey, scratchType, selectScratch, ...]
  //       scratchType "token" = beli pakai token, selain itu kartu gratis
  //
  // daily_login4.ScratchAmfGetResult (method 811):
  //     157: if (!validateAmfResponse(res)) return;
  //     173: reward_type   = res.reward_type
  //     185: reward_amount = res.reward_amount
  //     199: if (res.signature != Main.getHash(String(reward_type) +
  //                                            String(reward_amount)))
  //              onError("1216"); return;          <-- TANDA TANGAN DIPERIKSA
  //     343: startScratch(res)
  //
  // startScratch @1669-1899 mencocokkan reward_type dengan daftar:
  //     GOLD, XP%, XP, TOKEN, TP, SP, ITEM, WEAPON, BACK, SKILL,
  //     CLOTH, EMBLEM, PET, PACKAGE
  // Nilai di luar daftar itu jatuh ke default dan tidak menampilkan apa pun.
  // Panel daily_login_3 memanggil scratchCard; panel lain memakai nama After20.
  'RouletteService.scratchCard': (args) => {
    const paidWithToken = args && args[1] === 'token';
    if (paidWithToken && ACCOUNT.balance < 5) {
      return { status: 0, error: 'Not enough tokens' };
    }
    const c = chars.characterById(chars.getActiveId());
    const reward = scratchRewards.choose(c);
    const accountBefore = ACCOUNT.balance;
    const characterBefore = c ? { xp: c.xp, gold: c.gold } : { xp: 0, gold: 0 };
    const saved = c ? chars.applyScratchReward(c.id, reward, paidWithToken) : null;
    if (saved && saved.denied) {
      return { status: 0, error: 'No free scratch cards remaining' };
    }
    if (saved) ACCOUNT.balance = Math.max(0, ACCOUNT.balance + saved.accountDelta);
    const signature = sha1(String(reward.reward_type) + String(reward.reward_amount) +
                           SALT + ACCOUNT.sessionKey);
    log('   kartu gosok: ' + reward.reward_type + ' ' + reward.reward_amount +
        ' (tipe: ' + (paidWithToken ? 'token' : 'free') +
        ', sisa gratis: ' + (saved ? saved.remaining : '-') + ')');
    // validateAmfResponse memasang saldo awal sebelum animasi hadiah
    // menambahkan reward_amount pada karakter/akun di sisi Flash.
    return {
      status: 1, error: null,
      reward_type: reward.reward_type,
      reward_amount: reward.reward_amount,
      signature,
      update_inventory: {
        showPopup: false,
        xp: characterBefore.xp,
        gold: characterBefore.gold,
        token: Math.max(0, accountBefore - (paidWithToken ? 5 : 0)),
      },
    };
  },

  // Nama ini dipakai versi panel kartu gosok yang lebih baru.
  'RouletteService.scratchCardAtfer20Level': (args) =>
    handlers['RouletteService.scratchCard'](args),

  // --- Misi Lv80 (SLevelMission) --------------------------------
  'SLevelMission.getChapterStatus': () => {
    const state = chars.statusMisiSLevel();
    return state ? { status: 1, error: null, result: state } :
      { status: 0, error: 'Karakter aktif tidak ditemukan.' };
  },

  'SLevelMission.getBattleStatus': () => {
    const state = chars.statusMisiSLevel();
    return state ? {
      status: 1, error: null,
      result: { chapter_status: state.chapter_status, mission_status: state.mission_status },
      remain_energy: state.remain_energy,
      energy_refill_remain: state.energy_refill_remain,
    } : { status: 0, error: 'Karakter aktif tidak ditemukan.' };
  },

  'SLevelMission.startMission': (args) => {
    const result = chars.mulaiMisiSLevel(args && args[1]);
    if (result.gagal) return { status: 0, error: result.gagal };
    log('   misi Lv80 dimulai: ' + result.id + '  energi=' +
      (result.energy == null ? 'tetap' : result.energy));
    return { status: 1, error: null, result: 0, slf: String(++battleSeq) };
  },

  'SLevelMission.buyBigRamen': (args) => {
    const result = chars.beliRamenSLevel(args && args[1], ACCOUNT.balance);
    if (result.gagal) return { status: 0, error: result.gagal };
    ACCOUNT.balance -= result.cost;
    log('   Big Ramen x' + result.count + ' dibeli: -' + result.cost +
      ' token, saldo=' + ACCOUNT.balance);
    return { status: 1, error: null, result: 0,
      update_inventory: { add_item_id: ['item900_' + result.count],
        showPopup: false, token: ACCOUNT.balance } };
  },

  'SLevelMission.useRamen': (args) => {
    const result = chars.pakaiRamenSLevel(args && args[1]);
    if (result.gagal) return { status: 0, error: result.gagal };
    log('   ramen Lv80 dipakai: ' + result.item + '  energi=' + result.energy);
    return { status: 1, error: null, result: 0,
      update_inventory: { remove_item_id: [result.item + '_1'], showPopup: false } };
  },

  // Klien membaca tiga entri pertama add_item_id sebagai [barang, XP, gold].
  'SLevelMission.finishMission': (args) => {
    const id = args && args[1];
    const result = chars.selesaikanMisiSLevel(id, Number(args && args[4]) === 1);
    if (result.gagal) return { status: 0, error: result.gagal };
    if (result.diabaikan) {
      log('   hasil misi Lv80 diabaikan (tidak ada misi aktif): ' + id);
      return { status: 1, error: null, result: 1, reward_list: [],
        update_inventory: { add_item_id: ['item1'], remove_item_id: ['item1_1'],
          showPopup: false } };
    }
    log('   misi Lv80 ' + (result.failed ? 'gagal' : 'selesai') + ': ' + id +
      '  success=' + result.entry.success + ' fail=' + result.entry.fail);
    const reward = result.failed ? [] : [
      'item900', 'xp' + result.mission[3] + '_1', 'gold' + result.mission[4] + '_1',
    ];
    return { status: 1, error: null, result: 0,
      reward_list: result.failed ? [] : ['item900'],
      update_inventory: { add_item_id: reward, showPopup: false,
        ...(result.failed ? {} : { xp: result.xp, gold: result.gold }) } };
  },

  // Upgrade batas stamina klan. args: [sessionKey]
  //
  // UpgradeStaminaResponse (method 1336) @142-150 membaca res.max_stamina dan
  // memakainya untuk CHARACTER_STAMINA sekaligus CHARACTER_MAX_STAMINA.
  // Tanpa field itu int(undefined) = 0 -> stamina jadi 0/0.
  // result 9 = gagal (klien menampilkan langLib 501).
  'ClanService.upgradeStamina': () => {
    const h = chars.upgradeStaminaKlan();
    if (!h || h.gagal) {
      log('   !! upgrade stamina ditolak: ' + ((h && h.gagal) || 'karakter tidak ada'));
      return { status: 1, error: null, result: 9 };
    }
    log('   stamina klan -> ' + h.maxStamina +
        ' (biaya ' + h.biayaToken + ' token, sisa ' + h.sisaToken + ')');
    return { status: 1, error: null, result: 0, max_stamina: h.maxStamina };
  },

  // Isi ulang stamina klan. args: [sessionKey]
  // RestoreStaminaResponse (method 1333) @232-289 memakai konstanta klien
  // (Restore_Sta_Amt 50, Restore_Sta_requiretoken 20); server menyamakan.
  // show_captcha JANGAN diisi -- @60-64 akan membuka webview captcha.
  'ClanService.restoreStamina': () => {
    const h = chars.restoreStaminaKlan();
    if (!h || h.gagal) {
      log('   !! isi ulang stamina ditolak: ' + ((h && h.gagal) || 'karakter tidak ada'));
      return { status: 1, error: null, result: 9 };
    }
    log('   stamina klan diisi -> ' + h.stamina + '/' + h.maks +
        ' (sisa token ' + h.sisaToken + ')');
    return { status: 1, error: null, result: 0 };
  },

  // Tambah slot anggota klan. args: [sessionKey]
  //
  // buyMemberSlotResponse (method 1212) @37-113:
  //     slot = int(res.member_slots);
  //     clanData[MEMBER_SLOTS] = slot;
  //     clanData[TOKEN] -= slot * 10;      <-- token KLAN, slot BARU x 10
  // Tanpa member_slots, slot jadi 0 dan panel menampilkan "0".
  'ClanManagement.buyMemberSlot': () => {
    const h = chars.tambahSlotAnggota();
    if (!h || h.gagal) {
      log('   !! tambah slot ditolak: ' + ((h && h.gagal) || 'karakter tidak ada'));
      return { status: 1, error: null, result: 9 };
    }
    log('   slot anggota -> ' + h.memberSlots +
        ' (biaya ' + h.biaya + ' token klan, kas ' + h.kasToken + ')');
    return { status: 1, error: null, member_slots: h.memberSlots };
  },

  // Riwayat klan. args: [sessionKey, hash, halaman]
  //
  // loadClanHistoryResponse (method 1214) @51-135: int(res.result) dipakai
  // sebagai penanda; kalau 0 klien memakai clan_history sebagai Array.
  // Array kosong aman -- klien menyiapkan entri "tidak ada riwayat" sendiri.
  'ClanService.getHistory': () => {
    return { status: 1, error: null, result: 0, clan_history: [] };
  },

  // Bangun / upgrade bangunan klan.
  // args: [sessionKey, hash, idBangunan]   mis. ["...", "b1e984fb…", 1]
  //
  // ClanPanel.constructBuildingResponse (method 1151):
  //     @52-73  if (res.result) { if (int(res.result) == 9) { showOk(501); return; } }
  //     @107    b = res.building_data as Object;          <-- WAJIB objek
  //     @184    ... selectedBuilding.gold[ b.level - 1 ]  <-- b null -> #1009
  //     @264+   masukkan/perbarui b di Clan.buildingData
  //
  // Balasan generik tidak punya building_data, jadi `as Object` menghasilkan
  // null dan pembacaan b.level melempar #1009 -- upgrade gagal diam-diam.
  //
  // result 9 = gagal (klien menampilkan pesan langLib 501). result 0/falsy
  // dilewati pemeriksaannya, jadi itu yang dipakai untuk sukses.
  //
  // Biaya dipotong dari KAS KLAN, bukan dari saldo pemain -- tabelnya sama
  // dengan ClanData.BUILDING_DATA yang dipakai klien, jadi angka di panel
  // dan di server cocok.
  'ClanManagement.constructBuilding': (args) => {
    const id = (args && args[2] != null) ? args[2] : null;
    const h = chars.bangunBangunanKlan(id);
    if (!h || h.gagal) {
      log('   !! upgrade bangunan ditolak: ' + ((h && h.gagal) || 'karakter tidak ada'));
      return { status: 1, error: null, result: 9 };
    }
    log('   ' + h.nama + ' -> Lv' + h.level +
        '  (biaya ' + h.biayaGold + ' gold + ' + h.biayaToken + ' token)' +
        '  kas klan: ' + h.kasGold + ' gold, ' + h.kasToken + ' token' +
        '  bonus: ' + JSON.stringify(h.bonus));
    return {
      status: 1,
      error: null,
      result: 0,
      building_data: { id: h.id, level: h.level },
    };
  },

  // Donasi gold ke kas klan.
  // args (ClanPanel.confirmDonateGold): [sessionKey, sequence, hash, jumlah]
  //
  // ClanPanel.donateGoldResult (method 1246) @65-146:
  //     amt = int(res.result);
  //     clanData[GOLD] = int(clanData[GOLD]) + amt;
  //     getMainChar().saveGold(0 - amt);
  //
  // `result` adalah JUMLAH yang benar-benar disumbang, bukan kode status.
  // Balasan generik `result: []` -> int([]) = 0, jadi klien menambah 0 ke kas
  // dan mengurangi 0 dari gold pemain: donasi tampak berhasil tapi tidak ada
  // yang berpindah. Karena itu kembalikan angkanya, dan kembalikan 0 kalau
  // ditolak supaya klien tidak mengurangi apa pun.
  'ClanManagement.donateGold': (args) => {
    const jumlah = Number((args && args[3]) || 0);
    const h = chars.donasiKlan('gold', jumlah);
    if (!h || h.tidakPunyaKlan || h.jumlahTidakSah) {
      log('   !! donasi gold ditolak: ' +
          (h && h.tidakPunyaKlan ? 'belum punya klan' : 'jumlah tidak sah'));
      return { status: 1, error: null, result: 0 };
    }
    log('   donasi gold ' + h.diberikan +
        (h.diberikan !== h.diminta ? ' (diminta ' + h.diminta + ', dibatasi saldo)' : '') +
        '  -> kas klan ' + h.kasKlan + ', sisa gold ' + h.sisa);
    return { status: 1, error: null, result: h.diberikan };
  },

  // Donasi token ke kas klan.
  // args (ClanPanel.confirmDonateToken): [sessionKey, password, sequence,
  //                                       hash(tokenToDonate), jumlah, ...]
  //
  // ClanPanel.donateTokenResult (method 1254) @215-310 memakai pola yang sama
  // dengan donateGold. Selain itu @71-201 memeriksa res.msg lebih dulu:
  //     "wrong_password"  -> showInfo(langLib 1823)
  //     "not_registered"  -> showInfo("Not Registered")
  // Jadi msg TIDAK boleh diisi kalau donasinya berhasil.
  'ClanManagement.donateToken': (args) => {
    // args[1] = security password yang diketik pemain. Server ini tidak
    // menyimpan password akun, jadi apa pun diterima. Yang penting `msg`
    // TIDAK diisi -- donateTokenResult @151-201 memeriksanya lebih dulu dan
    // "wrong_password" / "not_registered" akan menghentikan alur.
    const jumlah = Number((args && args[4]) || 0);
    const h = chars.donasiKlan('token', jumlah);
    if (!h || h.tidakPunyaKlan || h.jumlahTidakSah) {
      log('   !! donasi token ditolak: ' +
          (h && h.tidakPunyaKlan ? 'belum punya klan' : 'jumlah tidak sah'));
      return { status: 1, error: null, result: 0 };
    }
    log('   donasi token ' + h.diberikan +
        (h.diberikan !== h.diminta ? ' (diminta ' + h.diminta + ', dibatasi saldo)' : '') +
        '  -> kas klan ' + h.kasKlan + ', sisa token ' + h.sisa);
    return { status: 1, error: null, result: h.diberikan };
  },

  // Daftar anggota klan. args: [sessionKey]
  //
  // ClanPanel.gotMemberList (method 1228) @45-58:
  //     memberList = GF.objectToArray(res.result as Object);
  //     memberList.sortOn("level", NUMERIC | DESCENDING);
  //     clanData[MEMBER_NUMBER] = int(res.member_number);
  // result dibaca sebagai Object lalu diubah jadi array, jadi array biasa pun
  // diterima. member_number ada di TINGKAT ATAS, bukan di dalam result.
  'ClanService.getMemberList': () => {
    const anggota = chars.anggotaKlan();
    if (anggota.length) anggota.push(...localFriends.clanMembers());
    log('   daftar anggota klan: ' + anggota.length + ' orang');
    return {
      status: 1,
      error: null,
      result: anggota,
      member_number: anggota.length,
    };
  },

  // Data ruang klan (Clan Hall). args: [sessionKey]
  //
  // ClanPanel.getClanHallDataResponse (method 1198) @35-113 MENIMPA tiga
  // field di clanData yang sudah ada:
  //     clanData[GOLD]          = res.result.clan_gold
  //     clanData[TOKEN]         = res.result.clan_token
  //     clanData[MEMBER_NUMBER] = res.result.member_number
  // lalu clanHallMc.gotoAndStop("profile") -> frame11 -> onClanProfile().
  //
  // onClanProfile @460-540 memasang nilai itu ke TextField:
  //     goldTxt.text = clanData[GOLD]
  // Balasan generik membuat res.result berupa Array kosong, jadi ketiganya
  // undefined. TextField.text bertipe String, dan undefined dikoersi jadi
  // null -> #2007 Parameter text must be non-null, panel profil klan gagal
  // digambar. Karena itu result harus objek dengan ketiga field tersebut.
  //
  // res.status juga diperiksa @26-31 dan harus bernilai 1.
  'ClanService.getClanHallData': () => {
    const clan = chars.klanAktif();
    if (!clan) {
      log('   !! getClanHallData dipanggil tapi karakter belum punya klan');
      return {
        status: 1, error: null,
        result: { clan_gold: 0, clan_token: 0, member_number: 0 },
      };
    }
    const jumlahAnggota = 1 + localFriends.friends.length;
    log('   data ruang klan "' + clan.name + '": gold=' + clan.gold +
        ' token=' + clan.token + ' anggota=' + jumlahAnggota);
    return {
      status: 1,
      error: null,
      result: {
        clan_gold:     clan.gold,
        clan_token:    clan.token,
        member_number: jumlahAnggota,
      },
    };
  },

  // Pembuatan klan. args (dari ClanPanel.confirmCreateClan @90-107):
  //     [sessionKey, sequence, hash(saldo token), namaKlan, saldoToken]
  //
  // ClanPanel.createClanResponse (method 1157) @39-47 membaca
  // int(response.result as int):
  //     0 = BERHASIL -> saldo dikurangi 400, Clan.clanData = res.clan_data,
  //         lalu gotoBase() (kalau group_id ada) atau gotoAndPlay(BASE_TL)
  //     1 = nama sudah dipakai   -> showInfo(langLib 172)
  //     2 = token tidak cukup    -> showOk(langLib 1792[8])
  //
  // Balasan generik `result: []` dikoersi jadi 0 alias BERHASIL, padahal
  // clan_data-nya tidak ada -> Clan.clanData = null -> panel loncat ke
  // frame13 -> onBase -> updateClanStatus -> #1009, dan frame terus diulang
  // sehingga panel tampak kelap-kelip. Karena itu result harus jujur.
  'ClanManagement.createClan': (args) => {
    const nama = (args && args[3] != null) ? String(args[3]).trim() : '';
    if (!nama) {
      log('   !! createClan tanpa nama: ' + JSON.stringify(args));
      return { status: 1, error: null, result: 1, stamina_item: 0 };
    }

    const saldo = Number(chars.characterById(chars.getActiveId())?.token) || 0;
    if (saldo < chars.BIAYA_BUAT_KLAN_TOKEN) {
      log('   createClan ditolak: token ' + saldo + ' < ' +
          chars.BIAYA_BUAT_KLAN_TOKEN);
      return { status: 1, error: null, result: 2, stamina_item: 0 };
    }

    const hasil = chars.buatKlan(nama);
    if (!hasil) {
      log('   !! createClan: karakter aktif tidak ditemukan');
      return { status: 1, error: null, result: 1, stamina_item: 0 };
    }
    if (hasil.sudahPunya) {
      log('   createClan ditolak: sudah punya klan "' + hasil.clan.name + '"');
      return { status: 1, error: null, result: 1, stamina_item: 0 };
    }

    log('   klan dibuat: "' + hasil.clan.name + '" (biaya ' +
        chars.BIAYA_BUAT_KLAN_TOKEN + ' token, sisa ' + hasil.sisaToken + ')');
    return {
      status: 1,
      error: null,
      result: 0,                       // berhasil
      clan_data: hasil.clan,
      group_id: hasil.clan.id,         // non-null -> gotoBase()
      server_time: Math.floor(Date.now() / 1000),
      stamina_item: 0,
    };
  },

  // Merekrut NPC jadi anggota party (dipanggil dari panel Recruit Friends).
  // args: [sessionKey, npcId, saldoTokenSaatIni]
  //
  // Main.setNpcParty() memverifikasi:
  //     response.signature == Main.getHash( response.status + response.npc_id
  //                                         + Account.getAccountBalance() )
  // dan Main.getHash(x) = SHA1(x + SALT + sessionKey).
  //
  // PENTING: penjumlahannya NUMERIK, bukan penggabungan string — ketiganya
  // angka, jadi hasilnya 1 + 3 + 999999999 = 1000000003, lalu String()-nya
  // yang di-hash. Ini terbukti dari log klien: saat npc_id tidak dikirim,
  // 1 + undefined + saldo menghasilkan "AC Full: NaN" dan hash yang dihitung
  // klien sama persis dengan SHA1("NaN" + SALT + sessionKey).
  //
  // Tanpa npc_id + signature yang benar, klien memanggil Main.onError('120')
  // dan panel rekrut mentok.
  //
  // old_recruit=true membuat klien melewati perhitungan potongan token dan
  // langsung memuat SWF NPC-nya — sesuai untuk server pribadi tanpa ekonomi token.
  'CharacterDAO.recruitNpc': (args) => {
    const status = 1;
    const npcId  = Number(args && args[1] != null ? args[1] : 0) || 0;
    const saldo  = Number(args && args[2] != null ? args[2] : ACCOUNT.balance) || 0;
    const input  = String(status + npcId + saldo);
    const signature = sha1(input + SALT + ACCOUNT.sessionKey);
    log('   rekrut NPC: id=' + npcId + ' saldo=' + saldo +
        '  input=' + input + '  signature=' + signature);
    return {
      status, error: null,
      npc_id: npcId,
      old_recruit: true,
      signature,
    };
  },

  // Dipakai saat misi memakai "salinan diri" sebagai lawan (dan pada tantangan
  // teman). Mission.gotCharacterProfile() menyuapkan response.result langsung ke
  // dataParser.parseRawCharacter(), jadi bentuknya WAJIB sama persis dengan
  // CharacterDAO.getCharacterById — bukan objek kosong. Tanpa handler ini
  // parser gagal ("Character Data Error 2") lalu gotCharacterProfile() meledak
  // dengan TypeError #1009 dan peta ikut error beruntun di checkGameStatus().
  'CharacterDAO.getCharacterProfileById': (args) => {
    const id = args && args[1];
    const friend = localFriends.byId(id);
    const template = chars.characterById(chars.getActiveId()) || chars.firstCharacter();
    const c = friend ? localFriends.profile(friend, template, chars.xpForLevel)
                     : ((id != null && chars.characterById(id)) || template);
    if (!c) return { status: 1, error: null, result: null };
    log('   profil karakter diminta: ' + c.name + ' lv' + c.level + ' (id=' + id + ')');
    return {
      status: 1, error: null,
      result: chars.rawCharacter(c, args && args[0]),
      pet_data: {},   // dibaca sebagai Object; {} aman kalau lawan bukan pet
    };
  },

  // Mengirim seluruh rekaman karakter. parseCharacterData membaca 200+ field;
  // yang diakses berantai wajib berupa objek/array (lihat chardata.js).
  'CharacterDAO.getExtraData': () => {
    const aktif = chars.getActiveId();
    const c = (aktif && chars.characterById(aktif)) || chars.firstCharacter();
    if (!c) {
      log('   !! getExtraData dipanggil tapi belum ada karakter tersimpan');
      return { status: 1, error: null, result: null };
    }
    const data = chars.buildExtraData(c, ACCOUNT.sessionKey);

    // Klien memverifikasi hash ini; kalau salah, parseCharacterData
    // memanggil onError() dan mengembalikan false tanpa exception.
    const h = chars.extraDataHash(data, ACCOUNT.sessionKey);
    data.extra_data_hash = h.hash;
    log('   hash extra data: input=' + JSON.stringify(h.input));
    log('                    hash =' + h.hash);

    // Periksa rekaman terhadap tipe deklarasi DBCharacter di klien.
    const bad = chars.validate(data.databaseCharacter);
    if (bad.length) {
      log('   !! TIPE FIELD TIDAK COCOK (' + bad.length + '):');
      bad.forEach(b => log('        ' + b));
    } else {
      log('   tipe rekaman karakter: semua benar (72 field)');
    }
    log('   character_skills = ' + JSON.stringify(data.databaseCharacter.character_skills));
    const pets = data.player_pet || [];
    log('   player_pet = ' + pets.length + ' pet' +
        (pets.length ? ' (aktif: ' +
          (pets.filter(p => p.equipped).map(p => p.name).join(',') || 'tidak ada') + ')' : ''));

    return { status: 1, error: null, result: data };
  },

  // PENTING: berbeda dengan SystemData.get, callback-nya memanggil
  //   dataParser.parseSystemData(response)   <- respons UTUH
  // bukan parseSystemData(response.result). Jadi field harus ada di
  // tingkat atas. Disertakan juga di dalam .result supaya aman
  // kalau ada jalur lain yang membacanya dari sana.
  'SystemData.getCreateCharacter': () => {
    const f = systemDataFields();
    return Object.assign({ status: 1, error: null, result: f }, f);
  },

  'ReportService.reportLogDump': () => ({ status: 1, error: null }),

  // --- Panel & fitur lain ---------------------------------------

  // Calendar statuses: 31 date flags, six milestone thresholds/rewards/claim flags.
  'NewDailyRewardStamp2017.getStatus': () =>
    dailyRewards.getStatus((activeCharacter() || {}).character_id),

  'NewDailyRewardStamp2017.claimReward': args =>
    dailyRewards.claimReward((activeCharacter() || {}).character_id, args && args[1]),

  'SpecialReward.getLvUpReward': () => ({
    status: 1, error: null, result: [], reward_list: [],
  }),

  'SpecialReward.claimLvUpReward': () => ({
    status: 1, error: null, result: [],
  }),

  // Secret Scroll of Wisdom (popup_claimSkill.swf)
  'SpecialReward.premiumClaimSkillSet': () => {
    const activeId = chars.getActiveId() || (chars.firstCharacter() && chars.firstCharacter().character_id);
    chars.addSecretScrolls(activeId, 1);
    log('   klaim Secret Scroll of Wisdom (item503) untuk karakter ' + activeId);
    return {
      status: 1,
      error: null,
      result: { item: 'item503', amount: 1 },
      message: 'You have received 1 Secret Scroll of Wisdom!',
    };
  },

  'CharacterDAO.learnFullSkillSet': (args) => {
    // Flash client mengirim [sessionKey, "item503", selectedSkillType, hash]
    // selectedSkillType adalah string ("wind", "fire", "lightning", "earth", "water")
    // atau angka (1=wind, 2=fire, 3=lightning, 4=earth, 5=water)
    const raw = (args && typeof args[2] !== 'undefined') ? args[2] : (args && args[1]);
    let elemName = 'fire';
    const numMap = { 1: 'wind', 2: 'fire', 3: 'lightning', 4: 'earth', 5: 'water' };

    if (typeof raw === 'string') {
      const lower = raw.trim().toLowerCase();
      if (['wind', 'fire', 'lightning', 'earth', 'water'].includes(lower)) {
        elemName = lower;
      } else if (numMap[Number(lower)]) {
        elemName = numMap[Number(lower)];
      }
    } else if (typeof raw === 'number' && numMap[raw]) {
      elemName = numMap[raw];
    }

    const activeId = chars.getActiveId() || (chars.firstCharacter() && chars.firstCharacter().character_id);
    const learned = chars.unlockElementSkills(activeId, elemName);
    chars.removeItem('503', 1);
    const allSkillsForElem = (chars.ELEMENT_SKILLS && chars.ELEMENT_SKILLS[elemName]) || [];
    // Kirim seluruh skill elemen tersebut ke Flash agar in-memory inventaris Flash
    // langsung memuat semuanya dan mengubah status kartu menjadi tanda centang hijau.
    const returnSkills = allSkillsForElem.length > 0 ? allSkillsForElem : learned;
    log('   learnFullSkillSet elemen "' + elemName + '": ' + learned.length + ' skill baru dipelajari, total ' + returnSkills.length + ' jutsu dikirim ke Flash');
    return {
      status: 1,
      error: null,
      result: {
        learn_skill_id: returnSkills,
      },
      learn_skill_id: returnSkills,
    };
  },

  // Tanpa Facebook, daftar teman selalu kosong.
  // RequestBox.gotoHide() berbunyi:
  //     Central.main.currRequest = this.requestListResult.requests.length;
  // dan requestListResult diisi mentah dari balasan servis ini. Tanpa field
  // `requests`, `.length` dibaca dari undefined -> #1010, dan panelnya tidak
  // pernah bisa ditutup. `remain` dipakai updatePanel()/acceptGiftResponse()
  // sebagai peta yang diindeks request_type.
  // InviteReward2.gotInviteRecord(response):
  //     Central.main.friendship_kunai = response.friendship_kunai;
  //     this.CLAIM_REWARD_ARR = response.reward_list;
  //     this.Maxpage = Math.ceil((CLAIM_REWARD_ARR.length - 1) / PER_PAGE);
  // Tanpa `reward_list`, .length dibaca dari null -> #1009 dan panel ajak
  // teman tidak pernah tampil.
  // reward_list TIDAK BOLEH kosong. InviteReward2.updateRewardList():
  //     this.clearRewardList();
  //     this.LoadRewardItem(0, this.CLAIM_REWARD_ARR[0]);   // <- tanpa penjaga
  // dan LoadRewardItem membaca data itu di instruksi pertamanya:
  //     panel["item" + idx].claimBtn.numToClaim = data.price;
  // Array kosong -> arr[0] undefined -> #1009 di LoadRewardItem.
  //
  // Field yang dibaca dari tiap entri (hasil pembongkaran LoadRewardItem):
  //   price     -> claimBtn.numToClaim, dan label tombolnya
  //   rewardId  -> Central.main.itemPrototype(String(rewardId))
  //   amount    -> kalau > 1 dan type gold/token, ditulis "x<amount>"
  //   type      -> dibandingkan dengan "gold" dan "token"
  //   priority  -> dibandingkan dengan 3 untuk menampilkan penanda "new"
  //
  // amount 1 dipilih supaya cabang label "x<amount>" tidak diambil, dan
  // rewardId "item1" karena id itu terbukti dikenali ITEM_DATA (dipakai juga
  // oleh panel daily login).
  // Daftar rambut yang DIMILIKI pemain. Katalognya sendiri sudah ada di
  // klien (HAIR_DATA berisi 575 entri dari data_library), jadi server cuma
  // perlu menyebut mana yang dipunya.
  //
  // StyleShop.getInvHairResponse():
  //     Central.main.hideAmfLoading();
  //     if (validateAmfResponse(response)) {
  //         var arr:Array = response.inv_hair as Array;      // null kalau absen
  //         this.invHair = arr;
  //         for (i = 0; i < arr.length; i++)                 // null.length -> #1009
  //             getMainChar().addInventory(InventoryData.TYPE_HAIR, "hair" + arr[i]);
  //         this.gotoShow();                                 // <- tidak pernah tercapai
  //     }
  // Tanpa `inv_hair`, gotoShow() tidak jalan dan panelnya tinggal putih.
  // Array kosong aman: perulangannya dilewati dan gotoShow() tetap dipanggil.
  //
  // Isi entri berupa id telanjang — klien menambahkan awalan "hair" sendiri,
  // pola yang sama dengan character_item.
  // Rumah berburu lama. OldHuntingHouse.BattleStatusResponse():
  //     if (validateAmfResponse(response)) {
  //         this.enemyList = [];
  //         for (i = 0; i < response.result.room.length; i++) { ... }
  //         this.currPage = 1;
  //         this.initDetail();
  //         this.loadPanelContent();
  //         this.gotoAndPlay(Timeline.SHOW);
  //         Central.main.hideAmfLoading();          // <- PALING AKHIR
  //     }
  //
  // Catch-all mengirim result: [] sehingga result.room undefined, dan
  // `.length` melempar #1010. Karena hideAmfLoading() ada di baris terakhir,
  // exception itu meninggalkan lapisan pemblokir tetap terpasang — layarnya
  // macet, bukan sekadar panel kosong.
  //
  // `room` satu-satunya field yang dibaca dari result di seluruh SWF ini.
  // Array kosong aman: perulangannya dilewati, dan initDetail() maupun
  // loadPanelContent() tidak menyentuh enemyList sama sekali.
  // Tailed Beast: tail numbers are 1..9, never array positions or sentinel 0.
  'Anni5th.getTailPet': () => ({
    status: 1, error: null, result: [],
    active_tail_number: EKOR_KE_PET.map((_, i) => i + 1),
    default_tail_number: 1,
    owned_tail_number: EKOR_KE_PET
      .map((petId, i) => ({ petId, ekor: i + 1 }))
      .filter(x => chars.listPets().some(p => String(p.id) === x.petId))
      .map(x => x.ekor),
  }),

  'Anni5th.buyPet': args => {
    const id = String(args && args[1] || '').replace(/^pet/, '');
    const data = require('./petdata').petById(id);
    const current = activeCharacter();
    if (!current || !EKOR_KE_PET.includes(id) || !data)
      return { status: 0, error: 'Invalid Tailed Beast' };
    if (chars.listPets().some(p => String(p.id) === id))
      return { status: 0, error: 'You already own this pet.' };
    const cost = Number(data.token);
    if (!Number.isSafeInteger(cost) || cost < 0 || ACCOUNT.balance < cost)
      return { status: 0, error: 'Not enough tokens.' };
    const pet = {
      id, name: data.name, level: 1, xp: 0, trained: [0], skills: [],
      swfName: data.swfName, clsName: data.clsName, equipped: false,
    };
    const saved = chars.updateCharacter(current.character_id, c => {
      c.pets ||= [];
      if (c.pets.some(p => String(p.id) === id)) return false;
      c.pets.push(pet);
      c.token = Math.max(0, (Number(c.token) || 0) - cost);
      c.utilityTokenSpent = (Number(c.utilityTokenSpent) || 0) + cost;
    });
    if (!saved) return { status: 0, error: 'Could not save the pet purchase.' };
    ACCOUNT.balance -= cost;
    const result = chars.petBuyResult(pet, ACCOUNT.sessionKey);
    result.equipped = false;
    log('   pet ekor dibeli: pet' + id + ' (' + data.name + '), ' + cost + ' token');
    return {
      status: 1, error: null, result,
      balance: ACCOUNT.balance, total_token: saved.character.token,
    };
  },

  // No payment entitlement is issued by the local server.
  'SpecialReward.claimPaymentPet': () => ({
    status: 0, error: 'No unclaimed payment pet reward is available.',
  }),

  // args: [sessionKey, characterId, tradingBodySet, tradingWeapon, ?, tradingBackItem, accessory]
  //
  // KETIDAKPASTIAN: saya sudah menelusuri pemanggilnya (Character.equipCharacter)
  // sampai ke titik ini, tapi belum memverifikasi apakah tiap argumen berupa
  // string tunggal atau array (mis. getTradingWeapon() bisa saja mengembalikan
  // Array kalau senjata dua tangan). Untuk sekarang disimpan sebagai string
  // apa adanya lewat setEquip(). Kalau nanti equip masih tidak sinkron
  // sesudah dipasang, kirim flashlog saat mengganti perlengkapan -- errornya
  // (kalau ada) akan menunjukkan bentuk yang benar.
  //
  // Callback klien (Main.onAmfResult) generik -- tidak menuntut field selain
  // status, jadi balasan minimal ini aman.
  // args: [sessionKey, characterId, "wpn2", jumlah]
  //
  // ShopPanel.sellItemResponse() menghapus barang dari inventaris KLIEN sendiri
  // (removeInventory) sesudah balasan valid, tapi tidak pernah memberi tahu
  // server apa yang terjual. Tanpa handler ini, catch-all menjawab tanpa
  // menyentuh characters.json, jadi barangnya muncul lagi saat login.
  //
  // update_inventory bernilai ABSOLUT. Harga jual di Ninja Saga adalah
  // separuh harga beli untuk barang ber-gold; barang ber-token tidak
  // menghasilkan token kembali.
  'CharacterDAO.sellItem': (args) => {
    // KOREKSI: susunannya BUKAN [sessionKey, characterId, id, jumlah].
    // Dari log nyata:
    //   [ "localdevsession0001", "wpn2", "<hash 40 hex>", 1 ]
    // Jadi id ada di args[1] dan jumlah di args[3]; args[2] hash verifikasi.
    // Versi sebelumnya mengambil args[2], sehingga removeItem() mencari
    // "b1e984fb..." di inventaris, tidak menemukan apa pun, dan barangnya
    // tetap ada saat login berikutnya.
    const id = args && args[1];
    const n  = Number(args && args[3]);
    const h  = HARGA[String(id)];
    if (!h || !Number.isSafeInteger(n) || n < 1) {
      return { status: 0, error: 'Barang atau jumlah penjualan tidak valid.' };
    }
    const kembali = Math.round((h[1] > 0 ? h[1] * 20 : h[0]) / 2) * n;

    const c = chars.removeItem(id, n, kembali);
    if (!c) return { status: 0, error: 'Barang tidak tersedia sebanyak jumlah yang dijual.' };

    log('   jual ' + id + ' x' + n + '  +' + kembali + ' gold' +
        '  -> gold=' + c.gold);
    return {
      status: 1, error: null, result: 1,
      // ShopPanel.sellItemResponse menambahkan hasil jual di sisi klien.
      update_inventory: {},
    };
  },

  'CharacterDAO.equipCharacter': (args) => {
    // args[4] berisi objek slot bernomor seperti {"0":"skill82"}.
    const c = chars.setEquip(args && args[3], args && args[2],
                             args && args[5], args && args[6], args && args[4],
                             args && args[1]);
    if (c) log('   equip -> ' + JSON.stringify(c.equip));
    return { status: 1, error: null };
  },

  'EudemonGarden.getHuntingStatus': () => eudemonGarden.getStatus(),

  'ItemDAO.getCharacterHuntingList': () => ({
    status: 1, error: null,
    hunting_list: HUNTING_ZONE,
    hunting_cost: 0,
    update_time: 0,
    get_hunting_passport: 1,
    hunting_daren: [],
    show_item: '',            // STRING dipisah koma, bukan larik
  }),

  // Mulai & selesai berburu. Keempat servis akhir-pertarungan memakai
  // bentuk balasan yang sama karena satu servis bisa dipanggil dari
  // jalur callback yang berbeda.
  'ItemDAO.startHunting':           () => ({ status: 1, error: null, result: 1 }),
  'ItemDAO.forgeObject': (params) => {
    const rawId = String((params && params[1]) || '');
    log('ItemDAO.forgeObject diminta untuk item: ' + rawId);
    const charId = chars.getActiveId() || '1';
    const c = chars.characterById(charId);

    if (rawId && c) {
      if (rawId.startsWith('pet_') || rawId.startsWith('pet')) {
        const num = rawId.replace(/^pet_?/, '');
        chars.addPet(charId, num);
      } else if (rawId.startsWith('wpn_') || rawId.startsWith('wpn')) {
        const num = rawId.replace(/^wpn_?/, '');
        if (!c.weapons) c.weapons = [];
        if (!c.weapons.includes(num)) c.weapons.push(num);
      } else if (rawId.startsWith('set_') || rawId.startsWith('set')) {
        const num = rawId.replace(/^set_?/, '');
        if (!c.bodysets) c.bodysets = [];
        if (!c.bodysets.includes(num)) c.bodysets.push(num);
      } else if (rawId.startsWith('back_') || rawId.startsWith('back')) {
        const num = rawId.replace(/^back_?/, '');
        if (!c.backitems) c.backitems = [];
        if (!c.backitems.includes(num)) c.backitems.push(num);
      } else if (rawId.startsWith('hair_') || rawId.startsWith('hair')) {
        const num = rawId.replace(/^hair_?/, '');
        if (!c.hairs) c.hairs = [];
        if (!c.hairs.includes(num)) c.hairs.push(num);
      } else if (rawId.startsWith('skill_') || rawId.startsWith('skill')) {
        const num = rawId.replace(/^skill_?/, '');
        if (!c.skills) c.skills = [];
        if (!c.skills.includes(num)) c.skills.push(num);
      } else if (rawId.startsWith('item_') || rawId.startsWith('item')) {
        const num = rawId.replace(/^item_?/, '');
        chars.addItem(charId, num);
      }
    }

    return {
      status: 1,
      result: 1,
      error: null,
      materials: '',
      already_upgrade: 0,
    };
  },
  'CharacterDAO.startHunting':      () => ({ status: 1, error: null, result: 1 }),
  'EudemonGarden.startHunting': (args) =>
    eudemonGarden.start(chars.getActiveId(), args && args[1], args && args[5]),
  'EudemonGarden.finishHunting': (args) => {
    const response = eudemonGarden.finish(chars.getActiveId(), args && args[1], args && args[3]);
    if (response.status !== 1) return response;
    log('   Eudemon Garden room ' + args[1] + ': ' + response.reward.join(', '));
    return balasanHadiah(response);
  },
  'CharacterDAO.finishHunting':     () => balasanHadiah(),
  'ValentinesDay2017.finishHunting': (args) => selesaikanHadiahBos(args, 'Valentine'),

  'CharacterDAO.getSkillProfiles': () => ({
    status: 1, error: null, profiles: chars.getSkillProfiles(),
  }),

  'CharacterDAO.saveSkillProfile': (args) => {
    const jutsu = chars.setSkillProfile(args && args[1], args && args[2]);
    if (!jutsu) return { status: 0, error: 'Profil jutsu tidak valid' };
    log('   profil jutsu ' + args[1] + ' disimpan: ' + jutsu.join(','));
    return { status: 1, error: null };
  },

  // Service data rambut untuk panel Style Shop
  'SystemData.getHairData': () => ({
    status: 1,
    error: null,
    result: HAIR_DATA,
    hair_data: HAIR_DATA,
  }),

  // Daftar rambut yang dimiliki karakter
  'CharacterManagement.getInvHair': () => {
    const activeId = chars.getActiveId() || 1;
    const c = chars.characterById(activeId);
    const owned = (c && Array.isArray(c.hairs)) ? c.hairs : [];
    return {
      status: 1,
      error: null,
      result: owned,
      inv_hair: owned,
    };
  },

  // Simpan perubahan tampilan (rambut, warna rambut, warna kulit) di Style Shop
  'CharacterDAO.changeAppearance': (args) => {
    // args: [sessionKey, charId, changedHair, changedHairColor, changedSkinColor]
    const charId = args && args[1];
    const hair = args && args[2];
    const hairColor = args && args[3];
    const skinColor = args && args[4];
    const c = chars.changeAppearance(charId, hair, hairColor, skinColor);
    if (c) {
      log(`   ganti tampilan: char=${charId} hair=${hair} skinColor=${skinColor}`);
    }
    return { status: 1, error: null, result: 1 };
  },

  // Pembelian rambut dari panel Style Shop / Token
  'CharacterManagement.buyHair': (args) => {
    // args: [sessionKey, seq, hash, buyHairId]
    const hairId = args && args[3];
    const c = chars.buyHair(hairId);
    if (c) {
      log(`   beli rambut: hairId=${hairId}`);
    }
    return { status: 1, error: null, result: 1 };
  },

  // Penggantian rambut dari panel Style Shop / Token
  'CharacterManagement.changeHair': (args) => {
    // args: [sessionKey, seq, hash, hairId]
    const hairId = args && args[3];
    const c = chars.changeHair(hairId);
    if (c) {
      log(`   ubah gaya rambut: hairId=${hairId}`);
    }
    return { status: 1, error: null, result: 1 };
  },

  'FacebookService.getInviteRecord': () => ({
    status: 1, error: null, result: [],
    friendship_kunai: 0,
    reward_list: [
      // `active` WAJIB dan harus truthy. gotInviteRecord memanggil
      // removeInactiveReward() sebelum gotoAndPlay(SHOW), dan isinya:
      //     for (i ...) if (!CLAIM_REWARD_ARR[i].active) CLAIM_REWARD_ARR.splice(i, 1);
      // Entri tanpa `active` dibuang, array kembali kosong, dan
      // updateRewardList() -> LoadRewardItem(0, arr[0]) menabrak undefined.
      // Itulah kenapa menambahkan entri saja belum cukup kemarin.
      { rewardId: 'item1', type: 'gold', amount: 1, price: 1, priority: 1, active: 1 },
    ],
  }),

  'FacebookService.getRequestList': () => ({
    status: 1, error: null, result: [],
    requests: [], remain: {},
  }),

  'FacebookService.getFriendList': () => ({
    status: 1, error: null, result: [],
    friend_list: localFriends.friendList(),
    char_list: localFriends.friendList(),
  }),

  'FacebookService.getFriendsData': () => ({
    status: 1, error: null, result: localFriends.friendList(),
  }),

  // Panel Mission dan Recruit Friends membaca karakter dari `result`.
  // Daftar akun sosial dari getFriendList hanya dipakai untuk nama/foto.
  'FacebookService.getRecruitRecord': (args) => ({
    status: 1, error: null,
    result: localFriends.characterRecords(args && args[1], chars.xpForLevel),
  }),

  'FacebookService.getChallengeRecord': (args) => ({
    status: 1, error: null,
    result: localFriends.characterRecords(args && args[1], chars.xpForLevel),
  }),

  'FacebookService.payToRecruit': (args) => {
    const friend = localFriends.byId(args && args[1]);
    if (!friend) return { status: 1, error: null, failreason: 'Teman lokal tidak ditemukan.' };
    log('   rekrut teman lokal: ' + friend.name + ' (id=' + friend.id + ')');
    return { status: 1, error: null, result: 1 };
  },

  // Alokasi attribute point
  // Character.updateAP mengirim TOTAL poin elemen, bukan selisih:
  //   service("CharacterDAO.updateAP", [sessionKey, dbChar.character_id,
  //            [character_fire, character_water, character_wind,
  //             character_earth, character_lightning]], onAmfResult)
  // Jadi "atribut" yang dinaikkan pemain sebenarnya penguasaan elemen.
  'CharacterDAO.updateAP': (args) => {
    const el = (args && args[2]) || [];
    const c = chars.setElements(el);
    if (c) log('   poin elemen -> api=' + c.elements[0] + ' air=' + c.elements[1] +
               ' angin=' + c.elements[2] + ' tanah=' + c.elements[3] +
               ' petir=' + c.elements[4]);
    return { status: 1, error: null, result: 1 };
  },

  'CharacterDAO.saveResetAP': () => {
    const c = chars.setElements([0, 0, 0, 0, 0]);
    if (c) log('   reset AP -> semua elemen direset ke 0 (Point Left = ' + c.level + ')');
    return { status: 1, error: null, result: 1 };
  },

  'CharacterDAO.resetAPbyToken': () => {
    const c = chars.setElements([0, 0, 0, 0, 0]);
    if (c) log('   reset AP (token) -> semua elemen direset ke 0 (Point Left = ' + c.level + ')');
    return { status: 1, error: null, result: 1 };
  },

  // Pembelian di toko. Emas dipotong lewat update_inventory
  // (nilainya ABSOLUT — total baru, bukan selisih).
  // args: [sessionKey, itemId, jumlah, ...]
  'CharacterDAO.buyItem': (args) => {
    // args: [sessionKey, "item1", jumlah]
    const id = args && args[1];
    const n  = Math.max(1, Number(args && args[2]) || 1);
    const h  = HARGA[String(id)];            // [gold, crystal] atau undefined

    const c = chars.addItem(id, n, h ? h[0] : 0, h ? h[1] : 0);
    if (!c) return { status: 1, error: null, result: 1 };

    if (h) {
      log('   beli ' + id + ' x' + n + '  -' + (h[0] * n) + ' gold' +
          (h[1] ? '  -' + (h[1] * n) + ' token' : '') +
          '  -> gold=' + c.gold + '  inventaris: [' + c.items.join(',') + ']');
    } else {
      log('   beli ' + id + ' x' + n + '  (harga TIDAK DIKENAL, tidak dipotong)' +
          '  -> inventaris: [' + c.items.join(',') + ']');
    }

    // update_inventory SENGAJA dikirim kosong.
    //
    // Emas dipotong DUA KALI kalau kita mengirim `gold`:
    //   ShopPanel.buyItemResponse() -> validateAmfResponse(response)
    //        -> if (update_inventory.gold !== undefined) setGold(gold)   // ABSOLUT
    //   lalu di offset 1832 method yang sama:
    //        getMainChar().updateGold(0 - selectedItem.gold * amount)    // SELISIH
    //
    // Jadi klien selalu mengurangi sendiri dari saldonya. Dengan mengirim
    // saldo yang SUDAH kita potong, pengurangan itu terjadi lagi dan angka
    // di layar melenceng dua kali lipat harga.
    //
    // Objek kosong tetap truthy, jadi validateAmfResponse masuk ke blok
    // update_inventory lalu melewati semua field karena semuanya undefined.
    // Item juga tidak perlu dikirim: buyItemResponse memanggil
    // addInventory() sendiri untuk tiap kategori.
    return { status: 1, error: null, result: 1, update_inventory: {} };
  },

  // Dikirim klien setelah misi selesai, membawa statistik pencapaian.
  // args: [sessionKey, hash1, hash2, { "12": 250, "13": 0, ... }]
  // Kuncinya id tipe statistik, nilainya jumlah tambahan.
  'Achievement.flushCharStat': (args) => {
    const stat = (args && args[3]) || {};
    const n = chars.mergeStats(stat);
    const isi = Object.keys(stat).filter(k => stat[k]);
    if (isi.length) log('   statistik disimpan: ' + isi.map(k => k + '=+' + stat[k]).join(', '));
    return { status: 1, error: null, result: [] };
  },

  // --- Pelatihan skill -----------------------------------------

  // Klien: `recall = int(response.recall); if (recall != 1) { ...proses... }`
  //
  // Perhitungan target lompatan (pc 60, ifne, panjang 4 byte):
  //   pc berikutnya = 64, target = 64 + 1 = 65
  // Jadi recall != 1 -> LANJUT memproses; recall == 1 -> returnvoid.
  //
  // Kalau diproses, klien memanggil addNewSkill() untuk skill yang
  // sedang dilatih dan mencari SKILL_DATA[id].name -> #1010 kalau
  // tidak ada pelatihan berjalan. Maka recall=1 = "tidak ada apa-apa".
  // JANGAN kembalikan recall:1 di sini. Character.verifyTrainingSkill()
  // memanggil Main.showAmfLoading() sebelum mengirim permintaan ini, dan
  // lapisan loading itu MEMBLOKIR seluruh klik di panggung. Penurunannya
  // hanya terjadi di baris terakhir Character.verifyTrainingSkillResult:
  //
  //     if (String(response.status) == "0") { Main.onError(...); return; }
  //     if (int(response.recall) == 1) return;      // <- keluar dini
  //     ... proses result ...
  //     Main.hideAmfLoading();                      // <- hanya tercapai bila recall != 1
  //
  // Dengan recall:1 klien keluar lewat pintu kedua dan lapisan pemblokir
  // tidak pernah turun -> layar hasil misi tampak beku, tidak bisa diklik.
  //
  // result juga harus > 0. Kalau result:0, klien masuk ke cabang
  // addNewSkill(_trainingSkill.id, cb) dengan id "0" — memberi skill palsu.
  // Dengan result positif ia mengambil cabang aman: mengisi trainingSkill,
  // memanggil callback, lalu hideAmfLoading().
  'CharacterDAO.verifyTrainingSkill': () => ({
    status: 1, error: null, recall: 0, result: 1,
  }),

  // Dipanggil dua tempat, dan keduanya menaikkan lapisan pemblokir lebih dulu:
  //   Popup.readyMissionComplete()  -> showAmfLoading(), lalu servis ini
  //   MissionResult.hide()          -> showAmfLoading(), lalu servis ini
  // Pembuka kuncinya masing-masing Popup.onFriendReward dan
  // MissionResult.popFeedResponse, dan keduanya memanggil hideAmfLoading()
  // TANPA syarat — jadi balasan apa pun sudah cukup membuka layar.
  //
  // status HARUS 1. Catatan lama (-1 dianggap "lolos diam-diam") ternyata salah:
  // Main.validateAmfResponse hanya meneruskan kalau String(status) == "1"
  // (AMFData.STATUS_SUCCESS). Untuk nilai lain -- termasuk -1 -- ia jatuh ke
  // cabang onError(String(response.error)) lalu meledak dengan TypeError #1009
  // di Main.hideAmfLoading().
  //
  // hash_str WAJIB ikut dikirim. Popup.onMissionComplete menghitung:
  //     Main.getHash( String(status) + String(reward_type) +
  //                   String(reward_amount) + String(reward_id) +
  //                   String(wallfeed_id) )
  // dan Main.getHash(x) = clientLib.getHash(sessionKey, x)
  //                     = SHA1(x + SALT + sessionKey)   (pola sama seperti
  //                       yang sudah dipakai SystemService.checkAmf).
  // Kalau hasilnya tidak sama dengan reward.hash_str, klien memanggil
  // Main.onError('120') -> dialog error + #1009 di Main.initButton.
  //
  // Dengan semua nilai reward 0, reward_id 0 jatuh ke cabang default switch
  // reward_id, dan cabang itu aman (lanjut normal, tanpa publishShareFeed).
  'FriendReward.getFriendReward': () => {
    const r = {
      status: 1, error: null,
      reward_type: 0, reward_amount: 0, reward_id: 0, wallfeed_id: 0,
    };
    const input = String(r.status) + String(r.reward_type) +
                  String(r.reward_amount) + String(r.reward_id) +
                  String(r.wallfeed_id);
    r.hash_str = sha1(input + SALT + ACCOUNT.sessionKey);
    log('   hash_str reward: input=' + input + ' hash=' + r.hash_str);
    return r;
  },

  // AMAN apa adanya. AcademyPanel.onAmfTrainSkillResult memanggil
  // hideAmfLoading() di instruksi PERTAMA, sebelum pemeriksaan apa pun, dan
  // tidak pernah membaca `recall`. Jadi jebakan yang mengunci layar hasil misi
  // tidak berlaku di sini.
  //   result <  0  -> trainSkillFailure()
  //   result >= 0  -> sukses, klien memotong gold sendiri
  // args: [sessionKey, skillId, sequence]
  //
  // AcademyPanelUpgradeSkill.onAmfTrainSkillResult():
  //     hideAmfLoading();                       // instruksi pertama, aman
  //     if (String(status) == STATUS_ERROR) { onError(error); return; }
  //     var r:int = int(response.result);
  //     if (r < 0)  { trainSkillFailure(); return; }
  //     if (r == 0) { trainSkillSuccess(); ... }
  //
  // Klien mengurangi saldo di layar setelah respons sukses. Simpan biaya dan
  // skill bersama-sama di server, tanpa mengirim saldo lagi dalam respons.
  'CharacterDAO.trainSkill': (args) => {
    const id = String(args && args[1]);
    const price = HARGA[id];
    if (!price || !id.startsWith('skill')) {
      return { status: 0, error: 'Harga jutsu tidak tersedia.' };
    }
    if (args && args[3] === 'fk') {
      return { status: 0, error: 'Pembayaran Friendship Kunai belum tersedia.' };
    }
    const result = chars.buyAcademySkill(id, price[0], price[1], ACCOUNT.balance);
    if (result.error) return { status: 0, error: result.error };
    ACCOUNT.balance -= price[1];
    log('   pelajari skill: ' + id + '  -' + price[0] + ' gold  -' + price[1] + ' token');
    return { status: 1, error: null, recall: 1, result: 0 };
  },

  // Melepas skill yang sedang dilatih (UIModule_TrainTimer.amfUnlearnSkill).
  // status HARUS persis 1. onAmfUnlearnSkillResult begini:
  //     if (String(status) == "0") { Out.error(...); return; }   // tanpa hide
  //     if (String(status) == "1") {
  //         getMainChar().trainingFdSkill = null;
  //         updateProgress();
  //         Central.main.hideAmfLoading();                        // <- HANYA di sini
  //     }
  // Nilai selain "1" membuat klien keluar tanpa menurunkan lapisan pemblokir,
  // dan akademi membeku seperti layar hasil misi dulu.
  'VisitFriendService.unlearn': () => ({
    status: 1, error: null, result: 1,
  }),

  // Melatih skill milik teman. Tanpa Facebook fitur ini tidak ada isinya.
  // onPracticeFdSkill memanggil hideAmfLoading() lebih dulu tanpa syarat, jadi
  // layar tetap aman berapa pun status-nya. status -1 dipilih supaya klien
  // melewati cabang sukses — cabang itu membaca banyak field lanjutan dari
  // respons dan akan melempar #1009 kalau kita mengarangnya.
  'VisitFriendService.getLearnedSkill': () => ({
    status: -1, error: null, result: [],
  }),

  'CharacterService.selectFreeSkill': (args) => {
    const starter = { skill1: 4, skill9: 1, skill10: 0, skill12: 3, skill13: 2 };
    const skill = String(args && args[1]);
    const id = chars.getActiveId();
    const c = id && chars.characterById(id);
    if (c && c.tutorialPending === true && Object.hasOwn(starter, skill)) {
      chars.updateCharacter(id, character => {
        const skillId = skill.slice(5);
        character.skills ||= [];
        if (!character.skills.includes(skillId)) character.skills.push(skillId);
        character.equip ||= {};
        character.equip.jutsu ||= [];
        if (!character.equip.jutsu.includes(skillId)) character.equip.jutsu.push(skillId);
        character.elements = [0, 0, 0, 0, 0];
        character.elements[starter[skill]] = 1;
        character.starterElement = starter[skill];
        if (character.tutorialBattleFinished === true) {
          character.xp = Math.max(1, Number(character.xp) || 0);
          character.tutorialPending = false;
          character.tutorialCompleted = true;
        }
      });
      log('   ' + (c.tutorialBattleFinished ? 'tutorial selesai: ' : 'elemen tutorial dipilih: ') +
          c.name + ' memilih ' + skill);
    }
    return { status: 1, error: null, result: 1 };
  },

  // --- Misi ---------------------------------------------------

  // args: [sessionKey, missionId, ?, ?, ?]
  // Klien menyimpan startBattleId lalu memulai pertarungan.
  'CharacterService.startMission': (args) => {
    battleSeq += 1;
    log('   mulai misi: ' + (args && args[1]) + '  startBattleId=' + battleSeq);
    return { status: 1, error: null, startBattleId: battleSeq };
  },

  // Dipanggil saat misi selesai (Character.updateDB).
  // args: [sessionKey, character_id, character_level, xpDidapat, goldDidapat,
  //        itemDipakai, skillId, skillLevel, ...]
  //
  // Klien menerapkan hadiah lewat field `update_inventory` di respons —
  // mekanisme universal yang diproses Main.validateAmfResponse untuk
  // SEMUA respons AMF. Nilainya ABSOLUT (total baru), bukan selisih:
  //   setGold(update_inventory.gold)  ->  dbChar.character_gold = nilai
  //   setXp(update_inventory.xp, ...) ->  dbChar.character_xp = nilai,
  //                                       lalu level dihitung ulang klien
  //                                       lewat Formula.getLvByXp()
  'CharacterService.updateCharacter': (args) => {
    const characterId = args && args[1];
    const xpGain   = Number(args && args[3]) || 0;
    const goldGain = Number(args && args[4]) || 0;

    // args[8] berisi id misi yang barusan diselesaikan, mis. "msn55".
    // Tanpa ini progres misi hanya hidup di memori klien: begitu relogin
    // server mengirim character_mission kosong dan rantai misi berjenjang
    // (mis. ujian Chuunin) mengulang dari tahap pertama.
    const missionId = args && args[8];
    if (missionId) {
      const m = chars.recordMission(missionId, true, characterId);
      if (m) {
        log('   misi selesai: msn' + m.no +
            '  success=' + m.entry.success +
            '  (total misi tercatat: ' + m.total + ')');
        if (m.naikRank) {
          const nama = { 0:'Student', 1:'Genin', 2:'Chunin', 3:'Chunin Talented',
                         4:'Jounin', 5:'Jounin Talented', 6:'Special Jounin',
                         7:'Special Jounin Talented', 8:'Tutor', 9:'Tutor Senior' };
          log('   *** NAIK RANK: ' + (nama[m.rankLama] || m.rankLama) +
              ' -> ' + (nama[m.rank] || m.rank) + ' ***');
        }
      }
      else   log('   !! id misi tidak dikenali: ' + missionId);
    }

    // Level pet ikut dikirim di sini. Character.updateDB @624-730 menyusun 20
    // argumen, dan dua di antaranya milik pet:
    //     args[6] = id pet      args[7] = level pet
    // (args[8] = id misi, dipakai di atas)
    //
    // Klien TIDAK menyimpan progres pet sendiri, jadi tanpa blok ini pet naik
    // level hanya di layar hasil battle lalu kembali ke level lama.
    //
    // XP wajib ikut disimpan: klien mengabaikan field `level` yang kita kirim
    // dan menghitung ulang dari `xp` lewat Formula.getPetLvByXp. Menyimpan
    // level saja membuat pet tetap terbaca level 1.
    const petId = args && args[6];
    const petLv = Number(args && args[7]);
    if (petId && petLv > 0) {
      const lama = (chars.listPets() || []).find(x => String(x.id) === String(petId));
      if (lama && petLv > (Number(lama.level) || 1)) {
        const xp = chars.xpPetUntukLevel(petLv);
        chars.addPet({ id: petId, level: petLv, xp });
        log('   pet ' + petId + ' naik level: ' + lama.level + ' -> ' + petLv +
            '  (xp disetel ke ' + xp + ')');
      }
    }

    const hasil = chars.addProgress(xpGain, goldGain, characterId);
    if (!hasil) {
      log('   !! updateCharacter tapi belum ada karakter tersimpan');
      return { status: 1, error: null, maintenance: 0, reward_items: [] };
    }

    const { c, lvLama, naik } = hasil;
    log('   +' + xpGain + ' xp, +' + goldGain + ' gold  ->  ' +
        'xp=' + c.xp + ' gold=' + c.gold + ' level=' + c.level +
        (naik > 0 ? '  NAIK LEVEL dari ' + lvLama : ''));

    return {
      status: 1,
      error: null,
      maintenance: 0,
      reward_items: [],
      update_inventory: {
        xp: c.xp,
        gold: c.gold,
        token: c.token || 0,
      },
    };
  },

  'ItemDAO.getBossReward': (args) => selesaikanHadiahBos(args, 'Boss'),

  // Dipanggil layar pembuatan/pemilihan karakter.
  // args: [sessionKey, TEST_VERSION]
  //
  // Karena Data.TEST_VERSION = false, klien mengambil SKILL_DATA, ITEM_DATA,
  // WEAPON_DATA, ENEMY_DATA, BLOODLINE, dan BODY_SET dari data_library_en.swf
  // (lewat dataLib.getSkill(), dst) — jadi server TIDAK perlu mengirimnya.
  // Yang tetap dibaca dari respons hanya field di bawah ini.
  // Genzu's Chronicles (genzu_chronicles.swf, kelas xmas2012_menu).
  //
  // show() @26-48 memanggil GenzusEvent.getStoryStatus, dan
  // getStatusResponse @25-37 menyalin dua field saja:
  //     EventStatus = res.story_status
  //     BossStatus  = res.reward_status
  //
  // onShow @378-439 memasang empat chapter:
  //     setupStage(stage1, 1, STORY_1) ... setupStage(stage4, 4, STORY_4)
  //
  // dan setupStage @2-47 menguncinya begini:
  //     if (EventStatus < indeksChapter) -> gotoAndStop('locked') + "coming soon"
  //     else                             -> gotoAndStop('enable') + tombol StoryBtn
  //
  // Jadi story_status = nomor chapter TERTINGGI yang terbuka. Chapter 4
  // sudah berisi cerita di SWF; tombol Battle dan Material House membuka
  // panel umum yang terpisah dari keempat tombol cerita.
  'SkillPackageLimit.getPackageStatus': () => ({
    status: 1, error: null,
    result: {
      package_type: PAKET_MERCHANT.tipe,
      package_data: PAKET_MERCHANT.daftar.map(p => ({ id: p.id, cost: p.cost })),
      time_limit: PAKET_MERCHANT.batas_waktu,
    },
  }),

  // args: [sessionKey, id paket]
  'SkillPackageLimit.buySkillLimit': (args) => {
    const id = args && args[1];
    const p = PAKET_MERCHANT.daftar.find(x => String(x.id) === String(id));
    if (!p) {
      log('   paket merchant tidak dikenal: ' + id);
      return { status: 1, error: null, cost: 0 };
    }
    for (const h of (p.isi || [])) {
      try { beriHadiah(h); } catch (e) { log('   !! ' + h + ': ' + e.message); }
    }
    // Pemilik Emblem membayar potongan pertama, pengguna biasa yang kedua.
    const harga = String(p.cost).split('_');
    const bayar = Number(EMBLEM ? harga[0] : harga[1]) || 0;
    log('   paket merchant ' + id + ' dibeli (' + bayar + ' token): ' +
        (p.isi || []).join(', '));
    return { status: 1, error: null, cost: bayar };
  },

  // Nama servis alternatif yang juga ada di panel yang sama.
  'SkillPackageLimit.buyLimitPackage': (args) =>
    handlers['SkillPackageLimit.buySkillLimit'](args),

  'GenzusEvent.getStoryStatus': () => ({
    status: 1, error: null,
    story_status: 4,
    reward_status: 0,
  }),

  // Dipanggil Popup_Gauntlet_menu. Balasan generik sudah tidak menimbulkan
  // error; didaftarkan supaya tidak lagi tercatat "handler BELUM ADA".
  // Six-Element Gauntlet (Popup_Gauntlet_menu.swf, kelas Gauntleluptade).
  //
  // confirmBuynew @84-129 memilih servis menurut btnNum:
  //     btnNum 1 -> GodSnap.buyPackage        (senjata gauntlet)
  //     btnNum 2 -> GodSnap.buySkillPackage   (kinjutsu)
  // keduanya mengirim [sessionKey, 1] dan memakai callback buyItemResponse.
  //
  // Kedua id barangnya terbaca langsung di buyItemResponse:
  //     @284 toolkit.hasItem('wpn1596')   -> senjata Six-Element Gauntlet
  //     @205 trainingSkill id 'skill902'  -> Kinjutsu: Unstoppable Rage
  //
  // buyItemResponse @100-346 membaca:
  //     res.stateInv   opsional (@13 iffalse -> dilewati kalau tidak ada)
  //     res.result     diuji Boolean(); harus bernilai benar supaya lanjut
  //     res.result.train.remaining_time
  //
  // PERHATIAN: `result` HARUS OBJEK, bukan true. @114-143 memang tampak
  // seperti hubung-singkat:
  //     Boolean(res.result) && Boolean(res.result.train)
  // tapi Boolean() itu PANGGILAN FUNGSI, jadi res.result.train tetap
  // dievaluasi lebih dulu. Kalau result bernilai true, Flash membaca
  // .train pada Boolean -- kelas TERTUTUP tanpa properti dinamis --
  // dan melempar
  //     #1069 Property train not found on Boolean
  // Panel lalu menggantung di layar loading karena hideAmfLoading()
  // tidak pernah tercapai. Objek kosong {} lolos: truthy, dan .train-nya
  // undefined sehingga blok timer dilewati.
  //
  // Panel memanggil loadPanelContent() setelah pembelian; inventaris klien
  // harus diperbarui lewat update_inventory.add_item_id sebelum callback itu.
  // Tiga servis upgrade di panel yang sama. Argumennya (confirmU @28-35,
  // confirmUnlockPower @28, confirmLearnSlotSkill @28-35):
  //     GodSnap.upgradeWeapon   [sessionKey, btnNum - 10]   -> slot 1..6
  //     GodSnap.unlockPower     [sessionKey, 1]
  //     GodSnap.learnSlotSkill  [sessionKey, btnNum - 20]   -> slot 1..6
  //
  // Ketiga callback-nya (upgradeWeaponUResponse, unlockPowerResponse,
  // learnSlotSkillResponse) berpola sama seperti buyItemResponse:
  // validateAmfResponse, lalu Boolean(res.result) harus TRUE.
  // res.result HARUS OBJEK, bukan true -- lihat catatan di buyPackage:
  // res.result.train dievaluasi walau Boolean(res.result) sudah false-kan
  // hubung-singkatnya, dan .train pada Boolean melempar #1069.
  // upgradeWeaponUResponse juga membaca res.stateInv, tapi @26-43
  // menjaganya terhadap undefined DAN null, jadi boleh tidak dikirim.
  //
  // Penyimpanannya lewat chars.setGauntlet -> characters.json, dan dikirim
  // balik saat login sebagai rawCharacter.stateInv "wpn_1596" (lihat
  // stateGauntlet() di chardata.js). Tanpa itu upgrade hilang tiap login.
  'GodSnap.upgradeWeapon': (args) => {
    const slot = Number(args && args[1]);
    const stoneId = BATU_GAUNTLET[slot - 1];
    const goldCost = [100000, 200000, 300000, 400000, 500000, 700000][slot - 1];
    if (!Number.isInteger(slot) || !stoneId)
      return { status: 0, error: 'Invalid gauntlet slot' };

    const id = chars.getActiveId();
    const current = id && chars.characterById(id);
    if (!current || !(current.weapons || []).map(String).includes('1596'))
      return { status: 0, error: 'Gauntlet not owned' };
    if (Number((current.gauntlet && current.gauntlet.slot || [])[slot - 1]) > 0)
      return { status: 0, error: 'Stone already implanted' };
    if (Number((current.materials || {})[stoneId]) < 220 || Number(current.gold) < goldCost)
      return { status: 0, error: 'Not enough stones or gold' };

    const saved = chars.updateCharacter(id, c => {
      c.gauntlet ||= { slot: [0, 0, 0, 0, 0, 0], power: 0, slotSkill: [0, 0, 0, 0, 0, 0] };
      if (Number(c.gauntlet.slot[slot - 1]) > 0 ||
          Number((c.materials || {})[stoneId]) < 220 || Number(c.gold) < goldCost)
        return false;
      c.gauntlet.slot[slot - 1] = 1;
      c.materials[stoneId] -= 220;
      c.gold -= goldCost;
    });
    if (!saved) return { status: 0, error: 'Gauntlet upgrade failed' };
    const c = saved.character;
    log('   gauntlet slot ' + slot + ' di-implant -> ' + c.gauntlet.slot.join(','));
    return {
      status: 1, error: null, result: {},
      stateInv: chars.stateGauntlet(c),
      update_inventory: {
        gold: c.gold,
        token: c.token || 0,
        remove_item_id: ['item' + stoneId + '_220'],
      },
    };
  },

  'GodSnap.unlockPower': () => {
    const id = chars.getActiveId();
    const current = id && chars.characterById(id);
    const cost = ACCOUNT.type === 2 ? 639 : 799;
    if (!current || Number(current.gauntlet && current.gauntlet.power) > 0 ||
        (current.gauntlet && current.gauntlet.slot || []).length !== 6 ||
        !current.gauntlet.slot.every(x => Number(x) > 0) ||
        !['903', '904', '905', '906', '907', '926'].every(x =>
          (current.skills || []).map(String).includes(x)) ||
        BATU_GAUNTLET.some(x => Number((current.materials || {})[x]) < 70) ||
        Number(current.gold) < 6000000 || Number(current.token) < cost ||
        ACCOUNT.balance < cost)
      return { status: 0, error: 'Gauntlet power requirements not met' };
    const saved = chars.updateCharacter(id, c => {
      if (Number(c.gauntlet.power) > 0) return false;
      c.gauntlet.power = 1;
      c.skills ||= [];
      if (!c.skills.map(String).includes('908')) c.skills.push('908');
      for (const stoneId of BATU_GAUNTLET) c.materials[stoneId] -= 70;
      c.gold -= 6000000;
      c.token -= cost;
      c.utilityTokenSpent = (Number(c.utilityTokenSpent) || 0) + cost;
    });
    if (!saved) return { status: 0, error: 'Gauntlet power unlock failed' };
    ACCOUNT.balance -= cost;
    const c = saved.character;
    return {
      status: 1, error: null, result: {},
      stateInv: chars.stateGauntlet(c),
      update_inventory: {
        add_item_id: ['skill908'],
        remove_item_id: BATU_GAUNTLET.map(x => 'item' + x + '_70'),
        showPopup: false,
        gold: c.gold,
        token: ACCOUNT.balance,
        total_token: c.token,
      },
    };
  },

  'GodSnap.learnSlotSkill': (args) => {
    const slot = Number(args && args[1]);
    const skills = ['903', '904', '905', '906', '907', '926'];
    const costs = ACCOUNT.type === 2
      ? [1399, 1599, 1279, 1199, 1279, 1279]
      : [1799, 1999, 1599, 1499, 1599, 1599];
    const skillId = skills[slot - 1];
    const stoneId = BATU_GAUNTLET[slot - 1];
    const cost = costs[slot - 1];
    const id = chars.getActiveId();
    const current = id && chars.characterById(id);
    if (!Number.isInteger(slot) || !skillId || !current ||
        !(current.weapons || []).map(String).includes('1596') ||
        Number((current.gauntlet && current.gauntlet.slot || [])[slot - 1]) <= 0 ||
        (current.skills || []).map(String).includes(skillId) ||
        Number((current.materials || {})[stoneId]) < 150 ||
        Number(current.token) < cost || ACCOUNT.balance < cost)
      return { status: 0, error: 'Gauntlet skill requirements not met' };

    const saved = chars.updateCharacter(id, c => {
      c.skills ||= [];
      if (c.skills.map(String).includes(skillId) ||
          Number((c.materials || {})[stoneId]) < 150 || Number(c.token) < cost)
        return false;
      c.skills.push(skillId);
      c.gauntlet.slotSkill ||= [0, 0, 0, 0, 0, 0];
      c.gauntlet.slotSkill[slot - 1] = 1;
      c.materials[stoneId] -= 150;
      c.token -= cost;
      c.utilityTokenSpent = (Number(c.utilityTokenSpent) || 0) + cost;
    });
    if (!saved) return { status: 0, error: 'Gauntlet skill purchase failed' };
    ACCOUNT.balance -= cost;
    const c = saved.character;
    log('   gauntlet skill' + skillId + ' dipelajari');
    return {
      status: 1, error: null, result: {},
      stateInv: chars.stateGauntlet(c),
      update_inventory: {
        add_item_id: ['skill' + skillId],
        remove_item_id: ['item' + stoneId + '_150'],
        showPopup: false,
        gold: c.gold,
        token: ACCOUNT.balance,
        total_token: c.token,
      },
    };
  },

  'GodSnap.buyPackage': () => {
    const c = chars.characterById(chars.getActiveId()) || chars.firstCharacter();
    if (!c) return { status: 1, error: null, result: false };
    const cost = ACCOUNT.type === 2 ? 1039 : 1299;
    if (!(Array.isArray(c.weapons) && c.weapons.includes('1596'))) {
      if ((c.token || 0) >= cost) c.token -= cost;
      chars.addItem('wpn1596', 1);
      log('   gauntlet dibeli: wpn1596 (-' + cost + ' token)');
    } else {
      log('   gauntlet sudah dimiliki, tidak ditambah lagi');
    }
    return {
      status: 1,
      error: null,
      result: {},
      stateInv: chars.stateGauntlet(c),
      update_inventory: {
        add_item_id: ['wpn1596'],
        showPopup: false,
        token: c.token,
        total_token: c.token,
        gold: c.gold,
      },
    };
  },

  'GodSnap.buySkillPackage': () => {
    const c = chars.characterById(chars.getActiveId()) || chars.firstCharacter();
    if (!c) return { status: 1, error: null, result: false };
    const cost = ACCOUNT.type === 2 ? 1899 : 2399;
    if (!(Array.isArray(c.skills) && c.skills.map(String).includes('902'))) {
      if ((c.token || 0) >= cost) c.token -= cost;
      chars.addSkill('902');
      log('   kinjutsu dibeli: skill902 (Unstoppable Rage, -' + cost + ' token)');
    } else {
      log('   kinjutsu sudah dimiliki, tidak ditambah lagi');
    }
    return {
      status: 1,
      error: null,
      result: {},
      stateInv: chars.stateGauntlet(c),
      update_inventory: {
        add_item_id: ['skill902'],
        showPopup: false,
        token: c.token,
        total_token: c.token,
        gold: c.gold,
      },
    };
  },

  'SystemData.get': () => ({
    status: 1, error: null, result: systemDataFields(),
  }),

  // Dipanggil setelah data_library termuat.
  // args: [BUILD_NO, cls, hash, sessionKey]  — hash = SHA1(cls + SALT + sessionKey)
  // status 1 -> klien memanggil gotoSelchar() (layar pilih karakter)
  'SystemService.checkAmf': (args) => {
    if (args && args[1] != null && args[2] != null) {
      const expect = sha1(String(args[1]) + SALT + String(args[3]));
      log('   cek hash cls: klien=' + args[2] + ' hitung=' + expect +
          (expect === args[2] ? '  COCOK' : '  BEDA (diabaikan)'));
    }
    return { status: 1, error: null };
  },

  'SystemService.login': () => ({ status: 1, error: null }),
};

function dispatch(target, args) {
  const h = handlers[target];
  if (h) {
    log('   -> handler ADA');
    try {
      return h(args);
    } catch (e) {
      // Tanpa ini, exception di dalam handler membuat server DIAM: klien
      // menunggu balasan yang tidak pernah datang dan layar membeku tanpa
      // satu pun pesan error — gejala yang paling mahal untuk dilacak.
      log('   !! HANDLER ERROR: ' + (e && e.stack ? e.stack : String(e)));
      return { status: 1, error: null, result: [], data: {} };
    }
  }
  // Paket klaim: semua servis SpecialReward.claim<Nama>Package dibalas
  // lewat klaimPaket(), termasuk yang belum ada di PAKET_KLAIM -- balasan
  // generik tanpa `message` membuat klien melempar #2007.
  if (/^SpecialReward\.claim\w*Package$/.test(target)) {
    log('   -> paket klaim');
    return klaimPaket(target);
  }
  log('   -> handler BELUM ADA, balas status=1 kosong');
  return { status: 1, error: null, result: [], data: {} };
}

// ---------------------------------------------------------------
const missing = new Set();

// Folder aset. Server ada di C:\ninjasaga\server, web di C:\ninjasaga\web
const WEB_ROOT = path.resolve(__dirname, '..', 'web');

const MIME = {
  '.swf': 'application/x-shockwave-flash',
  '.xml': 'text/xml',
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg',
  '.json': 'application/json',
};

// File inti — kalau ini sampai hilang, JANGAN dibuatkan stub.
// Stub kosong untuk file inti = layar putih tanpa pesan error apa pun.
const INTI = new Set([
  'ninja_saga', 'code_library', 'client_library', 'network_library',
  'library', 'menu', 'popup', 'en', 'data_library_en', 'facebook_connector',
  'action_base',
]);

/* Jangan biarkan peramban menyimpan salinan berkas.
 *
 * ninja_saga.swf dimuat halaman lewat URL yang querynya selalu sama
 * (?fb_uid=...), tidak seperti SWF lain yang diberi "?_t=<waktu>" oleh
 * Preloader. Tanpa header ini peramban terus memakai salinan lama, sehingga
 * SWF hasil patch "tidak berefek" walaupun berkas di disk sudah benar.
 */
const TANPA_CACHE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0',
};

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const safe = path.normalize(urlPath).replace(/^([/\\])+/, '');
  const full = path.join(WEB_ROOT, safe);

  // jangan biarkan keluar dari WEB_ROOT
  if (!full.startsWith(WEB_ROOT)) { res.writeHead(403); return res.end(); }

  if (fs.existsSync(full) && fs.statSync(full).isFile()) {
    const data = fs.readFileSync(full);
    res.writeHead(200, Object.assign({
      'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
      'Content-Length': data.length,
    }, TANPA_CACHE));
    return res.end(data);
  }

  // Tidak ada di disk. Kalau .swf, buatkan pengganti kosong.
  if (full.toLowerCase().endsWith('.swf')) {
    const name = path.basename(full, path.extname(full));

    if (INTI.has(name)) {
      log('\n!! FILE INTI TIDAK DITEMUKAN: ' + name + '.swf');
      log('   dicari di: ' + full);
      log('   Ini TIDAK dibuatkan stub, karena stub kosong akan');
      log('   menghasilkan layar putih tanpa penjelasan.');
      log('   Periksa letak file ini.\n');
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('file inti hilang: ' + name + '.swf\n');
    }

    if (!missing.has(name)) {
      missing.add(name);
      fs.writeFileSync(path.join(__dirname, 'aset-hilang.txt'),
                       [...missing].sort().join('\n'));
    }

    // Coba KLONING aset lain dari folder yang sama.
    //
    // SWF stub kosong tidak bisa dipakai: klien memanggil
    // applicationDomain.getDefinition(nama), yang mensyaratkan kelasnya
    // ada di bytecode ABC. Stub cuma punya entri SymbolClass, sehingga
    // Flash melempar "Variable X is not defined" saat memuatnya.
    //
    // Donor asli punya ABC lengkap, jadi cukup diganti namanya.
    // Hasilnya terlihat seperti donor, tapi tidak error.
    const swf = cloneOrStub(path.dirname(full), name);
    res.writeHead(200, Object.assign({
      'Content-Type': 'application/x-shockwave-flash',
      'Content-Length': swf.length,
    }, TANPA_CACHE));
    return res.end(swf);
  }

  log('   [404] ' + urlPath);
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('tidak ditemukan: ' + urlPath + '\n');
}


// Cache donor per folder supaya tidak memindai ulang tiap permintaan.
const donorCache = new Map();

function isSwf(p) {
  try {
    const fd = fs.openSync(p, 'r');
    const b = Buffer.alloc(3);
    fs.readSync(fd, b, 0, 3, 0);
    fs.closeSync(fd);
    const s = b.toString();
    return s === 'FWS' || s === 'CWS' || s === 'ZWS';
  } catch { return false; }
}

/* Mencari donor yang benar-benar bisa dikloning.
 * Kandidat diurutkan dari yang terkecil, lalu dicoba satu per satu —
 * tidak semua SWF punya SymbolClass + DoABC yang dibutuhkan.
 */
// Batas pemindaian donor. Folder swf/items/ berisi ribuan file (rambut,
// senjata, body set, ikon), dan versi lama fungsi ini menyentuh SEMUANYA:
//
//     .filter(isSwf)                                    // buka & baca tiap file
//     .sort((a,b) => fs.statSync(a).size - fs.statSync(b).size)
//
// `sort` memanggil statSync DUA KALI per perbandingan, jadi jumlah panggilan
// sinkron tumbuh seperti n log n. Semuanya di thread tunggal Node, sehingga
// event loop terkunci dan permintaan HTTP yang sedang berjalan tidak pernah
// dijawab — klien melihat "http=-1 STALL=no-open" dan menunggu selamanya.
//
// Sekarang: nama file dulu (murah), stat SEKALI per kandidat, baru buka
// beberapa yang terkecil.
const MAKS_PINDAI = 200;   // nama file yang dipertimbangkan per folder
const MAKS_COBA   = 8;     // file yang benar-benar dibuka sebagai calon donor

function findDonor(dir) {
  if (donorCache.has(dir)) return donorCache.get(dir);

  const t0 = Date.now();
  const cari = [dir, path.join(WEB_ROOT, 'cdn', 'swf', 'latest', 'swf', 'items')];
  let hasil = null;

  for (const d of cari) {
    if (!fs.existsSync(d)) continue;

    const nama = fs.readdirSync(d)
      .filter(x => x.toLowerCase().endsWith('.swf'))
      .slice(0, MAKS_PINDAI);

    // satu statSync per kandidat, ukurannya disimpan — bukan dihitung ulang
    // di dalam pembanding sort.
    const terukur = [];
    for (const x of nama) {
      const p = path.join(d, x);
      try { terukur.push({ p, size: fs.statSync(p).size }); } catch { /* lewati */ }
    }
    terukur.sort((a, b) => a.size - b.size);

    for (const { p } of terukur.slice(0, MAKS_COBA)) {
      try {
        if (!isSwf(p)) continue;
        cloneFrom(fs.readFileSync(p), 'uji_donor_x', path.basename(p, '.swf'));
        hasil = p;
        break;
      } catch { /* donor ini tidak cocok, coba berikutnya */ }
    }
    if (hasil) break;
  }

  const ms = Date.now() - t0;
  if (ms > 200) log('   [donor] pemindaian ' + dir + ' makan ' + ms + 'ms');

  donorCache.set(dir, hasil);
  return hasil;
}

function cloneOrStub(dir, name) {
  // Dua NPC rekrut ini tidak ada di koleksi aset. Pakai donor yang berbeda
  // agar Gekko dan Ryuma tidak sama-sama tampil sebagai npc_2.
  const npcDir = path.join(WEB_ROOT, 'cdn', 'swf', 'latest', 'swf', 'npc');
  const npcDonor = path.resolve(dir) === npcDir &&
    ({ npc_3: 'npc_5.swf', npc_4: 'npc_6.swf' })[name];
  const preferred = npcDonor && path.join(dir, npcDonor);
  const donor = preferred && fs.existsSync(preferred) ? preferred : findDonor(dir);
  if (donor) {
    try {
      // nama berkas donor ikut dikirim supaya cloneFrom bisa memilih simbol
      // yang benar (kelas utama aset senama dengan berkasnya) dan menyamakan
      // pola huruf besar/kecilnya
      const swf = cloneFrom(fs.readFileSync(donor), name, path.basename(donor, '.swf'));
      log('   [klon] ' + name + '  <- ' + path.basename(donor));
      return swf;
    } catch (e) {
      log('   [klon gagal] ' + name + ' : ' + e.message);
    }
  }
  log('   [stub kosong] ' + name + '  (tidak ada donor cocok di ' + dir + ')');
  return buildStub(name);
}

/* Satu baris per permintaan berkas statis.
 *
 * Tanpa ini, log tidak bisa membedakan "peramban tidak pernah sampai ke
 * server" (Caddy mati, hosts hilang, sertifikat) dari "peramban sampai tapi
 * game berhenti sebelum login" -- keduanya sama-sama terlihat sebagai log
 * kosong sesudah banner. Baris pertama sebuah sesi mestinya
 *     [http] GET /ninja_saga.swf -> 200  2872142 B
 */
function catatHttp(req, res) {
  const url = String(req.url || '').split('?')[0];
  // Header yang dioper lewat writeHead(status, {...}) tidak bisa dibaca balik
  // dengan getHeader(), jadi ukurannya dihitung dari yang benar-benar dikirim.
  let terkirim = 0;
  const endAsli = res.end;
  res.end = function (chunk, ...sisa) {
    if (chunk && typeof chunk !== 'function') terkirim += Buffer.byteLength(chunk);
    return endAsli.call(this, chunk, ...sisa);
  };
  res.on('finish', () => {
    log('[http] ' + req.method + ' ' + url + ' -> ' + res.statusCode +
        '  ' + terkirim.toLocaleString('id-ID') + ' B');
  });
}

const server = http.createServer((req, res) => {
  // Tangani permintaan Trainer Web Dashboard & API
  try {
    if (trainer.handleRequest(req, res)) return;
  } catch (e) {
    log('!! ERROR TRAINER: ' + (e && e.stack ? e.stack : String(e)));
  }

  if (req.method !== 'POST') {
    // Dibungkus: satu URL aneh (mis. %-escape rusak yang membuat
    // decodeURIComponent melempar) dulu cukup untuk MEMATIKAN proses Node,
    // dan jejaknya hanya tampil di jendela konsol, tidak di amf-log.txt.
    try {
      catatHttp(req, res);
      return serveStatic(req, res);
    } catch (e) {
      log('!! ERROR BERKAS STATIS ' + req.url + '\n' + (e && e.stack ? e.stack : String(e)));
      try {
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('error\n');
      } catch { /* koneksi sudah tertutup */ }
      return;
    }
  }
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
   // Seluruh pemrosesan dibungkus supaya server TIDAK PERNAH diam.
   // decodePacket sudah punya penjaga sendiri, tapi log(), encodePacket(),
   // dan penulisan respons belum. Kalau salah satunya melempar, koneksi
   // menggantung tanpa jawaban: klien menunggu sampai timeout dan layarnya
   // membeku tanpa satu pun pesan error. Itu mode kegagalan yang paling
   // mahal untuk dilacak, jadi lebih baik membalas 500 daripada bisu.
   try {
    const buf = Buffer.concat(chunks);
    let pkt;
    try { pkt = decodePacket(buf); }
    catch (e) {
      log('\n!! GAGAL DECODE:', e.message);
      log('   hex:', buf.slice(0, 64).toString('hex'));
      res.writeHead(500); return res.end();
    }

    const out = [];
    let amf3 = false;
    for (const b of pkt.bodies) {
      amf3 = amf3 || b.amf3;
      log('\n======================================');
      log('AMF ->', b.target, '  (responseURI=' + b.response + ', amf3=' + b.amf3 + ')');
      log('   argumen:', b.data);
      const result = dispatch(b.target, b.data);
      if (b.target === 'SystemData.getHairData') {
        log('   balasan: [SystemData.getHairData: ' + (result.hair_data ? result.hair_data.length : 0) + ' items]');
      } else {
        log('   balasan:', result);
      }
      out.push({ target: (b.response || '/1') + '/onResult', response: '', data: result });
    }
    const body = encodePacket(out, amf3);
    res.writeHead(200, { 'Content-Type': 'application/x-amf', 'Content-Length': body.length });
    res.end(body);
   } catch (e) {
    console.log('!! ERROR MEMPROSES AMF: ' + (e && e.stack ? e.stack : String(e)));
    try {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('error\n');
    } catch { /* koneksi sudah tertutup */ }
   }
  });
});

// Kalau ada error yang lolos dari semua try/catch, catat ke amf-log.txt dan
// JANGAN matikan server. Dulu proses langsung berhenti dan satu-satunya
// jejaknya ada di jendela konsol -- yang biasanya sudah tertutup.
process.on('uncaughtException', e => {
  try { log('\n!! ERROR TAK TERTANGANI (server tetap jalan):\n' + (e && e.stack ? e.stack : String(e))); }
  catch { console.log(e); }
});

// Port 8080 sudah dipakai = server lain (atau jendela lama) masih hidup.
server.on('error', e => {
  if (e && e.code === 'EADDRINUSE') {
    log('\n!! PORT ' + PORT + ' SUDAH DIPAKAI.');
    log('   Ada server lain (mungkin jendela lama) yang masih jalan.');
    log('   Tutup semua jendela node, lalu jalankan lagi.');
    process.exit(1);
  }
  log('\n!! SERVER GAGAL: ' + (e && e.stack ? e.stack : String(e)));
});

server.listen(PORT, '127.0.0.1', () => {
  log('\n\n### Server jalan di http://127.0.0.1:' + PORT + ' — ' + new Date().toLocaleString());
  log('### folder aset : ' + WEB_ROOT);

  if (!fs.existsSync(WEB_ROOT)) {
    log('\n!! FOLDER ASET TIDAK DITEMUKAN.');
    log('   Server berhenti, karena kalau diteruskan SEMUA file akan');
    log('   dijawab stub kosong dan hasilnya cuma layar putih.');
    log('   Struktur yang diharapkan:');
    log('      C:\\ninjasaga\\server\\index.js   (file ini)');
    log('      C:\\ninjasaga\\web\\ninja_saga.swf');
    process.exit(1);
  }

  const cek = path.join(WEB_ROOT, 'ninja_saga.swf');
  log('### ninja_saga.swf : ' + (fs.existsSync(cek) ? 'ADA' : 'TIDAK ADA di ' + cek));
  log('### signature login = ' + signAccount(ACCOUNT));
  log('### ninja emblem = ' + (ACCOUNT.type === 2 ? 'AKTIF (premium)' : 'mati (biasa)'));
  log('### Trainer Dashboard : http://127.0.0.1:' + PORT + '/trainer');
});
