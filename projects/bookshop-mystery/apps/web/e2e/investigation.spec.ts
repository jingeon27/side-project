import { expect, test, type Page } from '@playwright/test';

async function expectStepInView(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const body = document.querySelector('.case-app main');
        const buttons = [...document.querySelectorAll('.case-action button')];
        const first = buttons[0]?.getBoundingClientRect();
        if (!body || !first) return false;
        return (
          body.scrollHeight <= body.clientHeight + 1 &&
          buttons.every((button) => {
            const box = button.getBoundingClientRect();
            return (
              box.bottom <= window.innerHeight &&
              box.height >= 44 &&
              box.height === first.height &&
              box.top === first.top &&
              button.scrollWidth <= button.clientWidth
            );
          }) &&
          document.documentElement.scrollWidth <= window.innerWidth
        );
      }),
    )
    .toBe(true);
}

async function expectSceneFillsBody(page: Page) {
  await expect
    .poll(() =>
      page.locator('.case-body').evaluate((body) => {
        const scene = body.querySelector('.scene-frame');
        const evidence = body.querySelector('.step-content');
        if (!scene || !evidence) return false;
        const sceneBox = scene.getBoundingClientRect();
        const bodyBottom =
          body.getBoundingClientRect().bottom - parseFloat(getComputedStyle(body).paddingBottom);
        return (
          sceneBox.top >= evidence.getBoundingClientRect().bottom &&
          Math.abs(sceneBox.bottom - bodyBottom) <= 1
        );
      }),
    )
    .toBe(true);
}

