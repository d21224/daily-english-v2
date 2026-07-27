import { APP_NAME, APP_VERSION, DAYS, DAY_SHORT, DEFAULT_LISTENING_PRAISE, DEFAULT_TASK_PRAISE } from './constants.js?v=0.2.9';
import { AudioController } from './audio-controller.js?v=0.2.2';
import { clearAudio, clearV2, copyLegacyAudioIfAvailable, loadAudio, loadState, replaceState, saveAudio, saveState } from './storage.js?v=0.2.9';
import { createDefaultState, createId, migrateV2, resetForNewWeek } from './state.js?v=0.2.9';
import { dayIndex, formatMediaTime, getProgress, mondayKey, parseClock, parseSegment, rewardCopy, totalPoints, validateState } from './rules.js?v=0.2.6';
import { setTaskUnchecked, settleActivity } from './settlement.js?v=0.2.6';

const $ = id => document.getElementById(id);
const clone = value => structuredClone(value);
let state;
let draft;
let selectedDay = 0;
let audioUrl = '';
let dialogTrigger = null;
let dialogResolver = null;
let bootTimer;
let taskPraiseTimer;

const player = $('player');
const setupPlayer = $('setupPlayer');
const audioController = new AudioController(player, {
  onStatus: message => { $('playbackStatus').textContent = message; },
  onProgress: updatePlaybackButton,
  onComplete: completeListening,
  onError: error => showChildNotice(error.message, true)
});

function safeText(value, max = 160) {
  return String(value ?? '').trim().slice(0, max);
}

function show(element, visible = true) {
  element.classList.toggle('hidden', !visible);
}

function themeValue(value) {
  return ['cloud','light','dark'].includes(value) ? value : 'cloud';
}

function applyTheme(value) {
  document.body.dataset.theme = themeValue(value);
}

function rolloverPending() {
  return Boolean(state?.activeWeekStart && state.activeWeekStart !== mondayKey());
}

function setAudioSource(record) {
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = record?.blob ? URL.createObjectURL(record.blob) : '';
  player.src = audioUrl;
  setupPlayer.src = audioUrl;
  if (record?.name) state.audio.name = record.name;
}

function renderAudioStatus() {
  const connected = Boolean(audioUrl);
  $('audioFileName').textContent = connected ? state.audio.name : state.audio.name ? `${state.audio.name} · 다시 연결 필요` : '선택된 파일 없음';
  $('audioStatus').textContent = connected ? `● ${state.audio.name} · 이 기기에 연결됨` : state.audio.name ? `오디오 연결이 필요해요 · 이전 파일: ${state.audio.name}` : '';
  $('saveAudio').checked = state.audio.saveToDevice !== false;
}

function rewardEditorHtml() {
  const configs = [
    ['listening','듣기 목표 완료',false],
    ['dailyTask','매일 과제 1개',false],
    ['weeklyTask','주간 과제 1개',true]
  ];
  return configs.map(([key,label,weekly]) => {
    const rule = draft.rewards[key];
    return `<div class="reward-box" data-reward="${key}"><strong>${label}</strong>
      <div class="deadline-fields">
        <label>기본 포인트<input data-reward-base="${key}" type="number" min="0" step="10" value="${Number(rule.basePoints)||0}"></label>
        <label>추가 포인트<input data-reward-bonus="${key}" type="number" min="0" step="10" value="${Number(rule.bonusPoints)||0}"></label>
        ${weekly ? `<label class="bonus-condition">마감 요일<select data-reward-day="${key}"><option value="">선택</option>${DAYS.map((day,index)=>`<option value="${index}" ${String(rule.bonusDay)===String(index)?'selected':''}>${day}</option>`).join('')}</select></label>` : ''}
        <label class="bonus-condition">마감 시간<input data-reward-time="${key}" type="time" value="${rule.bonusTime||''}"></label>
      </div>
    </div>`;
  }).join('');
}

