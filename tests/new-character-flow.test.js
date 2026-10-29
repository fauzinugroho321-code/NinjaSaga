'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('new character is saved at level 1 before the map opens', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ninja-new-character-'));
  try {
    const server = path.join(root, 'server');
    fs.mkdirSync(server);
    const source = process.env.NINJA_TEST_SOURCE ||
      path.join(__dirname, '..', 'server');
    for (const name of fs.readdirSync(source)) {
      if (name.endsWith('.js') || name === 'pet-upgrades.json')
        fs.copyFileSync(path.join(source, name), path.join(server, name));
    }
    const indexPath = path.join(server, 'index.js');
    const indexSource = process.env.NINJA_TEST_INDEX || indexPath;
    fs.writeFileSync(indexPath,
      fs.readFileSync(indexSource, 'utf8').split('server.listen(PORT')[0] +
      '\nmodule.exports = { dispatch, ACCOUNT };\n');

    const chars = require(path.join(server, 'chardata.js'));
    const { dispatch, ACCOUNT } = require(indexPath);
    const session = ACCOUNT.sessionKey;
    const created = dispatch('CharacterDAO.createCharacter',
      [session, 'Hiroshi', 0, 0, 15, '01_0', '01_0']);
    assert.equal(created.status, 1);
    assert.equal(created.result.character_level, 1);
    assert.equal(created.result.character_xp, 1);
    assert.equal(chars.getActiveId(), created.character_id);

    const list = dispatch('CharacterDAO.getCharactersList', [session]);
    assert.equal(list.result.length, 1);
    assert.equal(list.result[0][1], 'Hiroshi');
    const selected = dispatch('CharacterDAO.getCharacterById',
      [session, created.character_id]);
    assert.equal(selected.status, 1);
    assert.equal(selected.result.character_name, 'Hiroshi');
    assert.equal(Number(selected.result.character_level), 1);
    assert.equal(Number(selected.result.character_xp), 1);

    const extra = dispatch('CharacterDAO.getExtraData', [session]);
    assert.equal(extra.status, 1);
    assert.equal(Number(extra.result.databaseCharacter.character_level), 1);
    assert.equal(Number(extra.result.databaseCharacter.character_xp), 1);
    assert.equal(extra.result.extra_data_hash,
      chars.extraDataHash(extra.result, session).hash);

    const saved = JSON.parse(fs.readFileSync(path.join(server, 'characters.json')));
    assert.equal(saved[created.character_id].xp, 1);
    delete require.cache[require.resolve(path.join(server, 'chardata.js'))];
    const reloaded = require(path.join(server, 'chardata.js'));
    assert.equal(reloaded.characterById(created.character_id).name, 'Hiroshi');
    assert.equal(reloaded.characterById(created.character_id).xp, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('tutorial character stays saved, chooses one element, and is not duplicated', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ninja-tutorial-character-'));
  try {
    const server = path.join(root, 'server');
    fs.mkdirSync(server);
    const source = process.env.NINJA_TEST_SOURCE || path.join(__dirname, '..', 'server');
    for (const name of fs.readdirSync(source)) {
      if (name.endsWith('.js') || name === 'pet-upgrades.json')
        fs.copyFileSync(path.join(source, name), path.join(server, name));
    }
    const indexPath = path.join(server, 'index.js');
    fs.writeFileSync(indexPath,
      fs.readFileSync(process.env.NINJA_TEST_INDEX || indexPath, 'utf8')
        .split('server.listen(PORT')[0] +
      '\nmodule.exports = { dispatch, ACCOUNT };\n');
    const chars = require(path.join(server, 'chardata.js'));
    const { dispatch, ACCOUNT } = require(indexPath);
    const args = [ACCOUNT.sessionKey, 'Kuroko', 0, 0, 15, '19_0', '01_0'];
    const prepared = dispatch('CharacterDAO.createCharacter', [...args, 'prepare']);
    assert.equal(prepared.status, 1);
    assert.equal(prepared.result.character_xp, 0);
    assert.equal(chars.characterById(prepared.character_id).tutorialPending, true);
    const selected = dispatch('CharacterDAO.getCharacterById',
      [ACCOUNT.sessionKey, prepared.character_id]);
    assert.equal(Number(selected.result.character_xp), 0);

    // Some tutorial scenes save the element before the training battle.
    assert.equal(dispatch('CharacterService.selectFreeSkill',
      [ACCOUNT.sessionKey, 'skill13']).status, 1);
    assert.equal(chars.characterById(prepared.character_id).xp, 0);
    assert.equal(chars.characterById(prepared.character_id).tutorialPending, true);

    const continued = dispatch('CharacterDAO.createCharacter', args);
    assert.equal(continued.character_id, prepared.character_id);
    assert.equal(chars.listCharacters().length, 1);
    assert.equal(chars.characterById(prepared.character_id).tutorialPending, true);
    assert.equal(chars.characterById(prepared.character_id).xp, 0);
    assert.equal(dispatch('CharacterService.selectFreeSkill',
      [ACCOUNT.sessionKey, 'skill13']).status, 1);
    const finished = chars.characterById(prepared.character_id);
    assert.equal(finished.xp, 1);
    assert.equal(finished.level, 1);
    assert.equal(finished.tutorialPending, false);
    assert.equal(finished.tutorialCompleted, true);
    assert.deepEqual(finished.elements, [0, 0, 1, 0, 0]);
    assert.ok(finished.skills.includes('13'));
    assert.ok(finished.equip.jutsu.includes('13'));
    const extra = dispatch('CharacterDAO.getExtraData', [ACCOUNT.sessionKey]);
    assert.equal(Number(extra.result.databaseCharacter.character_xp), 1);
    assert.equal(chars.listCharacters().length, 1);
    delete require.cache[require.resolve(path.join(server, 'chardata.js'))];
    const reloaded = require(path.join(server, 'chardata.js'));
    assert.equal(reloaded.characterById(prepared.character_id).tutorialCompleted, true);
    assert.deepEqual(reloaded.characterById(prepared.character_id).elements,
      [0, 0, 1, 0, 0]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
