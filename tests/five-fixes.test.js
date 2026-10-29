'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { Readable } = require('node:stream');

const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ninja-five-fixes-'));
for (const file of ['chardata.js', 'petdata.js', 'bloodlinedata.js', 'trainer.js']) {
  fs.copyFileSync(path.join(root, 'server', file), path.join(temp, file));
}
for (const file of fs.readdirSync(path.join(root, 'server')).filter(name => name.endsWith('.js'))) {
  if (file === 'index.js' || fs.existsSync(path.join(temp, file))) continue;
  fs.copyFileSync(path.join(root, 'server', file), path.join(temp, file));
}
const indexSource = fs.readFileSync(path.join(root, 'server', 'index.js'), 'utf8');
fs.writeFileSync(path.join(temp, 'index.js'),
  indexSource.slice(0, indexSource.indexOf('server.listen(PORT')) +
  '\nmodule.exports = { dispatch, ACCOUNT };\n');

const chars = require(path.join(temp, 'chardata.js'));
const trainer = require(path.join(temp, 'trainer.js'));

function request(url, method, body) {
  return new Promise((resolve, reject) => {
    const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
    req.url = url;
    req.method = method;
    const res = {
      status: 200,
      writeHead(status) { this.status = status; },
      end(text) { resolve({ status: this.status, text: String(text || '') }); },
    };
    try { trainer.handleRequest(req, res); } catch (error) { reject(error); }
  });
}

