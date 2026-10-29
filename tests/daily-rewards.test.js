'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const source = process.env.NINJA_TEST_SOURCE || path.resolve(__dirname, '..', 'server');
const stage = process.env.NINJA_TEST_STAGE || source;
const { createDailyRewards, MILESTONES, STONE_IDS } = require(path.join(stage, 'daily-rewards'));

function setup() {
  const data = { 1: { materials: { 1144: 7 } }, 2: {} };
  let writes = 0;
  const service = createDailyRewards({
    characterById(id) { return data[id]; },
    updateCharacter(id, change) {
      if (!data[id]) return null;
      const result = change(data[id]);
      if (result === false) return null;
      writes++;
      return { character: data[id], result };
    },
  });
  return { data, service, writes: () => writes };
}

test('calendar uses 31 date flags and six real rewards; repeat opens do not add attendance', () => {
  const { data, service, writes } = setup();
  const time = Date.parse('2026-10-28T03:00:00Z');
  const status = service.getStatus(1, time);
  assert.equal(status.status, 1);
  assert.equal(status.loginDay.length, 31);
  assert.equal(status.loginDay[27], '1');
  assert.equal(status.loginDay.filter(x => x === '0').length, 30);
  assert.deepEqual(status.rewardDay, MILESTONES.map(String));
  assert.deepEqual(status.item_list, STONE_IDS.map(id => [`item${id}_20`]));
  assert.deepEqual(status.claimReward, ['1', '0', '0', '0', '0', '0']);
  assert.ok(Object.values(status.txt).every(Boolean));
  for (let i = 0; i < 4; i++) service.getStatus(1, time);
  assert.equal(writes(), 1);
  assert.deepEqual(data[1].monthlyLoginReward.days, [28]);
  assert.equal(data[2].monthlyLoginReward, undefined);
});

test('claim grants currency once, rejects locked/invalid claims, and unlocks later milestones', () => {
  const { data, service } = setup();
  const time = Date.parse('2026-10-01T01:00:00Z');
  service.getStatus(1, time);
  for (const index of [undefined, null, '', '0', -1, 0.5, 6, NaN])
    assert.equal(service.claimReward(1, index, time).status, 0);
  assert.equal(service.claimReward(1, 1, time).status, 0);
  assert.equal(service.claimReward(999, 0, time).status, 0);
  const claim = service.claimReward(1, 0, time);
  assert.deepEqual(claim.update_inventory.add_item_id, ['item1144_20']);
  assert.equal(data[1].materials['1144'], 27);
  assert.equal(service.claimReward(1, 0, time).status, 0);
  assert.equal(data[1].materials['1144'], 27);
  assert.equal(service.getStatus(1, time).claimReward[0], '2');
  for (let day = 2; day <= 28; day++) {
    const status = service.getStatus(1, time + (day - 1) * 86400000);
    for (let index = 1; index < MILESTONES.length; index++) {
      if (day === MILESTONES[index]) {
        assert.equal(status.claimReward[index], '1');
        assert.equal(service.claimReward(1, index, time + (day - 1) * 86400000).status, 1);
        assert.equal(data[1].materials[STONE_IDS[index]], 20);
      }
    }
  }
});

test('Jakarta midnight, monthly reset and leap-year dates are handled', () => {
  const { data, service } = setup();
  service.getStatus(1, Date.parse('2026-10-31T16:59:59Z'));
  assert.deepEqual(data[1].monthlyLoginReward.days, [31]);
  service.claimReward(1, 0, Date.parse('2026-10-31T16:59:59Z'));
  const november = service.getStatus(1, Date.parse('2026-10-31T17:00:00Z'));
  assert.equal(data[1].monthlyLoginReward.month, '2026-11');
  assert.deepEqual(data[1].monthlyLoginReward.days, [1]);
  assert.deepEqual(data[1].monthlyLoginReward.claimed, []);
  assert.equal(november.loginDay[30], '-1');
  assert.equal(november.claimReward[0], '1');
  const leap = service.getStatus(1, Date.parse('2028-02-29T01:00:00Z'));
  assert.equal(leap.loginDay[28], '1');
  assert.equal(leap.loginDay[29], '-1');
  const february = service.getStatus(1, Date.parse('2027-02-28T01:00:00Z'));
  assert.equal(february.loginDay[28], '-1');
  assert.equal(data[1].materials['1144'], 27);
});

test('AMF handlers grant the selected character, and attendance/claims survive reload', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ninja-daily-rewards-'));
  try {
    for (const name of fs.readdirSync(source)) {
      if (name.endsWith('.js') || name.endsWith('.json') && name !== 'characters.json' && name !== 'characters.json.bak')
        fs.copyFileSync(path.join(source, name), path.join(root, name));
    }
    for (const name of ['daily-rewards.js', 'index.js'])
      fs.copyFileSync(path.join(stage, name), path.join(root, name));
    const index = path.join(root, 'index.js');
    fs.writeFileSync(index, fs.readFileSync(index, 'utf8').split('server.listen(PORT')[0] + '\nmodule.exports = { dispatch, ACCOUNT };\n');
    fs.writeFileSync(path.join(root, 'characters.json'), JSON.stringify({
      1: { character_id: '1', name: 'First', level: 1, rank: 1, xp: 0, gold: 300, token: 0, items: [] },
      2: { character_id: '2', name: 'Second', level: 1, rank: 1, xp: 0, gold: 300, token: 0, items: [] },
    }));
    let chars = require(path.join(root, 'chardata'));
    const { dispatch, ACCOUNT } = require(index);
    const sk = ACCOUNT.sessionKey;
    dispatch('CharacterDAO.getCharacterById', [sk, '2']);
    assert.equal(chars.characterById('2').monthlyLoginReward.days.length, 1);
    const status = dispatch('NewDailyRewardStamp2017.getStatus', [sk, 'en']);
    assert.equal(status.claimReward[0], '1');
    const response = dispatch('NewDailyRewardStamp2017.claimReward', [sk, 0]);
    assert.equal(response.status, 1);
    assert.deepEqual(response.update_inventory.add_item_id, ['item1144_20']);
    assert.equal(chars.characterById('2').materials['1144'], 20);
    assert.equal(chars.characterById('1').monthlyLoginReward, undefined);
    assert.equal(dispatch('NewDailyRewardStamp2017.claimReward', [sk, 0]).status, 0);
    delete require.cache[require.resolve(path.join(root, 'chardata'))];
    chars = require(path.join(root, 'chardata'));
    assert.equal(chars.characterById('2').materials['1144'], 20);
    const restored = createDailyRewards(chars).getStatus('2');
    assert.equal(restored.claimReward[0], '2');
    assert.match(chars.rawCharacter(chars.characterById('2'), sk).character_common_currency, /1144:20/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
