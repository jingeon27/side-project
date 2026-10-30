import { productRequest } from './support/photos';
import { expect, seedGroup, test } from './support/test';

test(
  '그룹 프로필 수정은 별도 페이지에서 새로고침·취소·뒤로 가기·저장을 지원해야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }, testInfo) => {
    const owner = await signIn('그룹 수정 페이지 관리자');
    const name = `수정 전 그룹-${testInfo.project.name}`;
    const group = await seedGroup(owner, name, 'PUBLIC');
    const path = `/groups/${group.id}`;
    await page.goto(path);
    await page.getByRole('link', { name: '그룹 프로필 수정', exact: true }).click();
    await expect(page).toHaveURL(`${path}/edit`);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const form = page.getByRole('form', { name: '그룹 프로필 수정' });
    const input = form.getByRole('textbox', { name: '그룹 이름', exact: true });
    await expect(input).toBeInViewport({ ratio: 1 });
    await expect(form.locator('details')).not.toHaveAttribute('open');
    await page.screenshot({ path: testInfo.outputPath('group-profile-edit.png'), animations: 'disabled' });
    await page.reload();
    await expect(input).toHaveValue(name);
    await input.fill('저장하지 않은 이름');
    await form.getByRole('button', { name: '취소', exact: true }).click();
    await expect(page).toHaveURL(path);
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY)).not.toBe(
      'hidden',
    );
    await page.goto(`${path}/edit`);
    await expect(input).toHaveValue(name);
    await page.getByRole('button', { name: '뒤로 가기', exact: true }).click();
    await expect(page).toHaveURL(path);
    await page.goto(`${path}/edit`);
    const savedName = `수정한 그룹-${testInfo.project.name}`;
    await input.fill(savedName);
    await form.getByRole('textbox', { name: '그룹 소개', exact: true }).fill('별도 페이지에서 바꾼 소개');
    await form.getByRole('button', { name: '프로필 저장하기', exact: true }).click();
    await expect(page).toHaveURL(path);
    await expect(page.getByRole('heading', { name: savedName, exact: true })).toBeVisible();
    await expect(page.getByText('별도 페이지에서 바꾼 소개', { exact: true })).toBeVisible();
    const profile = await productRequest<{ group: { name: string; description: string } }>(
      owner,
      'query($id: ID!){group(id:$id){name description}}',
      { id: group.id },
    );
    expect(profile.group).toEqual({ name: savedName, description: '별도 페이지에서 바꾼 소개' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  },
);

test(
  '관리자가 아닌 사용자는 그룹 수정 페이지에 직접 접근해도 폼을 볼 수 없어야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }) => {
    const owner = await signIn('수정 권한 그룹장');
    const group = await seedGroup(owner, '관리자 전용 프로필 수정', 'PUBLIC');
    const member = await signIn('수정 권한 일반 회원');
    await productRequest(member, 'mutation($id: ID!){requestGroupMembership(groupId:$id){id}}', {
      id: group.id,
    });
    const path = `/groups/${group.id}`;
    await page.goto(`${path}/edit`);
    await expect(page).toHaveURL(path);
    await expect(page.getByRole('form', { name: '그룹 프로필 수정' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: '그룹 프로필 수정' })).toHaveCount(0);
    await productRequest(
      owner,
      'mutation($groupId: ID!, $userId: ID!, $enabled: Boolean!){setGroupModerator(groupId:$groupId,userId:$userId,enabled:$enabled){id}}',
      {
        groupId: group.id,
        userId: (await productRequest<{ me: { id: string } }>(member, 'query{me{id}}')).me.id,
        enabled: true,
      },
    );
    await page.goto(`${path}/edit`);
    await expect(page.getByRole('form', { name: '그룹 프로필 수정' })).toBeVisible();
    await page.context().clearCookies();
    await page.goto(`${path}/edit`);
    await expect(page).toHaveURL(new RegExp(`/sign\\?next=${encodeURIComponent(`${path}/edit`)}`));
    await expect(page.getByRole('form', { name: '그룹 프로필 수정' })).toHaveCount(0);
  },
);