async function main() {
  try {
    chars.createCharacter(['session', 'Alpha', 0, 0, 0, '01_0', '01_0']);
    chars.createCharacter(['session', 'Beta', 0, 0, 0, '01_0', '01_0']);

    chars.setActiveCharacter('1');
    const selected = await request('/api/trainer/select-character', 'POST', { id: '2' });
    assert.equal(selected.status, 200);
    assert.equal(chars.getActiveId(), '1');
    assert.equal(trainer.getTrainerData().activeId, '2');
    assert.equal((await request('/api/trainer/select-character', 'POST', { id: '999' })).status, 404);
    const mission = chars.recordMission('msn55', true, '1');
    assert.ok(mission);
    chars.addProgress(100, 50, '1');
    assert.equal(chars.characterById('1').xp, 100);
    assert.equal(chars.characterById('2').xp, 0);
    assert.equal(chars.listCharacters().find(c => c.id === '1').missions['55'].success, 1);
    assert.equal(chars.listCharacters().find(c => c.id === '2').missions, undefined);

    const html = (await request('/trainer', 'GET')).text;
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\bloadStatus\(\);\s*$/, '');
    new vm.Script(script);
    const activeChar = trainer.getTrainerData().characters.find(c => c.id === '2');
    const fields = {
      inputGold: activeChar.gold, inputToken: activeChar.token,
      inputMcoin: activeChar.mcoin, inputCrystal: activeChar.crystal,
      inputPrestige: activeChar.prestige, inputPvpCurrency: activeChar.pvpCurrency,
      inputBloodlinePoint: activeChar.bloodlinePoint, inputSenjutsuSS: 1000,
      inputHeartOfKari: activeChar.heartOfKari, inputCrystalOfKari: activeChar.crystalOfKari,
    };
    chars.setCurrencies('2', { gold: 650 });
    let payload;
    const context = {
      document: { getElementById(id) { return { value: String(fields[id]), style: {}, innerText: '' }; } },
      fetch: async (_url, options) => {
        payload = JSON.parse(options.body);
        const result = await request('/api/trainer/set-currency', 'POST', payload);
        return { json: async () => JSON.parse(result.text) };
      },
      setTimeout() {},
    };
    vm.runInNewContext(script + '\nstate = ' + JSON.stringify({ activeId: '2', characters: [activeChar], cheats: {} }) +
      '; loadStatus = function () {};', context);
    await vm.runInNewContext('simpanCurrency()', context);
    assert.deepEqual(Object.keys(payload).sort(), ['id', 'senjutsuSS']);
    assert.equal(chars.characterById('2').gold, 650);
    assert.equal(chars.characterById('2').senjutsuSS, 1000);

    chars.setActiveCharacter('1');
    const before = chars.characterById('1').gold;
    assert.ok(chars.buyAcademySkill('skill1', 100, 0, 500).character);
    assert.equal(chars.characterById('1').gold, before - 100);
    assert.ok(chars.buyAcademySkill('skill259', 0, 150, 500).character);
    assert.equal(chars.characterById('1').academyTokenSpent, 150);
    assert.equal(chars.buyAcademySkill('skill259', 0, 150, 350).error, 'Jutsu sudah dipelajari.');
    assert.equal(chars.buyAcademySkill('skill392', 0, 3600, 350).error, 'Gold atau Token tidak cukup.');
    assert.equal(chars.characterById('1').academyTokenSpent, 150);

    chars.setActiveCharacter('2');
    const gateway = require(path.join(temp, 'index.js'));
    const balanceBefore = gateway.ACCOUNT.balance;
    const academyGold = gateway.dispatch('CharacterDAO.trainSkill', ['session', 'skill1', 'seq']);
    assert.equal(academyGold.status, 1);
    assert.equal(chars.characterById('2').gold, 550);
    const academyToken = gateway.dispatch('CharacterDAO.trainSkill', ['session', 'skill259', 'seq']);
    assert.equal(academyToken.status, 1);
    assert.equal(gateway.ACCOUNT.balance, balanceBefore - 150);
    assert.equal(gateway.dispatch('CharacterDAO.trainSkill', ['session', 'skill259', 'seq']).status, 0);
    const restartedGateway = (() => {
      delete require.cache[require.resolve(path.join(temp, 'index.js'))];
      return require(path.join(temp, 'index.js'));
    })();
    assert.equal(restartedGateway.ACCOUNT.balance, gateway.ACCOUNT.balance);
    assert.equal(restartedGateway.dispatch('SystemService.snsLogin', ['session']).result[2], gateway.ACCOUNT.balance);

    const goldBeforeInvalidSale = chars.characterById('2').gold;
    assert.equal(gateway.dispatch('CharacterDAO.sellItem', ['session', 'wpn2', 'hash', 1]).status, 0);
    assert.equal(chars.characterById('2').gold, goldBeforeInvalidSale);
    chars.addItem('wpn2', 1, 140, 0);
    const sold = gateway.dispatch('CharacterDAO.sellItem', ['session', 'wpn2', 'hash', 1]);
    assert.equal(sold.status, 1);
    assert.deepEqual(sold.update_inventory, {});
    assert.equal(chars.characterById('2').gold, goldBeforeInvalidSale - 70);
    assert.equal(gateway.dispatch('CharacterDAO.sellItem', ['session', 'wpn2', 'hash', 1]).status, 0);

    chars.setActiveCharacter('1');
    const xpBeforeMission = chars.characterById('1').xp;
    const missionResult = gateway.dispatch('CharacterService.updateCharacter',
      ['session', '2', 1, 10, 5, [], null, null, 'msn56']);
    assert.equal(missionResult.status, 1);
    assert.equal(chars.characterById('1').xp, xpBeforeMission);
    assert.equal(chars.characterById('2').xp, 10);
    assert.equal(chars.listCharacters().find(c => c.id === '2').missions['56'].success, 1);

    const goldBeforeSale = chars.characterById('1').gold;
    assert.equal(chars.removeItem('wpn2', 1, 70), null);
    assert.equal(chars.characterById('1').gold, goldBeforeSale);
    chars.addItem('wpn2', 1, 140, 0);
    assert.equal(chars.removeItem('wpn2', 2, 140), null);
    assert.equal(chars.removeItem('wpn2', 1, 70).gold, goldBeforeSale - 70);
    assert.equal(chars.removeItem('wpn2', 1, 70), null);

    assert.throws(() => chars.setLevel('1', 20, 0), /tidak cocok/);
    assert.equal(chars.characterById('1').level, 1);
    assert.equal(chars.setLevel('1', 20, null).level, 20);
    assert.equal(chars.characterById('1').level, 20);
    const rejected = await request('/api/trainer/set-level', 'POST', { id: '1', level: 20, xp: 0 });
    assert.equal(rejected.status, 400);
    assert.equal(chars.characterById('1').level, 20);

    console.log('Lima perbaikan: semua uji lulus.');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
