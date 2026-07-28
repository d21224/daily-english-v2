import { APP_VERSION, DAYS, DEFAULT_LISTENING_PRAISE, DEFAULT_TASK_PRAISE, DEFAULT_WEEKLY_TASKS, SCHEMA_VERSION } from './constants.js?v=0.2.12';
import { mondayKey } from './rules.js?v=0.2.6';

export function createId(prefix = 'item') {
  return `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function emptyReward() {
  return { points: 0, baseEarned: 0, bonusEarned: 0, eligible: false, completedAt: '' };
}

function rewardRule(basePoints = 0, bonusPoints = 0, bonusTime = '', bonusDay) {
  const rule = { basePoints: Math.max(0, Number(basePoints) || 0), bonusPoints: Math.max(0, Number(bonusPoints) || 0), bonusTime: String(bonusTime || '') };
  if (bonusDay !== undefined) rule.bonusDay = bonusDay;
  return rule;
}

function completedReward(reward = {}) {
  const points = Math.max(0, Number(reward.points) || 0);
  return {
    ...reward,
    points,
    baseEarned: Math.max(0, Number(reward.baseEarned) || points),
    bonusEarned: Math.max(0, Number(reward.bonusEarned) || 0),
    eligible: Boolean(reward.eligible),
    completedAt: String(reward.completedAt || '')
  };
}

export function normalizePreferences(value) {
  const next = structuredClone(value);
  const preferences = next.preferences || {};
  next.preferences = {
    copyStyle: preferences.copyStyle === 'simple' ? 'simple' : 'child',
    taskPraiseEnabled: preferences.taskPraiseEnabled !== false,
    progressCelebrationThreshold: [50,70,80,90,100].includes(Number(preferences.progressCelebrationThreshold))
      ? Number(preferences.progressCelebrationThreshold) : 100
  };
  next.listeningPraiseMessages = Array.isArray(next.listeningPraiseMessages) && next.listeningPraiseMessages.length
    ? next.listeningPraiseMessages.map(String)
    : Array.isArray(next.praiseMessages) && next.praiseMessages.length
      ? next.praiseMessages.map(String) : [...DEFAULT_LISTENING_PRAISE];
  next.taskPraiseMessages = Array.isArray(next.taskPraiseMessages) && next.taskPraiseMessages.length
    ? next.taskPraiseMessages.map(String) : [...DEFAULT_TASK_PRAISE];
  delete next.praiseMessages;
  return next;
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
      listening: rewardRule(200),
      dailyTask: rewardRule(100),
      weeklyTask: rewardRule(500, 0, '', '')
    },
    preferences: { copyStyle:'child', taskPraiseEnabled:true, progressCelebrationThreshold:100 },
    listeningPraiseMessages: [...DEFAULT_LISTENING_PRAISE],
    taskPraiseMessages: [...DEFAULT_TASK_PRAISE],
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
  next.rewards.listening = rewardRule(Number(v1.rewards?.dailyPoints) || 0);
  next.rewards.weeklyTask = rewardRule(Number(v1.rewards?.weeklyPoints) || 0, 0, '', '');
  next.listeningPraiseMessages = Array.isArray(v1.completeMessages) && v1.completeMessages.length ? v1.completeMessages.map(String) : [...DEFAULT_LISTENING_PRAISE];
  next.copy.title = String(v1.texts?.childTitle || next.copy.title);
  next.copy.intro = String(v1.texts?.childIntro || next.copy.intro);
  next.parentPasscode = String(v1.parentPassword || '');
  next.audio = { name: String(v1.audio?.name || ''), saveToDevice: v1.audio?.saveToDevice !== false };
  return next;
}

export function migrateV2(value) {
  const next = structuredClone(value);
  next.schemaVersion = SCHEMA_VERSION;
  next.appVersion = APP_VERSION;
  const oldRules = value.rewards || {};
  next.rewards = {
    listening: rewardRule(oldRules.listening?.points, 0, oldRules.listening?.time),
    dailyTask: rewardRule(oldRules.dailyTask?.points, 0, oldRules.dailyTask?.time),
    weeklyTask: rewardRule(oldRules.weeklyTask?.points, 0, oldRules.weeklyTask?.time, oldRules.weeklyTask?.day ?? '')
  };
  next.days = next.days.map(day => ({
    ...day,
    reward: completedReward(day.reward),
    tasks: day.tasks.map(task => ({ ...task, reward: completedReward(task.reward) }))
  }));
  next.weeklyTasks = next.weeklyTasks.map(task => ({ ...task, reward: completedReward(task.reward) }));
  return normalizePreferences(next);
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
