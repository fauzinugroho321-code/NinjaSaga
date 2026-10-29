'use strict';
// Run with the game server stopped: it caches characters.json in memory.
// node tools/custom-weapons/obsidian-twin-claws/grant-custom-weapon.cjs 4 --equip
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const repo = process.env.NINJA_REPO || path.resolve(__dirname, '../../..');
function grant(character, equip) {
  const owned = Array.isArray(character.weapons) ? character.weapons.map(String) : [];
  const previous = character.equip && character.equip.weapon;
  if (equip && previous) {
    const id = String(previous).replace(/^wpn_?/, '');
    if (id && !owned.includes(id)) owned.push(id);
  }
  if (!owned.includes('9000')) owned.push('9000');
  character.weapons = owned;
  if (equip) {
    if (!character.equip) character.equip = {};
    character.equip.weapon = 'wpn9000';
  }
  return character;
}
module.exports = { grant };
if (require.main === module) {
  const id = process.argv[2];
  if (!/^\d+$/.test(id || '')) throw new Error('Provide the target character ID.');
  const socket = net.connect(8080, '127.0.0.1');
  socket.once('connect', () => {
    socket.destroy();
    console.error('Stop the game server before granting equipment; its character cache is live.');
    process.exitCode = 1;
  });
  socket.once('error', err => {
    if (err.code !== 'ECONNREFUSED') throw err;
    const asset = path.join(repo, 'web/cdn/swf/latest/swf/items/wpn_9000.swf');
    if (!fs.existsSync(asset)) throw new Error('Build/install wpn_9000.swf first.');
    const characters = require(path.join(repo, 'server/chardata.js'));
    const c = characters.characterById(id);
    if (!c) throw new Error('Character not found: ' + id);
    if (process.argv.includes('--equip') && c.level < 20) throw new Error('Level 20 is required to equip.');
    characters.updateCharacter(id, current => { grant(current, process.argv.includes('--equip')); });
    console.log('Obsidian Twin Claws granted to ' + c.name + (process.argv.includes('--equip') ? ' and equipped.' : '.'));
  });
}
