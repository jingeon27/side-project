import { createTestImage } from '@photo-contest/test-kit';

import { seedContest } from './support/photos';
import { expect, seedGroup, test } from './support/test';

test(
  '이전 대회 사진도 서명된 저장소로 전송하고 실패한 초안으로 다시 제출할 수 있어야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }) => {
    const cookie = await signIn('대회 직접 업로드');
    const group = await seedGroup(cookie, '대회 직접 전송', 'PRIVATE');
    const contestId = await seedContest(cookie, group.id, '이전 대회 사진');
    await page.goto(`/contests/${contestId}`);
    await page.getByRole('button', { name: '사진 제출하기', exact: true }).click();
    const form = page.getByRole('dialog', { name: '내 웃긴 순간 제출하기', exact: true });
    await form
      .getByLabel('사진 선택', { exact: true })
      .setInputFiles({ name: 'moment.png', mimeType: 'image/png', buffer: await createTestImage() });
    await form.getByLabel('사진 설명').fill('직접 전송한 대회 사진');
    await form.getByRole('checkbox', { name: /공유할 권리/ }).check();
    const storage = /\/backend\/local-post-uploads\?/;
    await page.route(storage, (route) => route.abort('failed'));
    await form.getByRole('button', { name: '사진 제출하기', exact: true }).click();
    await expect(form.getByRole('alert')).toHaveText(
      '파일을 올리지 못했어요. 연결을 확인하고 다시 시도해 주세요.',
    );
    await expect(form.getByLabel('사진 설명')).toHaveValue('직접 전송한 대회 사진');
    await page.unroute(storage);
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/backend/graphql')) {
        expect(request.headers()['content-type']).toContain('application/json');
        requests.push(request.postData() ?? '');
      }
    });
    await form.getByRole('button', { name: '사진 제출하기', exact: true }).click();
    await expect(form).toHaveCount(0);
    await expect(page.getByText('직접 전송한 대회 사진', { exact: true })).toBeVisible();
    expect(requests.some((body) => body.includes('completeSubmissionUpload'))).toBe(true);
    await page.reload();
    await expect(page.getByText('직접 전송한 대회 사진', { exact: true })).toBeVisible();
  },
);
