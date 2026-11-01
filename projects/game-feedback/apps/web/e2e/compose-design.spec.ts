import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import { PostSchema, SessionSchema } from '@game-feedback/contracts';

import { expect, test } from './support/test';

const origin = 'http://127.0.0.1:3301';
const stage = process.env.GF_COMPOSE_AUDIT_STAGE ?? 'after';
const directory = process.env.GF_COMPOSE_AUDIT_DIR;

for (const width of [320, 360, 390, 1440]) {
  test(`composer keeps its controls and publish action reachable at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const login = await page.request.post('/api/auth/test-login', {
      headers: { Origin: origin },
      data: { accountId: 'sample-user-0' },
    });
    expect(login.ok()).toBe(true);
    await page.goto('/ko/write?board=free');
    const form = page.getByRole('form', { name: '글쓰기', exact: true });
    const body = form.getByRole('textbox', { name: '내용', exact: true });
    await expect(body).toBeVisible();
    const toolbar = form.getByRole('toolbar', { name: '내용', exact: true });
    await expect(toolbar).toBeVisible();
    await expect(page.locator('.site-footer:visible, .mobile-nav:visible')).toHaveCount(0);
    for (const button of await toolbar.getByRole('button').all()) {
      const bounds = await button.boundingBox();
      expect(bounds?.width).toBeGreaterThanOrEqual(44);
      expect(bounds?.height).toBeGreaterThanOrEqual(44);
    }
    expect(await toolbar.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const publish = form.getByRole('button', { name: '게시글 등록', exact: true });
    await expect(publish).toBeInViewport({ ratio: 1 });
    await form.getByLabel('제목', { exact: true }).fill('친구들과 연습한 이야기');
    await body.fill('연습하면서 배운 점을 함께 나눕니다.');
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await expect
        .poll(() => page.locator('body').evaluate((node) => getComputedStyle(node).backgroundColor))
        .toBe(theme === 'dark' ? 'rgb(20, 19, 18)' : 'rgb(255, 255, 255)');
      await expect
        .poll(() =>
          toolbar
            .getByRole('button')
            .first()
            .evaluate((node) => getComputedStyle(node).color),
        )
        .toBe(theme === 'dark' ? 'rgb(244, 241, 235)' : 'rgb(16, 16, 16)');
      const screenshot = testInfo.outputPath(`${stage}-${width}-${theme}.png`);
      await page.screenshot({ path: screenshot });
      await testInfo.attach(`${stage}-${width}-${theme}`, { path: screenshot, contentType: 'image/png' });
      if (directory) {
        await page.screenshot({ path: `${directory}/${stage}-${width}-${theme}.png` });
        const metrics = await page.evaluate(() => {
          const canvas = document.createElement('canvas');
          canvas.width = 1;
          canvas.height = 1;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Canvas color conversion unavailable.');
          const rgba = (value: string) => {
            context.clearRect(0, 0, 1, 1);
            context.fillStyle = value;
            context.fillRect(0, 0, 1, 1);
            return Array.from(context.getImageData(0, 0, 1, 1).data);
          };
          const blend = (front: number[], back: number[]) => {
            const alpha = (front[3] ?? 255) / 255;
            return [0, 1, 2]
              .map((index) => (front[index] ?? 0) * alpha + (back[index] ?? 255) * (1 - alpha))
              .concat(255);
          };
          const background = (node: Element | null): number[] => {
            if (!node) return [255, 255, 255, 255];
            const style = getComputedStyle(node);
            return blend(rgba(style.backgroundColor), background(node.parentElement));
          };
          const luminance = (color: number[]) =>
            color
              .slice(0, 3)
              .map((value) => value / 255)
              .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
              .reduce((sum, value, index) => sum + value * ([0.2126, 0.7152, 0.0722][index] ?? 0), 0);
          const visible = (node: Element) => {
            const bounds = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            return (
              bounds.width > 0 &&
              bounds.height > 0 &&
              style.visibility !== 'hidden' &&
              style.display !== 'none'
            );
          };
          const label = (node: Element) =>
            node.getAttribute('aria-label') ||
            node.textContent?.trim().slice(0, 90) ||
            node.getAttribute('placeholder');
          const fields = Array.from(
            document.querySelectorAll('form input:not([hidden]), form select, form [role="textbox"]'),
          )
            .filter(visible)
            .map((node) => ({
              label: label(node),
              id: node.id,
              ariaInvalid: node.getAttribute('aria-invalid'),
              describedBy: node.getAttribute('aria-describedby'),
              labels:
                'labels' in node
                  ? Array.from((node as HTMLInputElement).labels ?? []).map((value) => value.textContent)
                  : [],
            }));
          const colors = Array.from(
            document.querySelectorAll(
              'main label, main small, main [role="alert"], main p, main h1, main h2, form button, form input, form select, form [role="textbox"]',
            ),
          )
            .filter(visible)
            .map((node) => {
              const style = getComputedStyle(node);
              const bg = background(node);
              const fg = blend(rgba(style.color), bg);
              const values = [luminance(fg), luminance(bg)].sort((left, right) => left - right);
              const surrounding = background(node.parentElement);
              const border = blend(rgba(style.borderTopColor), surrounding);
              const borderValues = [luminance(border), luminance(surrounding)].sort(
                (left, right) => left - right,
              );
              return {
                label: label(node),
                color: style.color,
                background: bg,
                contrast: ((values[1] ?? 0) + 0.05) / ((values[0] ?? 0) + 0.05),
                fontSize: style.fontSize,
                fontWeight: style.fontWeight,
                opacity: style.opacity,
                borderColor: style.borderTopColor,
                borderWidth: style.borderTopWidth,
                boundaryContrast: ((borderValues[1] ?? 0) + 0.05) / ((borderValues[0] ?? 0) + 0.05),
              };
            });
          return {
            width: innerWidth,
            height: innerHeight,
            scrollWidth: document.documentElement.scrollWidth,
            theme: document.documentElement.dataset.theme,
            fields,
            colors,
            toolbar: document.querySelector('[role="toolbar"]')?.getBoundingClientRect().toJSON(),
            publish: Array.from(document.querySelectorAll('form button'))
              .find((node) => node.textContent?.includes('게시글 등록'))
              ?.getBoundingClientRect()
              .toJSON(),
          };
        });
        writeFileSync(`${directory}/${stage}-${width}-${theme}.json`, JSON.stringify(metrics, null, 2));
      }
    }
    await page.emulateMedia({ colorScheme: 'light' });
    await form.getByLabel('분류', { exact: true }).selectOption('FEEDBACK');
    const feedbackBody = form.getByRole('textbox', { name: '플레이와 고민', exact: true });
    await expect(feedbackBody).toHaveText('연습하면서 배운 점을 함께 나눕니다.');
    await page.setViewportSize({ width, height: 390 });
    await feedbackBody.focus();
    await expect(form.getByRole('button', { name: '피드백 요청 올리기', exact: true })).toBeInViewport({
      ratio: 1,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await expect
      .poll(() =>
        feedbackBody.evaluate((node) => {
          const selection = window.getSelection();
          const scroll = node.closest('.page-form-scroll')?.getBoundingClientRect();
          if (!selection?.rangeCount || !node.contains(selection.anchorNode) || !scroll) return false;
          const caret = selection.getRangeAt(0).getBoundingClientRect();
          return (
            caret.height > 0 &&
            caret.top >= scroll.top &&
            caret.bottom <= scroll.bottom &&
            caret.left >= 0 &&
            caret.right <= innerWidth
          );
        }),
      )
      .toBe(true);
    if (directory) await page.screenshot({ path: `${directory}/${stage}-${width}-short.png` });
  });
}

test('composer preserves its draft after validation and server failure', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.request.post('/api/auth/test-login', {
    headers: { Origin: origin },
    data: { accountId: 'sample-user-0' },
  });
  await page.goto('/ko/write?board=free');
  const form = page.getByRole('form', { name: '글쓰기', exact: true });
  const title = form.getByLabel('제목', { exact: true });
  const body = form.getByRole('textbox', { name: '내용', exact: true });
  await expect(body).toBeVisible();
  await title.fill('서버 실패에도 남겨둘 초안');
  await form.getByRole('button', { name: '게시글 등록', exact: true }).click();
  await expect(form.getByText('내용을 입력해주세요.', { exact: true })).toBeVisible();
  await expect(body).toHaveAttribute('aria-invalid', 'true');
  await expect(body).toBeFocused();
  expect(
    await body.evaluate((node) =>
      (node.getAttribute('aria-describedby') ?? '')
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent)
        .join(' '),
    ),
  ).toContain('내용을 입력해주세요.');
  expect(
    await body.evaluate((node) =>
      (node.getAttribute('aria-describedby') ?? '')
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent)
        .join(' '),
    ),
  ).toContain('게임 이야기나 나누고 싶은 내용을 자유롭게 적어주세요.');
  if (directory)
    writeFileSync(
      `${directory}/${stage}-errors.json`,
      JSON.stringify(
        await form.locator('input, select, [role="textbox"]').evaluateAll((nodes) =>
          nodes.map((node) => ({
            id: node.id,
            label: node.getAttribute('aria-label'),
            invalid: node.getAttribute('aria-invalid'),
            describedBy: node.getAttribute('aria-describedby'),
            labels:
              'labels' in node
                ? Array.from((node as HTMLInputElement).labels ?? []).map((label) => label.textContent)
                : [],
          })),
        ),
        null,
        2,
      ),
    );
  await body.fill('등록 실패 뒤에도 본문을 보존합니다.');
  await expect(body).toHaveAttribute('aria-invalid', 'false');
  await title.fill('짧음');
  await form.getByRole('button', { name: '게시글 등록', exact: true }).click();
  await expect(title).toHaveAttribute('aria-invalid', 'true');
  await expect(title).toBeFocused();
  expect(
    await title.evaluate((node) =>
      (node.getAttribute('aria-describedby') ?? '')
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent)
        .join(' '),
    ),
  ).toContain('제목을 4~30자로 입력해 주세요.');
  await title.fill('서버 실패에도 남겨둘 초안');
  await page.route('**/api/posts', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'TEST_FAILURE', message: '테스트 등록 실패' }),
    });
  });
  await form.getByRole('button', { name: '게시글 등록', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('테스트 등록 실패');
  await expect(title).toHaveValue('서버 실패에도 남겨둘 초안');
  await expect(body).toHaveText('등록 실패 뒤에도 본문을 보존합니다.');
  await page.unrouteAll({ behavior: 'wait' });
  await title.focus();
  const focusSequence = [];
  for (const index of Array.from({ length: 18 }, (_, value) => value)) {
    await page.keyboard.press('Tab');
    focusSequence.push(
      await page.evaluate((step) => {
        const node = document.activeElement;
        if (!node) return { step };
        const style = getComputedStyle(node);
        return {
          step,
          role: node.getAttribute('role'),
          name: node.getAttribute('aria-label') || node.textContent?.trim().slice(0, 40),
          tag: node.tagName,
          focusVisible: node.matches(':focus-visible'),
          outline: style.outline,
          shadow: style.boxShadow,
        };
      }, index),
    );
  }
  if (directory) writeFileSync(`${directory}/${stage}-focus.json`, JSON.stringify(focusSequence, null, 2));
});

for (const width of [320, 390, 1440]) {
  test(`floating compose entry stays reachable during scroll, focus and dialogs at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/ko');
    const entry = page.getByRole('button', { name: '글쓰기', exact: true });
    await expect(entry).toHaveCount(1);
    await expect(entry).toBeInViewport({ ratio: 1 });
    const initial = await entry.boundingBox();
    expect(initial?.width).toBeGreaterThan(100);
    expect(initial?.height).toBeGreaterThanOrEqual(44);
    const nav = page.locator('.mobile-nav:visible');
    if (width <= 760) {
      const navigation = await nav.boundingBox();
      expect((initial?.y ?? 0) + (initial?.height ?? 0)).toBeLessThanOrEqual(navigation?.y ?? 0);
    }
    for (const distance of [60, 60, 60, 60, 60, 60, 60, 60]) await page.mouse.wheel(0, distance);
    await expect(entry).toHaveAttribute('data-scrolling', 'true');
    await expect.poll(async () => (await entry.boundingBox())?.width).toBeLessThan(70);
    await expect(entry).not.toHaveAttribute('data-scrolling', 'true');
    await expect.poll(async () => (await entry.boundingBox())?.width).toBeGreaterThan(100);
    await entry.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(entry).toBeFocused();
    expect(await entry.evaluate((node) => node.matches(':focus-visible'))).toBe(true);
    for (const distance of [50, 50, 50, 50]) await page.mouse.wheel(0, distance);
    await expect(entry).toHaveAttribute('data-scrolling', 'true');
    expect((await entry.boundingBox())?.width).toBeGreaterThan(100);
    await page.keyboard.press('Tab');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(
      await entry.evaluate((node) =>
        Math.max(
          ...[node, ...node.querySelectorAll('*')].flatMap((element) =>
            getComputedStyle(element).transitionDuration.split(',').map(parseFloat),
          ),
        ),
      ),
    ).toBeLessThanOrEqual(0.01);
    for (const distance of [50, 50, 50, 50]) await page.mouse.wheel(0, distance);
    await expect(entry).toHaveAttribute('data-scrolling', 'true');
    expect((await entry.boundingBox())?.width).toBeLessThan(70);
    await expect(entry).not.toHaveAttribute('data-scrolling', 'true');
    await expect.poll(async () => (await entry.boundingBox())?.width).toBeGreaterThan(100);
    const footerContact = page.getByRole('link', { name: '문의', exact: true });
    await footerContact.scrollIntoViewIfNeeded();
    await expect(footerContact).toBeInViewport({ ratio: 1 });
    await expect(entry).not.toHaveAttribute('data-scrolling', 'true');
    await expect(entry).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('banner')).toBeInViewport({ ratio: 1 });
    await expect
      .poll(async () => {
        await footerContact.scrollIntoViewIfNeeded();
        await expect(entry).not.toHaveAttribute('data-scrolling', 'true');
        await expect.poll(async () => (await entry.boundingBox())?.width).toBeGreaterThan(100);
        return footerContact.evaluate(async (contact) => {
          const frame = () =>
            new Promise<string>((resolve) => {
              requestAnimationFrame(() => {
                const button = document.querySelector('.floating-compose-button')?.getBoundingClientRect();
                const footer = document.querySelector('.site-footer')?.getBoundingClientRect();
                resolve(JSON.stringify({ scrollY, button, footer }));
              });
            });
          const first = await frame();
          const second = await frame();
          const third = await frame();
          const bounds = contact.getBoundingClientRect();
          return (
            first === second &&
            second === third &&
            bounds.top >= 0 &&
            bounds.bottom <= innerHeight &&
            bounds.left >= 0 &&
            bounds.right <= innerWidth
          );
        });
      })
      .toBe(true);
    await expect(footerContact).toBeInViewport({ ratio: 1 });
    expect(
      await footerContact.evaluate((contact) => {
        const bounds = contact.getBoundingClientRect();
        const target = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        return target !== null && contact.contains(target);
      }),
    ).toBe(true);
    const collision = await page.evaluate(() => {
      const button = document.querySelector('.floating-compose-button')?.getBoundingClientRect();
      if (!button) return true;
      return Array.from(document.querySelectorAll('.site-footer a')).some((node) => {
        const box = node.getBoundingClientRect();
        return (
          box.width > 0 &&
          box.height > 0 &&
          box.left < button.right &&
          box.right > button.left &&
          box.top < button.bottom &&
          box.bottom > button.top
        );
      });
    });
    expect(collision).toBe(false);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    await expect(footerContact).toBeInViewport({ ratio: 1 });
    const screenshot = testInfo.outputPath(`${stage}-entry-${width}.png`);
    await page.screenshot({ path: screenshot });
    await testInfo.attach(`${stage}-entry-${width}`, { path: screenshot, contentType: 'image/png' });
    if (directory) await page.screenshot({ path: `${directory}/${stage}-entry-${width}.png` });
    await entry.click();
    const login = page.getByRole('dialog', { name: '로그인이 필요해요', exact: true });
    await expect(login).toBeVisible();
    await expect(entry).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(login).toHaveCount(0);
    await expect(entry).toBeVisible();
  });
}