function renderDayEditor() {
  const day = draft.days[selectedDay];
  $('dayTabs').innerHTML = DAY_SHORT.map((label,index)=>`<button class="day-tab" type="button" role="tab" data-day-tab="${index}" aria-selected="${selectedDay===index}">${label}</button>`).join('');
  const segment = parseSegment(day.segment);
  const start = segment ? formatMediaTime(segment.start) : '';
  const end = segment ? formatMediaTime(segment.end) : '';
  $('dayEditor').innerHTML = `<h3>${day.name} 설정</h3>
    <div class="field-grid">
      <label>듣기 시작<input id="dayStart" inputmode="decimal" placeholder="예: 10:11" value="${start}"></label>
      <label>듣기 종료<input id="dayEnd" inputmode="decimal" placeholder="예: 10:20" value="${end}"></label>
      <label>목표 횟수<input id="dayTarget" type="number" min="0" step="1" inputmode="numeric" value="${Number(day.target)||0}"></label>
    </div>
    <div class="task-editor">${day.tasks.map(task=>`<div class="task-input-row"><input data-daily-task="${task.id}" maxlength="100" placeholder="과제 이름" value="${escapeAttribute(task.label)}"><button class="delete-button" type="button" data-delete-daily="${task.id}" aria-label="${task.label?`${escapeAttribute(task.label)} 삭제`:'과제 삭제'}">삭제</button></div>`).join('')}</div>
    <div class="editor-actions">
      <button class="small-button" type="button" id="addDailyTask">+ 매일 과제 추가</button>
      <button class="small-button" type="button" id="applyDayToAll">${day.name} 설정을 다른 날에 적용</button>
    </div>`;
}

function escapeAttribute(value) {
  return String(value ?? '').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
}

function renderSetup() {
  draft = clone(state);
  selectedDay = Math.min(selectedDay, 6);
  applyTheme(draft.theme);
  renderAudioStatus();
  renderDayEditor();
  $('weeklyTaskEditor').innerHTML = draft.weeklyTasks.map(task=>`<div class="task-input-row"><input data-weekly-task="${task.id}" maxlength="100" placeholder="과제 이름" value="${escapeAttribute(task.label)}"><button class="delete-button" type="button" data-delete-weekly="${task.id}" aria-label="${task.label?`${escapeAttribute(task.label)} 삭제`:'과제 삭제'}">삭제</button></div>`).join('');
  $('rewardEditor').innerHTML = rewardEditorHtml();
  $('themeEditor').innerHTML = [
    ['cloud','구름 위 학습표'],
    ['light','조용한 집중 노트'],
    ['dark','밤하늘 테마']
  ].map(([key,label])=>`<label class="theme-card" data-theme="${key}"><input type="radio" name="theme" value="${key}" ${draft.theme===key?'checked':''}><div class="theme-swatch"></div><span>${label}</span></label>`).join('');
  $('copyTitle').value = draft.copy.title;
  $('copyIntro').value = draft.copy.intro;
  $('listeningPraiseMessages').value = draft.listeningPraiseMessages.join('\n');
  $('taskPraiseMessages').value = draft.taskPraiseMessages.join('\n');
  document.querySelector(`input[name="copyStyle"][value="${draft.preferences.copyStyle}"]`).checked = true;
  $('taskPraiseEnabled').checked = draft.preferences.taskPraiseEnabled;
  $('progressCelebrationThreshold').value = String(draft.preferences.progressCelebrationThreshold);
  $('parentPasscode').value = draft.parentPasscode;
  $('setupError').textContent = '';
  show($('setupError'), false);
}

function captureCurrentDay() {
  const start = $('dayStart')?.value.trim() || '';
  const end = $('dayEnd')?.value.trim() || '';
  const target = Number($('dayTarget')?.value || 0);
  const day = draft.days[selectedDay];
  day.segment = start || end ? `${start}-${end}` : '';
  day.target = Number.isFinite(target) ? Math.max(0, target) : 0;
  day.tasks.forEach(task => {
    const input = document.querySelector(`[data-daily-task="${CSS.escape(task.id)}"]`);
    if (input) task.label = safeText(input.value, 100);
  });
}

