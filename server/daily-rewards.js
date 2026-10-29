'use strict';

// Local monthly rewards. The six milestones match Panel_New_Daily_Login.swf;
// these are local rewards, not a reconstruction of an official event schedule.
const MILESTONES = [1, 3, 7, 14, 21, 28];
const STONE_IDS = ['1144', '1145', '1146', '1147', '1148', '1150'];
const QUANTITY = 20;
const JAKARTA_OFFSET = 7 * 60 * 60 * 1000;

function calendarDate(now) {
  const date = new Date(now + JAKARTA_OFFSET);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return {
    month: `${year}-${String(month + 1).padStart(2, '0')}`,
    day: date.getUTCDate(),
    length: new Date(Date.UTC(year, month + 1, 0)).getUTCDate(),
  };
}

function monthState(character, date) {
  const saved = character.monthlyLoginReward;
  if (!saved || saved.month !== date.month)
    return { month: date.month, days: [], claimed: [] };
  return {
    month: date.month,
    days: [...new Set((saved.days || []).filter(n => Number.isInteger(n) && n >= 1 && n <= date.length))],
    claimed: [...new Set((saved.claimed || []).filter(n => Number.isInteger(n) && n >= 0 && n < MILESTONES.length))],
  };
}

function createDailyRewards(characters) {
  function getStatus(characterId, now = Date.now()) {
    const date = calendarDate(now);
    const character = characters.characterById(characterId);
    if (!character || character.deletedAt) return { status: 0, error: 'Character not found' };
    let state = monthState(character, date);
    if (!state.days.includes(date.day)) {
      const saved = characters.updateCharacter(characterId, c => {
        c.monthlyLoginReward = monthState(c, date);
        if (!c.monthlyLoginReward.days.includes(date.day)) c.monthlyLoginReward.days.push(date.day);
      });
      if (!saved) return { status: 0, error: 'Could not save login day' };
      state = monthState(saved.character, date);
    }
    return {
      status: 1,
      error: null,
      loginDay: Array.from({ length: 31 }, (_, i) => i >= date.length ? '-1' : state.days.includes(i + 1) ? '1' : '0'),
      rewardDay: MILESTONES.map(String),
      item_list: STONE_IDS.map(id => [`item${id}_${QUANTITY}`]),
      claimReward: MILESTONES.map((days, i) => state.claimed.includes(i) ? '2' : state.days.length >= days ? '1' : '0'),
      txt: {
        desc1: `Daily Login Rewards - ${date.month}`,
        desc2: `Log in on different days this month. Attendance: ${state.days.length} day(s).`,
        desc3: 'Local rewards: 20 stone fragments per milestone. Resets each month (WIB).',
      },
      // The client displays this value as a time of day without a timezone conversion.
      now_time: Math.floor((now + JAKARTA_OFFSET) / 1000),
      part2: false,
    };
  }

  function claimReward(characterId, index, now = Date.now()) {
    if (!Number.isInteger(index) || index < 0 || index >= MILESTONES.length)
      return { status: 0, error: 'Invalid reward' };
    const status = getStatus(characterId, now);
    if (status.status !== 1) return status;
    if (status.claimReward[index] !== '1')
      return { status: 0, error: 'Reward is locked or already claimed' };
    const date = calendarDate(now);
    const saved = characters.updateCharacter(characterId, c => {
      const state = monthState(c, date);
      if (state.claimed.includes(index) || state.days.length < MILESTONES[index]) return false;
      c.materials = c.materials || {};
      const previous = Number(c.materials[STONE_IDS[index]]) || 0;
      c.materials[STONE_IDS[index]] = previous + QUANTITY;
      state.claimed.push(index);
      c.monthlyLoginReward = state;
    });
    if (!saved) return { status: 0, error: 'Could not claim reward' };
    const rewards = [`item${STONE_IDS[index]}_${QUANTITY}`];
    return {
      status: 1,
      error: null,
      item_list: rewards,
      update_inventory: { add_item_id: rewards, showPopup: true },
    };
  }

  return { getStatus, claimReward };
}

module.exports = { createDailyRewards, MILESTONES, STONE_IDS, QUANTITY };
