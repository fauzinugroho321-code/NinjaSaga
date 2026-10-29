'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('Kage skill claim updates the live Jutsu inventory and remains idempotent', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ninja-kage-claim-'));
  try {
    const source = process.env.NINJA_TEST_SOURCE || path.join(__dirname, '..', 'server');
    const stage = process.env.NINJA_TEST_STAGE || source;
    const server = path.join(root, 'server');
    fs.mkdirSync(server);
    for (const name of fs.readdirSync(source)) {
      if (name.endsWith('.js') || name === 'pet-upgrades.json')
        fs.copyFileSync(path.join(source, name), path.join(server, name));
    }
    fs.copyFileSync(path.join(stage, 'index.js'), path.join(server, 'index.js'));
    const indexPath = path.join(server, 'index.js');
    fs.writeFileSync(indexPath,
      fs.readFileSync(indexPath, 'utf8').split('server.listen(PORT')[0] +
      '\nmodule.exports = { dispatch, ACCOUNT };\n');

    const chars = require(path.join(server, 'chardata.js'));
    const { dispatch, ACCOUNT } = require(indexPath);
    const created = dispatch('CharacterDAO.createCharacter',
      [ACCOUNT.sessionKey, 'KageTester', 0, 0, 0, '01_0', '01_0']);
    const id = created.character_id;
    assert.equal(dispatch('Anni9th.selectKageMission', [ACCOUNT.sessionKey, 1]).status, 1);
    for (let n = 1; n <= 5; n++) {
      const response = dispatch('Anni9th.claimKageMissionReward',
        [ACCOUNT.sessionKey, 'e' + n]);
      assert.equal(response.status, 1);
      assert.equal(response.mission[n - 1].claim_status, 2);
      assert.deepEqual(response.update_inventory.add_item_id,
        [n === 5 ? 'skill892' : 'item1127']);
      assert.equal(response.update_inventory.showPopup, false);
    }
    assert.equal(chars.characterById(id).skills.filter(s => s === '892').length, 1);
    assert.ok(chars.rawCharacter(chars.characterById(id), ACCOUNT.sessionKey)
      .character_skill.split(',').includes('892'));
    const duplicate = dispatch('Anni9th.claimKageMissionReward',
      [ACCOUNT.sessionKey, 'e5']);
    assert.equal(duplicate.status, 1);
    assert.equal(duplicate.update_inventory, undefined);
    assert.equal(chars.characterById(id).skills.filter(s => s === '892').length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
