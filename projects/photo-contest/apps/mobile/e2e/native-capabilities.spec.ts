import { E2E_WEB_ORIGIN } from './support/e2e-env';
import { expect, test } from './support/fixtures';
import { seedGalleryWithMemberPost, seedGroup, signInBrowser, signUp, uniqueNickname } from './support/seed';
import { webScreens } from './support/web-screens';

test.describe('웹 → 앱 기능', () => {
  test('초대 공유는 앱 공유 시트(share.open)로 초대 URL을 보내야 한다', async ({
    page,
    context,
    nativeHost,
  }) => {
    const cookie = await signUp(uniqueNickname('공유'));
    const group = await seedGroup(cookie, '공유 모임');
    await signInBrowser(context, cookie);
    await page.goto(`/groups/${group.id}`);
    await nativeHost.waitForEvent('app.ready');

    await webScreens.galleryMembers(page).click();
    await webScreens.inviteShareButton(page).click();

    await expect.poll(() => nativeHost.calls.map((call) => call.type)).toContain('share.open');
    const share = nativeHost.calls.find((call) => call.type === 'share.open');
    expect(share?.payload).toMatchObject({ url: `${E2E_WEB_ORIGIN}/invite/${group.inviteToken}` });
    // 공유 시트에 같은 URL이 실려야 한다(iOS는 url, Android는 message 안).
    expect(JSON.stringify(nativeHost.platform.shares[0])).toContain(`/invite/${group.inviteToken}`);
  });

  test('초대 링크 복사는 앱 클립보드(clipboard.copy)로 가야 한다', async ({ page, context, nativeHost }) => {
    const cookie = await signUp(uniqueNickname('복사'));
    const group = await seedGroup(cookie, '복사 모임');
    await signInBrowser(context, cookie);
    await page.goto(`/groups/${group.id}`);
    await nativeHost.waitForEvent('app.ready');

    await webScreens.galleryMembers(page).click();
    await webScreens.inviteCopyButton(page).click();

    await expect.poll(() => nativeHost.platform.copiedTexts).toHaveLength(1);
    expect(nativeHost.platform.copiedTexts[0]).toContain(`/invite/${group.inviteToken}`);
    expect(nativeHost.calls.map((call) => call.type)).toContain('clipboard.copy');
  });

  test('좋아요를 누르면 가벼운 진동(haptics.impact light)을 줘야 한다', async ({
    page,
    context,
    nativeHost,
  }) => {
    const { ownerCookie, group } = await seedGalleryWithMemberPost();
    await signInBrowser(context, ownerCookie);
    await page.goto(`/groups/${group.id}`);
    await nativeHost.waitForEvent('app.ready');

    await webScreens.likeButton(page).click();

    await expect.poll(() => nativeHost.platform.impacts).toContain('light');
    expect(nativeHost.calls).toContainEqual({ type: 'haptics.impact', payload: { style: 'light' } });
  });
});
