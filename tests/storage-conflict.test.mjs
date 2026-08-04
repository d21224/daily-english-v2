import test from 'node:test';
import assert from 'node:assert/strict';
import { StateConflictError, assertExpectedState } from '../scripts/storage.js';

test('오래된 revision은 최신 상태 저장을 덮어쓸 수 없다', () => {
  assert.throws(
    () => assertExpectedState(
      { revision: 8, stateEpoch: 'epoch-a' },
      { revision: 7, stateEpoch: 'epoch-a' }
    ),
    error => error instanceof StateConflictError && error.code === 'STATE_CONFLICT'
  );
});

test('다른 주의 epoch는 revision이 같아도 저장할 수 없다', () => {
  assert.throws(
    () => assertExpectedState(
      { revision: 8, stateEpoch: 'epoch-new' },
      { revision: 8, stateEpoch: 'epoch-old' }
    ),
    error => error instanceof StateConflictError && error.code === 'STATE_CONFLICT'
  );
});

test('같은 revision과 epoch는 저장할 수 있다', () => {
  assert.doesNotThrow(() => assertExpectedState(
    { revision: 8, stateEpoch: 'epoch-a' },
    { revision: 8, stateEpoch: 'epoch-a' }
  ));
});
