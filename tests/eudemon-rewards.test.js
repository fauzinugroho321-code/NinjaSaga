'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const source = process.env.NINJA_TEST_SOURCE || path.resolve(__dirname, '..', 'server');
const stage = process.env.NINJA_TEST_STAGE || source;

function fixture() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ninja-eudemon-test-'));
  for (const name of fs.readdirSync(source)) {
    if (name.endsWith('.js') || name === 'pet-upgrades.json') fs.copyFileSync(path.join(source, name), path.join(temp, name));
  }
  for (const name of ['index.js', 'eudemon-garden.js']) fs.copyFileSync(path.join(stage, name), path.join(temp, name));
  const db = path.join(temp, 'characters.json');
  fs.writeFileSync(db, JSON.stringify(Object.fromEntries([1, 2, 3].map(id => [id, {
    character_id: String(id), name: 'Hunter' + id, xp: 0, level: 1, rank: 1,
    gold: 100, token: 100, hp: 100, cp: 100, agi: 1,
    weapons: ['1'], bodysets: ['01'], backitems: [], items: [], skills: [],
  }]))));
  const index = path.join(temp, 'index.js');
  fs.writeFileSync(index, fs.readFileSync(index, 'utf8').split('server.listen(PORT')[0] + '\nmodule.exports = { dispatch, ACCOUNT };\n');
  const characters = require(path.join(temp, 'chardata'));
  const module = require(path.join(temp, 'eudemon-garden'));
  return { temp, db, index, characters, module, cleanup: () => fs.rmSync(temp, { recursive: true, force: true }) };
}

// Exercise every possible local loot result against both advertised rooms and disk state.
test('both Eudemon rooms award the preview XP/gold and only their advertised loot; saves survive reload', () => {
  const f = fixture();
  try {
    let ticket = 0;
    const service = f.module.createEudemonGarden(f.characters, max => { assert.ok(ticket < max); return ticket; });
    const rooms = service.getStatus().result.room;
    assert.deepEqual(rooms.map(x => [x.xp, x.gold]), [[550, 400], [900, 700]]);
    for (const [roomId, room] of rooms.entries()) {
      for (ticket = 0; ticket <= room.rewards.length; ticket++) {
        const before = structuredClone(f.characters.characterById('1'));
        assert.equal(service.start('1', roomId, room.boss.join(',')).status, 1);
        const result = service.finish('1', String(roomId), 0);
        const drops = ticket < room.rewards.length ? [room.rewards[ticket]] : [];
        assert.equal(result.status, 1);
        assert.deepEqual(result.reward, [`xp_${room.xp}`, `gold_${room.gold}`, ...drops]);
        assert.deepEqual(result.reward_get, drops);
        const actual = f.characters.characterById('1');
        assert.equal(actual.xp - before.xp, room.xp);
        assert.equal(actual.gold - before.gold, room.gold);
        for (const drop of drops) {
          const item = f.characters.kantongDari(drop.replace('_', ''));
          assert.ok(actual[item.bag].includes(item.num));
          assert.equal(actual[item.bag].filter(id => id === item.num).length, 1);
        }
        assert.deepEqual(actual.items, []);
        const saved = JSON.parse(fs.readFileSync(f.db, 'utf8'))['1'];
        assert.equal(saved.xp, actual.xp);
        assert.equal(saved.gold, actual.gold);
        assert.deepEqual(saved.eudemonHunt.drops, drops);
        assert.deepEqual(service.finish('1', roomId, 0).reward, []);
        assert.equal(f.characters.characterById('1').xp, actual.xp);
      }
    }
    assert.equal(f.characters.characterById('2').xp, 0);
    assert.equal(f.characters.characterById('2').gold, 100);
    assert.equal(f.characters.characterById('2').eudemonHunt, undefined);
    const beforeReload = f.characters.characterById('1').xp;
    delete require.cache[require.resolve(path.join(f.temp, 'chardata'))];
    const reloaded = require(path.join(f.temp, 'chardata'));
    assert.deepEqual(f.module.createEudemonGarden(reloaded).finish('1', 1, 0).reward, []);
    assert.equal(reloaded.characterById('1').xp, beforeReload);
  } finally { f.cleanup(); }
});

