import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultState } from '../scripts/state.js';
import { locateActivity } from '../scripts/settlement.js';

test('과제 유형별 저장소만 검색하고 알 수 없는 유형은 거부한다', () => {
  const state = createDefaultState();
  state.days[0].tasks = [{id:'daily-a',label:'매일',done:false,reward:{points:0}}];
  state.weeklyTasks = [{id:'weekly-a',label:'주간',done:false,reward:{points:0}}];
  assert.equal(locateActivity(state, 'dailyTask', 'daily-a')?.dayIndex, 0);
  assert.equal(locateActivity(state, 'dailyTask', 'weekly-a'), null);
  assert.equal(locateActivity(state, 'weeklyTask', 'daily-a'), null);
  assert.equal(locateActivity(state, 'weeklyTask', 'weekly-a')?.dayIndex, null);
  assert.equal(locateActivity(state, 'unknown', 'daily-a'), null);
});
