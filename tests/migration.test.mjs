import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateV1 } from '../scripts/state.js';

const legacy = {
  screen:'child',
  theme:'cinnamoroll',
  days:[
    {name:'월요일',segment:'1:00-1:10',target:3,count:2,points:0,completedAt:''},
    {name:'화요일',segment:'2:00-2:10',target:1,count:1,points:200,completedAt:'2026-07-21T08:00:00Z'},
    {name:'수요일',segment:'',target:0,count:0},
    {name:'목요일',segment:'',target:0,count:0},
    {name:'금요일',segment:'',target:0,count:0}
  ],
  tasks:['워크시트','워크시트'],
  taskDone:[true,false],
  rewards:{dailyPoints:200,dailyDeadline:'18:00',weeklyPoints:500,weeklyDeadlineDay:6,weeklyDeadline:'12:00'},
  texts:{childTitle:'영어 집중듣기 학습표🤍',childIntro:''},
  audio:{name:'book.mp3',saveToDevice:true}
};

test('v1을 복사해 월~금을 보존하고 토/일을 비활성 추가한다', () => {
  const state = migrateV1(structuredClone(legacy), new Date(2026,6,27));
  assert.equal(state.days.length,7);
  assert.equal(state.days[0].segment,'1:00-1:10');
  assert.equal(state.days[1].count,1);
  assert.equal(state.days[5].target,0);
  assert.equal(state.days[6].target,0);
  assert.equal(state.audio.name,'book.mp3');
  assert.equal(state.weeklyTasks.reduce((sum,task)=>sum+task.reward.points,0),0);
});

test('중복 이름의 주간 과제도 결정적인 별도 ID를 갖는다', () => {
  const first = migrateV1(structuredClone(legacy));
  const second = migrateV1(structuredClone(legacy));
  assert.deepEqual(first.weeklyTasks.map(task=>task.id),['legacy-weekly-0','legacy-weekly-1']);
  assert.deepEqual(first.weeklyTasks.map(task=>task.id),second.weeklyTasks.map(task=>task.id));
  assert.notEqual(first.weeklyTasks[0].id,first.weeklyTasks[1].id);
});
