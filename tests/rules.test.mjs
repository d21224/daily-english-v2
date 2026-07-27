import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultState, resetForNewWeek } from '../scripts/state.js';
import { calculateReward, getProgress, mondayKey, parseSegment, rewardCopy } from '../scripts/rules.js';

test('하이픈과 en dash 구간을 모두 파싱한다', () => {
  assert.deepEqual(parseSegment('10:11-10:20'), { start: 611, end: 620 });
  assert.deepEqual(parseSegment('10:11–10:20'), { start: 611, end: 620 });
  assert.equal(parseSegment('10:20-10:11'), null);
});

test('월~일 듣기와 일일/주간 과제를 함께 진행률에 포함한다', () => {
  const state = createDefaultState(new Date(2026, 6, 27));
  state.days[0].target = 2;
  state.days[0].count = 2;
  state.days[0].tasks.push({ id:'daily-a', label:'읽기', done:false, completedAt:'', reward:{points:0} });
  state.weeklyTasks = [{ id:'weekly-a', label:'영상', done:true, completedAt:'x', reward:{points:0} }];
  assert.deepEqual(getProgress(state), { done: 2, total: 3 });
});

test('일일 보상은 기본 포인트를 항상 지급하고 마감 전 보너스를 더한다', () => {
  const mondayBefore = new Date(2026, 6, 27, 17, 59);
  const mondayDeadline = new Date(2026, 6, 27, 18, 0);
  const tuesday = new Date(2026, 6, 28, 17, 0);
  const rule = { basePoints:100, bonusPoints:50, bonusTime:'18:00' };
  assert.deepEqual(calculateReward('listening',0,rule,mondayBefore), {baseEarned:100,bonusEarned:50,points:150});
  assert.deepEqual(calculateReward('listening',0,rule,mondayDeadline), {baseEarned:100,bonusEarned:0,points:100});
  assert.deepEqual(calculateReward('listening',0,rule,tuesday), {baseEarned:100,bonusEarned:0,points:100});
  assert.equal(rewardCopy(rule,'dailyTask'),'기본 100P · 18:00 전 +50P');
  assert.equal(rewardCopy(rule,'dailyTask','child'),'100P · 🌙 저녁 6시 전에 하면 50P 더!');
  assert.equal(rewardCopy({basePoints:100,bonusPoints:0,bonusTime:'18:00'},'dailyTask'),'100P');
});

test('주간 보상은 설정 요일과 시간 전까지만 보너스를 지급한다', () => {
  const friday = new Date(2026, 6, 31, 20, 0);
  const saturdayMorning = new Date(2026, 7, 1, 11, 59);
  const saturdayDeadline = new Date(2026, 7, 1, 12, 0);
  const rule = { basePoints:500, bonusPoints:200, bonusDay:5, bonusTime:'12:00' };
  assert.equal(calculateReward('weeklyTask',null,rule,friday).points,700);
  assert.equal(calculateReward('weeklyTask',null,rule,saturdayMorning).points,700);
  assert.deepEqual(calculateReward('weeklyTask',null,rule,saturdayDeadline), {baseEarned:500,bonusEarned:0,points:500});
  assert.equal(rewardCopy(rule,'weeklyTask'),'기본 500P · 토 12:00 전 +200P');
  assert.equal(rewardCopy(rule,'weeklyTask','child'),'500P · ☀️ 토요일 낮 12시 전에 하면 200P 더!');
});

test('새 주 시작은 설정을 유지하고 진행만 초기화한다', () => {
  const state = createDefaultState(new Date(2026, 6, 27));
  state.theme = 'dark';
  state.parentPasscode = '1234';
  state.days[0].target = 3;
  state.days[0].count = 3;
  state.days[0].completedAt = 'done';
  state.days[0].reward.points = 200;
  state.weeklyTasks[0].done = true;
  const reset = resetForNewWeek(state, new Date(2026, 7, 3));
  assert.equal(reset.theme,'dark');
  assert.equal(reset.parentPasscode,'1234');
  assert.equal(reset.days[0].target,3);
  assert.equal(reset.days[0].count,0);
  assert.equal(reset.weeklyTasks[0].done,false);
  assert.equal(reset.activeWeekStart,mondayKey(new Date(2026,7,3)));
  assert.notEqual(reset.stateEpoch,state.stateEpoch);
});
