import { expect, test } from '@playwright/test';

test('수첩과 타임라인을 거쳐도 답안을 유지하며 틀린 작업 기록을 고쳐 제출한다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/play/');

  const action = page.locator('.case-action');
  const timeline = page.getByRole('list', { name: '조사 진행도' });
  await action.getByRole('button', { name: '프린터 조사' }).click();
  await action.getByRole('button', { name: '프린터 A 밑면 보기', exact: true }).click();
  await action.getByRole('button', { name: '프린터 B 보기' }).click();
  await action.getByRole('button', { name: '프린터 B 밑면 보기', exact: true }).click();
  await action.getByRole('button', { name: '이관 기록 열기' }).click();
  await action.getByRole('button', { name: '작업일지 보기' }).click();
  await action.getByRole('button', { name: '코드표 보기' }).click();
  const clueAnimation = timeline.locator('[data-motion="success"]');
  await expect(clueAnimation.locator('[data-motion-fallback]')).toBeVisible();
  await expect(clueAnimation.locator('[data-motion-ready]')).toHaveCount(0);

  const submit = action.getByRole('button', { name: '추리 제출' });
  const place = page.getByLabel('어디에서 출력됐을까요?');
  const job = page.getByLabel('어떤 작업 기록이 근거인가요?');
  const reason = page.getByLabel('무슨 작업이었을까요?');
  const ending = page.getByRole('heading', { name: '그날의 마지막 한 권' });
  await action.getByRole('button', { name: '최종 추리하기' }).click();
  await place.selectOption('archive');
  await job.selectOption('alignment');
  await reason.selectOption('reprint');

  await page.getByRole('button', { name: '증거 수첩' }).click();
  const notebook = page.getByRole('dialog', { name: '증거 수첩' });
  await notebook.getByText('작업일지', { exact: true }).click();
  await expect(notebook.getByRole('table').getByRole('row', { name: /02:13/ })).toHaveCount(2);
  await notebook.getByRole('button', { name: '수첩 닫기' }).click();
  await expect(job).toHaveValue('alignment');

  await timeline.getByRole('button', { name: /영수증/ }).click();
  await expect(page.getByText('원거래 일시')).toBeVisible();
  await timeline.getByRole('button', { name: '추리', exact: true }).click();
  await expect(place).toHaveValue('archive');

  await timeline.getByRole('button', { name: /영수증/ }).click();
  await action.getByRole('button', { name: '사건 소개' }).click();
  await page.getByRole('button', { name: '이어서 조사' }).click();
  await expect(place).toBeVisible();
  await expect(place).toHaveValue('archive');
  await expect(job).toHaveValue('alignment');
  await expect(reason).toHaveValue('reprint');
  await expect(ending).toBeHidden();

  await submit.click();
  await expect(page.getByText(/선택한 조합이 기록과 일치하지 않아요/)).toBeVisible();
  await expect(page.getByText(/서로 다른 일을 가리켜요/)).toHaveCount(0);
  await page.getByRole('button', { name: '힌트 보기' }).click();
  await expect(page.getByText(/서로 다른 일을 가리켜요/)).toBeVisible();
  await page.getByRole('button', { name: '다음 힌트' }).click();
  await expect(page.getByText(/같은 시각의 기록이 두 줄/)).toBeVisible();
  await job.selectOption('import');
  await submit.click();
  await expect(ending).toBeVisible();
  await expect(timeline.locator('[data-completed]')).toHaveCount(4);
  const success = page.getByRole('main', { name: '추리' }).locator('[data-motion="success"]');
  await expect(success.locator('[data-motion-fallback]')).toBeVisible();
  await expect(success.locator('[data-motion-ready]')).toHaveCount(0);

  await page.getByRole('button', { name: '다시 조사' }).click();
  await expect(timeline.locator('[aria-current="step"]')).toContainText('영수증');
  await expect(timeline.getByRole('button', { name: '추리' })).toBeDisabled();
  await expect(page.getByText('원거래 일시')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '사건 소개' }).click();
  await page.getByRole('button', { name: '결말 다시 보기' }).click();
  await expect(ending).toBeVisible();
  await expect(page.locator('[data-motion="success"]')).toHaveCount(0);
});
