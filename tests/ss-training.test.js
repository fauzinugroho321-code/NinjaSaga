'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ninja-ss-training-test-'));

try {
  for (const file of fs.readdirSync(path.join(root, 'server')).filter(name => name.endsWith('.js'))) {
    fs.copyFileSync(path.join(root, 'server', file), path.join(temp, file));
  }
  const index = fs.readFileSync(path.join(temp, 'index.js'), 'utf8');
  fs.writeFileSync(path.join(temp, 'index.js'),
    index.slice(0, index.indexOf('server.listen(PORT')) +
    '\nmodule.exports = { dispatch };\n');
  fs.writeFileSync(path.join(temp, 'characters.json'), JSON.stringify({
    1: { character_id: '1', name: 'Sennin', rank: 9, level: 80, xp: 55735935,
      gold: 100, token: 20, senjutsuSS: 10, items: [], missions: {} },
    2: { character_id: '2', name: 'Genin', rank: 1, level: 1, xp: 0,
      gold: 100, token: 20, senjutsuSS: 0, items: [], missions: {} },
  }));

  let chars = require(path.join(temp, 'chardata.js'));
  let gateway = require(path.join(temp, 'index.js'));
  chars.setActiveCharacter('1');

  assert.equal(chars.buildExtraData(chars.characterById('1'), 'test').level_80_exam_reward_list_read, 0);
  assert.equal(gateway.dispatch('Lvl80Exam.markRewardListRead', ['test']).status, 1);
  assert.equal(gateway.dispatch('Lvl80Exam.markRewardListRead', ['test']).status, 1);
  assert.equal(chars.buildExtraData(chars.characterById('1'), 'test').level_80_exam_reward_list_read, 1);
  assert.deepEqual(gateway.dispatch('SSTraining.getMissionStatus', ['test']).result.mission.map(x=>x.id),
    chars.SS_MISSION);

  const refreshed = gateway.dispatch('SSTraining.refreshMission', ['test']);
  assert.equal(refreshed.status, 1);
  assert.equal(refreshed.result.status, 0);
  assert.deepEqual(refreshed.result.mission.map(x=>x.id), chars.SS_MISSION);
  assert.deepEqual(chars.characterById('1').items, []);
  assert.ok(chars.characterById('1').ssTrainingLastRefresh > 0);

  assert.equal(gateway.dispatch('SSTraining.startSSMission', ['test', 'msn999']).status, 0);
  assert.equal(chars.characterById('1').ssTrainingCurrentMission, undefined);
  for (const id of chars.SS_MISSION) {
    assert.equal(gateway.dispatch('SSTraining.startSSMission', ['test', id]).status, 1);
    assert.equal(chars.characterById('1').ssTrainingCurrentMission, id);
  }
  assert.equal(chars.characterById('1').ssTrainingCurrentMission, 'msn283');
  assert.equal(gateway.dispatch('SSTraining.startSSMission', ['test', 'msn280']).result.mission_id, 'msn280');

  const success = gateway.dispatch('SSTraining.finishSSMission', ['test', 'msn280', [], 0]);
  assert.equal(success.status, 1);
  assert.ok(success.update_inventory);
  assert.equal(chars.characterById('1').senjutsuSS, 40);
  assert.equal(chars.characterById('1').missions['280'].success, 1);
  assert.equal(chars.characterById('1').ssTrainingCurrentMission, null);
  gateway.dispatch('SSTraining.finishSSMission', ['test', 'msn280', [], 0]);
  assert.equal(chars.characterById('1').senjutsuSS, 40);
  assert.equal(chars.characterById('1').missions['280'].success, 1);

  gateway.dispatch('SSTraining.startSSMission', ['test', 'msn279']);
  gateway.dispatch('SSTraining.finishSSMission', ['test', 'msn279', [], 1]);
  assert.equal(chars.characterById('1').senjutsuSS, 40);
  assert.equal(chars.characterById('1').missions['279'].fail, 1);

  delete require.cache[require.resolve(path.join(temp, 'chardata.js'))];
  delete require.cache[require.resolve(path.join(temp, 'index.js'))];
  chars = require(path.join(temp, 'chardata.js'));
  gateway = require(path.join(temp, 'index.js'));
  chars.setActiveCharacter('1');
  assert.equal(chars.buildExtraData(chars.characterById('1'), 'test').level_80_exam_reward_list_read, 1);
  assert.equal(chars.characterById('1').missions['280'].success, 1);
  assert.equal(chars.characterById('1').senjutsuSS, 40);
  assert.equal(gateway.dispatch('SSTraining.getMissionStatus', ['test']).result.status, 0);

  chars.setActiveCharacter('2');
  assert.equal(gateway.dispatch('SSTraining.startSSMission', ['test', 'msn280']).status, 0);
  assert.equal(gateway.dispatch('SSTraining.refreshMission', ['test']).status, 0);
  assert.equal(chars.characterById('2').ssTrainingCurrentMission, undefined);

  console.log('Lv80 reward read dan SS Training: semua alur lulus.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