function captureSetup() {
  captureCurrentDay();
  draft.weeklyTasks.forEach(task => {
    const input = document.querySelector(`[data-weekly-task="${CSS.escape(task.id)}"]`);
    if (input) task.label = safeText(input.value, 100);
  });
  for (const key of ['listening','dailyTask','weeklyTask']) {
    const basePoints = Number(document.querySelector(`[data-reward-base="${key}"]`).value);
    const bonusPoints = Number(document.querySelector(`[data-reward-bonus="${key}"]`).value);
    const time = document.querySelector(`[data-reward-time="${key}"]`).value;
    draft.rewards[key].basePoints = Number.isFinite(basePoints) ? Math.max(0, basePoints) : 0;
    draft.rewards[key].bonusPoints = Number.isFinite(bonusPoints) ? Math.max(0, bonusPoints) : 0;
    draft.rewards[key].bonusTime = time;
    const day = document.querySelector(`[data-reward-day="${key}"]`);
    if (day) draft.rewards[key].bonusDay = day.value === '' ? '' : Number(day.value);
  }
  draft.theme = document.querySelector('input[name="theme"]:checked')?.value || 'cloud';
  draft.copy.title = safeText($('copyTitle').value, 80) || '매일영어🤍';
  draft.copy.intro = safeText($('copyIntro').value, 160);
  draft.listeningPraiseMessages = $('listeningPraiseMessages').value.split('\n').map(value=>safeText(value,160)).filter(Boolean);
  draft.taskPraiseMessages = $('taskPraiseMessages').value.split('\n').map(value=>safeText(value,160)).filter(Boolean);
  if (!draft.listeningPraiseMessages.length) draft.listeningPraiseMessages = [...DEFAULT_LISTENING_PRAISE];
  if (!draft.taskPraiseMessages.length) draft.taskPraiseMessages = [...DEFAULT_TASK_PRAISE];
  draft.parentPasscode = safeText($('parentPasscode').value, 40);
  draft.preferences = {
    copyStyle: document.querySelector('input[name="copyStyle"]:checked')?.value === 'simple' ? 'simple' : 'child',
    taskPraiseEnabled: $('taskPraiseEnabled').checked,
    progressCelebrationThreshold: Number($('progressCelebrationThreshold').value) || 100
  };
  draft.audio = { ...state.audio, saveToDevice: $('saveAudio').checked };
}

function validateDraft() {
  for (const day of draft.days) {
    if (!Number.isInteger(Number(day.target)) || Number(day.target) < 0) throw new Error(`${day.name} 목표 횟수는 0 이상 정수로 입력해 주세요.`);
    if (Number(day.target) > 0) {
      const parts = String(day.segment).split(/\s*[-–]\s*/);
      if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error(`${day.name} 듣기 시작과 종료를 각각 입력해 주세요. 예: 시작 10:11, 종료 10:20`);
      if (!parseSegment(day.segment)) throw new Error(`${day.name} 시작·종료 시간 형식을 확인해 주세요. 종료 시간은 시작 시간보다 뒤여야 해요.`);
    }
    if (Number(day.target) > 0 && audioUrl && Number.isFinite(player.duration) && parseSegment(day.segment).end > player.duration + .03) throw new Error(`${day.name} 종료 시간이 오디오 길이보다 길어요.`);
    if (day.tasks.some(task=>!task.label)) throw new Error(`${day.name} 과제 이름을 입력해 주세요.`);
  }
  if (draft.weeklyTasks.some(task=>!task.label)) throw new Error('주간 과제 이름을 입력해 주세요.');
  if (!draft.weeklyTasks.length) throw new Error('주간 과제는 1개 이상 남겨 주세요.');
  if (draft.parentPasscode && draft.parentPasscode.length < 4) throw new Error('설정 암호는 4자리 이상 입력해 주세요.');
  for (const rule of Object.values(draft.rewards)) {
    if (Number(rule.basePoints) < 0 || Number(rule.bonusPoints) < 0) throw new Error('포인트는 0 이상 입력해 주세요.');
    if (Number(rule.bonusPoints) > 0 && (parseClock(rule.bonusTime) === undefined || parseClock(rule.bonusTime) === null)) throw new Error('추가 포인트의 마감 시간을 입력해 주세요.');
  }
  if (Number(draft.rewards.weeklyTask.bonusPoints) > 0 && draft.rewards.weeklyTask.bonusDay === '') throw new Error('주간 과제 추가 포인트의 마감 요일을 선택해 주세요.');
}

