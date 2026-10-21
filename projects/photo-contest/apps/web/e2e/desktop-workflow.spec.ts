import { mkdir } from 'node:fs/promises';

import { createTestImage, createTestUser } from '@photo-contest/test-kit';

import { API_URL, WEB_ORIGIN } from './support/env';
import { productRequest, seedPost } from './support/photos';
import { expect, seedGroup, test } from './support/test';

test(
  '데스크톱에서 스크롤하며 글을 쓰고 게시물을 보며 댓글을 남길 수 있어야 한다',
  { tag: ['@desktop'] },
  async ({ page, signIn }) => {
    const viewer = await signIn('큰 화면 사용자');
    const friend = await createTestUser(API_URL, { nickname: '함께 웃는 친구', origin: WEB_ORIGIN });
    const group = await seedGroup(viewer, '데스크톱 친구들');
    await productRequest(friend, 'mutation($token:String!){joinGroup(token:$token){id}}', {
      token: group.inviteToken,
    });
    await seedPost(viewer, group.id, '주말의 순간', { color: '#243b35' });
    const postId = await seedPost(friend, group.id, '함께 웃는 오후');
    await productRequest(
      friend,
      'mutation($id:ID!){createPostComment(postId:$id,body:"이 표정은 못 참지"){id}}',
      { id: postId },
    );
    await page.goto('/');
    const latest = page.getByRole('region', { name: '최신 게시물', exact: true });
    for (const width of [1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 960 });
      await expect(page.getByRole('heading', { name: '홈', exact: true })).toBeVisible();
      await expect(latest.getByRole('article')).toHaveCount(2);
      const feed = await latest.boundingBox();
      const popular = await page.getByRole('region', { name: '이달의 인기', exact: true }).boundingBox();
      if (!feed || !popular) throw new Error('피드와 인기 목록이 보여야 한다');
      expect(popular.x).toBeGreaterThan(feed.x + feed.width);
      expect(feed.width).toBeLessThanOrEqual(680);
      expect((await page.locator('#pc-main').boundingBox())?.width).toBeLessThanOrEqual(1440);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 1440, height: 960 });
    await mkdir('.data/screens', { recursive: true });
    await page.screenshot({ path: '.data/screens/desktop-home-wide.png' });

    await page
      .getByRole('navigation', { name: '주요 메뉴' })
      .getByRole('link', { name: 'MY', exact: true })
      .click();
    const profile = await page.getByRole('heading', { name: '큰 화면 사용자', exact: true }).boundingBox();
    const groupCard = page.getByRole('link', { name: /데스크톱 친구들/ });
    await expect(groupCard).toBeVisible();
    const card = await groupCard.boundingBox();
    if (!profile || !card) throw new Error('프로필과 내 그룹이 보여야 한다');
    expect(card.x).toBeGreaterThan(profile.x + profile.width);
    await page.screenshot({ path: '.data/screens/desktop-my-wide.png' });
    await groupCard.click();
    const summary = page.getByText('초대와 그룹 멤버', { exact: true });
    await expect(summary).toBeInViewport();
    const information = await summary.boundingBox();
    const groupFeed = await latest.boundingBox();
    if (!information || !groupFeed) throw new Error('그룹 정보와 피드가 보여야 한다');
    expect(information.x).toBeGreaterThan(groupFeed.x + groupFeed.width);
    await summary.click();
    await expect(page.getByLabel('그룹 초대 링크')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: '.data/screens/desktop-group-wide.png' });

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const write = page.getByRole('button', { name: '글쓰기', exact: true });
    await expect(write).toBeInViewport();
    await write.click();
    const composer = page.getByRole('dialog', { name: '그룹에 글쓰기', exact: true });
    const title = composer.getByLabel('제목', { exact: true });
    const picker = await composer.getByRole('button', { name: '파일 선택', exact: true }).boundingBox();
    const titleBox = await title.boundingBox();
    if (!picker || !titleBox) throw new Error('미디어와 제목 입력이 보여야 한다');
    expect(titleBox.x).toBeGreaterThan(picker.x + picker.width);
    await composer.getByLabel('사진·동영상 선택', { exact: true }).setInputFiles({
      name: 'desktop-moment.png',
      mimeType: 'image/png',
      buffer: await createTestImage({ width: 360, height: 240 }),
    });
    const preview = composer.getByRole('img', { name: '선택한 사진 미리보기', exact: true });
    await expect.poll(() => preview.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(360);
    await title.fill('스크롤하다 남긴 순간');
    await composer
      .getByLabel('내용', { exact: true })
      .fill('큰 화면에서도 사진과 내용을 함께 보며 작성해요.');
    await composer.getByRole('checkbox', { name: /공유할 권리/ }).check();
    await page.screenshot({ path: '.data/screens/desktop-composer-wide.png' });
    await composer.getByRole('button', { name: '게시물 올리기', exact: true }).click();
    await expect(composer).toHaveCount(0);
    await expect(latest.getByRole('heading', { name: '스크롤하다 남긴 순간', exact: true })).toBeInViewport();

    await latest.getByRole('button', { name: '함께 웃는 오후 댓글 1개', exact: true }).click();
    const comments = page.getByRole('dialog', { name: '댓글', exact: true });
    const context = comments.getByRole('article', { name: '댓글을 보는 게시물', exact: true });
    await expect(context).toBeVisible();
    await expect(context.getByRole('img', { name: '함께 웃는 오후', exact: true })).toBeVisible();
    const list = comments.getByRole('list', { name: '게시물 댓글', exact: true });
    await expect(list.getByText('이 표정은 못 참지', { exact: true })).toBeVisible();
    const contextBox = await context.boundingBox();
    const listBox = await list.boundingBox();
    if (!contextBox || !listBox) throw new Error('게시물과 댓글이 보여야 한다');
    expect(listBox.x).toBeGreaterThanOrEqual(contextBox.x + contextBox.width);
    await comments.getByRole('textbox', { name: '댓글', exact: true }).fill('사진을 보면서 같이 웃어요.');
    await comments.getByRole('button', { name: '댓글 올리기', exact: true }).click();
    await expect(list.getByRole('listitem')).toHaveCount(2);
    await page.screenshot({ path: '.data/screens/desktop-comments-wide.png' });
    await comments.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(comments).toHaveCount(0);
  },
);
