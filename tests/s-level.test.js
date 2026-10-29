'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const source = path.resolve(__dirname, '../server');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ninja-slevel-test-'));

try {
  for (const file of fs.readdirSync(source).filter(name => name.endsWith('.js'))) {
    fs.copyFileSync(path.join(source, file), path.join(temp, file));
  }
  const index = fs.readFileSync(path.join(temp, 'index.js'), 'utf8');
  fs.writeFileSync(path.join(temp, 'index.js'),
    index.slice(0, index.indexOf('server.listen(PORT')) + '\nmodule.exports = { dispatch };\n');
  fs.writeFileSync(path.join(temp, 'characters.json'), JSON.stringify({
    1: { character_id: '1', name: 'S-Level', rank: 9, level: 80, xp: 55735935,
      gold: 100, token: 200, items: [], missions: {} },
    2: { character_id: '2', name: 'Other', rank: 1, level: 1, xp: 0,
      gold: 100, token: 0, items: [], missions: {} },
  }));

  let chars = require(path.join(temp, 'chardata.js'));
  let gateway = require(path.join(temp, 'index.js'));
  const call = (service, ...args) => gateway.dispatch('SLevelMission.' + service, ['test', ...args]);
  chars.setActiveCharacter('1');

  let status = call('getBattleStatus');
  assert.equal(status.status, 1);
  assert.equal(status.result.chapter_status, 1);
  assert.equal(status.result.mission_status, 0);
  assert.equal(status.remain_energy, 75);
  assert.equal(call('getChapterStatus').result.mission_status, 0);
  assert.equal(call('startMission', 'msn275').status, 0);
  assert.equal(call('startMission', 'msn999').status, 0);
  assert.equal(call('finishMission', 'msn274', '', {}, 0).result, 1);
  assert.equal(chars.characterById('1').missions['274'], undefined);

  assert.equal(call('buyBigRamen', 5).status, 1);
  assert.equal(chars.characterById('1').sLevelTokenSpent, 150);
  assert.equal(chars.characterById('1').items.filter(id => id === '900').length, 5);
  assert.equal(call('buyBigRamen', 0).status, 0);
  assert.equal(call('useRamen', 1).status, 0); // Energy masih penuh.

  let started = call('startMission', 'msn274');
  assert.equal(started.status, 1);
  assert.ok(started.slf);
  assert.equal(call('getBattleStatus').remain_energy, 65);
  assert.equal(call('startMission', 'msn274').status, 1);
  assert.equal(call('getBattleStatus').remain_energy, 65);
  assert.equal(call('startMission', 'msn275').status, 0);
  assert.equal(call('useRamen', 2).status, 0); // Ramen kecil belum ada.
  assert.equal(call('useRamen', 1).status, 1);
  assert.equal(call('getBattleStatus').remain_energy, 75);
  assert.equal(chars.characterById('1').items.filter(id => id === '900').length, 4);

  const fail = call('finishMission', 'msn274', '', {}, 1);
  assert.equal(fail.status, 1);
  assert.deepEqual(fail.update_inventory.add_item_id, []);
  assert.equal(chars.characterById('1').missions['274'].fail, 1);
  assert.equal(call('getBattleStatus').result.mission_status, 0);
  const before = chars.characterById('1').xp;
  assert.equal(call('startMission', 'msn274').status, 1);
  const won = call('finishMission', 'msn274', '', {}, 0);
  assert.equal(won.status, 1);
  assert.deepEqual(won.update_inventory.add_item_id,
    ['item900', 'xp82700_1', 'gold5000_1']);
  assert.deepEqual(won.reward_list, ['item900']);
  assert.equal(chars.characterById('1').xp, before + 82700);
  assert.equal(chars.characterById('1').gold, 5100);
  assert.equal(chars.characterById('1').missions['274'].success, 1);
  assert.equal(call('getBattleStatus').result.mission_status, 1);
  assert.equal(call('finishMission', 'msn274', '', {}, 0).result, 1);
  assert.equal(chars.characterById('1').xp, before + 82700);
  for (const [id] of chars.S_LEVEL_MISSIONS.slice(1)) {
    if (call('getBattleStatus').remain_energy < 25) {
      assert.equal(call('useRamen', 1).status, 1);
    }
    assert.equal(call('startMission', id).status, 1);
    assert.equal(call('finishMission', id, '', {}, 0).status, 1);
  }
  assert.equal(call('getBattleStatus').result.mission_status, 5);
  assert.equal(call('getBattleStatus').result.chapter_status, 2);

  const c = chars.characterById('1');
  c.sLevelEnergy = 60;
  c.sLevelEnergyUpdatedAt = Math.floor(Date.now() / 1000) - 720;
  const recovered = call('getBattleStatus');
  assert.equal(recovered.remain_energy, 62);
  assert.ok(recovered.energy_refill_remain > 0);

  delete require.cache[require.resolve(path.join(temp, 'chardata.js'))];
  delete require.cache[require.resolve(path.join(temp, 'index.js'))];
  chars = require(path.join(temp, 'chardata.js'));
  gateway = require(path.join(temp, 'index.js'));
  chars.setActiveCharacter('1');
  assert.equal(call('getBattleStatus').result.mission_status, 5);
  assert.equal(call('getBattleStatus').remain_energy, 62);
  assert.equal(chars.characterById('1').sLevelTokenSpent, 150);

  chars.setActiveCharacter('2');
  assert.equal(call('getBattleStatus').remain_energy, 75);
  assert.equal(call('getBattleStatus').result.mission_status, 0);
  assert.equal(chars.characterById('2').items.length, 0);
  console.log('S-Level: status, ramen, battle, hadiah, kegagalan, progres, dan reload lulus.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