test('작은 화면에서 사건을 시작하고 타임라인으로 열린 단계에 이동할 수 있다', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.clock.install();
  const analyticsRequests: string[] = [];
  page.on('request', (request) => {
    const hostname = new URL(request.url()).hostname;
    if (hostname.endsWith('.amplitude.com')) analyticsRequests.push(hostname);
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '폐점한 서점의 마지막 영수증' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '사건 개요' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.stage')).toHaveCount(0);
  const start = page.getByRole('button', { name: '조사 시작' });
  await expect(start).toBeInViewport({ ratio: 1 });
  await start.click();
  await expect(page).toHaveURL(/\/play\/$/);

  const action = page.locator('.case-action');
  const timeline = page.getByRole('list', { name: '조사 진행도' });
  const currentStep = timeline.locator('[aria-current="step"]');
  const recordStep = timeline.getByRole('button', { name: '이관 기록', exact: true });
  await expect(page.getByRole('banner')).toHaveCount(0);
  await expect(timeline).toHaveAttribute('data-slot', 'timeline');
  await expect(timeline).toHaveAttribute('data-orientation', 'horizontal');
  await expect(timeline.getByRole('button')).toHaveCount(4);
  await expect(timeline.getByRole('button', { name: '이관 기록' })).toBeDisabled();
  await expect(timeline.getByRole('button', { name: '추리' })).toBeDisabled();
  await expect(page.getByText('원거래 일시')).toBeVisible();
  await expect(currentStep).toContainText('영수증');
  await expect(currentStep).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const firstMarker = await timeline.locator('[data-slot="timeline-indicator"]').first().boundingBox();
  const firstConnector = await timeline.locator('[data-slot="timeline-separator"]').first().boundingBox();
  const secondMarker = await timeline.locator('[data-slot="timeline-indicator"]').nth(1).boundingBox();
  expect(firstMarker && firstConnector && secondMarker).toBeTruthy();
  if (firstMarker && firstConnector && secondMarker) {
    expect(firstConnector.x).toBeGreaterThan(firstMarker.x + firstMarker.width);
    expect(firstConnector.x + firstConnector.width).toBeLessThan(secondMarker.x);
    expect(
      Math.abs(firstConnector.y + firstConnector.height / 2 - firstMarker.y - firstMarker.height / 2),
    ).toBeLessThan(1);
  }
  const connectors = timeline.locator('[data-slot="timeline-separator"]');
  await expect(connectors.nth(0)).toHaveCSS('border-top-style', 'solid');
  await expect(connectors.nth(1)).toHaveCSS('border-top-style', 'dashed');
  await expectStepInView(page);
  await expectSceneFillsBody(page);

  const notebook = page.getByRole('button', { name: '증거 수첩' });
  const dialog = page.getByRole('dialog', { name: '증거 수첩' });
  await notebook.click();
  await expect(dialog.getByText('이관 대장')).toHaveCount(0);
  await expect(dialog.getByText('프린터 기기 번호')).toHaveCount(0);
  await dialog.getByText('거래 영수증', { exact: true }).click();
  await expect(dialog.getByText('원거래 일시')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(notebook).toBeFocused();

  await timeline.getByRole('button', { name: '프린터', exact: true }).press('Enter');
  await expect(currentStep).toContainText('프린터');
  await action.getByRole('button', { name: '프린터 A 밑면 보기', exact: true }).click();
  await expect(timeline.getByRole('button', { name: /이관 기록/ })).toBeDisabled();
  await action.getByRole('button', { name: '프린터 B 보기' }).click();
  await action.getByRole('button', { name: '프린터 B 밑면 보기', exact: true }).click();
  await expect(page.getByRole('button', { name: '프린터 A MX-41' })).toBeVisible();
  await expect(page.getByRole('button', { name: '프린터 B RD-07' })).toBeVisible();
  const scene = page.locator('.stage');
  const toolbar = page.getByRole('group', { name: '프린터 조작', exact: true });
  const topFace = toolbar.getByRole('button', { name: '윗면 보기', exact: true });
  const bottomFace = toolbar.getByRole('button', { name: '밑면 보기', exact: true });
  await expect(scene).toHaveAttribute('data-renderer', /webgl|unity|photo/);
  if ((await scene.getAttribute('data-renderer')) !== 'photo') {
    for (const label of ['왼쪽 회전', '오른쪽 회전']) {
      const rotate = toolbar.getByRole('button', { name: label, exact: true });
      await expect(rotate).toHaveText(label);
      await expect(rotate).toBeInViewport({ ratio: 1 });
    }
  }
  await expect(topFace).toBeInViewport({ ratio: 1 });
  await expect(topFace).toHaveText('윗면 보기');
  const stage = await scene.boundingBox();
  const controls = await toolbar.boundingBox();
  expect(stage && controls && stage.y + stage.height <= controls.y).toBeTruthy();
  expect(
    await toolbar.evaluate((element) => {
      const bar = element.getBoundingClientRect();
      return [...element.querySelectorAll('button')].every((button) => {
        const bounds = button.getBoundingClientRect();
        return bounds.width >= 44 && bounds.height >= 44 && bounds.right <= bar.right;
      });
    }),
  ).toBe(true);
  await topFace.click();
  await expect(bottomFace).toBeInViewport({ ratio: 1 });
  await bottomFace.click();
  await expect(topFace).toBeVisible();
  await expect(connectors.nth(1)).toHaveCSS('border-top-style', 'solid');
  await expect(currentStep.locator('[data-motion="success"] [data-motion-ready] svg')).toBeVisible();
  await expect(recordStep).toHaveAccessibleDescription('다음 단계');
  await expect(recordStep.getByText('다음', { exact: true })).toBeVisible();
  await expect(recordStep).toBeInViewport({ ratio: 1 });

  await page.clock.fastForward(4000);
  await expect(currentStep).toContainText('프린터');
  await expect(page.getByRole('heading', { name: '프린터 두 대' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '이관 대장' })).toHaveCount(0);
  await expectStepInView(page);
  await expectSceneFillsBody(page);

  await recordStep.click();
  await expect(currentStep).toContainText('이관 기록');
  await expect(recordStep.getByText('다음', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: '이관 대장' })).toHaveAttribute('aria-selected', 'true');
  await expect(timeline.getByRole('button', { name: '추리' })).toBeDisabled();
  await expect(page.getByText('1/3 확인')).toBeVisible();
  await expectStepInView(page);

  await action.getByRole('button', { name: '작업일지 보기' }).click();
  await expect(page.getByRole('table').getByRole('row', { name: /02:13/ })).toHaveCount(2);
  await expect(page.getByText('2/3 확인')).toBeVisible();
  await expect(timeline.getByRole('button', { name: '추리' })).toBeDisabled();
  await expectStepInView(page);
  await page.getByRole('tab', { name: '코드표' }).click();
  await expect(page.getByText('3/3 확인')).toBeVisible();
  await expectStepInView(page);

  await timeline.getByRole('button', { name: '추리', exact: true }).click();
  await expect(currentStep).toContainText('추리');
  await expect(page.getByLabel('무슨 작업이었을까요?')).toBeVisible();
  await expectStepInView(page);
  await page.reload();
  await expect(currentStep).toContainText('추리');
  await expect(timeline.locator('[data-motion="success"]')).toHaveCount(0);
  expect(analyticsRequests).toHaveLength(0);
});

test('사건 소개와 조사 주소를 오가며 저장된 단서와 유입 링크를 보존한다', async ({ page }) => {
  const query = '?from=youtube-shorts&item=one&item=two#evidence';
  await page.goto('/' + query);
  await page.getByRole('button', { name: '조사 시작' }).click();
  await expect(page).toHaveURL((url) => url.pathname + url.search + url.hash === '/play/' + query);

  const action = page.locator('.case-action');
  await action.getByRole('button', { name: '프린터 조사' }).click();
  await action.getByRole('button', { name: '프린터 A 밑면 보기', exact: true }).click();
  await page.reload();
  await expect(action.getByRole('button', { name: '프린터 B 밑면 보기', exact: true })).toBeVisible();

  await page.goBack();
  await expect(page.getByText('원거래 일시')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('button', { name: '이어서 조사' })).toBeVisible();
  await expect(page).toHaveURL((url) => url.pathname + url.search + url.hash === '/' + query);
  await page.goForward();
  await expect(action.getByRole('button', { name: '사건 소개', exact: true })).toBeVisible();

  const resumed = await page.context().newPage();
  await resumed.goto(new URL('/play/' + query, page.url()).href);
  await expect(resumed.getByRole('button', { name: '프린터 B 밑면 보기', exact: true })).toBeVisible();
  await resumed.getByRole('button', { name: '영수증 보기', exact: true }).click();
  await resumed.getByRole('button', { name: '사건 소개', exact: true }).click();
  await expect(resumed).toHaveURL((url) => url.pathname + url.search + url.hash === '/' + query);
  await resumed.getByRole('button', { name: '이어서 조사', exact: true }).click();
  await expect(resumed.getByRole('button', { name: '프린터 A MX-41' })).toBeVisible();
  await resumed.close();
});

test('이전 버전 중간 진행은 새 문서부터 이어서 조사한다', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'dawn-archive:last-receipt:v1',
      JSON.stringify({
        clues: ['receipt', 'printers', 'record'],
        solved: false,
        followed: true,
        viewedBottoms: ['printer-a', 'printer-b'],
      }),
    );
  });
  await page.goto('/');
  await page.getByRole('button', { name: '이어서 조사' }).click();
  await expect(page.getByRole('tab', { name: '작업일지' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('2/3 확인')).toBeVisible();
  await expect(
    page.getByRole('list', { name: '조사 진행도' }).getByRole('button', { name: '추리' }),
  ).toBeDisabled();
});