function pointBadge(rule, type, earned = null) {
  if (earned !== null) return Number(earned) > 0 ? `<span class="point-badge">${Number(earned)}P</span>` : '';
  const copy = rewardCopy(rule, type, state.preferences?.copyStyle);
  return copy ? `<span class="point-badge">${copy}</span>` : '';
}

function taskHtml(task, type, pending, showRule = true) {
  const earned = task.completedAt ? task.reward?.points || 0 : null;
  const badge = earned !== null ? pointBadge(state.rewards[type],type,earned) : showRule ? pointBadge(state.rewards[type],type) : '';
  return `<label class="task-check"><input type="checkbox" data-task-toggle="${task.id}" data-task-type="${type}" ${task.done?'checked':''} ${pending?'disabled':''}><span>${escapeAttribute(task.label)}</span>${badge}</label>`;
}

function renderDayCard(day, index, pending) {
  const today = dayIndex() === index;
  const activeListening = Number(day.target) > 0;
  if (!activeListening && !day.tasks.length) return `<article class="learning-card rest-card ${today?'today':''}"><span class="day-badge">${day.name}: 쉬는 날 ☁️</span></article>`;
  const complete = activeListening && Number(day.count) >= Number(day.target);
  const remaining = Math.max(0, Number(day.target) - Number(day.count));
  const listeningBadge = activeListening
    ? complete
      ? pointBadge(state.rewards.listening,'listening',day.reward?.points||0)
      : pointBadge(state.rewards.listening,'listening')
    : '';
  const listeningMeta = activeListening
    ? `<div class="listening-meta"><span>${escapeAttribute(day.segment)}</span><span aria-hidden="true">·</span><span class="count">${day.count} / ${day.target}번</span>${listeningBadge}</div>`
    : '<div class="listening-meta listening-meta-empty" aria-hidden="true"></div>';
  const listeningAction = activeListening
    ? complete
      ? `<div class="listening-action"><p class="complete-copy">${escapeAttribute(day.praise || '🎉 오늘 목표 달성!')}</p></div>`
      : `<div class="listening-action"><button class="listen-button" type="button" data-play-day="${index}" ${pending||!audioUrl?'disabled':''}>오디오 듣기 · ${remaining}번 남았어요</button><div class="play-tools hidden" data-play-tools="${day.id}"><button type="button" data-rewind>↶ 3초 전</button><button type="button" data-restart>↺ 처음부터</button></div></div>`
    : '<div class="listening-action no-listening">듣기 없음</div>';
  return `<article class="learning-card ${today?'today':''}" data-card-day="${day.id}">
    <div class="card-head"><span class="day-badge">${day.name}</span></div>
    ${listeningMeta}
    ${listeningAction}
    ${day.tasks.length?`<div class="daily-tasks">${day.tasks.map(task=>taskHtml(task,'dailyTask',pending,true)).join('')}</div>`:''}
  </article>`;
}

