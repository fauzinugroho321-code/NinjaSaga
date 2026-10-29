'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const source = process.env.NINJA_TEST_SOURCE || path.resolve(__dirname, '..', 'server');
const stage = process.env.NINJA_TEST_STAGE || source;
const TAILS = ['146', '141', '131', '86', '74', '73', '71', '68', '65'];

test('all nine tails have valid default selection and purchases persist once for the selected character', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ninja-tails-'));
  try {
    for (const name of fs.readdirSync(source)) {
      if (name.endsWith('.js') || name === 'pet-upgrades.json') fs.copyFileSync(path.join(source, name), path.join(temp, name));
    }
    const indexPath = path.join(temp, 'index.js');
    const code = fs.readFileSync(path.join(stage, 'index.js'), 'utf8');
    fs.writeFileSync(indexPath, code.split('server.listen(PORT')[0] + '\nmodule.exports = { dispatch, ACCOUNT };\n');
    fs.writeFileSync(path.join(temp, 'characters.json'), JSON.stringify({
      1: { character_id: '1', name: 'First', level: 1, rank: 1, xp: 0, gold: 300, token: 100000, items: [] },
      2: { character_id: '2', name: 'Second', level: 1, rank: 1, xp: 0, gold: 300, token: 100000, items: [], pets: [{ id: '2', name: 'Existing', level: 1, xp: 0, equipped: true }] },
    }));
    let chars = require(path.join(temp, 'chardata'));
    let gateway = require(indexPath);
    const sk = gateway.ACCOUNT.sessionKey;
    gateway.dispatch('CharacterDAO.getCharacterById', [sk, '2']);
    let status = gateway.dispatch('Anni5th.getTailPet', [sk]);
    assert.deepEqual(status.active_tail_number, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.ok(status.active_tail_number.includes(status.default_tail_number));
    assert.equal(status.active_tail_number.indexOf(status.default_tail_number), 0);
    assert.deepEqual(status.owned_tail_number, []);
    const { petById } = require(path.join(temp, 'petdata'));
    const accountBefore = gateway.ACCOUNT.balance;
    const charBefore = chars.characterById('2').token;
    for (const id of ['', '0', '1', 'pet999', 'pet65junk', null]) {
      assert.equal(gateway.dispatch('Anni5th.buyPet', [sk, id]).status, 0);
    }
    let spent = 0;
    for (const [index, id] of TAILS.entries()) {
      const cost = petById(id).token;
      const response = gateway.dispatch('Anni5th.buyPet', [sk, 'pet' + id, 'Untrusted name', 'en']);
      assert.equal(response.status, 1);
      spent += cost;
      assert.equal(response.balance, accountBefore - spent);
      assert.equal(response.total_token, charBefore - spent);
      assert.equal(response.result.equipped, false);
      assert.equal(response.result.id, id);
      assert.equal(response.result.name, petById(id).name);
      assert.deepEqual(response.result.skills, [0]);
      const pet = response.result;
      const signed = [pet.id, pet.swfName, pet.clsName, pet.level, pet.xp].join(',');
      assert.equal(pet.hash, crypto.createHash('sha1').update(signed + 'Vmn34aAciYK00Hen26nT01' + sk, 'binary').digest('hex'));
      assert.equal(gateway.dispatch('Anni5th.buyPet', [sk, id]).status, 0);
      assert.equal(gateway.ACCOUNT.balance, accountBefore - spent);
      status = gateway.dispatch('Anni5th.getTailPet', [sk]);
      assert.deepEqual(status.owned_tail_number, Array.from({ length: index + 1 }, (_, i) => i + 1));
    }
    const second = chars.characterById('2');
    assert.equal(second.pets.length, 10);
    assert.equal(second.pets.find(p => p.id === '2').equipped, true);
    assert.ok(second.pets.filter(p => TAILS.includes(p.id)).every(p => !p.equipped));
    assert.equal((chars.characterById('1').pets || []).length, 0);
    assert.equal(second.utilityTokenSpent, spent);
    assert.equal(gateway.dispatch('SpecialReward.claimPaymentPet', [sk, 'en']).status, 0);

    gateway.dispatch('CharacterDAO.getCharacterById', [sk, '1']);
    gateway.ACCOUNT.balance = 1;
    assert.equal(gateway.dispatch('Anni5th.buyPet', [sk, 'pet146']).status, 0);
    assert.equal((chars.characterById('1').pets || []).length, 0);
    assert.equal(chars.characterById('1').token, 100000);

    delete require.cache[require.resolve(indexPath)];
    delete require.cache[require.resolve(path.join(temp, 'chardata'))];
    chars = require(path.join(temp, 'chardata'));
    gateway = require(indexPath);
    assert.equal(gateway.ACCOUNT.balance, accountBefore - spent);
    gateway.dispatch('CharacterDAO.getCharacterById', [sk, '2']);
    assert.deepEqual(gateway.dispatch('Anni5th.getTailPet', [sk]).owned_tail_number, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.equal(chars.characterById('2').pets.length, 10);
    assert.equal(chars.characterById('2').token, charBefore - spent);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
