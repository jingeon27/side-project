import { expect, seedGroup, test } from './support/test';

test(
  '검색 결과와 빈 결과에서 전체 그룹 목록으로 바로 돌아갈 수 있어야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }, testInfo) => {
    const owner = await signIn(`검색 복귀 ${testInfo.project.name}`);
    const name = `검색 복귀-${crypto.randomUUID().slice(0, 8)}`;
    await seedGroup(owner, name);
    await page.goto(`/explore?q=${encodeURIComponent(name)}`);
    const group = page.getByRole('link', { name, exact: true });
    const input = page.getByRole('textbox', { name: '그룹 검색', exact: true });
    await expect(group).toBeVisible();
    await expect(group).toHaveAccessibleDescription(/공개 그룹.*멤버 1명.*그룹으로 가기/);
    await expect(page.getByRole('status').filter({ hasText: '그룹 1개를 표시하고 있어요.' })).toBeVisible();
    await page.getByRole('button', { name: '검색 초기화', exact: true }).click();
    await expect(page).toHaveURL('/explore');
    await expect(input).toHaveValue('');

    await input.fill('W'.repeat(40));
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await expect(page.getByRole('heading', { name: '검색 결과', exact: true })).toBeVisible();
    await expect(input).toHaveValue('W'.repeat(40));
    await expect(page.getByRole('status').filter({ hasText: '검색한 그룹을 찾지 못했어요' })).toBeVisible();
    await page.getByRole('button', { name: '전체 그룹 보기', exact: true }).click();
    await expect(page).toHaveURL('/explore');
    await expect(group).toBeVisible();
  },
);
