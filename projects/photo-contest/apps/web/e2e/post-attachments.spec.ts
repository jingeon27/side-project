import { readFile } from 'node:fs/promises';

import { createTestImage, createTestVideo } from '@photo-contest/test-kit';

import { expect, seedGroup, test } from './support/test';

test(
  '저장소 전송 실패를 폼에 표시하고 같은 입력으로 다시 등록할 수 있어야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }) => {
    const cookie = await signIn('업로드 재시도 작성자');
    const group = await seedGroup(cookie, '전송 재시도');
    await page.goto(`/groups/${group.id}`);
    await page.getByRole('button', { name: '글쓰기', exact: true }).click();
    const form = page.getByRole('dialog', { name: '그룹에 글쓰기', exact: true });
    await form.getByLabel('사진·동영상 선택').setInputFiles({
      name: 'retry.png',
      mimeType: 'image/png',
      buffer: await createTestImage(),
    });
    await form.getByLabel('제목', { exact: true }).fill('다시 올리는 순간');
    await form.getByRole('checkbox', { name: /공유할 권리/ }).check();
    const storage = /\/backend\/local-post-uploads\?/;
    await page.route(storage, (route) => route.abort('failed'));
    await form.getByRole('button', { name: '게시물 올리기', exact: true }).click();
    await expect(form.getByRole('alert')).toHaveText(
      '파일을 올리지 못했어요. 연결을 확인하고 다시 시도해 주세요.',
    );
    await expect(form.getByLabel('제목', { exact: true })).toHaveValue('다시 올리는 순간');
    await page.unroute(storage);
    await form.getByRole('button', { name: '게시물 올리기', exact: true }).click();
    await expect(form).toHaveCount(0);
    await expect(
      page
        .getByRole('region', { name: '최신 게시물', exact: true })
        .getByRole('article', { name: '다시 올리는 순간', exact: true }),
    ).toBeVisible();
  },
);

test(
  '유튜브·일반 링크를 파일 없이 게시하고 공개 HTML에서도 읽을 수 있어야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, context, signIn }) => {
    const cookie = await signIn('링크 게시 작성자');
    const group = await seedGroup(cookie, '링크로 나누는 순간');
    const path = `/groups/${group.id}`;
    await page.goto(path);
    for (const [title, link] of [
      ['함께 볼 유튜브', 'https://youtu.be/abcdefghijk'],
      ['읽어볼 링크', 'https://example.com/funny'],
    ]) {
      await page.getByRole('button', { name: '글쓰기', exact: true }).click();
      const form = page.getByRole('dialog', { name: '그룹에 글쓰기', exact: true });
      await form.getByLabel('제목', { exact: true }).fill(title ?? '');
      await form.getByLabel('첨부 링크', { exact: true }).fill(link ?? '');
      await expect(form.getByLabel('사진·동영상 선택')).toHaveAttribute('aria-required', 'false');
      await form.getByRole('checkbox', { name: /공유할 권리/ }).check();
      await form.getByRole('button', { name: '게시물 올리기', exact: true }).click();
      await expect(form).toHaveCount(0);
      await expect(
        page
          .getByRole('region', { name: '최신 게시물', exact: true })
          .getByRole('article', { name: title, exact: true }),
      ).toBeVisible();
    }
    const youtube = page
      .getByRole('region', { name: '최신 게시물', exact: true })
      .getByRole('article', { name: '함께 볼 유튜브', exact: true });
    await expect(youtube.locator('iframe')).toHaveCount(0);
    await expect(youtube.getByRole('link', { name: '유튜브 영상 열기: youtu.be' })).toHaveAttribute(
      'href',
      'https://youtu.be/abcdefghijk',
    );
    await page.route('https://www.youtube-nocookie.com/embed/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html><body>외부 유튜브 플레이어 경계</body></html>',
      }),
    );
    await youtube.getByRole('button', { name: '영상 재생', exact: true }).click();
    await expect(youtube.locator('iframe')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=1',
    );
    await expect(youtube.getByRole('button', { name: /파일 저장/ })).toHaveCount(0);
    const ordinary = page
      .getByRole('region', { name: '최신 게시물', exact: true })
      .getByRole('article', { name: '읽어볼 링크', exact: true });
    await expect(ordinary.getByRole('link', { name: '첨부 링크 열기: example.com' })).toHaveAttribute(
      'rel',
      'noopener noreferrer ugc',
    );
    await context.clearCookies();
    await page.goto(path);
    await expect(
      page
        .getByRole('region', { name: '최신 게시물', exact: true })
        .getByRole('article', { name: '읽어볼 링크', exact: true }),
    ).toBeVisible();
    const html = await (await page.request.get(path, { headers: { 'User-Agent': 'Twitterbot' } })).text();
    const ld = await page.evaluate((source) => {
      const doc = new DOMParser().parseFromString(source, 'text/html');
      return Array.from(doc.querySelectorAll('script[type="application/ld+json"]')).map((script) =>
        JSON.parse(script.textContent ?? '{}'),
      );
    }, html);
    expect(JSON.stringify(ld)).toContain('"citation":"https://example.com/funny"');
    expect(JSON.stringify(ld)).not.toContain('"associatedMedia"');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  },
);

