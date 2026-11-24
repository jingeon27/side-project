import { expect, test } from '@playwright/test';

test('같은 홈페이지에서 두 사건을 선택하고 각각의 진행을 이어서 조사한다', async ({ page }) => {
  const query = '?from=youtube-shorts&item=one&item=two#evidence';
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/' + query);

  const receiptLink = page.getByRole('link', { name: '폐점한 서점의 마지막 영수증' });
  const keyLink = page.getByRole('link', { name: '새벽 세 시에 돌아온 열쇠' });
  const library = page.getByRole('link', { name: '사건 목록', exact: true });
  const start = page.getByRole('button', { name: '조사 시작', exact: true });
  const timeline = page.getByRole('list', { name: '조사 진행도' });
  const actions = page.locator('.case-action');
  const envelope = page.getByRole('heading', { name: '열쇠가 담긴 봉투' });

  await expect(receiptLink).toBeInViewport({ ratio: 1 });
  await expect(keyLink).toBeInViewport({ ratio: 1 });
  await receiptLink.click();
  await expect(page).toHaveURL(
    (url) => url.pathname + url.search + url.hash === '/cases/last-receipt/' + query,
  );
  await start.click();
  await expect(page).toHaveURL((url) => url.pathname + url.search + url.hash === '/play/' + query);
  await expect(page.getByText('원거래 일시')).toBeVisible();
  await actions.getByRole('button', { name: '사건 소개', exact: true }).click();
  await library.click();

  await keyLink.click();
  await expect(page).toHaveURL(
    (url) => url.pathname + url.search + url.hash === '/cases/returned-key/' + query,
  );
  await expect(start).toBeInViewport({ ratio: 1 });
  await start.click();
  await expect(envelope).toBeVisible();
  await expect(timeline.getByRole('button', { name: '야간 일지 잠김' })).toBeDisabled();
  await timeline.getByRole('button', { name: /반납함/ }).click();
  await expect(
    page.getByRole('region', { name: '반납함의 표식' }).getByText('골목 반납함', { exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(envelope).toBeVisible();
  await page.goForward();
  await actions.getByRole('button', { name: '야간 일지 보기', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('table', { name: '야간 일지' })).toBeVisible();
  const openVerdict = actions.getByRole('button', { name: '추리하기', exact: true });
  await expect(openVerdict).toBeInViewport({ ratio: 1 });
  await openVerdict.click();

  const slot = page.getByRole('combobox', { name: '봉투는 어느 반납함에 들어갔을까요?' });
  const job = page.getByRole('combobox', { name: '새벽 3시에 무슨 일이 있었을까요?' });
  const submit = actions.getByRole('button', { name: '추리 제출', exact: true });
  await slot.selectOption('front');
  await job.selectOption('deposit');
  await submit.click();
  await expect(page.getByRole('status')).toContainText('색과 모양을 함께 비교');
  await timeline.getByRole('button', { name: '봉투 확인 완료' }).click();
  await expect(envelope).toBeVisible();
  await timeline.getByRole('button', { name: '추리', exact: true }).click();
  await expect(slot).toHaveValue('front');
  await expect(job).toHaveValue('deposit');
  await slot.selectOption('alley');
  await job.selectOption('collection');
  await submit.click();
  await expect(page.getByRole('heading', { name: '문은 계속 잠겨 있었어요' })).toBeVisible();

  await library.click();
  await expect(page).toHaveURL((url) => url.pathname + url.search + url.hash === '/' + query);
  await keyLink.click();
  await expect(page.getByRole('button', { name: '결말 다시 보기' })).toBeVisible();
  await library.click();
  await receiptLink.click();
  await expect(page.getByRole('button', { name: '이어서 조사' })).toBeVisible();
});
