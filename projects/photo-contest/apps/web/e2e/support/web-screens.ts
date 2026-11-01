import type { Locator, Page } from '@playwright/test';

export const landingScreens = {
  hero: (page: Page) => page.getByRole('heading', { level: 1, name: '혼자 보기 아까운 순간', exact: true }),
  headerGuide: (page: Page) =>
    page
      .getByRole('navigation', { name: '서비스 안내' })
      .getByRole('link', { name: '이용 방법', exact: true }),
  headerStart: (page: Page) =>
    page
      .getByRole('navigation', { name: '서비스 안내' })
      .getByRole('link', { name: '시작하기', exact: true }),
  appNavigation: (page: Page) => page.getByRole('navigation', { name: '주요 메뉴' }),
  howItWorksLink: (page: Page) => page.getByRole('link', { name: '어떻게 쓰나요?' }),
  howItWorksHero: (page: Page) => page.getByRole('heading', { level: 1, name: '우리끼리, 이렇게 피식.' }),
  privateGroupHeading: (page: Page) => page.getByRole('heading', { name: '우리끼리 쓰는 비공개 그룹' }),
  startLink: (page: Page) => page.getByRole('link', { name: '피식 시작하기', exact: true }),
  anonymousStart: (page: Page) => page.getByRole('button', { name: '익명으로 시작하기', exact: true }),
  feedHeading: (page: Page) => page.getByRole('heading', { name: '우리끼리 모은 순간.' }),
} satisfies Record<string, (page: Page) => Locator>;

export const groupScreens = {
  categoryManager: (page: Page) =>
    page.locator('details:visible').filter({ has: page.getByText('카테고리 관리', { exact: true }) }),
} satisfies Record<string, (page: Page) => Locator>;

export const emptyStateScreens = {
  ownPosts: (page: Page) =>
    page
      .getByRole('region', { name: '올린 게시물', exact: true })
      .getByText('아직 올린 게시물이 없어요', { exact: true }),
  emptyContests: (page: Page) =>
    page
      .getByText('아직 진행 중인 대회가 없어요', { exact: true })
      .filter({ visible: true })
      .locator('..')
      .locator('.lucide-trophy'),
  emptyHallOfFame: (page: Page) =>
    page
      .getByText('아직 지난 대회가 없어요', { exact: true })
      .filter({ visible: true })
      .locator('..')
      .locator('.lucide-medal'),
} satisfies Record<string, (page: Page) => Locator>;
