import { mkdir } from 'node:fs/promises';

import type { Page } from '@playwright/test';

import { createTestUser } from '@photo-contest/test-kit';

import { API_URL, WEB_ORIGIN } from './support/env';
import { productRequest, seedPost } from './support/photos';
import { expect, seedGroup, test } from './support/test';

async function dragComments(page: Page, browserName: string, isMobile: boolean, distance: number) {
  const heading = page.getByRole('heading', { name: '댓글', exact: true });
  const box = await heading.boundingBox();
  if (!box) throw new Error('댓글 헤더가 보여야 한다');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (!isMobile) {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + distance, { steps: 12 });
    await page.mouse.up();
    return;
  }
  if (browserName === 'chromium') {
    const session = await page.context().newCDPSession(page);
    try {
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let step = 1; step <= 10; step++)
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y: y + (distance * step) / 10 }],
        });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally {
      await session.detach();
    }
    return;
  }
  const touch = (clientY: number) => ({
    identifier: 1,
    clientX: x,
    clientY,
    screenX: x,
    screenY: clientY,
    radiusX: 1,
    radiusY: 1,
    rotationAngle: 0,
    force: 1,
  });
  for (const [type, touches, changedTouches] of [
    ['touchstart', [touch(y)], [touch(y)]],
    ...Array.from({ length: 10 }, (_, index) => {
      const point = touch(y + (distance * (index + 1)) / 10);
      return ['touchmove', [point], [point]] as const;
    }),
    ['touchend', [], [touch(y + distance)]],
  ] as const)
    await heading.dispatchEvent(type, { touches, targetTouches: touches, changedTouches });
}