function renderChild() {
  applyTheme(state.theme);
  const pending = rolloverPending();
  $('childTitle').textContent = state.copy.title;
  $('childIntro').textContent = state.copy.intro;
  show($('childIntro'), Boolean(state.copy.intro));
  const progress = getProgress(state);
  const childCopy = state.preferences.copyStyle === 'child';
  $('progressLabel').textContent = childCopy ? `⭐ 이번 주 ${progress.total}개 중 ${progress.done}개 했어요` : '이번 주 진행률';
  const remaining = Math.max(0, progress.total - progress.done);
  $('progressText').textContent = childCopy
    ? remaining
      ? Number(state.preferences.progressCelebrationThreshold) === 100
        ? '🎯 이번 주 모두 완료하자!'
        : `🎯 이번 주 목표 ${state.preferences.progressCelebrationThreshold}% 달성하자!`
      : '🏆 모두 끝냈어요!'
    : `${progress.done} / ${progress.total} 완료`;
  $('progressBar').max = Math.max(1, progress.total);
  $('progressBar').value = progress.done;
  const points = totalPoints(state);
  $('pointTotal').textContent = points ? `🎁 이번 주 적립 포인트 ${points}P` : '';
  const progressPercent = progress.total > 0 ? progress.done / progress.total * 100 : 0;
  const celebrationThreshold = Number(state.preferences.progressCelebrationThreshold) || 100;
  show($('celebration'), progress.total > 0 && progressPercent >= celebrationThreshold);
  $('celebrationTitle').textContent = celebrationThreshold === 100
    ? '🏆 이번 주 할 일을 모두 끝냈어요!'
    : `🎉 이번 주 목표 ${celebrationThreshold}%를 달성했어요!`;
  $('celebration').querySelector('img').classList.toggle('hidden', state.theme !== 'cloud');
  show($('rolloverNotice'), pending);
  $('rolloverNotice').innerHTML = pending ? `새 주 학습표를 준비하려면 보호자 확인이 필요해요. <button type="button" class="small-button" data-confirm-rollover>보호자 확인</button>` : '';
  showChildNotice(!audioUrl ? '오디오 연결이 필요해요. 보호자에게 알려 주세요.' : '', false);
  const weekly = `<article class="learning-card weekly"><div class="card-head"><span class="day-badge">주간 과제</span></div><div class="daily-tasks">${state.weeklyTasks.length ? state.weeklyTasks.map(task=>taskHtml(task,'weeklyTask',pending)).join('') : '<p class="segment">설정된 주간 과제가 없어요.</p>'}</div></article>`;
  $('learningGrid').innerHTML = state.days.map((day,index)=>renderDayCard(day,index,pending)).join('') + weekly;
}

function showChildNotice(message, error = false) {
  $('childAudioNotice').textContent = message;
  $('childAudioNotice').classList.toggle('error', error);
  show($('childAudioNotice'), Boolean(message));
}

function updatePlaybackButton({ percent, paused, dayId }) {
  const card = document.querySelector(`[data-card-day="${CSS.escape(dayId)}"]`);
  const button = card?.querySelector('.listen-button');
  const tools = card?.querySelector(`[data-play-tools="${CSS.escape(dayId)}"]`);
  if (!button) return;
  button.style.background = `linear-gradient(90deg,var(--accent) 0%,var(--accent) ${percent}%,var(--accent-soft) ${percent}%,var(--accent-soft) 100%)`;
  button.style.color = percent > 48 ? '#fff' : '';
  button.textContent = `${paused ? '계속 듣기' : '일시정지'} · ${Math.floor(percent)}%`;
  show(tools, true);
}

async function completeListening(run) {
  try {
    const praise = state.listeningPraiseMessages[Math.floor(Math.random() * state.listeningPraiseMessages.length)] || DEFAULT_LISTENING_PRAISE[0];
    const result = await settleActivity({ expectedEpoch: state.stateEpoch, type: 'listening', id: run.day.id, runId: run.runId, praise });
    if (result.status === 'stale') throw new Error('학습표가 바뀌었어요. 다시 시작해 주세요.');
    state = result.state || await loadState();
    $('playbackStatus').textContent = result.status === 'settled' ? '기록 완료' : '한 번 듣기 완료';
    renderChild();
  } catch (error) {
    $('playbackStatus').textContent = '기록 실패';
    showChildNotice('기록을 저장하지 못했어요. 다시 시도해 주세요.', true);
    state = await loadState();
    renderChild();
  }
}

