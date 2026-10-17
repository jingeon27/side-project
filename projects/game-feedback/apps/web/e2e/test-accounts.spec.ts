import { test, expect, type Page } from '@playwright/test';
import type { Session, ChatMessage } from '@game-feedback/contracts';

async function selectTestAccount(page: Page, nickname: string) {
  const response = page.waitForResponse(
    (item) => new URL(item.url()).pathname === '/api/auth/test-login' && item.request().method() === 'POST',
  );
  await page.getByRole('button', { name: new RegExp(nickname) }).click();
  const login = await response;
  expect(login.ok(), await login.text()).toBeTruthy();
  return (await login.json()) as Session;
}

test('prepared accounts can write posts and comments, switch identities, and exchange private chat', async ({
  page,
}) => {
  const suffix = Date.now().toString(36);
  await page.goto('/ko');
  await page.getByRole('button', { name: '로그인 / 시작하기', exact: true }).click();
  const player = await selectTestAccount(page, '새벽의호그');
  expect(player.user).toMatchObject({
    id: 'sample-user-0',
    isTestAccount: true,
    isVerified: false,
    supercellTag: '#2PP',
  });
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: '글쓰기', exact: true }).click();
  const composer = page.getByRole('dialog');
  const title = `테스트 계정으로 작성한 게시글 ${suffix}`;
  await composer.getByLabel('제목', { exact: true }).fill(title);
  await composer
    .getByRole('textbox', { name: /플레이와 고민/ })
    .fill(
      '준비된 테스트 계정으로 게시글과 댓글, 채팅이 모두 저장되는지 확인하고 있어요. 호그 순환 덱 수비를 함께 이야기해 주세요.',
    );
  const creation = page.waitForResponse(
    (item) => new URL(item.url()).pathname === '/api/posts' && item.request().method() === 'POST',
  );
  await composer.getByRole('button', { name: '피드백 요청 올리기', exact: true }).click();
  const post = await (await creation).json();
  expect(post.author).toMatchObject({
    id: player.user?.id,
    isVerified: false,
    supercellTag: '#2PP',
    isTestAccount: true,
  });
  expect(post.gameProfile).toBeNull();
  await expect(page).toHaveURL(/\/ko\/posts\/[^/?]+$/);
  const postUrl = page.url();
  const comment = `준비된 계정으로 직접 남긴 댓글입니다. ${suffix}`;
  await page.getByRole('textbox', { name: '댓글 내용' }).fill(comment);
  await page.getByRole('button', { name: '댓글 등록', exact: true }).click();
  await expect(page.getByText(comment, { exact: true })).toBeVisible();
  await page.goto('/ko/settings');
  const coach = await selectTestAccount(page, '덱연구소');
  expect(coach.user).toMatchObject({
    id: 'sample-user-3',
    isTestAccount: true,
    isVerified: true,
    supercellTag: '#9QY',
  });
  await expect(page.locator('.settings-profile')).toContainText('인증 유저 (테스트)');
  await expect(page.locator('.settings-profile')).toContainText('#9QY');
  await page.goto(postUrl);
  const responseComment = `인증 코치 테스트 계정에서 이어서 남긴 댓글입니다. ${suffix}`;
  await page.getByRole('textbox', { name: '댓글 내용' }).fill(responseComment);
  await page.getByRole('button', { name: '댓글 등록', exact: true }).click();
  await expect(page.getByText(responseComment, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '새벽의호그님과 채팅하기', exact: true }).first().click();
  await expect(page).toHaveURL(/\/ko\/messages\/[^/?]+$/);
  const roomId = new URL(page.url()).pathname.split('/').at(-1);
  const chatBody = `테스트 계정 전환 후 보낸 1:1 메시지입니다. ${suffix}`;
  await page.getByRole('textbox', { name: '메시지 내용' }).fill(chatBody);
  const delivery = page.waitForResponse(
    (item) =>
      /\/api\/conversations\/[^/]+\/messages$/.test(new URL(item.url()).pathname) &&
      item.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '보내기', exact: true }).click();
  const sent = (await (await delivery).json()) as ChatMessage;
  await page.goto('/ko/settings');
  await selectTestAccount(page, '새벽의호그');
  await expect(page.locator('.settings-profile')).not.toContainText('인증 유저 (테스트)');
  await page.goto(`/ko/messages?conversation=${roomId}`);
  await expect(page.getByTestId(`message-${sent.id}`)).toContainText(chatBody);
  await page.reload();
  await expect(page.getByTestId(`message-${sent.id}`)).toContainText(chatBody);
  const detail = await (await page.request.get(`/api/posts/${post.id}`)).json();
  expect(detail.comments.some((item: { body: string }) => item.body === comment)).toBeTruthy();
  expect(
    detail.comments.some(
      (item: { body: string; author: { id: string; isVerified: boolean } }) =>
        item.body === responseComment && item.author.id === coach.user?.id && item.author.isVerified,
    ),
  ).toBeTruthy();
  await page.goto('/ko/settings');
  await selectTestAccount(page, '운영테스터');
  await page.goto(`/ko/messages?conversation=${roomId}`);
  await expect(page.getByRole('alert', { name: '대화창 오류' })).toBeVisible();
  await expect(page.getByText(chatBody, { exact: true })).not.toBeVisible();
});

test('a registered Supercell tag is saved on the user and survives account switching and reload', async ({
  page,
}) => {
  await page.goto('/ko');
  await page.getByRole('button', { name: '로그인 / 시작하기', exact: true }).click();
  await selectTestAccount(page, '새벽의호그');
  await page.goto('/ko/settings');
  await page.getByRole('button', { name: '계정 등록', exact: true }).click();
  await page.getByRole('textbox', { name: /플레이어 태그/ }).fill('p0lyq');
  await page.getByRole('button', { name: '조회', exact: true }).click();
  await page.getByRole('button', { name: '내 계정에 등록', exact: true }).click();
  await expect(page.locator('.settings-profile')).toContainText('#P0LYQ');
  await selectTestAccount(page, '덱연구소');
  await selectTestAccount(page, '새벽의호그');
  await page.reload();
  await expect(page.locator('.settings-profile')).toContainText('#P0LYQ');
  const session = (await (await page.request.get('/api/session')).json()) as Session;
  expect(session.user).toMatchObject({
    id: 'sample-user-0',
    supercellTag: '#P0LYQ',
    isVerified: false,
    isTestAccount: true,
  });
  const accounts = await (await page.request.get('/api/me/game-accounts')).json();
  expect(
    accounts.some(
      (item: { playerTag: string; verification: string }) =>
        item.playerTag === '#P0LYQ' && item.verification === 'UNVERIFIED',
    ),
  ).toBeTruthy();
  await page.screenshot({ path: 'test-results/test-account-profile.png', fullPage: true });
});
