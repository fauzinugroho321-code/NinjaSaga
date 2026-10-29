'use strict';

const { randomInt } = require('node:crypto');

// One source for both OldHuntingHouse's preview and finishHunting's awards.
// The client sends the zero-based room index at args[1] on both requests.
const ROOMS = [
  { boss: ['enemy338'], rank: 1, time: 3, xp: 550, gold: 400,
    rewards: ['wpn_1498', 'set_2248'] },
  { boss: ['enemy339', 'enemy340'], rank: 2, time: 3, xp: 900, gold: 700,
    rewards: ['wpn_1343', 'back_557'] },
];
for (const room of ROOMS) {
  Object.freeze(room.boss);
  Object.freeze(room.rewards);
  Object.freeze(room);
}
Object.freeze(ROOMS);

function roomIndex(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (!/^(0|[1-9]\d*)$/.test(String(value))) return null;
  const index = Number(value);
  return Number.isSafeInteger(index) && index < ROOMS.length ? index : null;
}

function createEudemonGarden(characters, roll = randomInt) {
  function getStatus() {
    return { status: 1, error: null, result: { room: ROOMS.map(room => ({
      ...room, boss: [...room.boss], rewards: [...room.rewards], status: 0,
    })) } };
  }

  function start(characterId, value, bosses) {
    const index = roomIndex(value);
    if (index === null || bosses !== ROOMS[index].boss.join(','))
      return { status: 0, error: 'Invalid Eudemon Garden room or enemies.' };
    if (characterId == null) return { status: 0, error: 'Select a character first.' };
    const saved = characters.updateCharacter(characterId, c => {
      c.eudemonHunt = { room: index, finished: false };
    });
    return saved ? { status: 1, error: null, result: 1 } :
      { status: 0, error: 'Character not found.' };
  }

  function finish(characterId, value, outcome) {
    const index = roomIndex(value);
    if (index === null || ![0, 1, '0', '1'].includes(outcome))
      return { status: 0, error: 'Invalid Eudemon Garden result.' };
    if (characterId == null) return { status: 0, error: 'Select a character first.' };
    const current = characters.characterById(characterId);
    if (!current || current.deletedAt) return { status: 0, error: 'Character not found.' };
    const hunt = current.eudemonHunt;
    if (!hunt || hunt.room !== index)
      return { status: 0, error: 'This Eudemon Garden room has not been started.' };
    const empty = { status: 1, error: null, reward: [], reward_get: [] };
    // Do not pay a repeated finish request again, including after server restart.
    if (hunt.finished) return empty;
    const won = Number(outcome) === 0;
    const room = ROOMS[index];
    let drops = [];
    if (won) {
      // Original drop rates are unavailable. Local rule: one equally likely
      // ticket per advertised item, plus one no-item ticket. Never substitute
      // unrelated generic bones/skulls or guarantee every preview item.
      const ticket = roll(room.rewards.length + 1);
      if (!Number.isInteger(ticket) || ticket < 0 || ticket > room.rewards.length)
        throw new RangeError('Invalid Eudemon Garden loot roll');
      if (ticket < room.rewards.length) drops = [room.rewards[ticket]];
    }
    const saved = characters.updateCharacter(characterId, c => {
      if (!c.eudemonHunt || c.eudemonHunt.room !== index || c.eudemonHunt.finished) return false;
      if (won) {
        // Same level/stat calculation as chardata.addProgress, but XP, gold,
        // inventory and the completion flag are saved together in one write.
        const oldLevel = c.level || 1;
        c.xp = Math.max(0, (Number(c.xp) || 0) + room.xp);
        c.gold = Math.max(0, (Number(c.gold) || 0) + room.gold);
        c.level = characters.getLvByXp(c.xp);
        if (c.level !== oldLevel) {
          c.hp = 100 + (c.level - 1) * 40;
          c.cp = 100 + (c.level - 1) * 40;
          c.agi = c.level;
          c.naikLevel = c.level > oldLevel;
        }
        for (const drop of drops) {
          const item = characters.kantongDari(drop.replace('_', ''));
          if (!item || item.bag === 'items') throw new Error('Invalid room equipment reward');
          c[item.bag] ||= [];
          if (!c[item.bag].includes(item.num)) c[item.bag].push(item.num);
        }
      }
      c.eudemonHunt = { room: index, finished: true, won, drops };
    });
    if (!saved) return { status: 0, error: 'Could not save Eudemon Garden rewards.' };
    return won ? { status: 1, error: null,
      reward: [`xp_${room.xp}`, `gold_${room.gold}`, ...drops], reward_get: drops,
    } : empty;
  }

  return { getStatus, start, finish };
}

module.exports = { createEudemonGarden, ROOMS };
