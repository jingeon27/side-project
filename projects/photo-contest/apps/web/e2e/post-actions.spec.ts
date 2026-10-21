import { mkdir } from 'node:fs/promises';

import { createTestUser } from '@photo-contest/test-kit';

import { API_URL, WEB_ORIGIN } from './support/env';
import { productRequest, seedPost } from './support/photos';
import { expect, seedGroup, test } from './support/test';

test(
  '더보기 메뉴에서 수정·분류 변경·숨기기·삭제가 동작하고 키보드 포커스가 유지되어야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }, testInfo) => {
    const cookie = await signIn('메뉴 관리자');
    const group = await seedGroup(cookie, '오늘의 웃음');
    const postId = await seedPost(cookie, group.id, '우연히 찍힌 완벽한 순간');
    const { createGroupCategory: category } = await productRequest<{ createGroupCategory: { id: string } }>(
      cookie,
      'mutation($id:ID!){createGroupCategory(groupId:$id,name:"순간포착"){id}}',
      { id: group.id },
    );
    await page.goto(`/groups/${group.id}`);
    const latest = page.getByRole('region', { name: '최신 게시물', exact: true });
    const post = latest.getByRole('article', { name: '우연히 찍힌 완벽한 순간', exact: true });
    const trigger = post.getByRole('button', { name: '우연히 찍힌 완벽한 순간 더보기', exact: true });
    await expect(post.getByRole('button', { name: /숨기기|분류 변경|삭제/ })).toHaveCount(0);
    await trigger.focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: '수정', exact: true })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: '숨기기', exact: true })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: '삭제', exact: true })).toBeVisible();
    await mkdir('.data/screens', { recursive: true });
    await page.screenshot({
      animations: 'disabled',
      path: `.data/screens/${testInfo.project.name}-post-menu.png`,
    });
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.getByRole('menuitem', { name: '수정', exact: true }).click();
    const editor = page.getByRole('dialog', { name: '게시물 수정', exact: true });
    await expect
      .poll(() => editor.evaluate((element) => element.contains(document.activeElement)))
      .toBe(true);
    await expect(editor.getByRole('textbox', { name: '제목', exact: true })).toHaveValue(
      '우연히 찍힌 완벽한 순간',
    );
    await editor.getByRole('textbox', { name: '제목', exact: true }).fill('웃음이 번지는 오후');
    await editor.getByRole('textbox', { name: '내용', exact: true }).fill('우연이라 더 재미있는 순간.');
    await editor.getByRole('combobox', { name: '카테고리', exact: true }).selectOption(category.id);
    await editor.getByRole('button', { name: '수정 저장하기' }).click();
    await expect(editor).toHaveCount(0);
    const edited = latest.getByRole('article', { name: '웃음이 번지는 오후', exact: true });
    await expect(edited.getByText('우연이라 더 재미있는 순간.')).toBeVisible();
    await expect(edited.getByText('순간포착', { exact: true })).toBeVisible();
    await expect(
      edited.getByRole('button', { name: '웃음이 번지는 오후 더보기', exact: true }),
    ).toBeFocused();
    await page.reload();
    await expect(edited.getByText('우연이라 더 재미있는 순간.')).toBeVisible();
    const friend = await createTestUser(API_URL, { nickname: '메뉴 일반 회원', origin: WEB_ORIGIN });
    await productRequest(friend, 'mutation($token:String!){joinGroup(token:$token){id}}', {
      token: group.inviteToken,
    });
    await seedPost(friend, group.id, '다른 회원의 순간');
    await page.reload();
    const friendPost = latest.getByRole('article', { name: '다른 회원의 순간', exact: true });
    await friendPost.getByRole('button', { name: '다른 회원의 순간 더보기' }).click();
    await page.getByRole('menuitem', { name: '삭제', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '게시물 삭제하기' }).click();
    await expect(friendPost).toHaveCount(0);
    await edited.getByRole('button', { name: '웃음이 번지는 오후 더보기' }).click();
    await page.getByRole('menuitem', { name: '숨기기', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '숨기기', exact: true }).click();
    await expect(edited).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(
      (
        await productRequest<{ hiddenGalleryPosts: { id: string }[] }>(
          cookie,
          'query($id:ID!){hiddenGalleryPosts(groupId:$id){id}}',
          { id: group.id },
        )
      ).hiddenGalleryPosts.map(({ id }) => id),
    ).toContain(postId);
  },
);
