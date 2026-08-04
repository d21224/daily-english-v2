import { openDatabase } from './storage.js?v=0.2.16';
import { calculateReward } from './rules.js?v=0.2.16';

const STATE_KEY = 'current';

function activityKey(epoch, type, id) {
  return `${epoch}:${type}:${id}`;
}

export function locateActivity(state, type, id) {
  if (type === 'listening') {
    const dayIndex = state.days.findIndex(day => day.id === id);
    return dayIndex < 0 ? null : { item: state.days[dayIndex], dayIndex };
  }
  if (type === 'dailyTask') {
    for (let dayIndex = 0; dayIndex < state.days.length; dayIndex += 1) {
      const task = state.days[dayIndex].tasks.find(value => value.id === id);
      if (task) return { item: task, dayIndex };
    }
    return null;
  }
  if (type === 'weeklyTask') {
    const task = state.weeklyTasks.find(value => value.id === id);
    return task ? { item: task, dayIndex: null } : null;
  }
  return null;
}

export async function settleActivity({ expectedEpoch, type, id, runId = '', completedAt = new Date(), praise = '' }) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['state','ledger'], 'readwrite');
    const stateStore = tx.objectStore('state');
    const ledgerStore = tx.objectStore('ledger');
    const getState = stateStore.get(STATE_KEY);
    let outcome;
    getState.onerror = () => tx.abort();
    getState.onsuccess = () => {
      const state = getState.result;
      if (!state || state.stateEpoch !== expectedEpoch) {
        outcome = { status: 'stale' };
        tx.abort();
        return;
      }
      const located = locateActivity(state, type, id);
      if (!located) {
        outcome = { status: 'missing' };
        tx.abort();
        return;
      }
      const key = activityKey(state.stateEpoch, type, id);
      const getLedger = ledgerStore.get(key);
      getLedger.onerror = () => tx.abort();
      getLedger.onsuccess = () => {
        if (getLedger.result || located.item.completedAt) {
          if (type !== 'listening') {
            located.item.done = true;
            state.revision += 1;
            stateStore.put(state, STATE_KEY);
          }
          outcome = { status: 'duplicate', state, record: getLedger.result };
          return;
        }
        const { item, dayIndex } = located;
        const date = completedAt instanceof Date ? completedAt : new Date(completedAt);
        if (type === 'listening') {
          item.count = Math.min(Number(item.target), Number(item.count) + 1);
          if (item.count < Number(item.target)) {
            state.revision += 1;
            stateStore.put(state, STATE_KEY);
            outcome = { status: 'counted', state };
            return;
          }
        } else {
          item.done = true;
        }
        const rule = state.rewards?.[type];
        if (!rule) {
          outcome = { status: 'invalid-rule' };
          tx.abort();
          return;
        }
        const earned = calculateReward(type, dayIndex, rule, date);
        item.completedAt = date.toISOString();
        item.reward = { ...earned, eligible: earned.bonusEarned > 0, completedAt: item.completedAt };
        if (type === 'listening') item.praise = String(praise || '');
        const record = { key, runId, type, id, completedAt: item.completedAt, ...earned };
        ledgerStore.put(record);
        state.revision += 1;
        stateStore.put(state, STATE_KEY);
        outcome = { status: 'settled', state, record };
      };
    };
    tx.oncomplete = () => { db.close(); resolve(outcome); };
    tx.onabort = () => {
      db.close();
      if (outcome?.status === 'stale' || outcome?.status === 'missing') resolve(outcome);
      else reject(tx.error || new Error('기록을 저장하지 못했어요.'));
    };
    tx.onerror = () => {};
  });
}

export async function setTaskUnchecked({ expectedEpoch, type, id }) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['state','ledger'], 'readwrite');
    const stateStore = tx.objectStore('state');
    const ledgerStore = tx.objectStore('ledger');
    const request = stateStore.get(STATE_KEY);
    let next;
    request.onsuccess = () => {
      next = request.result;
      if (!next || next.stateEpoch !== expectedEpoch) return tx.abort();
      const located = locateActivity(next, type, id);
      if (!located || type === 'listening') return tx.abort();
      located.item.done = false;
      located.item.completedAt = '';
      located.item.reward = {
        points: 0,
        baseEarned: 0,
        bonusEarned: 0,
        eligible: false,
        completedAt: ''
      };
      ledgerStore.delete(activityKey(next.stateEpoch, type, id));
      next.revision += 1;
      stateStore.put(next, STATE_KEY);
    };
    tx.oncomplete = () => { db.close(); resolve(next); };
    tx.onabort = () => { db.close(); reject(new Error('과제 상태를 저장하지 못했어요.')); };
  });
}
