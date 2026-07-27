const { chromium } = require('playwright');
let browser;

function silentWav(seconds = 2, sampleRate = 8000) {
  const dataSize = seconds * sampleRate * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

(async () => {
  browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  });
  const context = await browser.newContext({ viewport: { width: 820, height: 1180 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', message => {
    if (message.type() === 'error') {
      const location = message.location();
      errors.push(`${message.text()}${location.url ? ` @ ${location.url}` : ''}`);
    }
  });
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('http://127.0.0.1:4173/v0.2/daily-english.html', { waitUntil: 'networkidle' });
  await page.waitForSelector('#setupView:not(.hidden)');
  await page.screenshot({ path:'/tmp/daily-english-v02-setup.png', fullPage:true });

  const setupTitle = await page.locator('#setupTitle').textContent();
  if (setupTitle !== '매일영어 설정') throw new Error(`첫 화면이 설정이 아닙니다: ${setupTitle}`);
  if (await page.locator('[data-reward-base="dailyTask"]').inputValue() !== '100') throw new Error('일반 과제 기본 포인트가 올바르지 않습니다.');
  if (await page.locator('[data-reward-bonus="dailyTask"]').inputValue() !== '0') throw new Error('기존 포인트가 추가 포인트로 잘못 이전됐습니다.');
  if (await page.locator('[data-reward-time="dailyTask"]').isDisabled()) throw new Error('추가 포인트 입력 전에도 마감 시간을 먼저 바꿀 수 있어야 합니다.');
  if (!await page.locator('input[name="copyStyle"][value="child"]').isChecked()) throw new Error('아이 문구가 기본값이 아닙니다.');
  if (!await page.locator('#taskPraiseEnabled').isChecked()) throw new Error('과제 축하 카드가 기본 켜짐이 아닙니다.');
  if (await page.locator('#progressCelebrationThreshold').inputValue() !== '100') throw new Error('전체 진행률 축하 기본 기준이 100%가 아닙니다.');
  const preferenceAfterTheme = await page.evaluate(() => Boolean(document.querySelector('#themeEditor').compareDocumentPosition(document.querySelector('.copy-style-editor')) & Node.DOCUMENT_POSITION_FOLLOWING));
  if (!preferenceAfterTheme) throw new Error('아이 화면 표현 설정이 테마 아래에 있지 않습니다.');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('details.fold').first().locator(':scope > summary').click();
  await page.fill('[data-reward-time="dailyTask"]', '18:00');
  const setupMetrics = await page.evaluate(() => {
    const style = selector => getComputedStyle(document.querySelector(selector));
    const listeningLabels = [...document.querySelectorAll('[data-reward="listening"] .deadline-fields label')];
    const weeklyLabels = [...document.querySelectorAll('[data-reward="weeklyTask"] .deadline-fields label')];
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      titleSize: style('.setup-header h1').fontSize,
      sectionSize: style('.section-head h2').fontSize,
      detailSize: style('.fold-body h3').fontSize,
      helperSize: style('.helper').fontSize,
      inputSize: style('[data-reward-time="listening"]').fontSize,
      listeningTop: listeningLabels.map(label => label.getBoundingClientRect().top),
      weeklyTop: weeklyLabels.map(label => label.getBoundingClientRect().top),
      timeRight: document.querySelector('[data-reward-time="weeklyTask"]').getBoundingClientRect().right,
      boxRight: document.querySelector('[data-reward="weeklyTask"]').getBoundingClientRect().right
    };
  });
  if (setupMetrics.overflow > 0) throw new Error(`모바일 가로 넘침: ${setupMetrics.overflow}px`);
  if (setupMetrics.titleSize !== '30px') throw new Error(`설정 제목 크기: ${setupMetrics.titleSize}`);
  if (setupMetrics.sectionSize !== '16px') throw new Error(`섹션 제목 크기: ${setupMetrics.sectionSize}`);
  if (setupMetrics.detailSize !== '14px') throw new Error(`세부 제목 크기: ${setupMetrics.detailSize}`);
  if (setupMetrics.helperSize !== '12px') throw new Error(`도움말 크기: ${setupMetrics.helperSize}`);
  if (setupMetrics.inputSize !== '14px') throw new Error(`입력값 크기: ${setupMetrics.inputSize}`);
  if (setupMetrics.listeningTop[0] !== setupMetrics.listeningTop[1]) throw new Error('포인트와 마감시간이 같은 행이 아닙니다.');
  if (setupMetrics.weeklyTop[2] !== setupMetrics.weeklyTop[3]) throw new Error('주간 마감 요일과 시간이 같은 행이 아닙니다.');
  if (setupMetrics.timeRight > setupMetrics.boxRight) throw new Error('마감시간이 카드 밖으로 나갑니다.');
  await page.screenshot({ path:'/tmp/daily-english-v02-mobile-setup.png', fullPage:true });
  await page.setViewportSize({ width: 820, height: 1180 });

  await page.click('#addDailyTask');
  const addedDailyTask = page.locator('[data-daily-task]').first();
  if (await addedDailyTask.inputValue() !== '' || await addedDailyTask.getAttribute('placeholder') !== '과제 이름') throw new Error('매일 과제 추가 입력칸이 빈 placeholder 상태가 아닙니다.');
  await page.click('[data-delete-daily]');
  await page.click('#addWeeklyTask');
  const weeklyInputs = page.locator('[data-weekly-task]');
  const addedWeeklyTask = weeklyInputs.nth((await weeklyInputs.count()) - 1);
  if (await addedWeeklyTask.inputValue() !== '' || await addedWeeklyTask.getAttribute('placeholder') !== '과제 이름') throw new Error('주간 과제 추가 입력칸이 빈 placeholder 상태가 아닙니다.');
  await page.locator('[data-delete-weekly]').nth((await page.locator('[data-delete-weekly]').count()) - 1).click();

  await page.fill('#dayStart', '잘못된 값');
  await page.fill('#dayEnd', '0:10');
  await page.fill('#dayTarget', '1');
  await page.click('#setupForm .primary');
  await page.waitForSelector('#setupError:not(.hidden)');
  const validation = await page.locator('#setupError').textContent();
  if (!validation.includes('시간 형식')) throw new Error(`구간 오류 안내가 없습니다: ${validation}`);

  await page.setInputFiles('#audioFile', {
    name: 'test-silence.wav',
    mimeType: 'audio/wav',
    buffer: silentWav()
  });
  await page.waitForFunction(() => document.querySelector('#audioFileName')?.textContent.includes('test-silence.wav'));
  await page.fill('#dayStart', '0:00');
  await page.fill('#dayEnd', '0:01');
  await page.fill('#dayTarget', '1');
  await page.fill('[data-reward-bonus="weeklyTask"]', '200');
  await page.selectOption('[data-reward-day="weeklyTask"]', '6');
  await page.fill('[data-reward-time="weeklyTask"]', '23:59');
  await page.selectOption('#progressCelebrationThreshold', '50');
  await page.locator('details.message-fold').nth(0).locator('summary').click();
  await page.fill('#listeningPraiseMessages', '🎧 브라우저 듣기 축하');
  await page.locator('details.message-fold').nth(1).locator('summary').click();
  await page.fill('#taskPraiseMessages', '✅ 브라우저 과제 축하');
  await page.check('input[name="theme"][value="dark"]');
  const darkHeadingColor = await page.locator('#audioHeading').evaluate(element => getComputedStyle(element).color);
  if (darkHeadingColor !== 'rgb(237, 247, 255)') throw new Error(`다크 테마 소제목 대비가 올바르지 않습니다: ${darkHeadingColor}`);
  await page.screenshot({ path:'/tmp/daily-english-v02-dark-setup.png', fullPage:true });
  await page.click('#setupForm .primary');
  await page.waitForSelector('#childView:not(.hidden)');

  if (await page.locator('.child-header .eyebrow').count()) throw new Error('아이 화면의 영문 소제목이 남아 있습니다.');
  if (await page.locator('.today-badge').count()) throw new Error('아이 화면의 오늘 배지가 남아 있습니다.');
  const friendlyProgress = await page.locator('#progressLabel').textContent();
  if (!friendlyProgress.includes('이번 주 4개 중 0개 했어요')) throw new Error(`아이용 진행률 문구가 올바르지 않습니다: ${friendlyProgress}`);
  const friendlyGoal = await page.locator('#progressText').textContent();
  if (!friendlyGoal.includes('이번 주 목표 50% 달성하자!')) throw new Error(`아이용 목표 문구가 올바르지 않습니다: ${friendlyGoal}`);
  const listeningMeta = page.locator('[data-card-day="day-0"] .listening-meta');
  const listeningMetaCopy = await listeningMeta.textContent();
  if (!listeningMetaCopy.includes('0:00') || !listeningMetaCopy.includes('0 / 1번')) throw new Error(`구간과 횟수가 같은 행에 없습니다: ${listeningMetaCopy}`);
  if (await listeningMeta.locator('.point-badge').count() !== 1) throw new Error('듣기 포인트가 구간 행 오른쪽에 없습니다.');
  const cardHeadGap = await page.locator('[data-card-day="day-0"] .card-head').evaluate(element => getComputedStyle(element).marginBottom);
  if (cardHeadGap !== '10px') throw new Error(`요일과 구간 사이 간격이 시안과 다릅니다: ${cardHeadGap}`);
  const firstRestCard = page.locator('.rest-card').first();
  const restBadgeCopy = await firstRestCard.locator('.day-badge').textContent();
  if (!restBadgeCopy.includes(': 쉬는 날 ☁️')) throw new Error(`쉬는 날이 요일 배지에 표시되지 않습니다: ${restBadgeCopy}`);
  const restCardHeight = await firstRestCard.evaluate(element => element.getBoundingClientRect().height);
  if (restCardHeight > 60) throw new Error(`쉬는 날 카드가 불필요하게 큽니다: ${restCardHeight}px`);
  const footerCopy = await page.locator('#appFooter').textContent();
  if (!footerCopy.includes('설정 보기') || !footerCopy.includes('매일영어 v0.2.9')) throw new Error(`하단 설정 및 버전 표기가 올바르지 않습니다: ${footerCopy}`);

  const cards = await page.locator('.learning-card').count();
  if (cards !== 8) throw new Error(`학습 카드 수가 8개가 아닙니다: ${cards}`);
  const columns = await page.locator('#learningGrid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  if (columns !== 2) throw new Error(`820px 화면이 2열이 아닙니다: ${columns}`);

  await page.click('[data-play-day="0"]');
  await page.waitForTimeout(250);
  const earlyCount = await page.locator('[data-card-day="day-0"] .count').textContent();
  if (!earlyCount.includes('0 / 1')) throw new Error(`구간 종료 전에 횟수가 증가했습니다: ${earlyCount}`);
  await page.waitForSelector('[data-card-day="day-0"] .complete-copy', { timeout: 5000 });
  if (await page.locator('[data-card-day="day-0"] .complete-copy').textContent() !== '🎧 브라우저 듣기 축하') throw new Error('듣기 완료에 듣기 문구가 사용되지 않았습니다.');
  const completedCount = await page.locator('[data-card-day="day-0"] .count').textContent();
  if (!completedCount.includes('1 / 1')) throw new Error(`구간 종료 후 횟수가 증가하지 않았습니다: ${completedCount}`);

  const pointsBeforeTask = Number((await page.locator('#pointTotal').textContent()).match(/(\d+)P/)?.[1] || 0);
  let weeklyToggle = page.locator('[data-task-type="weeklyTask"]').first();
  await weeklyToggle.check();
  await page.waitForFunction(expected => Number(document.querySelector('#pointTotal')?.textContent.match(/(\d+)P/)?.[1] || 0) === expected, pointsBeforeTask + 700);
  weeklyToggle = page.locator('[data-task-type="weeklyTask"]').first();
  await weeklyToggle.uncheck();
  weeklyToggle = page.locator('[data-task-type="weeklyTask"]').first();
  await weeklyToggle.check();
  await page.waitForSelector('#taskPraiseToast:not(.hidden)');
  if (await page.locator('#taskPraiseCard').textContent() !== '✅ 브라우저 과제 축하') throw new Error('일반 과제 완료에 과제 문구가 사용되지 않았습니다.');
  const toastPosition = await page.locator('#taskPraiseToast').evaluate(element => getComputedStyle(element).position);
  if (toastPosition !== 'fixed') throw new Error(`축하 카드가 화면 중앙 오버레이가 아닙니다: ${toastPosition}`);
  const completedWeeklyBadge = await weeklyToggle.locator('xpath=..').locator('.point-badge').textContent();
  if (completedWeeklyBadge.startsWith('+')) throw new Error(`완료 포인트 합계에 +가 남아 있습니다: ${completedWeeklyBadge}`);
  await page.waitForSelector('#celebration:not(.hidden)');
  const celebrationTitle = await page.locator('#celebrationTitle').textContent();
  if (!celebrationTitle.includes('50%')) throw new Error(`설정한 전체 축하 기준 문구가 아닙니다: ${celebrationTitle}`);
  if (!await page.locator('#celebration img').evaluate(element => element.classList.contains('hidden'))) throw new Error('다크 테마에서 캐릭터가 표시됩니다.');
  await page.waitForTimeout(100);
  const repeatedPoints = await page.locator('#pointTotal').textContent();
  const repeatedTotal = Number(repeatedPoints.match(/(\d+)P/)?.[1] || 0);
  if (repeatedTotal !== pointsBeforeTask + 700) throw new Error(`과제 포인트가 중복 지급됐습니다: ${repeatedPoints}`);
  await page.screenshot({ path:'/tmp/daily-english-v02-child.png', fullPage:true });

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#childView:not(.hidden)');
  const savedTitle = await page.locator('#childTitle').textContent();
  if (savedTitle !== '매일영어🤍') throw new Error(`새로고침 저장에 실패했습니다: ${savedTitle}`);

  await page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('dailyEnglishV2');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = database.transaction('state', 'readwrite');
      const store = transaction.objectStore('state');
      const request = store.get('current');
      request.onsuccess = () => {
        const current = request.result;
        current.days[0].tasks = [{ id:'browser-listening-task', label:'단어 읽기', done:false, completedAt:'', reward:{points:0,eligible:false,completedAt:''} }];
        current.days[1].target = 0;
        current.days[1].segment = '';
        current.days[1].tasks = [{ id:'browser-task-only', label:'단어 읽기', done:false, completedAt:'', reward:{points:0,eligible:false,completedAt:''} }];
        store.put(current, 'current');
      };
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });
  await page.reload({ waitUntil:'networkidle' });
  await page.waitForSelector('#childView:not(.hidden)');
  const taskOnlyCard = page.locator('[data-card-day="day-1"]');
  if (await taskOnlyCard.getByText('듣기 없음', { exact:true }).count() !== 1) throw new Error('듣기 없는 카드에 상태가 정확히 한 번 표시되지 않습니다.');
  const futureTaskPoint = await taskOnlyCard.locator('.task-check .point-badge').textContent();
  if (!futureTaskPoint.includes('100P')) throw new Error(`오늘이 아닌 요일의 일반 과제 포인트가 표시되지 않습니다: ${futureTaskPoint}`);
  const listeningTaskTop = await page.locator('[data-card-day="day-0"] .daily-tasks').evaluate(element => element.offsetTop);
  const taskOnlyTaskTop = await taskOnlyCard.locator('.daily-tasks').evaluate(element => element.offsetTop);
  if (listeningTaskTop !== taskOnlyTaskTop) throw new Error(`듣기 유무에 따라 과제 시작선이 다릅니다: ${listeningTaskTop}, ${taskOnlyTaskTop}`);
  const cardPadding = await taskOnlyCard.evaluate(element => getComputedStyle(element).paddingTop);
  if (cardPadding !== '14px') throw new Error(`카드 내부 여백이 복원되지 않았습니다: ${cardPadding}`);
  const taskRowHeight = await taskOnlyCard.locator('.task-check').evaluate(element => getComputedStyle(element).minHeight);
  if (taskRowHeight !== '32px') throw new Error(`과제 행 높이가 32px이 아닙니다: ${taskRowHeight}`);
  const taskCheckboxHeight = await taskOnlyCard.locator('.task-check input').evaluate(element => element.getBoundingClientRect().height);
  if (taskCheckboxHeight !== 22) throw new Error(`체크박스가 과제 행을 밀어내고 있습니다: ${taskCheckboxHeight}px`);
  await page.screenshot({ path:'/tmp/daily-english-v02-child-aligned.png', fullPage:true });

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileColumns = await page.locator('#learningGrid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  if (mobileColumns !== 1) throw new Error(`390px 화면이 1열이 아닙니다: ${mobileColumns}`);
  await page.click('#backToSetup');
  await page.waitForSelector('#setupView:not(.hidden)');
  if (await page.locator('#progressCelebrationThreshold').inputValue() !== '50') throw new Error('전체 축하 기준이 저장되지 않았습니다.');
  if (await page.locator('[data-reward-time="dailyTask"]').inputValue() !== '18:00') throw new Error('추가 포인트 입력 전에 바꾼 마감 시간이 저장되지 않았습니다.');
  if (await page.locator('[data-reward-time="weeklyTask"]').inputValue() !== '23:59') throw new Error('주간 과제 마감 시간이 저장되지 않았습니다.');
  await page.locator('details.fold').first().locator(':scope > summary').click();
  await page.locator('label.preference-card:has(input[name="copyStyle"][value="simple"])').click();
  await page.uncheck('#taskPraiseEnabled');
  await page.click('#setupForm .primary');
  await page.waitForSelector('#childView:not(.hidden)');
  if (await page.locator('#progressLabel').textContent() !== '이번 주 진행률') throw new Error('간단 문구로 전환되지 않았습니다.');
  await page.locator('[data-task-type="weeklyTask"]').nth(1).check();
  await page.waitForTimeout(150);
  if (!await page.locator('#taskPraiseToast').evaluate(element => element.classList.contains('hidden'))) throw new Error('과제 축하 카드 끄기가 적용되지 않았습니다.');
  await page.reload({ waitUntil:'networkidle' });
  await page.waitForSelector('#childView:not(.hidden)');
  if (await page.locator('#progressLabel').textContent() !== '이번 주 진행률') throw new Error('문구 스타일이 새로고침 후 유지되지 않았습니다.');
  const footerSetupTransition = 'passed';

  if (errors.length) throw new Error(`브라우저 오류: ${errors.join(' | ')}`);
  console.log(JSON.stringify({
    firstScreen: 'setup',
    validation: 'shown',
    childTransition: 'passed',
    persistence: 'passed',
    cards,
    tabletColumns: columns,
    mobileColumns,
    audioCompletion: 'only-after-end',
    taskReward: 'exactly-once',
    darkHeadingContrast: 'passed',
    compactChildCopy: 'passed',
    cardHeadGap,
    restCardHeight,
    alignedTaskOnlyCard: 'passed',
    cardPadding,
    taskRowHeight,
    taskCheckboxHeight,
    footerSetupTransition,
    footerVersion: footerCopy,
    consoleErrors: errors.length
  }, null, 2));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await browser?.close();
});
