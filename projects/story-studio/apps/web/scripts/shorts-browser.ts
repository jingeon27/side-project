import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium, type Page } from '@playwright/test';
import { match } from 'ts-pattern';

function isSourceHost(hostname: string) {
  return /(^|\.)(dcinside\.com|dcinside\.co\.kr)$/.test(hostname);
}

function isPublicWeb(url: URL) {
  return (
    url.protocol === 'https:' &&
    !url.username &&
    !url.password &&
    !isSourceHost(url.hostname) &&
    url.hostname.includes('.') &&
    !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname) &&
    !/^[\d.]+$/.test(url.hostname) &&
    !url.hostname.endsWith('.local')
  );
}

async function documentPage(page: Page, input: string) {
  const remote = /^https?:\/\//i.test(input);
  const url = remote ? new URL(input) : pathToFileURL(path.resolve(input));
  if (remote && !isPublicWeb(url))
    throw new Error('외부 캡처는 공개 HTTPS 자료를 지정하세요. 실베 목록은 저장한 HTML로 읽습니다.');
  if (!remote) await readFile(url, { encoding: 'utf8' });
  await page.route('**/*', (route) => {
    const requestUrl = new URL(route.request().url());
    if (remote ? isPublicWeb(requestUrl) : requestUrl.protocol === 'file:') return route.continue();
    return route.abort();
  });
  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
}

async function capture(page: Page, input: string, selector: string, output: string) {
  await documentPage(page, input);
  const selection = selector.startsWith('text=')
    ? page.getByText(selector.slice(5), { exact: true })
    : page.locator(selector);
  const target = selection.filter({ visible: true }).first();
  await target.waitFor({ state: 'visible' });
  await target.scrollIntoViewIfNeeded();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await mkdir(path.dirname(output), { recursive: true });
  if (selector.startsWith('text=')) {
    const clip = await target.evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = range.getBoundingClientRect();
      const x = Math.max(0, Math.floor(rect.left));
      const y = Math.max(0, Math.floor(rect.top));
      return { x, y, width: Math.ceil(rect.right) - x, height: Math.ceil(rect.bottom) - y };
    });
    await page.screenshot({ path: output, type: 'png', clip, animations: 'disabled' });
    return;
  }
  await target.screenshot({ path: output, type: 'png', animations: 'disabled', timeout: 15000 });
}

async function boards(page: Page, input: string, output: string) {
  if (/^https?:/i.test(input)) throw new Error('컷 보드는 로컬 HTML로 지정하세요.');
  await documentPage(page, input);
  const panels = page.locator('[data-shot]');
  const count = await panels.count();
  if (count < 1 || count > 12) throw new Error('보드에는 data-shot 영역을 1~12개 넣으세요.');
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images, (image) => image.decode()));
  });
  await mkdir(output, { recursive: true });
  const reveals: number[][] = [];
  for (const [index, panel] of (await panels.all()).entries()) {
    const box = await panel.boundingBox();
    if (!box || !((box.width === 1080 && box.height === 1920) || (box.width === 960 && box.height === 900)))
      throw new Error('컷 보드는 1080 × 1920 또는 960 × 900 CSS 픽셀로 만드세요.');
    const omitBackground = (await panel.getAttribute('data-transparent')) !== null;
    const marks = panel.locator('[data-from], [data-until]');
    const points = await marks.evaluateAll((nodes) => {
      const times = nodes.flatMap((node) =>
        [node.getAttribute('data-from'), node.getAttribute('data-until')]
          .filter((value) => value !== null)
          .map(Number),
      );
      return Array.from(new Set(times)).sort((a, b) => a - b);
    });
    if (points.length > 16 || points.some((point) => !Number.isFinite(point) || point <= 0 || point >= 1))
      throw new Error('data-from과 data-until에는 컷 내부의 0과 1 사이 시점을 최대 16개 지정하세요.');
    reveals.push(points);
    for (const [stage, time] of [0, ...points].entries()) {
      await marks.evaluateAll((nodes, at) => {
        for (const node of nodes) {
          if (!(node instanceof HTMLElement || node instanceof SVGElement)) continue;
          const from = Number(node.getAttribute('data-from'));
          const until = Number(node.getAttribute('data-until') ?? 1);
          node.style.visibility = from <= at && at < until ? '' : 'hidden';
        }
      }, time);
      const name = stage === points.length ? `${index + 1}.png` : `${index + 1}-${stage}.png`;
      await panel.screenshot({
        path: path.join(output, name),
        animations: 'disabled',
        omitBackground,
      });
    }
  }
  await writeFile(path.join(output, 'reveals.json'), JSON.stringify(reveals));
}

