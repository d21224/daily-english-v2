import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioController } from '../scripts/audio-controller.js';

globalThis.window = {
  setInterval: globalThis.setInterval,
  clearInterval: globalThis.clearInterval
};

class FakePlayer extends EventTarget {
  constructor(duration = 30) {
    super();
    this.currentTime = 0;
    this.duration = duration;
    this.paused = true;
  }
  async play() { this.paused = false; }
  pause() { this.paused = true; }
}

test('설정 끝점에 도달한 뒤에만 완료 콜백을 한 번 호출한다', async () => {
  const player = new FakePlayer();
  let now = 0;
  let completed = 0;
  const controller = new AudioController(player,{now:()=>now,onComplete:async()=>{completed+=1;}});
  await controller.start({id:'day-0',segment:'0:05-0:10'});
  now = 4500;
  player.currentTime = 9.5;
  controller.update();
  assert.equal(completed,0);
  now = 5000;
  player.currentTime = 10;
  controller.update();
  await new Promise(resolve=>setTimeout(resolve,0));
  controller.update();
  assert.equal(completed,1);
});

test('오디오 길이보다 긴 구간은 재생 전에 거부한다', async () => {
  const player = new FakePlayer(8);
  const controller = new AudioController(player);
  await assert.rejects(()=>controller.start({id:'day-0',segment:'0:05-0:10'}),/짧아요/);
});

test('3초 전과 처음부터는 구간 시작보다 앞으로 가지 않는다', async () => {
  const player = new FakePlayer();
  const controller = new AudioController(player);
  await controller.start({id:'day-0',segment:'0:05-0:15'});
  player.currentTime = 6;
  controller.rewind();
  assert.equal(player.currentTime,5);
  player.currentTime = 12;
  controller.restart();
  assert.equal(player.currentTime,5);
  controller.invalidate();
});

test('외부 조작으로 재생 위치를 앞으로 건너뛰면 완료하지 않는다', async () => {
  const player = new FakePlayer();
  let now = 0;
  let completed = 0;
  let error = '';
  const controller = new AudioController(player, {
    now: () => now,
    onComplete: async () => { completed += 1; },
    onError: value => { error = value.message; }
  });
  await controller.start({id:'day-0',segment:'0:05-0:10'});
  now = 100;
  player.currentTime = 10;
  controller.update();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(completed, 0);
  assert.match(error, /건너뛸 수 없어요/);
  assert.equal(controller.active, null);
});
