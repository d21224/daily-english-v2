import { DAY_SHORT } from './constants.js?v=0.2.6';

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

function meetsBonusDeadline(type, assignedDay, rule, completedAt = new Date()) {
  const now = completedAt instanceof Date ? completedAt : new Date(completedAt);
  const clock = now.getHours() * 60 + now.getMinutes();
  const cutoff = parseClock(rule.bonusTime ?? '');
  if (type === 'weeklyTask') {
    if (rule.bonusDay === '' || rule.bonusDay === null || rule.bonusDay === undefined) return cutoff === null || clock < cutoff;
    const current = dayIndex(now);
    const deadline = Number(rule.bonusDay);
    if (current < deadline) return true;
    if (current > deadline) return false;
    return cutoff === null || clock < cutoff;
  }
  if (dayIndex(now) !== Number(assignedDay)) return false;
  return cutoff === null || clock < cutoff;
}

export function calculateReward(type, assignedDay, rule, completedAt = new Date()) {
  const baseEarned = Math.max(0, Number(rule?.basePoints) || 0);
  const bonusPoints = Math.max(0, Number(rule?.bonusPoints) || 0);
  const bonusEarned = bonusPoints > 0 && meetsBonusDeadline(type, assignedDay, rule, completedAt) ? bonusPoints : 0;
  return { baseEarned, bonusEarned, points: baseEarned + bonusEarned };
}

function friendlyTime(value) {
  const minutes = parseClock(value);
  if (minutes === null || minutes === undefined) return '';
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const period = hour24 >= 5 && hour24 < 11 ? ['🌅','아침']
    : hour24 >= 11 && hour24 < 14 ? ['☀️','낮']
      : hour24 >= 14 && hour24 < 18 ? ['🌤️','오후']
        : hour24 >= 18 && hour24 < 22 ? ['🌙','저녁'] : ['🌙','밤'];
  const hour = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
  return `${period[0]} ${period[1]} ${hour}시${minute ? ` ${minute}분` : ''}`;
}

export function rewardCopy(rule, type, style = 'simple') {
  const base = Math.max(0, Number(rule?.basePoints) || 0);
  const bonus = Math.max(0, Number(rule?.bonusPoints) || 0);
  if (!base && !bonus) return '';
  if (!bonus) return `${base}P`;
  const time = rule.bonusTime || '';
  if (style === 'child') {
    const dayName = type === 'weeklyTask' && rule.bonusDay !== '' && rule.bonusDay !== null && rule.bonusDay !== undefined
      ? `${DAY_SHORT[Number(rule.bonusDay)] || ''}요일 ` : '';
    const condition = time ? `${friendlyTime(time)} 전에 하면` : '일찍 하면';
    return `${base}P · ${condition.replace(' ', ` ${dayName}`).trim()} ${bonus}P 더!`;
  }
  let condition = time ? `${time} 전` : '일찍 완료';
  if (type === 'weeklyTask' && rule.bonusDay !== '' && rule.bonusDay !== null && rule.bonusDay !== undefined) {
    const dayName = DAY_SHORT[Number(rule.bonusDay)] || '';
    condition = time ? `${dayName} ${time} 전` : `${dayName} 전`;
  }
  return `기본 ${base}P · ${condition} +${bonus}P`;
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
  if (!state || state.schemaVersion !== 3 || !Array.isArray(state.days) || state.days.length !== 7) throw new Error('저장된 학습표 형식이 올바르지 않아요.');
  if (!Array.isArray(state.weeklyTasks) || !state.rewards || !state.copy) throw new Error('저장된 과제 또는 화면 설정이 올바르지 않아요.');
  for (const day of state.days) {
    if (!day.id || !Array.isArray(day.tasks) || Number(day.target) < 0) throw new Error('요일별 학습 설정이 올바르지 않아요.');
    if (Number(day.target) > 0 && !parseSegment(day.segment)) throw new Error(`${day.name} 듣기 구간 형식이 올바르지 않아요.`);
  }
  return state;
}
