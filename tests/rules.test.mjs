import test from 'node:test';
import assert from 'node:assert/strict';
import { copyDaySetup, createDefaultState, resetForNewWeek, selectProgressPraise } from '../scripts/state.js';
import { calculateReward, getProgress, mondayKey, parseSegment, rewardCopy, totalPoints, validateState } from '../scripts/rules.js';

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

test('체크 해제된 과제에 과거 보상 기록이 남아 있어도 포인트에서 제외한다', () => {
  const state = createDefaultState(new Date(2026, 6, 27));
  state.days[0].target = 2;
  state.days[0].count = 2;
  state.days[0].reward.points = 100;
  state.days[0].tasks = [
    { id:'done', label:'완료 과제', done:true, completedAt:'done', reward:{points:100} },
    { id:'unchecked', label:'해제 과제', done:false, completedAt:'old', reward:{points:1100} }
  ];

  assert.equal(totalPoints(state), 200);
});

test('선택한 요일에만 듣기와 과제를 복사하고 해당 진행을 초기화한다', () => {
  const state = createDefaultState(new Date(2026, 6, 27));
  state.days[0].segment = '1:00-1:20';
  state.days[0].target = 3;
  state.days[0].tasks = [
    { id:'source-task', label:'ORT 1권', done:true, completedAt:'source', reward:{points:100} }
  ];
  state.days[1].count = 2;
  state.days[1].completedAt = 'old';
  state.days[1].reward = { points:100 };
  state.days[1].tasks = [
    { id:'old-tuesday', label:'기존 화요일 과제', done:true, completedAt:'old', reward:{points:100} }
  ];
  state.days[2].segment = '9:00-9:10';
  state.days[2].tasks = [
    { id:'keep-wednesday', label:'수요일 유지', done:true, completedAt:'keep', reward:{points:100} }
  ];
  const weeklyBefore = structuredClone(state.weeklyTasks);
  const rewardsBefore = structuredClone(state.rewards);

  const next = copyDaySetup(state, 0, [1, 3]);

  assert.equal(next.days[1].segment, '1:00-1:20');
  assert.equal(next.days[1].target, 3);
  assert.equal(next.days[1].count, 0);
  assert.equal(next.days[1].completedAt, '');
  assert.equal(next.days[1].reward.points, 0);
  assert.deepEqual(next.days[1].tasks.map(task => task.label), ['ORT 1권']);
  assert.equal(next.days[1].tasks[0].done, false);
  assert.equal(next.days[1].tasks[0].completedAt, '');
  assert.equal(next.days[1].tasks[0].reward.points, 0);
  assert.notEqual(next.days[1].tasks[0].id, 'source-task');
  assert.equal(next.days[3].segment, '1:00-1:20');
  assert.equal(next.days[2].segment, '9:00-9:10');
  assert.equal(next.days[2].tasks[0].label, '수요일 유지');
  assert.deepEqual(next.weeklyTasks, weeklyBefore);
  assert.deepEqual(next.rewards, rewardsBefore);
  assert.equal(state.days[1].tasks[0].label, '기존 화요일 과제');
});

test('주간 목표 응원 문구는 기준 달성 후 한 번만 선택하고 새 주에 초기화한다', () => {
  const state = createDefaultState(new Date(2026, 6, 27));
  state.preferences.progressCelebrationThreshold = 50;
  state.progressPraiseMessages = ['첫 문구', '둘째 문구'];
  state.days[0].target = 1;
  state.days[0].count = 1;
  state.days[1].target = 1;
  state.weeklyTasks = [];

  const selected = selectProgressPraise(state, 0.75);

  assert.equal(selected.progressPraise, '둘째 문구');
  assert.equal(selectProgressPraise(selected, 0).progressPraise, '둘째 문구');
  const reset = resetForNewWeek(selected, new Date(2026, 7, 3));
  assert.equal(reset.progressPraise, '');
  assert.deepEqual(reset.progressPraiseMessages, ['첫 문구', '둘째 문구']);
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
  state.copy.title = '유지할 제목';
  state.rewards.dailyTask.basePoints = 321;
  state.weeklyTasks[0].label = '유지할 과제';
  const reset = resetForNewWeek(state, new Date(2026, 7, 3));
  assert.equal(reset.theme,'dark');
  assert.equal(reset.parentPasscode,'1234');
  assert.equal(reset.days[0].target,3);
  assert.equal(reset.days[0].count,0);
  assert.equal(reset.days[0].reward.points,0);
  assert.equal(reset.weeklyTasks[0].done,false);
  assert.equal(reset.copy.title,'유지할 제목');
  assert.equal(reset.rewards.dailyTask.basePoints,321);
  assert.equal(reset.weeklyTasks[0].label,'유지할 과제');
  assert.equal(reset.activeWeekStart,mondayKey(new Date(2026,7,3)));
  assert.notEqual(reset.stateEpoch,state.stateEpoch);
});

test('중복 과제 ID와 잘못된 보상 규칙은 저장 전에 거부한다', () => {
  const duplicate = createDefaultState();
  duplicate.days[0].tasks = [{id:'same',label:'A',done:false,reward:{points:0}}];
  duplicate.weeklyTasks[0].id = 'same';
  assert.throws(() => validateState(duplicate), /과제 ID/);

  const invalidReward = createDefaultState();
  delete invalidReward.rewards.dailyTask;
  assert.throws(() => validateState(invalidReward), /포인트/);
});
