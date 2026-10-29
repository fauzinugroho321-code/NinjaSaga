'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { Readable } = require('node:stream');

const source = path.resolve(__dirname, '..', 'server');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ninja-all-talents-'));
for (const name of fs.readdirSync(source).filter(name => name.endsWith('.js') && name !== 'index.js')) {
  fs.copyFileSync(path.join(source, name), path.join(testDir, name));
}
const chars = require(path.join(testDir, 'chardata.js'));
const trainer = require(path.join(testDir, 'trainer.js'));

function request(url, body) {
  return new Promise((resolve, reject) => {
    const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
    req.url = url;
    req.method = body ? 'POST' : 'GET';
    const res = {
      status: 200,
      writeHead(status) { this.status = status; },
      end(text) { resolve({ status: this.status, data: JSON.parse(text) }); },
    };
    try { trainer.handleRequest(req, res); } catch (error) { reject(error); }
  });
}

async function main() {
  try {
    chars.createCharacter(['session', 'Alpha', 0, 0, 0, '01_0', '01_0']);
    chars.createCharacter(['session', 'Beta', 0, 0, 0, '01_0', '01_0']);
    chars.setActiveCharacter('1');
    chars.setCurrencies('1', { bloodlinePoint: 100 });
    assert.equal(chars.naikkanSkillBloodline('1007', 3).level, 3);
    const before = structuredClone(chars.characterById('1').bloodline);
    assert.equal(chars.ALL_TALENT_SKILL_IDS.length, 51);
    assert.ok(!chars.ALL_TALENT_SKILL_IDS.includes('1040'));
    assert.ok(!chars.ALL_TALENT_SKILL_IDS.includes('1053'));

    const invalid = await request('/api/trainer/all-talents', { id: '1', enabled: 'true' });
    assert.equal(invalid.status, 400);
    const missing = await request('/api/trainer/all-talents', { id: '999', enabled: true });
    assert.equal(missing.status, 404);
    const on = await request('/api/trainer/all-talents', { id: '1', enabled: true });
    assert.equal(on.status, 200);
    assert.equal(on.data.enabled, true);
    assert.equal(trainer.getTrainerData().characters.find(c => c.id === '1').allTalentsMode, true);
    assert.equal(trainer.getTrainerData().characters.find(c => c.id === '2').allTalentsMode, false);
    const alpha = chars.characterById('1');
    const projected = chars.buildExtraData(alpha, 'session').bloodline;
    assert.equal(projected.filter(x => x.skill_id).length, 51);
    assert.equal(new Set(projected.filter(x => x.skill_id).map(x => x.skill_id)).size, 51);
    assert.equal(projected.find(x => x.skill_id === '1007').level, '3');
    assert.equal(projected.find(x => x.skill_id === '1049').level, '1');
    assert.deepEqual(chars.databaseCharacter(alpha).bloodline, projected);
    assert.deepEqual(chars.characterById('1').bloodline, before);
    assert.deepEqual(chars.buildExtraData(chars.characterById('2'), 'session').bloodline, []);

    const html = (await new Promise((resolve, reject) => {
      const req = { url: '/trainer', method: 'GET' };
      const res = { writeHead() {}, end(text) { resolve(String(text)); } };
      try { trainer.handleRequest(req, res); } catch (error) { reject(error); }
    }));
    assert.match(html, /Mode Semua Talent/);
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    new vm.Script(script);

    const off = await request('/api/trainer/all-talents', { id: '1', enabled: false });
    assert.equal(off.data.enabled, false);
    assert.deepEqual(chars.buildExtraData(chars.characterById('1'), 'session').bloodline,
      chars.databaseCharacter(chars.characterById('1')).bloodline);
    assert.deepEqual(chars.characterById('1').bloodline, before);
    assert.equal(chars.buildExtraData(chars.characterById('1'), 'session').bloodline.find(x => x.skill_id === '1049'), undefined);
    await request('/api/trainer/all-talents', { id: '1', enabled: true });
    chars.resetCharacter('1');
    assert.equal(chars.characterById('1').allTalentsMode, false);
    console.log('Mode Semua Talent: on/off, karakter terpilih, serialisasi, dan reset valid.');
  } finally {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
