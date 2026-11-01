import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { chromium, expect, type Browser, type BrowserContext } from '@playwright/test';
import { z } from 'zod';

const { values } = parseArgs({
  options: {
    'game-feedback-url': { type: 'string' },
    'photo-contest-url': { type: 'string' },
    'photo-contest-state': { type: 'string' },
    'photo-contest-search': { type: 'string', default: '' },
    'captured-on': { type: 'string' },
    'output-dir': { type: 'string' },
    'reuse-photo-capture': { type: 'boolean', default: false },
    'reuse-game-captures': { type: 'boolean', default: false },
  },
});
const options = z
  .object({
    'game-feedback-url': z.url(),
    'photo-contest-url': z.url(),
    'photo-contest-state': z.string().min(1).optional(),
    'photo-contest-search': z.string().max(40),
    'captured-on': z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    'output-dir': z.string().min(1),
    'reuse-photo-capture': z.boolean(),
    'reuse-game-captures': z.boolean(),
  })
  .refine((input) => input['reuse-photo-capture'] || input['photo-contest-state'], {
    message: 'A local storage state is required when capturing Pisik again.',
    path: ['photo-contest-state'],
  })
  .parse(values);

function testOrigin(value: string, allowedPorts: readonly string[]) {
  const url = new URL(value);
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    !allowedPorts.includes(url.port) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('Product captures require an explicitly isolated loopback test server.');
  return url.origin;
}

const gameOrigin = testOrigin(options['game-feedback-url'], ['3301']);
const photoOrigin = testOrigin(options['photo-contest-url'], ['3320']);
const output = path.resolve(options['output-dir']);
const capturedOn = options['captured-on'];
const viewport = { width: 390, height: 844 };
const compositionCopy = {
  ko: {
    titles: { services: '직접 실행하며 살펴본 화면', profiles: '공개 프로필과 수정 페이지' },
    labels: {
      services: ['Game Mate 피드', '피식 그룹 탐색'],
      profiles: ['Game Mate 공개 프로필', '프로필 수정 페이지'],
    },
    lead: '격리된 테스트 계정으로 실행한 실제 서비스 화면',
    notes: {
      services: '사진과 계정 정보는 화면 확인을 위해 준비한 테스트 데이터입니다.',
      profiles: '사진과 계정 정보는 화면 확인을 위해 준비한 테스트 데이터입니다.',
    },
  },
  en: {
    titles: { services: 'Trying the two services', profiles: 'Public profile and editing' },
    labels: {
      services: ['Game Mate feed', 'Pisik group discovery (Korean)'],
      profiles: ['Game Mate public profile', 'Edit profile'],
    },
    lead: 'Actual service screens from isolated test accounts',
    notes: {
      services: 'Test data and a fake game-profile provider. Pisik is shown in Korean.',
      profiles: 'Test account and a fake game-profile provider. Unmodified product screenshots.',
    },
  },
} satisfies Record<
  'ko' | 'en',
  {
    titles: Record<'services' | 'profiles', string>;
    labels: Record<'services' | 'profiles', string[]>;
    lead: string;
    notes: Record<'services' | 'profiles', string>;
  }
>;
await mkdir(output, { recursive: true });

async function digest(file: string) {
  return createHash('sha256')
    .update(await readFile(file))
    .digest('hex');
}

function matchesRoute(actual: string, expected: string) {
  const url = new URL(actual);
  const route = new URL(expected, url.origin);
  return url.pathname === route.pathname && url.search === route.search;
}

