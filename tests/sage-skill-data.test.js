'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ninja-sage-sage-test-'));
try {
  for (const file of fs.readdirSync(path.join(root, 'server')).filter(name => name.endsWith('.js') && name !== 'index.js')) {
    fs.copyFileSync(path.join(root, 'server', file), path.join(temp, file));
  }
  const toad = [3000, 3500, ...Array.from({length: 10}, (_, i) => 3001 + i)];
  const snake = Array.from({length: 10}, (_, i) => 3101 + i);
  fs.writeFileSync(path.join(temp, 'characters.json'), JSON.stringify({
    1: { character_id: '1', name: 'Toad', level: 1, xp: 0, senjutsuSystem: 2, senjutsuSS: 100,
      senjutsu: [
        {skill_id:'2',senjutsu_id:'2',level:'1'},
        ...toad.map(id => ({skill_id:String(id),senjutsu_id:'2',level:'11'})),
      ] },
    2: { character_id: '2', name: 'Snake', level: 1, xp: 0, senjutsuSystem: 3, senjutsuSS: 100,
      senjutsu: [
        {skill_id:'3',senjutsu_id:'3',level:'1'},
        ...snake.map(id => ({skill_id:String(id),senjutsu_id:'3',level:id === 3101 ? '9' : '11'})),
      ] },
  }));
  const chars = require(path.join(temp, 'chardata.js'));
  for (const [id, ids, system] of [['1',toad,2],['2',snake,3]]) {
    const char = chars.characterById(id);
    const actual = chars.buildExtraData(char, 'test').senjutsu;
    assert.deepEqual(actual.map(x=>Number(x.skill_id)).sort((a,b)=>a-b), ids.slice().sort((a,b)=>a-b));
    for (const item of actual) {
      const common = item.skill_id === '3000' || item.skill_id === '3500';
      assert.equal(item.senjutsu_id, String(common ? 1 : system));
      assert.equal(item.level, common ? '1' : (system === 3 && item.skill_id === '3101' ? '9' : '10'));
    }
    const dbChar = chars.databaseCharacter(char);
    assert.deepEqual(dbChar.character_senjutsu, actual.map(x => 'senjutsu_skill' + x.skill_id));
    assert.deepEqual(dbChar.senjutsu, actual);
  }
  chars.setActiveCharacter('1');
  assert.ok(chars.naikkanSkillSenjutsu('3005').gagal);
  assert.ok(chars.naikkanSkillSenjutsu('3101').gagal);
  assert.ok(chars.naikkanSkillSenjutsu('2').gagal);
  chars.setActiveCharacter('2');
  assert.equal(chars.naikkanSkillSenjutsu('3101').level, 10);
  assert.ok(chars.naikkanSkillSenjutsu('3101').gagal);
  assert.ok(chars.naikkanSkillSenjutsu('3110').gagal);
  assert.ok(chars.naikkanSkillSenjutsu('3001').gagal);
  console.log('Sage Toad, Snake, dan skill umum: validasi lulus.');
} finally {
  fs.rmSync(temp,{recursive:true,force:true});
}
