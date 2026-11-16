import { createTestImage } from '@photo-contest/test-kit';

import { isStorageUpload, productRequest } from './support/photos';
import { expect, seedGroup, test } from './support/test';

for (const mode of ['생성', '수정'] as const) {
  test(
    `그룹 ${mode}의 부분 전송 실패는 완료한 사진을 유지하고 실패한 사진만 재전송해야 한다`,
    { tag: ['@ios', '@desktop'] },
    async ({ page, signIn }, testInfo) => {
      const cookie = await signIn(`사진 재시도 ${mode}`);
      const name = `사진 재시도-${mode}-${testInfo.project.name}`;
      const group = mode === '수정' ? await seedGroup(cookie, name) : null;
      await page.goto(group ? `/groups/${group.id}/edit` : '/groups/new');
      const form = page.getByRole('form', {
        name: mode === '생성' ? '그룹 만들기' : '그룹 프로필 수정',
        exact: true,
      });
      const nameInput = form.getByRole('textbox', { name: '그룹 이름', exact: true });
      if (!group) await nameInput.fill(name);
      await expect(nameInput).toHaveValue(name);
      await form.locator('summary').click();
      const image = await createTestImage({ width: 120, height: 60 });
      await form
        .getByLabel('그룹 배경 사진 선택')
        .setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: image });
      await form
        .getByLabel(mode === '생성' ? '그룹 프로필 사진 선택' : '그룹 사진 선택')
        .setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: image });
      const sentFiles: string[] = [];
      await page.route(isStorageUpload, async (route) => {
        if (route.request().method() !== 'POST') {
          await route.continue();
          return;
        }
        const file = route.request().postData()?.includes('filename="cover.png"') ? 'cover' : 'avatar';
        sentFiles.push(file);
        if (file === 'cover' && sentFiles.filter((name) => name === file).length === 1) {
          await route.abort('failed');
          return;
        }
        await route.continue();
      });
      const submit = form.getByRole('button', {
        name: mode === '생성' ? '그룹 만들기' : '프로필 저장하기',
        exact: true,
      });
      await submit.click();
      await expect(form.getByRole('alert')).toHaveText(
        mode === '생성'
          ? '사진을 올리지 못했어요. 다시 시도해 주세요.'
          : '파일을 올리지 못했어요. 연결을 확인하고 다시 시도해 주세요.',
      );
      await expect(form.getByRole('textbox', { name: '그룹 이름', exact: true })).toHaveValue(name);
      await expect(form.getByRole('img', { name: '그룹 배경 사진 미리보기' })).toBeVisible();
      expect(sentFiles.filter((file) => file === 'avatar')).toHaveLength(1);
      await submit.click();
      await expect(page).toHaveURL(/\/groups\/(?!new$)[^/]+$/);
      expect(sentFiles.filter((file) => file === 'avatar')).toHaveLength(1);
      expect(sentFiles.filter((file) => file === 'cover')).toHaveLength(2);
      const id = new URL(page.url()).pathname.split('/').at(-1);
      const result = await productRequest<{ group: { avatarUrl: string | null; coverUrl: string | null } }>(
        cookie,
        'query($id:ID!){group(id:$id){avatarUrl coverUrl}}',
        { id },
      );
      expect(result.group.avatarUrl).toBeTruthy();
      expect(result.group.coverUrl).toBeTruthy();
      await page.reload();
      for (const source of [result.group.avatarUrl, result.group.coverUrl]) {
        const photo = page.locator(`img[src="${source}"]`).first();
        await expect(photo).toBeVisible();
        await expect
          .poll(() =>
            photo.evaluate((element) => element instanceof HTMLImageElement && element.naturalWidth > 0),
          )
          .toBe(true);
      }
    },
  );
}