async function capture(
  context: BrowserContext,
  route: string,
  file: string,
  ready: readonly string[],
  readyButtons: readonly string[] = [],
) {
  const page = await context.newPage();
  try {
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    if (!response?.ok()) throw new Error(`Product route failed: ${route}`);
    if (!matchesRoute(page.url(), route)) throw new Error(`Product route redirected: ${route}`);
    for (const selector of ready) await page.locator(selector).first().waitFor({ state: 'visible' });
    for (const name of readyButtons)
      await expect(page.getByRole('button', { name, exact: true })).toBeEnabled({ timeout: 30_000 });
    if (route === '/ko' || route === '/en') {
      await page.getByRole('heading', { name: route === '/ko' ? '전체' : 'All', exact: true }).waitFor();
      await expect(page.locator('.game-board-navigation:visible')).toHaveCSS('opacity', '1');
    }
    await page.keyboard.press('Home');
    await page.waitForFunction(() => window.scrollY === 0);
    await page.evaluate(async () => document.fonts.ready);
    await page.waitForFunction(() =>
      [...document.images].every((image) => {
        const bounds = image.getBoundingClientRect();
        if (bounds.bottom <= 0 || bounds.top >= window.innerHeight || bounds.width === 0) return true;
        return image.complete && image.naturalWidth > 0;
      }),
    );
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );
    if (!matchesRoute(page.url(), route)) throw new Error(`Product route redirected: ${route}`);
    const readiness = await Promise.all(
      readyButtons.map(async (name) => {
        const button = page.getByRole('button', { name, exact: true });
        await expect(button).toBeEnabled();
        return button.evaluate((element: HTMLButtonElement) => ({
          label: element.textContent?.trim(),
          nativeDisabled: element.disabled,
          ariaDisabled: element.getAttribute('aria-disabled'),
          dataDisabled: element.getAttribute('data-disabled'),
          opacity: getComputedStyle(element).opacity,
        }));
      }),
    );
    const target = path.join(output, file);
    await page.screenshot({ path: target });
    console.log(`Captured ${file}.`);
    return { file, route, sha256: await digest(target), readiness };
  } finally {
    await page.close();
  }
}

async function captureGame(browser: Browser, locale: 'ko' | 'en') {
  if (options['reuse-game-captures']) {
    const screen = z.object({ file: z.string(), route: z.string(), sha256: z.string() });
    const previous = z
      .object({
        capturedOn: z.literal(capturedOn),
        game: z.array(
          z.object({ locale: z.enum(['ko', 'en']), feed: screen, profile: screen, edit: screen }),
        ),
      })
      .parse(JSON.parse(await readFile(path.join(output, 'capture-result.json'), 'utf8')));
    const game = previous.game.find((entry) => entry.locale === locale);
    if (!game) throw new Error('Previously captured Game Mate screens are missing.');
    for (const image of [game.feed, game.profile, game.edit])
      if ((await digest(path.join(output, image.file))) !== image.sha256)
        throw new Error('A previously captured Game Mate screen changed.');
    return game;
  }
  const context = await browser.newContext({
    baseURL: gameOrigin,
    viewport,
    deviceScaleFactor: 2,
    locale: locale === 'ko' ? 'ko-KR' : 'en-US',
    timezoneId: 'Asia/Seoul',
    colorScheme: 'dark',
  });
  try {
    const login = await context.request.post('/api/auth/test-login', {
      headers: { Origin: gameOrigin },
      data: { accountId: 'sample-user-0' },
    });
    if (!login.ok()) throw new Error('The isolated Game Mate fixture login failed.');
    const feed = await capture(
      context,
      `/${locale}`,
      `game-feed-${locale}.png`,
      ['.game-board-chips:visible [aria-current="page"]', 'article:visible'],
      [locale === 'ko' ? '글쓰기' : 'Write a post'],
    );
    const profile = await capture(context, `/${locale}/users/sample-user-0`, `game-profile-${locale}.png`, [
      '.profile-identity-text:visible',
    ]);
    const edit = await capture(context, `/${locale}/settings/profile`, `game-edit-${locale}.png`, [
      'form:visible',
    ]);
    return { locale, feed, profile, edit };
  } finally {
    await context.close();
  }
}