async function leads(page: Page, input: string) {
  // Saved gallery pages are untrusted. Only parse anchors, without executing the document or fetching its media.
  await page.route('**/*', (route) => route.abort());
  const markup = /^https?:/i.test(input)
    ? await readFeed(page, input)
    : await readFile(path.resolve(input), 'utf8');
  const rows = await page.evaluate((source) => {
    const base = 'https://gall.dcinside.com/board/lists/?id=dcbest';
    const feed = /<(rss|feed)(?:\s|>)/i.test(source);
    const doc = new DOMParser().parseFromString(source, feed ? 'application/xml' : 'text/html');
    const items = feed
      ? Array.from(doc.querySelectorAll('item, entry'), (entry) => ({
          href:
            entry.querySelector('link[rel="alternate"], link:not([rel])')?.getAttribute('href') ??
            entry.querySelector('link')?.textContent,
          title: entry.querySelector('title')?.textContent,
        }))
      : Array.from(doc.querySelectorAll('a[href]:not(.reply_numbox)'), (link) => ({
          href: link.getAttribute('href'),
          title: link.textContent,
        }));
    return items
      .flatMap(({ href, title }) => {
        if (!href || !title || !URL.canParse(href, base)) return [];
        const url = new URL(href.trim(), base);
        const mobile = url.hostname === 'm.dcinside.com' && /^\/board\/dcbest\/(\d+)\/?$/.exec(url.pathname);
        const number = mobile
          ? mobile[1]
          : url.hostname === 'gall.dcinside.com' &&
              url.pathname.replace(/\/$/, '') === '/board/view' &&
              url.searchParams.get('id') === 'dcbest'
            ? url.searchParams.get('no')
            : null;
        if (!number || !/^[1-9]\d*$/.test(number) || /^\s*\[?\d+\]?\s*$/.test(title)) return [];
        return [
          {
            title: title.trim().replace(/\s+/g, ' ').slice(0, 180),
            url: 'https://gall.dcinside.com/board/view/?id=dcbest&no=' + number,
          },
        ];
      })
      .filter((row) => row.title);
  }, markup);
  const unique = new Map(rows.map((lead) => [lead.url, lead]));
  process.stdout.write(JSON.stringify(Array.from(unique.values()).slice(0, 60), null, 2) + '\n');
}

async function readFeed(page: Page, input: string) {
  const url = new URL(input);
  if (!isPublicWeb(url)) throw new Error('소유하거나 수집이 허용된 외부 HTTPS 피드를 지정하세요.');
  const response = await page.request.get(url.href, { maxRedirects: 0, timeout: 15000 });
  if (!response.ok()) throw new Error('피드 HTTP ' + response.status() + '. 최종 피드 주소를 확인하세요.');
  const body = await response.text();
  if (Buffer.byteLength(body) > 2_000_000 || !/<(rss|feed)(?:\s|>)/i.test(body))
    throw new Error('2MB 이내의 RSS/Atom 피드가 필요합니다.');
  return body;
}

export async function runBrowser(command: string, args: string[]) {
  const arity = match(command)
    .with('capture', () => 3)
    .with('boards', () => 2)
    .with('leads', () => 1)
    .otherwise(() => 0);
  if (!arity || args.length !== arity)
    throw new Error(
      'capture <주소|HTML> <CSS|text=문구> <출력.png> / boards <HTML> <컷폴더> / leads <저장한 목록|허용된 RSS·Atom URL>',
    );
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1080, height: command === 'boards' ? 1920 : 1100 },
      deviceScaleFactor: command === 'capture' ? 3 : 1,
      serviceWorkers: 'block',
    });
    page.setDefaultTimeout(15000);
    const [input = '', selector = '', output = ''] = args;
    await match(command)
      .with('capture', () => capture(page, input, selector, output))
      .with('boards', () => boards(page, input, selector))
      .with('leads', () => leads(page, input))
      .otherwise(() => {
        throw new Error('지원하지 않는 캡처 명령입니다.');
      });
  } finally {
    await browser.close();
  }
}
