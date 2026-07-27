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
  let completed = 0;
  const controller = new AudioController(player,{onComplete:async()=>{completed+=1;}});
  await controller.start({id:'day-0',segment:'0:05-0:10'});
  player.currentTime = 9.5;
  controller.update();
  assert.equal(completed,0);
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
