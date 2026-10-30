import type { Locator, Page } from '@playwright/test';

export const landingScreens = {
  hero: (page: Page) => page.getByRole('heading', { level: 1, name: '혼자 보기 아까운 순간.' }),
  appNavigation: (page: Page) => page.getByRole('navigation', { name: '주요 메뉴' }),
  howItWorksLink: (page: Page) => page.getByRole('link', { name: '어떻게 쓰나요?' }),
  howItWorksHero: (page: Page) => page.getByRole('heading', { level: 1, name: '우리끼리, 이렇게 피식.' }),
  privateGroupHeading: (page: Page) => page.getByRole('heading', { name: '우리끼리 쓰는 비공개 그룹' }),
  startLink: (page: Page) => page.getByRole('link', { name: '피식 시작하기', exact: true }),
  anonymousStart: (page: Page) => page.getByRole('button', { name: '익명으로 시작하기', exact: true }),
  feedHeading: (page: Page) => page.getByRole('heading', { name: '우리끼리 모은 순간.' }),
} satisfies Record<string, (page: Page) => Locator>;
