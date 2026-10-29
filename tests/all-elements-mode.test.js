'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const vm = require('node:vm');

const source = process.env.NINJA_ELEMENT_FIX_SOURCE || path.resolve(__dirname, '..', 'server');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ninja-five-elements-'));
for (const name of fs.readdirSync(source).filter(name => name.endsWith('.js') && name !== 'index.js')) {
  fs.copyFileSync(path.join(source, name), path.join(temp, name));
}
if (process.env.NINJA_ELEMENT_FIX_CHAR_DATA) {
  fs.copyFileSync(process.env.NINJA_ELEMENT_FIX_CHAR_DATA, path.join(temp, 'chardata.js'));
}
const chars = require(path.join(temp, 'chardata.js'));
const trainer = require(path.join(temp, 'trainer.js'));

function request(url, body) {
  return new Promise((resolve, reject) => {
    const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
    req.url = url;
    req.method = body ? 'POST' : 'GET';
    const res = {
      status: 200,
      writeHead(status) { this.status = status; },
      end(text) {
        resolve({ status: this.status,
          data: text && text[0] === '{' ? JSON.parse(text) : text });
      }
    };
    try { trainer.handleRequest(req, res); } catch (e) { reject(e); }
  });
}

(async () => {
  try {
    chars.createCharacter(['session', 'Five', 0, 0, 0, '01_0', '01_0']);
    chars.setActiveCharacter('1');
    const original = chars.characterById('1');
    const originalSkills = new Set((original.skills || []).map(String));
    const originalEquipped = (original.equip && original.equip.jutsu || []).map(String);
    assert.equal((await request('/api/trainer/all-elements', {id:'1',enabled:'yes'})).status, 400);
    assert.equal((await request('/api/trainer/all-elements', {id:'missing',enabled:true})).status, 404);
    assert.equal((await request('/api/trainer/all-elements', {id:'1',enabled:true})).status, 200);
    const active = chars.characterById('1');
    const ids = chars.ALL_ELEMENT_SKILL_IDS;
    assert.equal(ids.length, 206);
    assert.equal(active.allElementsMode, true);
    assert.equal(active.elements.length, 5);
    assert.ok(active.elements.every(value => Number(value) >= 1));
    assert.ok(active.elements.reduce((sum, value) => sum + value, 0) <=
      active.level + active.attributePointBonus);
    chars.setElements([20, 20, 20, 20, 20], '1');
    const invested = chars.characterById('1');
    assert.equal(invested.attributePointBonus, 99);
    assert.equal(chars.buildExtraData(invested, 'session').attribute_point_bonus, 99);
    assert.deepEqual(active.skills.map(String), [...originalSkills]);
    assert.deepEqual((active.equip.jutsu || []).map(String), originalEquipped);
    const advancedSkill = ids.find(id => !originalSkills.has(id));
    assert.ok(advancedSkill);
    const purchase = chars.buyAcademySkill(advancedSkill, 0, 0, 100);
    assert.ok(purchase.character);
    assert.ok(chars.characterById('1').skills.includes(advancedSkill));
    chars.setEquip(null, null, null, null, ['skill' + advancedSkill], '1');
    assert.deepEqual(chars.characterById('1').equip.jutsu, [advancedSkill]);
    chars.setAllSageMode('1', true);
    for (const csv of Object.values(chars.getSkillProfiles())) {
      assert.ok(chars.ALL_EQUIPPABLE_SAGE_IDS.every(id => !csv.split(',').includes('skill' + id)));
    }
    chars.setAllSageMode('1', false);
    assert.equal((await request('/api/trainer/all-elements', {id:'1',enabled:true})).status, 200);
    chars.setSkillProfile('hokage', {});
    chars.setEquip(null, null, null, null, {}, '1');
    assert.deepEqual(chars.characterById('1').equip.jutsu, []);
    assert.equal(chars.getSkillProfiles().hokage, '');
    const chosen = ids.slice(0, 2);
    chars.setSkillProfile('hokage', chosen);
    chars.setEquip(null, null, null, null, chosen, '1');
    assert.deepEqual(chars.characterById('1').equip.jutsu, chosen);
    assert.equal(chars.getSkillProfiles().hokage, chosen.map(id => 'skill' + id).join(','));
    assert.equal(chars.rawCharacter(chars.characterById('1'), 'session').character_equipped_skills,
      chosen.join(','));
    const html = await request('/trainer');
    assert.match(html.data, /Mode Lima Elemen/);
    new vm.Script(html.data.match(/<script>([\s\S]*?)<\/script>/)[1]);
    assert.equal((await request('/api/trainer/all-elements', {id:'1',enabled:false})).status, 200);
    const after = chars.characterById('1');
    assert.equal(after.allElementsMode, false);
    assert.equal(after.attributePointBonus, 99);
    assert.deepEqual(after.equip.jutsu, chosen);
    assert.ok([...originalSkills].every(id => after.skills.map(String).includes(id)));
    chars.resetCharacter('1');
    assert.equal(chars.characterById('1').allElementsMode, false);
    console.log('Mode Lima Elemen valid.');
  } finally {
    fs.rmSync(temp, {recursive:true,force:true});
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