async function toggleTask(input) {
  const type = input.dataset.taskType;
  const id = input.dataset.taskToggle;
  input.disabled = true;
  try {
    if (input.checked) {
      const result = await settleActivity({ expectedEpoch: state.stateEpoch, type, id });
      if (result.status === 'stale') throw new Error('학습표가 바뀌었어요.');
      state = result.state || await loadState();
      renderChild();
      showTaskPraise();
    } else {
      state = await setTaskUnchecked({ expectedEpoch: state.stateEpoch, type, id });
      renderChild();
    }
  } catch (error) {
    state = await loadState();
    renderChild();
    showChildNotice('과제 기록을 저장하지 못했어요. 다시 시도해 주세요.', true);
  }
}

function showTaskPraise() {
  if (!state.preferences?.taskPraiseEnabled) return;
  const messages = state.taskPraiseMessages?.length ? state.taskPraiseMessages : DEFAULT_TASK_PRAISE;
  const toast = $('taskPraiseToast');
  $('taskPraiseCard').textContent = messages[Math.floor(Math.random() * messages.length)] || DEFAULT_TASK_PRAISE[0];
  clearTimeout(taskPraiseTimer);
  show(toast, true);
  taskPraiseTimer = setTimeout(() => show(toast, false), 2000);
}

async function chooseAudio(file) {
  if (!file) return;
  const oldRecord = await loadAudio().catch(()=>null);
  const record = { blob: file, name: file.name };
  setAudioSource(record);
  state.audio = { name: file.name, saveToDevice: $('saveAudio').checked };
  try {
    if (state.audio.saveToDevice) await saveAudio(file);
    else await clearAudio();
    await saveState(state);
    renderAudioStatus();
    if (state.screen === 'child') renderChild();
  } catch (error) {
    if (oldRecord?.blob) setAudioSource(oldRecord);
    state.audio.saveToDevice = false;
    await saveState(state).catch(()=>{});
    $('audioStatus').textContent = `연결됨: ${file.name} · 기기 저장에는 실패했어요.`;
  }
}

function openDialog({ title, message, field = '', confirm = '확인', trigger = document.activeElement }) {
  dialogTrigger = trigger;
  $('dialogTitle').textContent = title;
  $('dialogMessage').textContent = message;
  $('dialogField').innerHTML = field;
  $('dialogConfirm').textContent = confirm;
  $('dialogError').textContent = '';
  show($('dialogError'), false);
  show($('dialogLayer'), true);
  setTimeout(()=>($('dialogField').querySelector('input') || $('dialogConfirm')).focus(), 0);
  return new Promise(resolve => { dialogResolver = resolve; });
}

function closeDialog(value) {
  show($('dialogLayer'), false);
  const resolve = dialogResolver;
  dialogResolver = null;
  resolve?.(value);
  dialogTrigger?.focus?.();
}

async function confirmNewWeek(trigger) {
  const okay = await openDialog({ title:'새 주를 시작할까요?', message:'설정·테마·암호는 유지하고 듣기 횟수·과제 체크·포인트·완료 문구만 초기화합니다.', confirm:'초기화하고 시작', trigger });
  if (!okay) return;
  audioController.invalidate();
  state = resetForNewWeek(state);
  await replaceState(state);
  renderCurrentScreen();
}

async function requestSetupAccess(trigger) {
  if (!state.parentPasscode) return true;
  const okay = await openDialog({ title:'설정 암호', message:'보호자 암호를 입력해 주세요.', field:'<label>암호<input id="dialogPasscode" type="password" autocomplete="current-password"></label>', confirm:'설정 열기', trigger });
  if (!okay) return false;
  if ($('dialogPasscode')?.value !== state.parentPasscode) {
    await openDialog({ title:'암호가 맞지 않아요', message:'다시 시도해 주세요.', confirm:'닫기', trigger });
    return false;
  }
  return true;
}

