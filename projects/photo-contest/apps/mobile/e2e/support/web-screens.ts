import type { Page } from '@playwright/test';

/**
 * 웹 화면 요소. 웹(apps/web)은 다시 만드는 중이라 이름이 바뀌면 이 파일만 고친다.
 * 역할과 접근성 이름으로 찾는다.
 */
export const webScreens = {
  /** 서버가 앱 User-Agent를 보고 붙이는 표식 */
  appMarker: (page: Page) => page.locator('html[data-app]'),
  socialLoginButton: (page: Page, provider: 'google' | 'kakao') =>
    page.getByRole('button', { name: provider === 'google' ? /google|구글/i : /kakao|카카오/i }),
  /** 그룹 화면의 초대 링크 공유 */
  inviteShareButton: (page: Page) =>
    page.getByRole('button', { name: /초대.*(공유|보내기)|초대하기/ }).first(),
  /** 그룹 화면의 초대 링크 복사 */
  inviteCopyButton: (page: Page) => page.getByRole('button', { name: /링크 복사|복사/ }).first(),
  likeButton: (page: Page) => page.getByRole('button', { name: /좋아요/ }).first(),
  toast: (page: Page) => page.getByRole('status').or(page.getByRole('alert')),
  /** 홈에서 바텀시트를 여는 버튼 */
  createGroupButton: (page: Page) => page.getByRole('button', { name: /그룹 만들기/ }).first(),
  dialog: (page: Page) => page.getByRole('dialog'),
};