test('editor toolbar uses one tab stop and restores the editing selection after a formatting menu', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 844 });
  await page.request.post('/api/auth/test-login', {
    headers: { Origin: origin },
    data: { accountId: 'sample-user-0' },
  });
  await page.goto('/ko/write?board=free');
  const form = page.getByRole('form', { name: '글쓰기', exact: true });
  const body = form.getByRole('textbox', { name: '내용', exact: true });
  const toolbar = form.getByRole('toolbar', { name: '내용', exact: true });
  await expect(body).toBeVisible();
  await body.fill('목록으로 바꿀 한글 문장');
  await body.press('ControlOrMeta+a');
  const bold = toolbar.getByRole('button', { name: '굵게', exact: true });
  const more = toolbar.getByRole('button', { name: '서식 더보기', exact: true });
  expect(
    await toolbar
      .getByRole('button')
      .evaluateAll((nodes) => nodes.filter((node) => (node as HTMLButtonElement).tabIndex === 0).length),
  ).toBe(1);
  await bold.focus();
  await page.keyboard.press('ArrowRight');
  await expect(toolbar.getByRole('button', { name: '기울임', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(bold).toBeFocused();
  await page.keyboard.press('End');
  await expect(more).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.getByRole('menuitem', { name: '번호 목록', exact: true }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(body).toBeFocused();
  await expect(body.locator('ol li')).toHaveText('목록으로 바꿀 한글 문장');
  await more.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(more).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(body).toBeFocused();
});

test.describe('touch compose entry', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 360, height: 844 } });

  test('a synthesized touch scroll leaves compose available and touch activation opens login', async ({
    page,
  }) => {
    await page.goto('/ko');
    const entry = page.getByRole('button', { name: '글쓰기', exact: true });
    await expect(entry).toBeInViewport({ ratio: 1 });
    const session = await page.context().newCDPSession(page);
    try {
      await session.send('Input.synthesizeScrollGesture', {
        x: 180,
        y: 600,
        yDistance: -400,
        speed: 500,
        gestureSourceType: 'touch',
      });
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
      await expect(entry).not.toHaveAttribute('data-scrolling', 'true');
      await expect(entry).toBeInViewport({ ratio: 1 });
      await expect.poll(async () => (await entry.boundingBox())?.width).toBeGreaterThan(100);
      const bounds = await entry.boundingBox();
      if (!bounds) throw new Error('Compose target must have visible bounds.');
      await page.touchscreen.tap(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await expect(page.getByRole('dialog', { name: '로그인이 필요해요', exact: true })).toBeVisible();
      await expect(entry).toBeHidden();
    } finally {
      await session.detach();
    }
  });
});