function renderCurrentScreen() {
  show($('boot'), false);
  show($('app'), true);
  show($('fatalView'), false);
  show($('setupView'), state.screen === 'setup');
  show($('childView'), state.screen === 'child');
  show($('backToSetup'), state.screen === 'child');
  show($('footerDivider'), state.screen === 'child');
  if (state.screen === 'setup') renderSetup();
  else renderChild();
}

function backupPayload() {
  return { app: APP_NAME, version: 2, appVersion: APP_VERSION, exportedAt: new Date().toISOString(), state };
}

function exportBackup() {
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}-${String(now.getSeconds()).padStart(2,'0')}`;
  const url = URL.createObjectURL(new Blob([JSON.stringify(backupPayload(),null,2)],{type:'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = `매일영어-설정과진도-${stamp}.json`;
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

async function importBackupFile(file) {
  if (!file) return;
  const current = state;
  try {
    const parsed = JSON.parse(await file.text());
    if (parsed?.app !== APP_NAME || parsed?.version !== 2) throw new Error('매일영어 v0.2 백업 파일이 아니에요.');
    const imported = clone(parsed.state);
    const next = validateState(imported.schemaVersion === 2 ? migrateV2(imported) : imported);
    next.stateEpoch = createId('epoch');
    next.revision = Number(next.revision || 0) + 1;
    next.screen = 'setup';
    audioController.invalidate();
    state = await replaceState(next);
    renderCurrentScreen();
    $('setupError').textContent = '백업을 불러왔어요. 오디오는 필요하면 다시 연결해 주세요.';
    show($('setupError'), true);
  } catch (error) {
    state = current;
    if (state) {
      renderCurrentScreen();
      $('setupError').textContent = `백업을 불러오지 못했어요: ${error.message}`;
      show($('setupError'), true);
    } else showFatal(error);
  }
}

function showFatal(error) {
  clearTimeout(bootTimer);
  show($('boot'), false);
  show($('app'), true);
  show($('setupView'), false);
  show($('childView'), false);
  show($('fatalView'), true);
  $('fatalMessage').textContent = `${error?.message || '예상하지 못한 오류가 발생했어요.'} 기존 v0.1 데이터는 변경하지 않았어요.`;
}

async function start() {
  $('footerVersion').textContent = `매일영어 v${APP_VERSION}`;
  try {
    bootTimer = setTimeout(()=>show($('boot'), true),150);
    state = await loadState();
    let stored = await loadAudio().catch(()=>null);
    if (!stored?.blob && state.audio.name) stored = await copyLegacyAudioIfAvailable(state.audio.name);
    if (stored?.blob) setAudioSource(stored);
    clearTimeout(bootTimer);
    renderCurrentScreen();
  } catch (error) {
    showFatal(error);
  }
}

$('dayTabs').addEventListener('click', event => {
  const button = event.target.closest('[data-day-tab]');
  if (!button) return;
  captureCurrentDay();
  selectedDay = Number(button.dataset.dayTab);
  renderDayEditor();
});

$('dayEditor').addEventListener('click', event => {
  if (event.target.id === 'addDailyTask') {
    captureCurrentDay();
    draft.days[selectedDay].tasks.push({ id:createId('daily'), label:'', done:false, completedAt:'', reward:{points:0,eligible:false,completedAt:''} });
    return renderDayEditor();
  }
  if (event.target.id === 'applyDayToAll') {
    captureCurrentDay();
    const source = draft.days[selectedDay];
    draft.days.forEach((day,index)=>{
      if (index === selectedDay) return;
      day.segment = source.segment;
      day.target = source.target;
      day.tasks = source.tasks.map(task=>({ ...clone(task), id:createId(`daily-${index}`), done:false, completedAt:'', reward:{points:0,eligible:false,completedAt:''} }));
    });
    $('setupError').textContent = `${source.name} 듣기와 과제를 다른 요일에 적용했어요.`;
    show($('setupError'), true);
  }
  const remove = event.target.closest('[data-delete-daily]');
  if (remove) {
    captureCurrentDay();
    draft.days[selectedDay].tasks = draft.days[selectedDay].tasks.filter(task=>task.id!==remove.dataset.deleteDaily);
    renderDayEditor();
  }
});

$('weeklyTaskEditor').addEventListener('click', event => {
  const remove = event.target.closest('[data-delete-weekly]');
  if (!remove) return;
  captureSetup();
  draft.weeklyTasks = draft.weeklyTasks.filter(task=>task.id!==remove.dataset.deleteWeekly);
  state = clone(draft);
  renderSetup();
});

$('addWeeklyTask').addEventListener('click', () => {
  captureSetup();
  draft.weeklyTasks.push({ id:createId('weekly'), label:'', done:false, completedAt:'', reward:{points:0,eligible:false,completedAt:''} });
  state = clone(draft);
  renderSetup();
});

$('themeEditor').addEventListener('change', event => {
  if (event.target.name === 'theme') applyTheme(event.target.value);
});

$('setupForm').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    captureSetup();
    validateDraft();
    audioController.invalidate();
    draft.stateEpoch = createId('epoch');
    draft.revision = Number(state.revision) + 1;
    draft.screen = 'child';
    state = clone(draft);
    if (!state.audio.saveToDevice) await clearAudio();
    await saveState(state);
    renderCurrentScreen();
  } catch (error) {
    $('setupError').textContent = error.message;
    show($('setupError'), true);
    $('setupError').scrollIntoView({behavior:'smooth',block:'center'});
  }
});

$('audioFile').addEventListener('change', event => chooseAudio(event.target.files[0]));
$('learningGrid').addEventListener('click', async event => {
  const play = event.target.closest('[data-play-day]');
  if (play) {
    try {
      await audioController.start(state.days[Number(play.dataset.playDay)]);
    } catch (error) {
      showChildNotice(error.message, true);
    }
    return;
  }
  if (event.target.closest('[data-rewind]')) audioController.rewind();
  if (event.target.closest('[data-restart]')) audioController.restart();
});
$('learningGrid').addEventListener('change', event => {
  if (event.target.matches('[data-task-toggle]')) toggleTask(event.target);
});
$('rolloverNotice').addEventListener('click', async event => {
  const button = event.target.closest('[data-confirm-rollover]');
  if (!button) return;
  if (await requestSetupAccess(button)) await confirmNewWeek(button);
});
$('backToSetup').addEventListener('click', async event => {
  if (!(await requestSetupAccess(event.currentTarget))) return;
  audioController.invalidate();
  state.screen = 'setup';
  await saveState(state);
  renderCurrentScreen();
});
$('newWeekButton').addEventListener('click', event => confirmNewWeek(event.currentTarget));
$('exportBackup').addEventListener('click', exportBackup);
$('importBackup').addEventListener('change', event => importBackupFile(event.target.files[0]));
$('fatalImport').addEventListener('change', event => importBackupFile(event.target.files[0]));
$('resetApp').addEventListener('click', async event => {
  const okay = await openDialog({title:'설정을 초기화할까요?',message:'v0.2 설정, 진도, 저장 오디오를 이 기기에서 삭제합니다. v0.1 데이터는 유지됩니다.',confirm:'초기화',trigger:event.currentTarget});
  if (!okay) return;
  audioController.invalidate();
  await clearV2();
  location.reload();
});
$('fatalReset').addEventListener('click', async () => { await clearV2(); location.reload(); });
$('retryApp').addEventListener('click', () => location.reload());
$('dialogCancel').addEventListener('click', () => closeDialog(false));
$('dialogConfirm').addEventListener('click', () => closeDialog(true));
$('dialogLayer').addEventListener('click', event => { if (event.target === $('dialogLayer')) closeDialog(false); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('dialogLayer').classList.contains('hidden')) closeDialog(false); });
window.addEventListener('beforeunload', () => { audioController.invalidate(); if (audioUrl) URL.revokeObjectURL(audioUrl); });
window.addEventListener('error', event => showFatal(event.error));
window.addEventListener('unhandledrejection', event => showFatal(event.reason));

start();
