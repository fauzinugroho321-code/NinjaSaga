'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('Unstoppable Rage purchase updates the live inventory and persists once', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ninja-kinjutsu-purchase-'));
  try {
    const source = process.env.NINJA_TEST_SOURCE || path.join(__dirname, '..', 'server');
    const stage = process.env.NINJA_TEST_STAGE || source;
    const server = path.join(root, 'server');
    fs.mkdirSync(server);
    for (const name of fs.readdirSync(source)) {
      if (name.endsWith('.js') || name === 'pet-upgrades.json')
        fs.copyFileSync(path.join(source, name), path.join(server, name));
    }
    for (const name of ['chardata.js', 'index.js'])
      fs.copyFileSync(path.join(stage, name), path.join(server, name));
    const indexPath = path.join(server, 'index.js');
    fs.writeFileSync(indexPath,
      fs.readFileSync(indexPath, 'utf8').split('server.listen(PORT')[0] +
      '\nmodule.exports = { dispatch, ACCOUNT };\n');

    const chars = require(path.join(server, 'chardata.js'));
    const { dispatch, ACCOUNT } = require(indexPath);
    const created = dispatch('CharacterDAO.createCharacter',
      [ACCOUNT.sessionKey, 'Buyer', 0, 0, 15, '19_0', '01_0']);
    chars.updateCharacter(created.character_id, c => { c.token = 10000; });
    const expectedCost = ACCOUNT.type === 2 ? 1899 : 2399;
    const bought = dispatch('GodSnap.buySkillPackage', [ACCOUNT.sessionKey, 1]);
    assert.equal(bought.status, 1);
    assert.deepEqual(bought.update_inventory.add_item_id, ['skill902']);
    assert.equal(bought.update_inventory.showPopup, false);
    assert.equal(bought.update_inventory.token, 10000 - expectedCost);
    assert.equal(bought.update_inventory.total_token, 10000 - expectedCost);
    assert.equal(chars.characterById(created.character_id).token, 10000 - expectedCost);
    assert.ok(chars.characterById(created.character_id).skills.includes('902'));

    const again = dispatch('GodSnap.buySkillPackage', [ACCOUNT.sessionKey, 1]);
    assert.equal(again.update_inventory.token, 10000 - expectedCost);
    assert.deepEqual(again.update_inventory.add_item_id, ['skill902']);
    assert.equal(chars.characterById(created.character_id).skills.filter(s => s === '902').length, 1);
    const selected = dispatch('CharacterDAO.getCharacterById',
      [ACCOUNT.sessionKey, created.character_id]);
    assert.ok(selected.result.character_skill.split(',').includes('902'));
    assert.equal(chars.buildExtraData(chars.characterById(created.character_id),
      ACCOUNT.sessionKey).totalToken, 10000 - expectedCost);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
