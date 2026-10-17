import { test, expect } from '@playwright/test';
const origin = 'http://127.0.0.1:3301';

test('the feed combines general posts and paid coaching and connects a student to the coach', async ({
  page,
}) => {
  const suffix = Date.now().toString(36);
  await page.request.post('/api/auth/test-login', {
    headers: { Origin: origin },
    data: { accountId: 'sample-user-3' },
  });
  await page.goto('/ko');
  await expect(page.getByRole('heading', { name: '피드', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '글쓰기', exact: true }).click();
  const editor = page.getByRole('form', { name: '글쓰기', exact: true });
  await editor.getByLabel('분류', { exact: true }).selectOption('COACHING');
  await editor.getByLabel('시간당 수강료 (원)', { exact: true }).fill('0');
  await editor.getByLabel('분류', { exact: true }).selectOption('FREE');
  const generalTitle = `자유롭게 나누는 게임 이야기 ${suffix}`;
  await editor.getByLabel('제목', { exact: true }).fill(generalTitle);
  await editor
    .getByRole('textbox', { name: '내용', exact: true })
    .fill('오늘의 게임 이야기를 다른 플레이어와 자유롭게 나누고 싶어요.');
  await editor.getByRole('button', { name: '게시글 등록', exact: true }).click();
  await expect(page.getByRole('heading', { name: generalTitle })).toBeVisible();
  await page.goto('/ko');
  await page.getByRole('button', { name: '글쓰기', exact: true }).click();
  await editor.getByLabel('분류', { exact: true }).selectOption('COACHING');
  await editor.getByLabel('모집 유형').selectOption('COACH');
  await editor.getByLabel('시간당 수강료 (원)', { exact: true }).fill('35000');
  const coachingTitle = `수비 타이밍 유료 레슨 ${suffix}`;
  await editor.getByLabel('제목', { exact: true }).fill(coachingTitle);
  await editor
    .getByRole('textbox', { name: '내용', exact: true })
    .fill('수비 타이밍을 함께 연습할 수강생을 모집해요. 레슨은 음성으로 한 시간 진행합니다.');
  await editor.getByRole('button', { name: '코칭 등록', exact: true }).click();
  await expect(page.getByRole('heading', { name: coachingTitle })).toBeVisible();
  await expect(page.locator('.detail-card .coaching-summary')).toContainText('수강생 모집');
  await expect(page.locator('.detail-card .coaching-summary')).toContainText('35,000');
  const detailUrl = page.url();
  await page.reload();
  await expect(page.locator('.coaching-summary:visible')).toContainText('35,000');
  await page.goto(`/ko?q=${suffix}`);
  await expect(page.locator('.post-card:visible')).toHaveCount(2);
  await expect(page.locator('.post-list:visible')).toContainText(generalTitle);
  await expect(page.locator('.post-list:visible')).toContainText(coachingTitle);
  await page.getByRole('button', { name: '답변 대기' }).click();
  await expect(page.locator('.post-card:visible')).toHaveCount(0);
  await page.request.post('/api/auth/test-login', {
    headers: { Origin: origin },
    data: { accountId: 'sample-user-0' },
  });
  await page.goto(detailUrl);
  await page.getByRole('button', { name: /코칭 상담/ }).click();
  await expect(page).toHaveURL(/\/messages\//);
  const message = `레슨 시간 상담 부탁드려요 ${suffix}`;
  await page.getByRole('textbox', { name: '메시지 내용' }).fill(message);
  await page.getByRole('button', { name: '보내기', exact: true }).click();
  await expect(page.getByRole('log').getByText(message, { exact: true })).toBeVisible();
});

test('students can recruit a paid coach and a new game receives the same five boards', async ({ page }) => {
  const suffix = Date.now().toString(36);
  await page.request.post('/api/auth/test-login', {
    headers: { Origin: origin },
    data: { accountId: 'sample-test-admin' },
  });
  const slug = `test-game-${suffix}`;
  const gameName = `새 게임 ${suffix}`;
  expect(
    (
      await page.request.post('/api/admin/categories', {
        headers: { Origin: origin },
        data: { slug, name: gameName },
      })
    ).ok(),
  ).toBe(true);
  await page.request.post('/api/auth/test-login', {
    headers: { Origin: origin },
    data: { accountId: 'sample-user-0' },
  });
  await page.goto(`/ko/boards/coaching?game=${slug}`);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    `https://feedback.example/ko/boards/coaching?game=${slug}`,
  );
  const sidebar = page.locator('.left-sidebar nav').filter({ hasText: gameName });
  await expect(sidebar.locator('.game-submenu a')).toHaveText([
    '피드백',
    '친추판매',
    '친선전 모집',
    '게임코치',
    '자유게시판',
  ]);
  await page.getByRole('button', { name: '코칭 등록', exact: true }).click();
  const editor = page.getByRole('form', { name: '글쓰기', exact: true });
  await expect(editor.getByRole('textbox', { name: '선택한 게임', exact: true })).toHaveValue(gameName);
  const classification = editor.getByRole('combobox', { name: '분류', exact: true });
  await expect(classification).toHaveValue('COACHING');
  await classification.selectOption('FRIEND_SALE');
  await editor.getByLabel('판매 금액 (원)', { exact: true }).fill('12000');
  await classification.selectOption('COACHING');
  await expect(editor.getByLabel('판매 금액 (원)', { exact: true })).toHaveCount(0);
  await expect(editor.getByText('내 게임 프로필', { exact: true })).toHaveCount(0);
  await editor.getByLabel('모집 유형').selectOption('STUDENT');
  const title = `운영을 가르쳐줄 코치 구해요 ${suffix}`;
  await editor.getByLabel('제목', { exact: true }).fill(title);
  await editor
    .getByRole('textbox', { name: '내용', exact: true })
    .fill('기본적인 운영부터 차근차근 배우고 싶어요. 유료 레슨의 일정과 수강료를 채팅으로 협의해요.');
  await editor.getByRole('button', { name: '코칭 등록', exact: true }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.locator('.coaching-summary:visible')).toContainText('코치 구함');
  await expect(page.locator('.coaching-summary:visible')).toContainText('수강료 협의');
  await expect(page).toHaveURL(new RegExp(`board=coaching&game=${slug}$`));
  await page.locator('.back-link').click();
  await expect(page).toHaveURL(new RegExp(`/ko/boards/coaching\\?game=${slug}$`));
  await expect(page.locator('.board-post-list')).toContainText(title);
  await page.goto(`/ko/boards/coaching?q=${suffix}`);
  await expect(page.locator('.post-card:visible')).toHaveCount(0);
  await page.goto(`/ko?q=${suffix}`);
  await expect(page.locator('.post-card:visible')).toContainText(title);
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/ko/boards/coaching?game=${slug}`);
    await expect(page.locator('.post-card:visible')).toContainText(title);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `/tmp/game-feedback-coaching-${width}.png`, fullPage: true });
  }
});
