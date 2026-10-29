'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const source = process.env.NINJA_JUTSU_TEST_SOURCE || path.resolve(__dirname, '..', 'server');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ninja-jutsu-upgrade-'));
try {
  for (const name of fs.readdirSync(source).filter(name => name.endsWith('.js') && name !== 'index.js')) {
    fs.copyFileSync(path.join(source, name), path.join(temp, name));
  }
  const chars = require(path.join(temp, 'chardata.js'));
  const prices = require(path.join(temp, 'harga.js'));
  const predecessors = require(path.join(temp, 'upgrade-predecessors.js'));
  assert.equal(predecessors['254'], '60');
  assert.equal(predecessors['255'], '254');
  chars.createCharacter(['session', 'Upgrade', 0, 0, 0, '01_0', '01_0']);
  chars.setActiveCharacter('1');
  assert.equal(chars.characterById('1').level, 1);
  const rankTwo = chars.buyAcademySkill('skill254', ...prices.skill254, 1000);
  assert.ok(rankTwo.character);
  assert.ok(chars.characterById('1').skills.includes('254'));
  assert.ok(!chars.characterById('1').skills.includes('60'));
  chars.setEquip(null, null, null, null, ['skill254'], '1');
  chars.setSkillProfile('hokage', ['skill254']);
  const rankThree = chars.buyAcademySkill('skill255', ...prices.skill255, 1000);
  assert.ok(rankThree.character);
  const current = chars.characterById('1');
  assert.ok(current.skills.includes('255'));
  assert.ok(!current.skills.includes('254'));
  assert.deepEqual(current.equip.jutsu, []);
  assert.equal(chars.getSkillProfiles().hokage, '');
  assert.ok(!chars.rawCharacter(current, 'session').character_skill.split(',').includes('254'));
  console.log('Pembelian jutsu tanpa prasyarat dan upgrade tersimpan.');
} finally {
  fs.rmSync(temp, {recursive: true, force: true});
}
