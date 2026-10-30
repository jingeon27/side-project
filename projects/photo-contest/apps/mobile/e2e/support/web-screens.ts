import type { Page } from '@playwright/test';

/**
 * 웹 화면 요소. 웹(apps/web)은 다시 만드는 중이라 이름이 바뀌면 이 파일만 고친다.
 * 역할과 접근성 이름으로 찾는다.
 */
export const webScreens = {
  homeLink: (page: Page) => page.getByRole('link', { name: '홈', exact: true }),
  homeHeading: (page: Page) => page.getByRole('heading', { name: '우리끼리 모은 순간.' }),
  landingHero: (page: Page) =>
    page.getByRole('heading', { level: 1, name: '혼자 보기 아까운 순간', exact: true }),
  landingStart: (page: Page) => page.getByRole('link', { name: '피식 시작하기', exact: true }),
  postCard: (page: Page) =>
    page
      .getByRole('region', { name: '최신 게시물', exact: true })
      .getByRole('article', { name: '모바일 피드 확인용 게시물' }),
  myPageLink: (page: Page) => page.getByRole('link', { name: 'MY', exact: true }),
  profileHeading: (page: Page, nickname: string) =>
    page.getByRole('heading', { name: nickname, exact: true }),
  /** 서버가 앱 User-Agent를 보고 붙이는 표식 */
  appMarker: (page: Page) => page.locator('html[data-app]'),
  galleryMembers: (page: Page) => page.getByText('초대와 그룹 멤버', { exact: true }),
  /** 그룹 화면의 초대 링크 공유 */
  inviteShareButton: (page: Page) =>
    page.getByRole('button', { name: /초대.*(공유|보내기)|초대하기/ }).first(),
  /** 그룹 화면의 초대 링크 복사 */
  inviteCopyButton: (page: Page) => page.getByRole('button', { name: /링크 복사|복사/ }).first(),
  likeButton: (page: Page) => page.getByRole('button', { name: / 좋아요$/ }).first(),
  toast: (page: Page) => page.getByRole('status').or(page.getByRole('alert')),
  /** 마이페이지에서 그룹 생성 페이지로 이동하는 버튼 */
  createGroupButton: (page: Page) => page.getByRole('button', { name: /그룹 만들기/ }).first(),
  profileEditButton: (page: Page) => page.getByRole('button', { name: '프로필 수정', exact: true }),
  dialog: (page: Page) => page.getByRole('dialog'),
};
