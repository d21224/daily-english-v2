import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultState } from '../scripts/state.js';
import { createBackupPayload, prepareImportedState } from '../scripts/backup.js';

test('백업은 암호를 제외하고 설정과 진도를 담는다', () => {
  const state = createDefaultState();
  state.parentPasscode = '1234';
  state.days[0].count = 2;
  const payload = createBackupPayload(state, new Date('2026-08-02T00:00:00Z'));
  assert.equal('parentPasscode' in payload.state, false);
  assert.equal(payload.state.days[0].count, 2);
  assert.equal(state.parentPasscode, '1234');
});

test('복원은 현재 기기의 암호와 오디오 설정을 유지한다', () => {
  const current = createDefaultState();
  current.parentPasscode = '5678';
  current.audio = {name:'device.mp3',saveToDevice:true};
  const imported = createDefaultState();
  imported.parentPasscode = 'leaked';
  imported.audio = {name:'backup.mp3',saveToDevice:false};
  imported.copy.title = '복원 제목';
  const next = prepareImportedState({app:'매일영어',version:2,state:imported}, current);
  assert.equal(next.parentPasscode, '5678');
  assert.deepEqual(next.audio, current.audio);
  assert.equal(next.copy.title, '복원 제목');
});

test('손상된 백업은 복원 전에 거부한다', () => {
  const current = createDefaultState();
  const imported = createDefaultState();
  imported.days[0].tasks = [{id:'duplicate',label:'A',done:false,reward:{points:0}}];
  imported.weeklyTasks[0].id = 'duplicate';
  assert.throws(() => prepareImportedState({app:'매일영어',version:2,state:imported}, current), /과제 ID/);
});
