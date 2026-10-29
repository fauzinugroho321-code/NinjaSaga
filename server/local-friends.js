'use strict';

// Karakter lokal ini hanya muncul sebagai teman, anggota klan, dan lawan tantangan.
// ID tinggi menjaga jarak dari karakter yang dibuat lewat layar pilih karakter.
const friends = Object.freeze([
  { id: 900001, name: 'Akira', level: 35, gender: 0 },
  { id: 900002, name: 'Kenji', level: 50, gender: 0 },
  { id: 900003, name: 'Raiden', level: 70, gender: 0 },
  { id: 900004, name: 'Hiro', level: 10, gender: 0 },
  { id: 900005, name: 'Kaito', level: 15, gender: 0 },
  { id: 900006, name: 'Sora', level: 18, gender: 0 },
  { id: 900007, name: 'Takeshi', level: 65, gender: 0 },
  { id: 900008, name: 'Ryu', level: 75, gender: 0 },
]);

// Setiap teman memakai aset yang memang ada di web/cdn/swf/latest/swf/items.
const looks = Object.freeze({
  900001: { bodySet: '100', hair: '10_0', weapon: '100' },
  900002: { bodySet: '101', hair: '11_0', weapon: '101' },
  900003: { bodySet: '104', hair: '12_0', weapon: '102' },
  900004: { bodySet: '105', hair: '13_0', weapon: '103' },
  900005: { bodySet: '108', hair: '14_0', weapon: '104' },
  900006: { bodySet: '109', hair: '15_0', weapon: '105' },
  900007: { bodySet: '110', hair: '16_0', weapon: '106' },
  900008: { bodySet: '111', hair: '18_0', weapon: '107' },
});

function byId(id) {
  return friends.find(friend => String(friend.id) === String(id)) || null;
}

function socialRecord(friend) {
  const id = String(friend.id);
  return {
    id, uid: id, fb_uid: id, fb_id: id, source_id: id,
    character_id: id, char_id: id, charId: id,
    name: friend.name, char_name: friend.name, character_name: friend.name,
    display_name: friend.name, fb_name: friend.name,
    level: friend.level, character_level: friend.level,
    gender: friend.gender, sex: friend.gender,
    pic_square: '', thumbnail_url: '', recruited_time: 0,
  };
}

function friendList() {
  return friends.map(socialRecord);
}

function rankForLevel(level) {
  return level >= 40 ? 4 : level >= 20 ? 2 : 1;
}

// Hasil getRecruitRecord/getChallengeRecord berbeda dari daftar akun sosial:
// field `id` di sini akan membuat klien menganggap teman sebagai NPC.
function characterRecords(requestedIds, xpForLevel) {
  const requested = requestedIds == null ? null :
    new Set(String(requestedIds).match(/\d+/g) || []);
  const now = Math.floor(Date.now() / 1000);
  return friends.filter(friend => !requested || requested.has(String(friend.id)))
    .map(friend => ({
      source_id: String(friend.id),
      character_id: String(friend.id),
      character_name: friend.name,
      character_level: String(friend.level),
      character_xp: String(xpForLevel(friend.level)),
      character_rank: String(rankForLevel(friend.level)),
      character_gender: friend.gender,
      account_type: 2,
      recruit_last_time: null,
      challenge_last_time: 0,
      server_time: now,
    }));
}

function clanMembers() {
  return friends.map(friend => ({
    id: friend.id,
    name: friend.name,
    level: friend.level,
    account_type: 2,
    skill_type: 0,
    position: 0,
    reputation: 0,
    last_login: Math.floor(Date.now() / 1000),
  }));
}

function profile(friend, template, xpForLevel) {
  if (!template) return null;
  const xp = xpForLevel(friend.level);
  const look = looks[friend.id];
  return {
    ...template,
    character_id: String(friend.id), id: String(friend.id),
    name: friend.name, gender: friend.gender,
    level: friend.level, xp, rank: rankForLevel(friend.level),
    hp: 100 + (friend.level - 1) * 40,
    cp: 100 + (friend.level - 1) * 40,
    hair: look.hair,
    face: '01_0',
    skin_color: 0,
    bodysets: [look.bodySet],
    hairs: [],
    weapons: [look.weapon],
    backitems: [],
    accessories: [],
    items: [],
    skills: [],
    bloodline: [],
    senjutsu: [],
    pets: [],
    elements: [0, 0, 0, 0, 0],
    equip: { weapon: `wpn${look.weapon}`, bodySet: `set${look.bodySet}`,
             backItem: '', accessory: '', jutsu: [] },
  };
}

module.exports = { friends, byId, friendList, characterRecords, clanMembers, profile };
