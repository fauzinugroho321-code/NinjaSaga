'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = process.env.NINJA_CLAWS_SOURCE || path.join(__dirname,'../tools/custom-weapons/obsidian-twin-claws');
const { grant } = require(path.join(source, 'grant-custom-weapon.cjs'));
test('grant/equip preserves currencies, progress and equipment; repeat is idempotent', () => {
  const original = {name:'Kuroko',level:20,gold:551,xp:881,token:42,weapons:['1596','1341'],equip:{weapon:'wpn1',bodySet:'set2124',backItem:'back778',jutsu:['1','2']},skills:['3'],allTalentsMode:true};
  const c = structuredClone(original);
  grant(c,true);
  assert.deepEqual(c.weapons,['1596','1341','1','9000']);
  assert.equal(c.equip.weapon,'wpn9000');
  const once = structuredClone(c); grant(c,true); assert.deepEqual(c,once);
  c.weapons=original.weapons;c.equip.weapon=original.equip.weapon;
  assert.deepEqual(c,original);
});
test('inventory-only grant leaves equipped weapon and other characters intact', () => {
  const all = [{id:1,weapons:['2'],equip:{weapon:'wpn2'}},{id:4,weapons:[],equip:{weapon:'wpn1'}}];
  const first=structuredClone(all[0]);grant(all[1],false);
  assert.deepEqual(all[0],first);assert.deepEqual(all[1].weapons,['9000']);assert.equal(all[1].equip.weapon,'wpn1');
});