async function capturePhoto(browser: Browser) {
  if (options['reuse-photo-capture']) {
    const previous = z
      .object({
        capturedOn: z.literal(capturedOn),
        photo: z.object({
          file: z.string(),
          route: z.string().startsWith('/explore'),
          sha256: z.string(),
          readiness: z.array(
            z.object({
              label: z.string().optional(),
              nativeDisabled: z.literal(false),
              ariaDisabled: z.null(),
              dataDisabled: z.null(),
              opacity: z.literal('1'),
            }),
          ),
        }),
      })
      .parse(JSON.parse(await readFile(path.join(output, 'capture-result.json'), 'utf8')));
    if ((await digest(path.join(output, previous.photo.file))) !== previous.photo.sha256)
      throw new Error('The previously captured Pisik screen changed.');
    return previous.photo;
  }
  const context = await browser.newContext({
    baseURL: photoOrigin,
    storageState: options['photo-contest-state'],
    viewport,
    deviceScaleFactor: 2,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    colorScheme: 'dark',
  });
  try {
    const search = options['photo-contest-search'];
    const route = search ? `/explore?${new URLSearchParams({ q: search })}` : '/explore';
    return await capture(
      context,
      route,
      'pisik-explore-ko.png',
      ['a[href^="/groups/"]:visible'],
      ['검색', '그룹 만들기'],
    );
  } finally {
    await context.close();
  }
}

async function compose(
  browser: Browser,
  locale: 'ko' | 'en',
  kind: 'services' | 'profiles',
  left: string,
  right: string,
) {
  const copy = compositionCopy[locale];
  const title = copy.titles[kind];
  const labels = copy.labels[kind];
  const images = await Promise.all([left, right].map((file) => readFile(path.join(output, file))));
  const html = `<!doctype html><html lang="${locale}"><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;background:#f6f5f1;color:#22231f;font-family:Arial,system-ui,sans-serif}
    main{width:952px;height:1139px;padding:46px 56px 30px}h1{font-size:32px;line-height:1.35;margin:0 0 16px;font-weight:750}
    .lead{color:#62685e;font-size:18px;line-height:1.5;margin:0 0 30px}.screens{display:grid;grid-template-columns:390px 390px;gap:60px}
    h2{font-size:20px;line-height:28px;margin:0 0 16px;font-weight:700;white-space:nowrap}.screen{width:390px;height:844px;overflow:hidden;border-radius:24px;background:#151515}
    img{display:block;width:390px;height:844px}.note{font-size:15px;line-height:1.5;color:#62685e;margin:25px 0 0}
    </style><main><h1>${title}</h1><p class="lead">${copy.lead}</p><div class="screens">${images.map((bytes, index) => `<section><h2>${labels[index]}</h2><div class="screen"><img src="data:image/png;base64,${bytes.toString('base64')}" alt=""></div></section>`).join('')}</div><p class="note">${copy.notes[kind]}</p></main></html>`;
  const file = `${kind}-${capturedOn}-${locale}.png`;
  await writeFile(path.join(output, `${kind}-${capturedOn}-${locale}.html`), html);
  const page = await browser.newPage({ viewport: { width: 952, height: 1139 }, deviceScaleFactor: 1 });
  try {
    await page.setContent(html);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((image) => image.decode()));
    });
    await page.screenshot({ path: path.join(output, file) });
    return { file, sha256: await digest(path.join(output, file)), width: 952, height: 1139 };
  } finally {
    await page.close();
  }
}

const browser = await chromium.launch({ headless: true });
try {
  const ko = await captureGame(browser, 'ko');
  const en = await captureGame(browser, 'en');
  const photo = await capturePhoto(browser);
  const compositions = await Promise.all(
    [ko, en].flatMap((game) => [
      compose(browser, game.locale, 'services', game.feed.file, photo.file),
      compose(browser, game.locale, 'profiles', game.profile.file, game.edit.file),
    ]),
  );
  await writeFile(
    path.join(output, 'capture-result.json'),
    JSON.stringify({ capturedOn, viewport, game: [ko, en], photo, compositions }, null, 2) + '\n',
  );
  console.log('Prepared seven verified product screenshots and four HTML/CSS compositions.');
} finally {
  await browser.close();
}
