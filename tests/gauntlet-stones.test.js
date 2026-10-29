'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { Readable } = require('node:stream');

test('trainer stone amounts persist through character selection and max gauntlet', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ninja-gauntlet-stones-'));
  try {
    const source = process.env.NINJA_TEST_SOURCE || path.join(__dirname, '..', 'server');
    const stage = process.env.NINJA_TEST_STAGE || source;
    const server = path.join(root, 'server');
    fs.mkdirSync(server);
    for (const name of fs.readdirSync(source)) {
      if (name.endsWith('.js') || name === 'pet-upgrades.json')
        fs.copyFileSync(path.join(source, name), path.join(server, name));
    }
    for (const name of ['chardata.js', 'trainer.js', 'index.js'])
      fs.copyFileSync(path.join(stage, name), path.join(server, name));
    const indexPath = path.join(server, 'index.js');
    fs.writeFileSync(indexPath,
      fs.readFileSync(indexPath, 'utf8').split('server.listen(PORT')[0] +
      '\nmodule.exports = { dispatch, ACCOUNT };\n');

    const chars = require(path.join(server, 'chardata.js'));
    const trainer = require(path.join(server, 'trainer.js'));
    const { dispatch, ACCOUNT } = require(indexPath);
    const first = dispatch('CharacterDAO.createCharacter',
      [ACCOUNT.sessionKey, 'First', 0, 0, 15, '19_0', '01_0']);
    const second = dispatch('CharacterDAO.createCharacter',
      [ACCOUNT.sessionKey, 'Second', 0, 0, 15, '19_0', '01_0']);
    const ids = chars.GAUNTLET_STONE_IDS;
    const amounts = Object.fromEntries(ids.map((id, index) => [id, (index + 1) * 10]));
    const saved = chars.setGauntletStones(second.character_id, amounts);
    assert.ok(saved);
    assert.equal((chars.characterById(first.character_id).materials || {})['1144'] || 0, 0);
    assert.deepEqual(ids.map(id => chars.characterById(second.character_id).materials[id]),
      ids.map(id => amounts[id]));

    dispatch('CharacterDAO.getCharacterById', [ACCOUNT.sessionKey, second.character_id]);
    assert.deepEqual(ids.map(id => chars.characterById(second.character_id).materials[id]),
      ids.map(id => amounts[id]));
    const raw = chars.rawCharacter(chars.characterById(second.character_id), ACCOUNT.sessionKey);
    assert.match(raw.character_common_currency, /1144:10/);
    assert.match(raw.character_common_currency, /1150:60/);
    assert.doesNotMatch(raw.character_material, /1144:10/);

    const status = trainer.getTrainerData();
    const selected = status.characters.find(c => c.id === String(second.character_id));
    assert.deepEqual(selected.gauntletStones, amounts);

    await new Promise(resolve => {
      const req = Readable.from([Buffer.from(JSON.stringify({
        id: first.character_id,
        stones: Object.fromEntries(ids.map(id => [id, 220])),
      }))]);
      req.url = '/api/trainer/gauntlet-stones';
      req.method = 'POST';
      const res = {
        writeHead(code) { assert.equal(code, 200); },
        end(body) { assert.equal(JSON.parse(body).success, true); resolve(); },
      };
      assert.equal(trainer.handleRequest(req, res), true);
    });
    assert.equal(chars.characterById(first.character_id).materials['1150'], 220);
    assert.equal(chars.characterById(second.character_id).materials['1150'], 60);

    chars.unlockGauntletMax(second.character_id);
    assert.deepEqual(ids.map(id => chars.characterById(second.character_id).materials[id]),
      ids.map(() => 220));
    assert.equal(chars.stateGauntlet(chars.characterById(second.character_id))
      .wpn_1596, '1,1,1,1,1,1');

    chars.updateCharacter(second.character_id, c => {
      c.gauntlet.slot[5] = 0;
      c.gold = 1000000;
    });
    const implant = dispatch('GodSnap.upgradeWeapon', [ACCOUNT.sessionKey, 6]);
    assert.equal(implant.status, 1);
    assert.equal(implant.stateInv.wpn_1596, '1,1,1,1,1,1');
    assert.deepEqual(implant.update_inventory.remove_item_id, ['item1150_220']);
    assert.equal(chars.characterById(second.character_id).materials['1150'], 0);
    assert.equal(chars.characterById(second.character_id).gold, 300000);
    assert.equal(chars.characterById(second.character_id).gauntlet.slot[5], 1);
    assert.equal(dispatch('GodSnap.upgradeWeapon', [ACCOUNT.sessionKey, 6]).status, 0);
    assert.equal(chars.characterById(second.character_id).gold, 300000);
    chars.setGauntlet('slot', 5, 2);
    assert.equal(chars.stateGauntlet(chars.characterById(second.character_id))
      .wpn_1596, '1,1,1,1,1,1');

    chars.updateCharacter(second.character_id, c => {
      c.gauntlet.slotSkill[5] = 0;
      c.gauntlet.power = 0;
      c.skills = c.skills.filter(x => !['926', '908'].includes(String(x)));
      c.materials['1150'] = 220;
      c.token = 5000;
      c.gold = 7000000;
    });
    const purchase = dispatch('GodSnap.learnSlotSkill', [ACCOUNT.sessionKey, 6]);
    assert.equal(purchase.status, 1);
    assert.deepEqual(purchase.update_inventory.add_item_id, ['skill926']);
    assert.deepEqual(purchase.update_inventory.remove_item_id, ['item1150_150']);
    assert.equal(chars.characterById(second.character_id).materials['1150'], 70);
    assert.equal(chars.characterById(second.character_id).token, 3721);
    assert.ok(chars.characterById(second.character_id).skills.includes('926'));
    assert.match(chars.rawCharacter(chars.characterById(second.character_id), ACCOUNT.sessionKey)
      .character_skill, /926/);
    assert.equal(dispatch('GodSnap.learnSlotSkill', [ACCOUNT.sessionKey, 6]).status, 0);

    const power = dispatch('GodSnap.unlockPower', [ACCOUNT.sessionKey, 1]);
    assert.equal(power.status, 1);
    assert.deepEqual(power.update_inventory.add_item_id, ['skill908']);
    assert.equal(chars.characterById(second.character_id).materials['1150'], 0);
    assert.equal(chars.characterById(second.character_id).gold, 1000000);
    assert.ok(chars.characterById(second.character_id).skills.includes('908'));
    assert.equal(dispatch('GodSnap.unlockPower', [ACCOUNT.sessionKey, 1]).status, 0);
    assert.throws(() => chars.setGauntletStones(second.character_id,
      Object.fromEntries(ids.map(id => [id, -1]))), /antara 0 dan 999999/);

    let html = '';
    trainer.handleRequest({ url: '/trainer', method: 'GET' }, {
      writeHead(code) { assert.equal(code, 200); },
      end(body) { html = body; },
    });
    assert.match(html, /Batu Six-Element Gauntlet/);
    assert.match(html, /stone1150/);
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    new vm.Script(script);

    chars.updateCharacter(second.character_id, c => {
      c.skills = c.skills.filter(x => !['926', '908'].includes(String(x)));
    });
    delete require.cache[require.resolve(path.join(server, 'chardata.js'))];
    const reloaded = require(path.join(server, 'chardata.js'));
    const restored = reloaded.characterById(second.character_id);
    assert.ok(restored.skills.includes('926'));
    assert.ok(restored.skills.includes('908'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
