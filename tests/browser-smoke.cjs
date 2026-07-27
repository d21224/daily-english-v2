const { chromium } = require('playwright');
let browser;
const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4173/v0.2/daily-english.html';

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

  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.waitForSelector('#setupView:not(.hidden)');
  await page.screenshot({ path:'/tmp/daily-english-v02-setup.png', fullPage:true });

  const setupTitle = await page.locator('#setupTitle').textContent();
  if (setupTitle !== '매일영어 설정') throw new Error(`첫 화면이 설정이 아닙니다: ${setupTitle}`);

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
  await page.locator('details.fold').first().locator('summary').click();
  await page.selectOption('[data-reward-day="weeklyTask"]', '');
  await page.fill('[data-reward-time="weeklyTask"]', '');
  await page.check('input[name="theme"][value="dark"]');
  const darkHeadingColor = await page.locator('#audioHeading').evaluate(element => getComputedStyle(element).color);
  if (darkHeadingColor !== 'rgb(237, 247, 255)') throw new Error(`다크 테마 소제목 대비가 올바르지 않습니다: ${darkHeadingColor}`);
  await page.screenshot({ path:'/tmp/daily-english-v02-dark-setup.png', fullPage:true });
  await page.click('#setupForm .primary');
  await page.waitForSelector('#childView:not(.hidden)');

  if (await page.locator('.child-header .eyebrow').count()) throw new Error('아이 화면의 영문 소제목이 남아 있습니다.');
  if (await page.locator('.today-badge').count()) throw new Error('아이 화면의 오늘 배지가 남아 있습니다.');
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
  if (!footerCopy.includes('설정 보기') || !footerCopy.includes('매일영어 v0.2.2')) throw new Error(`하단 설정 및 버전 표기가 올바르지 않습니다: ${footerCopy}`);

  const cards = await page.locator('.learning-card').count();
  if (cards !== 8) throw new Error(`학습 카드 수가 8개가 아닙니다: ${cards}`);
  const columns = await page.locator('#learningGrid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  if (columns !== 2) throw new Error(`820px 화면이 2열이 아닙니다: ${columns}`);

  await page.click('[data-play-day="0"]');
  await page.waitForTimeout(250);
  const earlyCount = await page.locator('[data-card-day="day-0"] .count').textContent();
  if (!earlyCount.includes('0 / 1')) throw new Error(`구간 종료 전에 횟수가 증가했습니다: ${earlyCount}`);
  await page.waitForSelector('[data-card-day="day-0"] .complete-copy', { timeout: 5000 });
  const completedCount = await page.locator('[data-card-day="day-0"] .count').textContent();
  if (!completedCount.includes('1 / 1')) throw new Error(`구간 종료 후 횟수가 증가하지 않았습니다: ${completedCount}`);

  const pointsBeforeTask = Number((await page.locator('#pointTotal').textContent()).match(/(\d+)P/)?.[1] || 0);
  let weeklyToggle = page.locator('[data-task-type="weeklyTask"]').first();
  await weeklyToggle.check();
  await page.waitForFunction(expected => Number(document.querySelector('#pointTotal')?.textContent.match(/(\d+)P/)?.[1] || 0) === expected, pointsBeforeTask + 500);
  weeklyToggle = page.locator('[data-task-type="weeklyTask"]').first();
  await weeklyToggle.uncheck();
  weeklyToggle = page.locator('[data-task-type="weeklyTask"]').first();
  await weeklyToggle.check();
  await page.waitForTimeout(100);
  const repeatedPoints = await page.locator('#pointTotal').textContent();
  const repeatedTotal = Number(repeatedPoints.match(/(\d+)P/)?.[1] || 0);
  if (repeatedTotal !== pointsBeforeTask + 500) throw new Error(`과제 포인트가 중복 지급됐습니다: ${repeatedPoints}`);
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