for (const width of [360, 1440]) {
  test(`profile and settings never offer compose for populated or empty accounts at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.request.post('/api/auth/test-login', {
      headers: { Origin: origin },
      data: { accountId: 'sample-user-0' },
    });
    await page.goto('/ko/settings');
    const authored = page.getByRole('region', { name: '내가 작성한 글', exact: true });
    await expect(authored.getByRole('article').first()).toBeVisible();
    await expect(page.getByRole('button', { name: '글쓰기', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: '글쓰기', exact: true })).toHaveCount(0);
    await expect(page.locator('.floating-compose-button')).toHaveCount(0);
    await page.getByRole('link', { name: '공개 프로필 보기 →', exact: true }).click();
    await expect(page.getByRole('heading', { name: '새벽의호그', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: '글쓰기', exact: true })).toHaveCount(0);
    await expect(page.locator('.floating-compose-button')).toHaveCount(0);
    const nickname = `빈목록${randomUUID().slice(0, 8)}`;
    const demo = await page.request.post('/api/auth/demo', {
      headers: { Origin: origin },
      data: { nickname },
    });
    expect(demo.ok()).toBe(true);
    const session = SessionSchema.parse(await demo.json());
    expect(session.user?.nickname).toBe(nickname);
    await page.goto('/ko/settings');
    await expect(page.getByText('아직 작성한 글이 없어요.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '글쓰기', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: '글쓰기', exact: true })).toHaveCount(0);
    await expect(page.locator('.floating-compose-button')).toHaveCount(0);
    await page.getByRole('link', { name: '공개 프로필 보기 →', exact: true }).click();
    await expect(page.getByRole('heading', { name: nickname, level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: '글쓰기', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: '글쓰기', exact: true })).toHaveCount(0);
    await expect(page.locator('.floating-compose-button')).toHaveCount(0);
  });
}

test('create keeps its game hidden and submits Clash Royale without a game selection', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 844 });
  await page.request.post('/api/auth/test-login', {
    headers: { Origin: origin },
    data: { accountId: 'sample-user-0' },
  });
  await page.goto('/ko/write?board=free');
  const form = page.getByRole('form', { name: '글쓰기', exact: true });
  const body = form.getByRole('textbox', { name: '내용', exact: true });
  await expect(body).toBeVisible();
  await expect(form.getByRole('combobox', { name: '게임', exact: true })).toHaveCount(0);
  await expect(form.getByRole('textbox', { name: '선택한 게임', exact: true })).toHaveCount(0);
  await expect(form.locator('input[type="hidden"][name="categoryId"]')).toHaveValue('clash-royale');
  await form.getByLabel('제목', { exact: true }).fill(`기본 게임 등록 ${randomUUID().slice(0, 8)}`);
  await body.fill('게임을 고르지 않고 클래시로얄 이야기를 등록합니다.');
  const creation = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/posts' && response.request().method() === 'POST',
  );
  await form.getByRole('button', { name: '게시글 등록', exact: true }).click();
  const response = await creation;
  expect(response.ok()).toBe(true);
  expect(response.request().postDataJSON().categoryId).toBe('clash-royale');
  const post = PostSchema.parse(await response.json());
  expect(post.category.slug).toBe('clash-royale');
  await expect(page).toHaveURL((url) => url.pathname === `/ko/posts/${post.id}`);
});

test('coaching radio groups support keyboard selection and preserve the amount across pricing changes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 844 });
  await page.request.post('/api/auth/test-login', {
    headers: { Origin: origin },
    data: { accountId: 'sample-user-0' },
  });
  await page.goto('/ko/write?board=coaching');
  const form = page.getByRole('form', { name: '글쓰기', exact: true });
  const role = form.getByRole('group', { name: '모집 유형', exact: true });
  const pricing = form.getByRole('group', { name: '수강료 기준', exact: true });
  const coach = role.getByRole('radio', { name: '수강생 모집', exact: true });
  const student = role.getByRole('radio', { name: '코치 구함', exact: true });
  await expect(coach).toBeChecked();
  await coach.focus();
  await page.keyboard.press('ArrowRight');
  await expect(student).toBeChecked();
  await expect(student).toBeFocused();
  const hourly = pricing.getByRole('radio', { name: '시간당', exact: true });
  const monthly = pricing.getByRole('radio', { name: '기간 단위', exact: true });
  const goal = pricing.getByRole('radio', { name: '목표 달성까지', exact: true });
  const amount = form.getByRole('spinbutton');
  await amount.fill('35000');
  await hourly.focus();
  await page.keyboard.press('ArrowRight');
  await expect(monthly).toBeChecked();
  await expect(amount).toHaveValue('35000');
  await page.keyboard.press('ArrowRight');
  await expect(goal).toBeChecked();
  await form.getByLabel('목표 점수', { exact: true }).fill('9000');
  await goal.focus();
  await page.keyboard.press('ArrowRight');
  await expect(hourly).toBeChecked();
  await expect(form.getByLabel('목표 점수', { exact: true })).toHaveCount(0);
  await expect(amount).toHaveValue('35000');
  await goal.focus();
  await page.keyboard.press('Space');
  await expect(goal).toBeChecked();
  await expect(form.getByLabel('목표 점수', { exact: true })).toHaveValue('');
  await expect(amount).toHaveValue('35000');
  for (const radio of await form.getByRole('radio').all()) {
    const bounds = await radio.evaluate((node) => node.closest('label')?.getBoundingClientRect().toJSON());
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
  }
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  for (const group of [role, pricing])
    expect(await group.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
});
