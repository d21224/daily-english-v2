import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultState, resetForNewWeek } from '../scripts/state.js';
import { eligibleForReward, getProgress, mondayKey, parseSegment, rewardCopy } from '../scripts/rules.js';

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

test('일일 보상은 지정 요일과 독립 마감을 모두 지킨다', () => {
  const mondayBefore = new Date(2026, 6, 27, 17, 59);
  const mondayAfter = new Date(2026, 6, 27, 18, 1);
  const tuesday = new Date(2026, 6, 28, 17, 0);
  const rule = { points:200, time:'18:00' };
  assert.equal(eligibleForReward('listening',0,rule,mondayBefore),200);
  assert.equal(eligibleForReward('listening',0,rule,mondayAfter),0);
  assert.equal(eligibleForReward('listening',0,rule,tuesday),0);
  assert.equal(eligibleForReward('dailyTask',0,{points:100,time:''},mondayAfter),100);
});

test('주간 보상은 설정 요일과 시간 전까지만 지급한다', () => {
  const friday = new Date(2026, 6, 31, 20, 0);
  const saturdayMorning = new Date(2026, 7, 1, 11, 59);
  const saturdayAfternoon = new Date(2026, 7, 1, 12, 1);
  const rule = { points:500, day:5, time:'12:00' };
  assert.equal(eligibleForReward('weeklyTask',null,rule,friday),500);
  assert.equal(eligibleForReward('weeklyTask',null,rule,saturdayMorning),500);
  assert.equal(eligibleForReward('weeklyTask',null,rule,saturdayAfternoon),0);
  assert.equal(rewardCopy(rule,'weeklyTask'),'토 12:00까지 · 500P');
  assert.equal(rewardCopy({points:100,time:'19:26'},'dailyTask'),'19:26까지 · 100P');
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
