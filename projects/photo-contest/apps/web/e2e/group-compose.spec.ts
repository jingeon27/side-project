import { mkdir } from 'node:fs/promises';

import { createTestUser } from '@photo-contest/test-kit';

import { API_URL, WEB_ORIGIN } from './support/env';
import { productRequest } from './support/photos';
import { expect, seedGroup, startAnonymousSession, test } from './support/test';

test(
  '그룹 멤버의 고정 글쓰기는 헤더를 비우고 스크롤 중 줄어들며 현재 그룹 작성으로 바로 이동해야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn, browserName, isMobile }, testInfo) => {
    const cookie = await signIn('그룹 고정 글쓰기');
    const group = await seedGroup(cookie, '함께 나누는 순간');
    for (const index of [1, 2, 3, 4, 5, 6, 7, 8])
      await productRequest(
        cookie,
        'mutation($id:ID!,$title:String!){createPost(groupId:$id,title:$title,body:"함께 보고 웃을 수 있는 장면을 담았어요.",linkUrl:"https://example.com/memory",rightsConfirmed:true){id}}',
        { id: group.id, title: `그룹의 소소한 순간 ${index}` },
      );
    await page.goto('/');
    await page.getByRole('link').filter({ hasText: '함께 나누는 순간' }).first().click();
    await expect(page).toHaveURL(`/groups/${group.id}`);
    const write = page.getByRole('link', { name: '글쓰기', exact: true });
    await expect(write).toHaveAttribute('data-compose-entry', 'true');
    await expect(write).toHaveAttribute('href', `/groups/${group.id}/write`);
    await expect(write).not.toHaveAttribute('aria-haspopup');
    await expect(page.getByRole('button', { name: '초대와 멤버 보기', exact: true })).toBeEnabled();
    await expect(page.locator('header').getByRole('link', { name: '글쓰기', exact: true })).toHaveCount(0);
    await expect(page.locator('[data-bottom-nav]:visible')).toHaveCount(0);
    await mkdir('.data/screens', { recursive: true });
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(write).toHaveAttribute('data-compact', 'false');
      await expect(write).toBeInViewport({ ratio: 1 });
      const box = await write.boundingBox();
      if (!box) throw new Error('그룹 글쓰기 버튼이 보여야 한다');
      expect(box.width).toBeGreaterThanOrEqual(100);
      expect(box.height).toBeGreaterThanOrEqual(48);
      expect(900 - box.y - box.height).toBeGreaterThanOrEqual(width < 1024 ? 24 : 32);
      expect(900 - box.y - box.height).toBeLessThan(width < 1024 ? 30 : 38);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({
        path: `.data/screens/group-compose-${testInfo.project.name}-${width}-idle.png`,
        scale: 'css',
      });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    if (browserName === 'chromium' && isMobile) {
      const session = await page.context().newCDPSession(page);
      try {
        const point = { x: 195, y: 620 };
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
        for (const step of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]) {
          await session.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: point.x, y: point.y - step * 28 }],
          });
          await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
        }
        await expect(write).toHaveAttribute('data-compact', 'true');
        await page.screenshot({
          path: `.data/screens/group-compose-${testInfo.project.name}-scroll.png`,
          scale: 'css',
        });
      } finally {
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await session.detach();
      }
    }
    if (browserName !== 'chromium' || !isMobile) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      await expect(write).toHaveAttribute('data-compact', 'false');
      // 180ms 상태를 원격 polling이 놓치지 않게 실제 변경을 스크롤 전에 관찰한다.
      const compactDuringScroll = await write.evaluate(
        (element) =>
          new Promise<boolean>((resolve) => {
            const observer = new MutationObserver(() => {
              if (element.getAttribute('data-compact') !== 'true') return;
              clearTimeout(timeout);
              observer.disconnect();
              resolve(true);
            });
            const timeout = setTimeout(() => {
              observer.disconnect();
              resolve(false);
            }, 15_000);
            observer.observe(element, { attributes: true, attributeFilter: ['data-compact'] });
            window.scrollTo(0, 480);
          }),
      );
      expect(compactDuringScroll).toBe(true);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    }
    await expect(write).toHaveAttribute('data-compact', 'false');
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await write.focus();
    await expect(write).toBeFocused();
    await expect.poll(async () => (await write.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(100);
    await page.screenshot({
      path: `.data/screens/group-compose-${testInfo.project.name}-dark-focus.png`,
      scale: 'css',
    });
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`/groups/${group.id}/write`);
    await expect(page.getByRole('form', { name: '그룹에 글쓰기', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('[data-compose-entry]:visible')).toHaveCount(0);
  },
);

test(
  '공개 그룹의 익명 방문자는 가입 행동을 유지하고 가입 즉시 고정 글쓰기를 사용할 수 있어야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, context }) => {
    const owner = await createTestUser(API_URL, { nickname: '공개 그룹장', origin: WEB_ORIGIN });
    const group = await seedGroup(owner, '익명도 함께 나누는 그룹');
    await startAnonymousSession(context);
    await page.goto(`/groups/${group.id}`);
    await expect(page.getByRole('link', { name: '글쓰기', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '그룹 가입하기', exact: true }).click();
    const write = page.getByRole('link', { name: '글쓰기', exact: true });
    await expect(write).toHaveAttribute('data-compose-entry', 'true');
    await expect(page.getByRole('button', { name: '그룹 가입하기', exact: true })).toHaveCount(0);
    await write.click();
    await expect(page).toHaveURL(`/groups/${group.id}/write`);
    await expect(page.getByRole('form', { name: '그룹에 글쓰기', exact: true })).toBeVisible();
  },
);

test(
  '비공개 그룹은 승인 전 글쓰기를 숨기고 승인 확인 후 같은 화면에서 고정 글쓰기를 제공해야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, context, signIn }) => {
    const owner = await createTestUser(API_URL, { nickname: '비공개 그룹장', origin: WEB_ORIGIN });
    const group = await seedGroup(owner, '승인된 사람들의 순간', 'PRIVATE');
    await signIn('그룹 승인 신청자');
    await page.goto(`/groups/${group.id}`);
    await expect(page.getByRole('region', { name: '비공개 그룹 안내' })).toBeVisible();
    await expect(page.getByRole('link', { name: '글쓰기', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '가입 신청하기', exact: true }).click();
    await expect(page.getByRole('button', { name: '가입 승인 대기 중', exact: true })).toBeDisabled();
    await expect(page.locator('[data-compose-entry]:visible')).toHaveCount(0);
    await context.setOffline(true);
    await page.getByRole('button', { name: '승인 상태 확인', exact: true }).click();
    const notice = page.getByRole('region', { name: '비공개 그룹 안내' });
    await expect(notice.getByRole('alert')).toContainText('승인 상태를 확인하지 못했어요.');
    await expect(page.locator('[data-compose-entry]:visible')).toHaveCount(0);
    await context.setOffline(false);
    await page.getByRole('button', { name: '승인 상태 확인', exact: true }).click();
    await expect(notice.getByRole('alert')).toHaveCount(0);
    const { groupJoinRequests } = await productRequest<{ groupJoinRequests: Array<{ id: string }> }>(
      owner,
      'query($id:ID!){groupJoinRequests(groupId:$id){id}}',
      { id: group.id },
    );
    const [request] = groupJoinRequests;
    if (!request) throw new Error('승인할 가입 신청이 있어야 한다');
    await productRequest(owner, 'mutation($id:ID!){approveGroupJoinRequest(requestId:$id)}', {
      id: request.id,
    });
    await page.getByRole('button', { name: '승인 상태 확인', exact: true }).click();
    const write = page.getByRole('link', { name: '글쓰기', exact: true });
    await expect(write).toHaveAttribute('data-compose-entry', 'true');
    await expect(page.getByRole('region', { name: '비공개 그룹 안내' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: '최신 게시물', exact: true })).toBeVisible();
    await write.click();
    await expect(page).toHaveURL(`/groups/${group.id}/write`);
    await expect(page.getByRole('form', { name: '그룹에 글쓰기', exact: true })).toBeVisible();
  },
);
