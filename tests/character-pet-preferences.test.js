'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('character, pet, options, emblem and daily actions survive reload', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ninja-actions-'));
  const server = path.join(root, 'server');
  fs.mkdirSync(server);
  const source = path.join(__dirname, '..', 'server');
  for (const name of fs.readdirSync(source)) {
    if (name.endsWith('.js') || name === 'pet-upgrades.json')
      fs.copyFileSync(path.join(source, name), path.join(server, name));
  }
  const indexPath = path.join(server, 'index.js');
  fs.writeFileSync(indexPath,
    fs.readFileSync(indexPath, 'utf8').split("server.listen(PORT")[0] +
    '\nmodule.exports = { dispatch, ACCOUNT };\n');
  const chars = require(path.join(server, 'chardata.js'));
  const c = chars.createCharacter(['localdevsession0001', 'Starter', 0, 0, 0, '01_0', '01_0']);
  chars.setActiveCharacter(c.character_id);
  const { dispatch, ACCOUNT } = require(indexPath);
  const call = (name, ...args) => dispatch(name, ['localdevsession0001', ...args]);
  assert.equal(chars.rawCharacter(c, ACCOUNT.sessionKey).daily, null);

  assert.equal(call('CharacterDAO.upgradeInvSlot', 'back', 2).status, 1);
  assert.equal(chars.rawCharacter(chars.characterById(c.character_id), ACCOUNT.sessionKey)
    .character_inv_slots.back, 202);
  assert.equal(call('OptionData.setOption', 1, 0, 0).status, 1);
  assert.equal(call('CharacterService.changeName', 'Renamed').status, 1);
  assert.equal(call('CharacterService.reviveBattleCharacter').update_inventory.token,
    ACCOUNT.balance);
  assert.equal(call('CharacterDAO.upgradeEmblemType').days_left, 0);
  assert.equal(call('CharacterDAO.claimEmblemType2XpBonus').status, 1);
  assert.equal(chars.buildExtraData(chars.characterById(c.character_id), ACCOUNT.sessionKey)
    .emblem_xp_bonus_times, 30);

  chars.addPet({ id: '93', level: 20, xp: chars.xpPetUntukLevel(20), name: 'Chick' });
  assert.equal(call('CharacterService.changePetName', '93', 'Birdie').status, 1);
  assert.equal(call('CharacterDAO.upgradePet', '93', '97').result.id, '97');
  assert.equal(chars.listPets().some(p => p.id === '93'), false);
  assert.equal(chars.listPets().some(p => p.id === '97'), true);
  chars.updateCharacter(null, ch => { ch.essences = ['200']; });
  assert.equal(call('PetDAO.addPetMaturityByItem', '97', 'item200').pet_maturity, 13);
  assert.equal(call('CharacterDAO.deletePet', '', '97').status, 1);
  assert.equal(chars.characterById(c.character_id).deletedPets.length, 1);

  assert.equal(call('CharacterDAO.updateDailyTask', c.character_id,
    { total: 2, amount: 2, completeTime: 42, type: 'battle' }).status, 1);
  assert.deepEqual(call('CharacterService.completeDailyTask').dt_reward,
    { type: 'gold', amount: 1000 });
  assert.equal(call('CharacterService.completeDailyTask').status, 0);
  assert.equal(call('CharacterDAO.updateDailyTask', c.character_id,
    { total: 1, amount: 1, completeTime: 0, type: 'battle' }).status, 0);
  assert.equal(call('CharacterDAO.deleteCharacter', 'wrong', c.character_id).msg, 'wrong_code');
  assert.equal(call('CharacterDAO.deleteCharacter', 'DELETE', c.character_id).status, 1);
  assert.equal(chars.listCharacters().length, 0);
  assert.equal(call('CharacterManagement.recoverCharacter', c.character_id).status, 1);
  assert.equal(chars.listCharacters().length, 1);

  const saved = JSON.parse(fs.readFileSync(path.join(server, 'characters.json')))[c.character_id];
  assert.equal(saved.name, 'Renamed');
  assert.equal(saved.optionData.sound_on, 0);
  assert.equal(saved.dailyTask.claimed, true);
  assert.ok(saved.dailyTask.completeTime > 0);
  assert.equal(saved.pets.length, 0);
  assert.equal(saved.deletedAt, undefined);
  assert.equal(ACCOUNT.balance, 10000000 - 150 - 600 - 50 - 600 - 1000);
  delete require.cache[require.resolve(indexPath)];
  delete require.cache[require.resolve(path.join(server, 'chardata.js'))];
  const reloaded = require(indexPath);
  const restoredChars = require(path.join(server, 'chardata.js'));
  assert.equal(reloaded.ACCOUNT.balance, ACCOUNT.balance);
  assert.equal(restoredChars.listCharacters()[0].name, 'Renamed');
  assert.equal(restoredChars.rawCharacter(restoredChars.listCharacters()[0], ACCOUNT.sessionKey)
    .character_inv_slots.back, 202);
  restoredChars.updateCharacter(c.character_id, ch => { ch.dailyTaskDate = '2000-01-01'; });
  assert.equal(restoredChars.rawCharacter(restoredChars.listCharacters()[0], ACCOUNT.sessionKey).daily, null);
  fs.rmSync(root, { recursive: true, force: true });
});
