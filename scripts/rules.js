import { DAY_SHORT } from './constants.js?v=0.2.2';

export function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function mondayKey(date = new Date()) {
  const value = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = value.getDay();
  value.setDate(value.getDate() - (day === 0 ? 6 : day - 1));
  return localDateKey(value);
}

export function parseTime(value) {
  const parts = String(value ?? '').trim().split(':');
  if (parts.length !== 2 || !/^\d+$/.test(parts[0]) || !/^\d{1,2}$/.test(parts[1])) return null;
  const minutes = Number(parts[0]);
  const seconds = Number(parts[1]);
  return seconds < 60 ? minutes * 60 + seconds : null;
}

export function parseSegment(value) {
  const parts = String(value ?? '').trim().split(/\s*[-–]\s*/);
  if (parts.length !== 2) return null;
  const start = parseTime(parts[0]);
  const end = parseTime(parts[1]);
  return start !== null && end !== null && end > start ? { start, end } : null;
}

export function formatMediaTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  return `${Math.floor(safe / 60)}:${String(Math.floor(safe % 60)).padStart(2, '0')}`;
}

export function parseClock(value) {
  if (value === '') return null;
  const match = /^(\d{2}):(\d{2})$/.exec(String(value ?? ''));
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour < 24 && minute < 60 ? hour * 60 + minute : undefined;
}

export function dayIndex(date = new Date()) {
  return (date.getDay() + 6) % 7;
}

export function eligibleForReward(type, assignedDay, rule, completedAt = new Date()) {
  if (!rule || Number(rule.points) <= 0) return 0;
  const now = completedAt instanceof Date ? completedAt : new Date(completedAt);
  const clock = now.getHours() * 60 + now.getMinutes();
  const cutoff = parseClock(rule.time ?? '');
  if (type === 'weeklyTask') {
    if (rule.day === '' || rule.day === null || rule.day === undefined) return cutoff === null || clock < cutoff ? Number(rule.points) : 0;
    const current = dayIndex(now);
    const deadline = Number(rule.day);
    if (current < deadline) return Number(rule.points);
    if (current > deadline) return 0;
    return cutoff === null || clock < cutoff ? Number(rule.points) : 0;
  }
  if (dayIndex(now) !== Number(assignedDay)) return 0;
  return cutoff === null || clock < cutoff ? Number(rule.points) : 0;
}

export function rewardCopy(rule, type) {
  const points = Number(rule?.points) || 0;
  if (!points) return '';
  const time = rule.time || '';
  if (type === 'weeklyTask' && rule.day !== '' && rule.day !== null && rule.day !== undefined) {
    const dayName = DAY_SHORT[Number(rule.day)] || '';
    return time ? `${dayName} ${time}까지 · ${points}P` : `${dayName}까지 · ${points}P`;
  }
  return time ? `${time}까지 · ${points}P` : `${points}P`;
}

export function getActiveItems(state) {
  const items = [];
  state.days.forEach((day, dayIndexValue) => {
    if (Number(day.target) > 0) items.push({ type: 'listening', id: day.id, dayIndex: dayIndexValue, done: Number(day.count) >= Number(day.target) });
    day.tasks.forEach(task => items.push({ type: 'dailyTask', id: task.id, dayIndex: dayIndexValue, done: Boolean(task.done) }));
  });
  state.weeklyTasks.forEach(task => items.push({ type: 'weeklyTask', id: task.id, done: Boolean(task.done) }));
  return items;
}

export function getProgress(state) {
  const items = getActiveItems(state);
  return { done: items.filter(item => item.done).length, total: items.length };
}

export function totalPoints(state) {
  let total = 0;
  state.days.forEach(day => {
    total += Number(day.reward?.points) || 0;
    day.tasks.forEach(task => { total += Number(task.reward?.points) || 0; });
  });
  state.weeklyTasks.forEach(task => { total += Number(task.reward?.points) || 0; });
  return total;
}

export function validateState(state) {
  if (!state || state.schemaVersion !== 2 || !Array.isArray(state.days) || state.days.length !== 7) throw new Error('저장된 학습표 형식이 올바르지 않아요.');
  if (!Array.isArray(state.weeklyTasks) || !state.rewards || !state.copy) throw new Error('저장된 과제 또는 화면 설정이 올바르지 않아요.');
  for (const day of state.days) {
    if (!day.id || !Array.isArray(day.tasks) || Number(day.target) < 0) throw new Error('요일별 학습 설정이 올바르지 않아요.');
    if (Number(day.target) > 0 && !parseSegment(day.segment)) throw new Error(`${day.name} 듣기 구간 형식이 올바르지 않아요.`);
  }
  return state;
}
