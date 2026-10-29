'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const vm = require('node:vm');
const source = path.resolve(__dirname, '..', 'server');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ninja-sage-modes-'));
for (const name of fs.readdirSync(source).filter(name => name.endsWith('.js') && name !== 'index.js')) {
  fs.copyFileSync(path.join(source, name), path.join(temp, name));
}
const chars = require(path.join(temp, 'chardata.js'));
const trainer = require(path.join(temp, 'trainer.js'));
function request(url, body) {
  return new Promise((resolve, reject) => {
    const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
    req.url = url; req.method = body ? 'POST' : 'GET';
    const res = { status: 200, writeHead(status) { this.status = status; },
      end(text) { resolve({ status: this.status, data: text && text[0] === '{' ? JSON.parse(text) : text }); } };
    try { trainer.handleRequest(req, res); } catch (e) { reject(e); }
  });
}
(async () => {
  try {
    chars.createCharacter(['session', 'Sage', 0, 0, 0, '01_0', '01_0']);
    chars.setActiveCharacter('1');
    const before = structuredClone(chars.characterById('1').senjutsu || []);
    assert.equal((await request('/api/trainer/all-sage', {id:'1',enabled:'yes'})).status, 400);
    assert.equal((await request('/api/trainer/sp-mode', {id:'1',mode:'unlimited'})).status, 400);
    assert.equal((await request('/api/trainer/all-sage', {id:'1',enabled:true})).status, 200);
    const c = chars.characterById('1');
    const list = chars.buildExtraData(c, 'session').senjutsu;
    assert.equal(list.length, 22);
    assert.equal(new Set(list.map(x => x.skill_id)).size, 22);
    assert.ok(list.some(x => x.skill_id === '3001' && x.senjutsu_id === '2'));
    assert.ok(list.some(x => x.skill_id === '3101' && x.senjutsu_id === '3'));
    assert.deepEqual(c.senjutsu || [], before);
    assert.deepEqual(c.equip.jutsu.filter(id => /^3\d{3}$/.test(id)), chars.ALL_EQUIPPABLE_SAGE_IDS);
    assert.equal(chars.rawCharacter(c, 'session').character_equipped_skills.split(',')
      .filter(id => /^3\d{3}$/.test(id)).length, 18);
    assert.equal((await request('/api/trainer/all-sage', {id:'1',enabled:true})).status, 200);
    assert.equal(chars.characterById('1').equip.jutsu.filter(id => /^3\d{3}$/.test(id)).length, 18);
    const upgraded = chars.naikkanSkillSenjutsu('3101', 0);
    assert.equal(upgraded.level, 2);
    assert.equal(chars.buildExtraData(chars.characterById('1'), 'session').senjutsu
      .find(x => x.skill_id === '3101').level, '2');
    assert.equal((await request('/api/trainer/sp-mode', {id:'1',mode:'full'})).status, 200);
    assert.equal(chars.buildExtraData(chars.characterById('1'), 'session').sage_sp_mode, 1);
    assert.equal((await request('/api/trainer/sp-mode', {id:'1',mode:'infinite'})).status, 200);
    assert.equal(chars.buildExtraData(chars.characterById('1'), 'session').sage_sp_mode, 2);
    const html = await request('/trainer');
    assert.match(html.data, /Mode Semua Sage/);
    assert.match(html.data, /Infinite SP/);
    assert.match(html.data, /9999\/9999/);
    new vm.Script(html.data.match(/<script>([\s\S]*?)<\/script>/)[1]);
    assert.equal((await request('/api/trainer/all-sage', {id:'1',enabled:false})).status, 200);
    const saved = chars.buildExtraData(chars.characterById('1'), 'session').senjutsu;
    assert.equal(saved.length, 1);
    assert.equal(saved[0].skill_id, '3101');
    assert.equal(saved[0].level, '2');
    assert.equal(chars.characterById('1').equip.jutsu.filter(id => /^3\d{3}$/.test(id)).length, 0);
    chars.resetCharacter('1');
    assert.equal(chars.characterById('1').allSageMode, false);
    assert.equal(chars.characterById('1').spMode, 'normal');
    console.log('Mode Semua Sage dan pilihan SP valid.');
  } finally { fs.rmSync(temp, {recursive:true,force:true}); }
})().catch(e => { console.error(e); process.exitCode = 1; });
