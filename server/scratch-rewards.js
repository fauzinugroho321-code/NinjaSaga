'use strict';

// Hadiah lokal yang memakai jenis respons yang dikenali daily_login_3.swf.
// Bobot ini bukan peluang resmi server Ninja Saga.
const POOL = [
  { type: 'GOLD', amount: 5000, weight: 22 },
  { type: 'GOLD', amount: 20000, weight: 10 },
  { type: 'XP', amount: 1000, weight: 16 },
  { type: 'TP', amount: 10, weight: 8 },
  { type: 'TOKEN', amount: 100, weight: 8 },
  { type: 'ITEM', ids: [1, 1144, 1145, 1146, 1147, 1148, 1150], weight: 26 },
  { type: 'WEAPON', ids: [100, 101, 103], bag: 'weapons', weight: 3 },
  { type: 'BACK', ids: [100, 101, 102], bag: 'backitems', weight: 3 },
  { type: 'SKILL', ids: [402, 403, 404], bag: 'skills', weight: 3 },
  { type: 'TOKEN', amount: 2000, weight: 1 }, // Grand Prize
];

function choose(character, random = Math.random) {
  const entries = POOL.map(entry => ({
    entry,
    ids: entry.ids && entry.bag
      ? entry.ids.filter(id => !(character && character[entry.bag] || []).map(String).includes(String(id)))
      : entry.ids,
  })).filter(({ entry, ids }) => !entry.ids || ids.length > 0);
  const total = entries.reduce((n, { entry }) => n + entry.weight, 0);
  let roll = Math.min(Math.max(random(), 0), 0.999999999) * total;
  for (const { entry, ids } of entries) {
    roll -= entry.weight;
    if (roll < 0) {
      const amount = ids ? ids[Math.floor(Math.min(Math.max(random(), 0), 0.999999999) * ids.length)] : entry.amount;
      return { reward_type: entry.type, reward_amount: amount };
    }
  }
  throw new Error('Scratch reward pool is empty');
}

module.exports = { choose, POOL };
