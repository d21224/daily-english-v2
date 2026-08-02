import { parseSegment } from './rules.js?v=0.2.15';

export class AudioController {
  constructor(player, callbacks = {}) {
    this.player = player;
    this.callbacks = callbacks;
    this.now = callbacks.now || (() => performance.now());
    this.active = null;
    this.timer = null;
    this.boundEnded = () => this.handleEnded();
    this.boundTime = () => this.update();
    player.addEventListener('ended', this.boundEnded);
    player.addEventListener('timeupdate', this.boundTime);
  }

  async start(day) {
    const segment = parseSegment(day.segment);
    if (!segment) throw new Error('듣기 구간을 확인해 주세요.');
    if (Number.isFinite(this.player.duration) && segment.end > this.player.duration + .03) throw new Error('오디오가 설정한 구간보다 짧아요.');
    if (this.active?.day.id === day.id) return this.toggle();
    if (this.active) throw new Error('다른 구간을 재생 중이에요.');
    this.active = { day, segment, runId: crypto.randomUUID(), lastTrustedTime: segment.start, lastWallTime: this.now() };
    this.player.currentTime = segment.start;
    await this.player.play();
    this.timer = window.setInterval(() => this.update(), 100);
    this.callbacks.onStatus?.('재생 중');
    this.update();
  }

  async toggle() {
    if (!this.active) return;
    if (this.player.paused) {
      await this.player.play();
      this.callbacks.onStatus?.('재생 중');
    } else {
      this.player.pause();
      this.callbacks.onStatus?.('일시정지');
    }
    this.update();
  }

  rewind() {
    if (!this.active) return;
    this.player.currentTime = Math.max(this.active.segment.start, this.player.currentTime - 3);
    this.trustCurrentPosition();
    this.callbacks.onStatus?.('3초 전으로 돌아갔어요');
    this.update();
  }

  restart() {
    if (!this.active) return;
    this.player.currentTime = this.active.segment.start;
    this.trustCurrentPosition();
    this.callbacks.onStatus?.('처음부터 다시 듣고 있어요');
    this.update();
  }

  update() {
    if (!this.active) return;
    const now = this.now();
    const current = Number(this.player.currentTime) || 0;
    const elapsed = Math.max(0, now - this.active.lastWallTime) / 1000;
    const advance = current - this.active.lastTrustedTime;
    if (advance > elapsed + .75) {
      this.invalidate();
      this.callbacks.onError?.(new Error('듣는 중에는 앞으로 건너뛸 수 없어요. 처음부터 다시 재생해 주세요.'));
      return;
    }
    this.active.lastTrustedTime = current;
    this.active.lastWallTime = now;
    const { start, end } = this.active.segment;
    const percent = Math.max(0, Math.min(100, ((current - start) / (end - start)) * 100));
    this.callbacks.onProgress?.({ percent, paused: this.player.paused, dayId: this.active.day.id });
    if (current >= end - .03) this.complete();
  }

  trustCurrentPosition() {
    if (!this.active) return;
    this.active.lastTrustedTime = Number(this.player.currentTime) || this.active.segment.start;
    this.active.lastWallTime = this.now();
  }

  async complete() {
    if (!this.active) return;
    const run = this.active;
    this.stopTimer();
    this.player.pause();
    this.active = null;
    this.callbacks.onStatus?.('기록 저장 중');
    await this.callbacks.onComplete?.(run);
  }

  handleEnded() {
    if (!this.active) return;
    if (this.player.currentTime >= this.active.segment.end - .03) this.complete();
    else {
      this.invalidate();
      this.callbacks.onError?.(new Error('오디오가 구간이 끝나기 전에 종료됐어요.'));
    }
  }

  invalidate() {
    this.stopTimer();
    this.player.pause();
    this.active = null;
  }

  stopTimer() {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
  }
}
