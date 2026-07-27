import { APP_VERSION, DAYS, DEFAULT_PRAISE, DEFAULT_WEEKLY_TASKS, SCHEMA_VERSION } from './constants.js?v=0.2.2';
import { mondayKey } from './rules.js?v=0.2.2';

export function createId(prefix = 'item') {
  return `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function emptyReward() {
  return { points: 0, eligible: false, completedAt: '' };
}

export function createDefaultState(now = new Date()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    screen: 'setup',
    theme: 'cloud',
    activeWeekStart: mondayKey(now),
    stateEpoch: createId('epoch'),
    revision: 0,
    days: DAYS.map((name, index) => ({
      id: `day-${index}`,
      name,
      segment: '',
      target: 0,
      count: 0,
      completedAt: '',
      praise: '',
      reward: emptyReward(),
      tasks: []
    })),
    weeklyTasks: DEFAULT_WEEKLY_TASKS.map((label, index) => ({
      id: `weekly-${index}`,
      label,
      done: false,
      completedAt: '',
      reward: emptyReward()
    })),
    rewards: {
      listening: { points: 200, time: '18:00' },
      dailyTask: { points: 100, time: '' },
      weeklyTask: { points: 500, day: 5, time: '12:00' }
    },
    praiseMessages: [...DEFAULT_PRAISE],
    copy: { title: '매일영어🤍', intro: '오늘 할 일부터 하나씩 해보자.' },
    parentPasscode: '',
    audio: { name: '', saveToDevice: true }
  };
}

export function migrateV1(v1, now = new Date()) {
  const next = createDefaultState(now);
  if (!v1 || !Array.isArray(v1.days) || v1.days.length !== 5) throw new Error('v0.1 학습표 형식을 확인하지 못했어요.');
  next.screen = v1.screen === 'child' ? 'child' : 'setup';
  next.theme = v1.theme === 'dark' ? 'dark' : v1.theme === 'light' ? 'light' : 'cloud';
  next.days = next.days.map((day, index) => {
    if (index >= 5) return day;
    const old = v1.days[index] || {};
    return {
      ...day,
      segment: String(old.segment || ''),
      target: Math.max(0, Number(old.target) || 0),
      count: Math.max(0, Number(old.count) || 0),
      completedAt: String(old.completedAt || ''),
      praise: String(old.celebration || ''),
      reward: { points: Number(old.points) || 0, eligible: Number(old.points) > 0, completedAt: String(old.completedAt || '') }
    };
  });
  const tasks = Array.isArray(v1.tasks) ? v1.tasks : [];
  const done = Array.isArray(v1.taskDone) ? v1.taskDone : [];
  const firstCompletedTask = done.findIndex(Boolean);
  next.weeklyTasks = tasks.map((label, index) => ({
    id: `legacy-weekly-${index}`,
    label: String(label || `주간 과제 ${index + 1}`),
    done: Boolean(done[index]),
    completedAt: Boolean(done[index]) ? String(v1.rewards?.weeklyCompletedAt || '') : '',
    reward: {
      points: index === firstCompletedTask ? Number(v1.rewards?.weeklyEarned || 0) : 0,
      eligible: index === firstCompletedTask && Number(v1.rewards?.weeklyEarned || 0) > 0,
      completedAt: Boolean(done[index]) ? String(v1.rewards?.weeklyCompletedAt || '') : ''
    }
  }));
  next.rewards.listening = { points: Number(v1.rewards?.dailyPoints) || 0, time: String(v1.rewards?.dailyDeadline || '') };
  next.rewards.weeklyTask = { points: Number(v1.rewards?.weeklyPoints) || 0, day: Math.max(0, Math.min(6, Number(v1.rewards?.weeklyDeadlineDay) || 5)), time: String(v1.rewards?.weeklyDeadline || '') };
  next.praiseMessages = Array.isArray(v1.completeMessages) && v1.completeMessages.length ? v1.completeMessages.map(String) : [...DEFAULT_PRAISE];
  next.copy.title = String(v1.texts?.childTitle || next.copy.title);
  next.copy.intro = String(v1.texts?.childIntro || next.copy.intro);
  next.parentPasscode = String(v1.parentPassword || '');
  next.audio = { name: String(v1.audio?.name || ''), saveToDevice: v1.audio?.saveToDevice !== false };
  return next;
}

export function resetForNewWeek(state, now = new Date()) {
  return {
    ...structuredClone(state),
    activeWeekStart: mondayKey(now),
    stateEpoch: createId('epoch'),
    revision: Number(state.revision) + 1,
    days: state.days.map(day => ({
      ...day,
      count: 0,
      completedAt: '',
      praise: '',
      reward: emptyReward(),
      tasks: day.tasks.map(task => ({ ...task, done: false, completedAt: '', reward: emptyReward() }))
    })),
    weeklyTasks: state.weeklyTasks.map(task => ({ ...task, done: false, completedAt: '', reward: emptyReward() }))
  };
}