for (const video of [false, true]) {
  test(
    `${video ? '동영상' : '사진'}을 등록하고 한글 이름의 파일로 저장해야 한다`,
    { tag: ['@ios', '@desktop'] },
    async ({ page, signIn }) => {
      const cookie = await signIn('파일 저장 작성자');
      const group = await seedGroup(cookie, '편하게 파일 저장');
      const title = video ? '동영상으로 남긴 순간' : '사진으로 남긴 순간';
      await page.goto(`/groups/${group.id}`);
      await page.getByRole('button', { name: '글쓰기', exact: true }).click();
      const form = page.getByRole('dialog', { name: '그룹에 글쓰기', exact: true });
      await form.getByLabel('사진·동영상 선택').setInputFiles({
        name: video ? 'clip.mp4' : 'photo.png',
        mimeType: video ? 'video/mp4' : 'image/png',
        buffer: video ? await createTestVideo() : await createTestImage(),
      });
      await form.getByLabel('제목', { exact: true }).fill(title);
      await form.getByLabel('첨부 링크', { exact: true }).fill('https://example.com/original');
      await form.getByRole('checkbox', { name: /공유할 권리/ }).check();
      await form.getByRole('button', { name: '게시물 올리기', exact: true }).click();
      await expect(form).toHaveCount(0);
      const article = page
        .getByRole('region', { name: '최신 게시물', exact: true })
        .getByRole('article', { name: title, exact: true });
      const saved = page.waitForEvent('download');
      const metadata = page.waitForResponse((response) => {
        const request = response.request();
        if (!response.url().endsWith('/backend/graphql')) return false;
        if (!request.headers()['content-type']?.includes('application/json')) return false;
        return request.postDataJSON()?.operationName === 'PostDownload';
      });
      await article.getByRole('button', { name: `${title} 파일 저장`, exact: true }).click();
      const download = await saved;
      const expectedFilename = `${title}.${video ? 'mp4' : 'jpg'}`;
      expect((await (await metadata).json()).data.postDownload.filename).toBe(expectedFilename);
      // 서버가 지정한 한글 이름을 확인하고 브라우저/OS의 공백 치환만 허용한다.
      expect(download.suggestedFilename().normalize('NFC').replaceAll('_', ' ')).toBe(expectedFilename);
      const file = await download.path();
      if (!file) throw new Error('저장한 파일이 있어야 한다');
      const bytes = await readFile(file);
      if (video) expect(bytes.subarray(4, 8).toString()).toBe('ftyp');
      if (!video) expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
      await expect(page).toHaveURL(`/groups/${group.id}`);
      await expect(article).toBeVisible();
    },
  );
}