test(
  '댓글을 작성하고 작성자·관리자가 삭제하면 피드의 개수도 바뀌어야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn, browserName, isMobile }, testInfo) => {
    const owner = await signIn('댓글 관리자');
    const member = await createTestUser(API_URL, { nickname: '댓글 친구', origin: WEB_ORIGIN });
    const group = await seedGroup(owner, '댓글 그룹');
    await productRequest(member, 'mutation($token:String!){joinGroup(token:$token){id}}', {
      token: group.inviteToken,
    });
    const postId = await seedPost(member, group.id, '댓글이 있는 순간');
    await productRequest(
      member,
      'mutation($id:ID!){createPostComment(postId:$id,body:"친구가 남긴 웃음"){id}}',
      { id: postId },
    );
    await page.goto(`/groups/${group.id}`);
    const post = page
      .getByRole('region', { name: '최신 게시물' })
      .getByRole('article', { name: '댓글이 있는 순간' });
    await post.getByRole('button', { name: '댓글이 있는 순간 댓글 1개' }).click();
    const sheet = page.getByRole('dialog', { name: '댓글', exact: true });
    const list = sheet.getByRole('list', { name: '게시물 댓글' });
    await expect(list.getByText('친구가 남긴 웃음')).toBeVisible();
    const friendComment = list.getByRole('listitem').filter({ hasText: '친구가 남긴 웃음' });
    await expect(sheet.getByRole('button', { name: /시트.*확장|시트 축소/ })).toHaveCount(0);
    await friendComment.getByRole('button', { name: '댓글 좋아요 0개', exact: true }).click();
    await expect(friendComment.getByRole('button', { name: '댓글 좋아요 1개', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(friendComment.getByRole('button', { name: '댓글 좋아요 1개', exact: true })).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await post.getByRole('button', { name: '댓글이 있는 순간 댓글 1개' }).click();
    await expect(friendComment.getByRole('button', { name: '댓글 좋아요 1개', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await friendComment.getByRole('button', { name: '댓글 좋아요 1개', exact: true }).click();
    await expect(friendComment.getByRole('button', { name: '댓글 좋아요 0개', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    const viewport = page.viewportSize();
    if (!viewport) throw new Error('화면 크기가 있어야 한다');
    const expectCompact = async () => {
      await expect
        .poll(async () => {
          const box = await sheet.boundingBox();
          return box ? Math.abs((viewport.height - box.y) / viewport.height - 0.75) : 1;
        })
        .toBeLessThan(0.015);
      await expect(sheet.getByRole('textbox', { name: '댓글', exact: true })).toBeInViewport();
      await expect(sheet.getByRole('button', { name: '댓글 올리기' })).toBeInViewport();
    };
    await mkdir('.data/screens', { recursive: true });
    if (viewport.width < 768) {
      await expectCompact();
      const backdrop = page.locator('[data-slot="bottom-sheet-backdrop"]');
      const opacity = () => backdrop.evaluate((element) => Number(getComputedStyle(element).opacity));
      await expect.poll(opacity).toBeGreaterThan(0);
      const compactOpacity = await opacity();
      expect(compactOpacity).toBeLessThan(0.5);
      await mkdir('.data/screens', { recursive: true });
      await page.screenshot({ path: `.data/screens/${testInfo.project.name}-comments-peek.png` });
      await dragComments(page, browserName, isMobile, -viewport.height * 0.3);
      await expect.poll(async () => (await sheet.boundingBox())?.y ?? 100).toBeLessThan(48);
      await expect.poll(opacity).toBeGreaterThan(compactOpacity);
      expect(await opacity()).toBeLessThan(1);
      await page.screenshot({ path: `.data/screens/${testInfo.project.name}-comments-expanded.png` });
      await dragComments(page, browserName, isMobile, viewport.height * 0.3);
      await expectCompact();
      const handle = sheet.getByRole('slider', { name: '시트 높이 조절', exact: true });
      await handle.press('ArrowUp');
      await expect(handle).toHaveAttribute('aria-valuetext', '100%');
      await expect.poll(async () => (await sheet.boundingBox())?.y ?? 100).toBeLessThan(48);
      // 전체 높이에서도 보이는 화면이 줄면(키보드) 시트가 그 높이에 맞춰 제목과 입력창을 함께 보여야 한다.
      const heading = sheet.getByRole('heading', { name: '댓글', exact: true });
      await page.setViewportSize({ width: viewport.width, height: 500 });
      await expect.poll(async () => (await sheet.boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(0);
      await expect(heading).toBeInViewport();
      await expect(sheet.getByRole('textbox', { name: '댓글', exact: true })).toBeInViewport();
      await page.setViewportSize(viewport);
      await handle.press('Home');
      await expectCompact();
    }
    if (viewport.width >= 768) {
      const box = await sheet.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThan(0);
      expect(box!.y).toBeGreaterThan(0);
      await expect(sheet.getByRole('textbox', { name: '댓글', exact: true })).toBeInViewport();
    }
    await sheet.getByRole('button', { name: '댓글 올리기' }).click();
    await expect(sheet.getByText('댓글을 입력해 주세요.')).toBeVisible();
    const input = sheet.getByRole('textbox', { name: '댓글', exact: true });
    await expect(input).toBeFocused();
    await page.setViewportSize({ width: viewport.width, height: 500 });
    await input.fill('한참 웃었어요\n이 순간은 저장!');
    await expect(input).toBeInViewport();
    await expect(sheet.getByRole('button', { name: '댓글 올리기' })).toBeInViewport();
    await sheet.getByRole('button', { name: '댓글 올리기' }).click();
    await expect(list.getByRole('listitem')).toHaveCount(2);
    await expect(list.getByRole('listitem').first()).toContainText('이 순간은 저장!');
    await expect(input).toHaveValue('');
    const body = sheet.locator('[data-slot="bottom-sheet-body"], [data-slot="post-comments-body"]');
    await body.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(input).toBeInViewport();
    await expect(sheet.getByRole('button', { name: '댓글 올리기' })).toBeInViewport();
    expect(await sheet.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.setViewportSize(viewport);
    await body.evaluate((element) => {
      element.scrollTop = 0;
    });
    await mkdir('.data/screens', { recursive: true });
    await page.screenshot({ path: `.data/screens/${testInfo.project.name}-comments.png` });
    for (const nickname of ['댓글 관리자', '댓글 친구']) {
      await list.getByRole('button', { name: `${nickname} 댓글 삭제` }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: '댓글 삭제하기' }).click();
      await expect(list.getByRole('button', { name: `${nickname} 댓글 삭제` })).toHaveCount(0);
    }
    await expect(sheet.getByText('첫 댓글을 남겨보세요.')).toBeVisible();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    // 768px보다 좁은 시트는 닫기 버튼 없이 아래로 밀어 닫고, 중앙 모달은 제목 옆 버튼으로 닫는다.
    const close = sheet.getByRole('button', { name: '닫기', exact: true });
    if (viewport.width < 768) {
      await expect(close).toHaveCount(0);
      await dragComments(page, browserName, isMobile, viewport.height * 0.6);
    }
    if (viewport.width >= 768) {
      await expect(close).toBeInViewport();
      await close.click();
    }
    await expect(sheet).toHaveCount(0);
    await expect(post.getByRole('button', { name: '댓글이 있는 순간 댓글 0개' })).toBeVisible();
    await page.reload();
    await expect(post.getByRole('button', { name: '댓글이 있는 순간 댓글 0개' })).toBeVisible();
  },
);

test('폭이 767px과 768px 사이를 오가면 입력을 유지한 채 바텀시트와 모달을 바꿔 보여야 한다', async ({
  page,
  signIn,
}) => {
  const cookie = await signIn('댓글 폭 회원');
  const group = await seedGroup(cookie, '댓글 폭 그룹');
  await seedPost(cookie, group.id, '폭이 바뀌는 순간');
  await page.setViewportSize({ width: 767, height: 900 });
  await page.goto(`/groups/${group.id}`);
  await page.getByRole('button', { name: '폭이 바뀌는 순간 댓글 0개' }).click();
  const sheet = page.getByRole('dialog', { name: '댓글', exact: true });
  const close = sheet.getByRole('button', { name: '닫기', exact: true });
  const handle = sheet.getByRole('slider', { name: '시트 높이 조절', exact: true });
  await expect(sheet.getByText('첫 댓글을 남겨보세요.')).toBeVisible();
  await expect(handle).toBeVisible();
  await expect(close).toHaveCount(0);
  const input = sheet.getByRole('textbox', { name: '댓글', exact: true });
  await input.fill('돌려도 남는 초안');
  const groupUrl = page.url();

  await page.setViewportSize({ width: 768, height: 900 });
  await expect(close).toBeVisible();
  await expect(handle).toHaveCount(0);
  await expect(input).toHaveValue('돌려도 남는 초안');
  await expect
    .poll(async () => {
      const box = await sheet.boundingBox();
      return box ? box.x > 0 && Math.abs(box.x + box.width / 2 - 384) < 2 : false;
    })
    .toBe(true);

  await page.setViewportSize({ width: 767, height: 900 });
  await expect(handle).toBeVisible();
  await expect(close).toHaveCount(0);
  await expect(input).toHaveValue('돌려도 남는 초안');

  await page.setViewportSize({ width: 768, height: 900 });
  await expect(close).toBeVisible();
  // 끌어도 닫히지 않고, 교체를 거친 뒤에도 뒤로 가기는 화면 대신 모달을 닫는다.
  const heading = sheet.getByRole('heading', { name: '댓글', exact: true });
  const box = await heading.boundingBox();
  if (!box) throw new Error('댓글 제목이 보여야 한다');
  await page.mouse.move(box.x + 8, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + 8, box.y + 308, { steps: 12 });
  await page.mouse.up();
  await expect(close).toBeVisible();
  await page.goBack();
  await expect(sheet).toHaveCount(0);
  expect(page.url()).toBe(groupUrl);
});

test('댓글의 다음 페이지와 새 댓글 작성 뒤 목록을 정확히 이어 받아야 한다', async ({ page, signIn }) => {
  const cookie = await signIn('댓글 페이지 회원');
  const group = await seedGroup(cookie, '댓글 페이지 그룹');
  const postId = await seedPost(cookie, group.id, '댓글 많은 순간');
  for (let index = 0; index < 25; index++)
    await productRequest(
      cookie,
      'mutation($id:ID!,$body:String!){createPostComment(postId:$id,body:$body){id}}',
      { id: postId, body: `이야기 ${index}` },
    );
  await page.goto(`/groups/${group.id}`);
  await page.getByRole('button', { name: '댓글 많은 순간 댓글 25개' }).click();
  const sheet = page.getByRole('dialog', { name: '댓글', exact: true });
  const items = sheet.getByRole('list', { name: '게시물 댓글' }).getByRole('listitem');
  await expect(items).toHaveCount(24);
  await sheet.getByRole('button', { name: '댓글 더 보기' }).click();
  await expect(items).toHaveCount(25);
  await expect(sheet.getByRole('button', { name: '댓글 더 보기' })).toHaveCount(0);
  await sheet.getByRole('textbox', { name: '댓글', exact: true }).fill('새로운 이야기');
  await sheet.getByRole('button', { name: '댓글 올리기' }).click();
  await expect(items).toHaveCount(24);
  await expect(items.first()).toContainText('새로운 이야기');
  await sheet.getByRole('button', { name: '댓글 더 보기' }).click();
  await expect(items).toHaveCount(26);
  await expect(sheet.getByRole('button', { name: '댓글 더 보기' })).toHaveCount(0);
});