test('invalid rooms, mismatched enemies, unstarted results and defeats cannot award loot or progress', () => {
  const f = fixture();
  try {
    let rolls = 0;
    const service = f.module.createEudemonGarden(f.characters, () => { rolls++; return 0; });
    for (const invalid of [null, undefined, '', false, true, -1, 2, 0.5, {}, '00', '1x']) {
      assert.equal(service.start('1', invalid, 'enemy338').status, 0);
      assert.equal(service.finish('1', invalid, 0).status, 0);
    }
    assert.equal(service.start('1', 0, 'enemy339').status, 0);
    assert.equal(service.start(null, 0, 'enemy338').status, 0);
    assert.equal(service.finish('2', 0, 0).status, 0);
    assert.equal(service.start('1', 0, 'enemy338').status, 1);
    assert.equal(service.finish('1', 1, 0).status, 0);
    assert.equal(service.finish('1', 0, undefined).status, 0);
    const failed = service.finish('1', 0, 1);
    assert.equal(failed.status, 1);
    assert.deepEqual(failed.reward, []);
    assert.deepEqual(failed.reward_get, []);
    assert.deepEqual(service.finish('1', 0, 0).reward, []);
    assert.equal(rolls, 0);
    assert.equal(f.characters.characterById('1').xp, 0);
    assert.equal(f.characters.characterById('1').gold, 100);
    assert.deepEqual(f.characters.characterById('1').weapons, ['1']);
  } finally { f.cleanup(); }
});

test('gateway uses the selected room and keeps AMF reward arrays and the following zero-gain sync consistent', () => {
  const f = fixture();
  try {
    const { dispatch, ACCOUNT } = require(f.index);
    const sk = ACCOUNT.sessionKey;
    dispatch('CharacterDAO.getCharacterById', [sk, '2']);
    const preview = dispatch('EudemonGarden.getHuntingStatus', [sk]).result.room;
    for (const roomId of [0, 1]) {
      const room = preview[roomId];
      assert.equal(dispatch('EudemonGarden.startHunting', [sk, roomId, '', 'hash', '', room.boss.join(',')]).status, 1);
      const before = structuredClone(f.characters.characterById('2'));
      const result = dispatch('EudemonGarden.finishHunting', [sk, roomId, {}, 0, 'hash', '1', '', '1']);
      assert.equal(result.status, 1);
      assert.deepEqual(result.reward.slice(0, 2), [`xp_${room.xp}`, `gold_${room.gold}`]);
      assert.ok(result.reward.slice(2).every(id => room.rewards.includes(id)));
      assert.deepEqual(result.reward.slice(2), result.reward_get);
      assert.equal(result.result, null);
      assert.equal(result.extra_reward, null);
      assert.equal(result.pet, null);
      const character = f.characters.characterById('2');
      const sync = dispatch('CharacterService.updateCharacter', [sk, '2', character.level, 0, 0, {}, null, 0, '']);
      assert.equal(sync.status, 1);
      assert.equal(f.characters.characterById('2').xp - before.xp, room.xp);
      assert.equal(f.characters.characterById('2').gold - before.gold, room.gold);
      const duplicate = dispatch('EudemonGarden.finishHunting', [sk, roomId, {}, 0]);
      assert.deepEqual(duplicate.reward, []);
      assert.deepEqual(duplicate.reward_get, []);
      f.characters.addProgress(room.xp, room.gold, '3');
      const baseline = f.characters.characterById('3');
      for (const stat of ['xp', 'gold', 'level', 'hp', 'cp', 'agi'])
        assert.equal(f.characters.characterById('2')[stat], baseline[stat], stat);
    }
    assert.equal(f.characters.characterById('1').xp, 0);
    assert.equal(f.characters.characterById('1').gold, 100);
    // Other boss services retain their existing defaults.
    assert.deepEqual(dispatch('CharacterDAO.finishHunting', []).reward,
      ['xp_1000', 'gold_500', 'item_600', 'item_604']);
  } finally { f.cleanup(); }
});
