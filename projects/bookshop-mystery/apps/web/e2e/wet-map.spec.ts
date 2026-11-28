import { expect, test } from '@playwright/test';

test('쇼츠 주소에서 지도 사건에 들어가 단서를 비교하고 오답 뒤 추리를 완료한다', async ({ page }) => {
  const address = '/cases/wet-map/?from=youtube-shorts&item=one&item=two#evidence';
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(address);
  await expect(page).toHaveTitle('비가 그친 뒤 사라진 표찰');
  const start = page.getByRole('button', { name: '조사 시작', exact: true });
  await expect(start).toBeInViewport({ ratio: 1 });
  await start.click();

  const timeline = page.getByRole('list', { name: '조사 진행도' });
  const action = page.locator('.case-action');
  await expect(page.getByRole('heading', { name: '젖은 지도' })).toBeVisible();
  await expect(timeline.getByRole('button', { name: '추리 잠김' })).toBeDisabled();
  await expect(action.getByRole('button', { name: '표찰 비교' })).toBeInViewport({ ratio: 1 });
  await timeline.getByRole('button', { name: '일지', exact: true }).click();
  await expect(page.getByRole('table', { name: '선착장 작업 일지' })).toContainText('21:18');
  await action.getByRole('button', { name: '표찰 비교' }).click();
  await expect(page.getByRole('heading', { name: '안내대의 표찰 세 개' })).toBeVisible();
  await page.getByText('치수와 홈 위치 읽기').click();
  await expect(page.getByText(/보관함 표찰 · 11 × 7cm/)).toBeVisible();
  await timeline.getByRole('button', { name: '추리', exact: true }).click();

  const plate = page.getByRole('combobox', { name: '지도 위에 있었던 표찰' });
  const time = page.getByRole('combobox', { name: '표찰을 치운 시각' });
  const submit = action.getByRole('button', { name: '추리 제출' });
  await plate.selectOption('direction');
  await time.selectOption('21:12');
  await submit.click();
  await expect(page.getByRole('status')).toContainText('다시 젖지 않을 시각');
  await timeline.getByRole('button', { name: '일지 확인 완료' }).click();
  await timeline.getByRole('button', { name: '추리', exact: true }).click();
  await expect(plate).toHaveValue('direction');
  await time.selectOption('21:19');
  await submit.click();
  await expect(page.getByRole('heading', { name: '마른 자국이 남긴 시각' })).toBeVisible();
  await expect(page).toHaveURL((url) => url.pathname + url.search + url.hash === address);

  await action.getByRole('button', { name: '사건 소개' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: '결말 다시 보기' })).toBeVisible();
});
