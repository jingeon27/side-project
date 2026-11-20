import { join } from 'node:path';

import dayjs from 'dayjs';
import { chromium, type BrowserContext, type Page } from 'playwright';
import sharp from 'sharp';

import { center, HEIGHT, WIDTH, type Point } from '../../core/geometry.ts';
import type { Profile } from '../../core/profile.ts';
import { RESULT_LABEL } from '../../shared/qualification.ts';
import { HERO_ABILITY_TARGET } from '../perception/hero-ability.ts';

const DECK_FORMS = ['', 'evo', '', '', 'hero', 'evo', '', ''];
const DECK_ART = [
  'BarbLog',
  'FirespiritHut',
  'GoblinHut',
  'Graveyard',
  'IceWizard',
  'Knight',
  'Poison',
  'Skeletons',
];
export type BrowserPhase = 'setup' | 'loading' | 'battle' | 'result' | 'unknown';
export type BrowserResult = { blue: number; red: number; outcome: 'win' | 'loss' | 'draw'; label: string };

export function parseBrowserResult(label: string): BrowserResult | null {
  const match = RESULT_LABEL.exec(label);
  if (!match) return null;
  const blue = Number(match[1]),
    red = Number(match[2]);
  return { blue, red, outcome: blue > red ? 'win' : blue < red ? 'loss' : 'draw', label };
}

export class CounterpushBrowser {
  readonly context: BrowserContext;
  readonly page: Page;
  constructor(context: BrowserContext, page: Page) {
    this.context = context;
    this.page = page;
  }

  static async open(dataDir: string, loginTimeoutMs = 30_000) {
    const context = await chromium.launchPersistentContext(join(dataDir, 'counterpush/chrome'), {
      channel: 'chrome',
      chromiumSandbox: true,
      headless: false,
      args: [
        '--mute-audio',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
      ],
      viewport: { width: 1100, height: 940 },
      deviceScaleFactor: 1,
      timeout: 30_000,
    });
    try {
      const page = context.pages()[0] ?? (await context.newPage());
      for (const extra of context.pages().filter((other) => other !== page)) await extra.close();
      page.setDefaultTimeout(5000);
      page.on('dialog', (dialog) => {
        void dialog.dismiss();
      });
      await page.goto('https://app.playcounterpush.com/play', {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      await page.waitForFunction(
        () => {
          const button = document.querySelector('#battle');
          return button instanceof HTMLButtonElement && !button.disabled;
        },
        {},
        { timeout: loginTimeoutMs },
      );
      const browser = new CounterpushBrowser(context, page);
      if (await page.locator('#leave').isVisible()) await page.locator('#leave').click();
      await browser.assertDecks();
      return browser;
    } catch (error) {
      await context.close();
      throw error;
    }
  }

  async assertDecks() {
    for (const selector of ['#sideMine', '#sideVs']) {
      const deck = await this.page
        .locator(`${selector} img`)
        .evaluateAll((images) => images.map((image) => image.getAttribute('src') ?? ''));
      if (
        deck.length !== 8 ||
        !deck.every((image, index) => {
          const url = new URL(image, 'https://app.playcounterpush.com');
          return (
            url.pathname === `/ui/card/${DECK_ART[index]}` &&
            (url.searchParams.get('form') ?? '') === DECK_FORMS[index]
          );
        })
      )
        throw new Error(
          'Counterpush의 양쪽 덱을 GY GobHut Evo Furnace로 맞춰주세요. 다른 덱으로 매칭하지 않았습니다.',
        );
    }
  }

  async phase(): Promise<BrowserPhase> {
    if (!this.page.url().startsWith('https://app.playcounterpush.com/play'))
      throw new Error('Counterpush 로그인 또는 화면 확인이 필요합니다.');
    if (await this.page.locator('#result').isVisible()) return 'result';
    if (await this.page.locator('#loading').isVisible()) return 'loading';
    if (await this.page.locator('#leaveX').isVisible()) return 'battle';
    if (await this.page.locator('#setup').isVisible()) return 'setup';
    return 'unknown';
  }

  async startMatch() {
    const phase = await this.phase();
    if (phase === 'setup') {
      await this.assertDecks();
      await this.page.locator('#battle').click();
      return;
    }
    // Reloading preserves the result overlay and leaves #battle hidden.
    // Only the visible Play again control starts the next single-tab game.
    if (phase !== 'result') throw new Error(`새 매칭을 시작할 화면이 아닙니다: ${phase}`);
    await this.page.locator('#again').click();
  }

  async capture(fast = false): Promise<{ image: Buffer; capturedAt: number }> {
    const capturedAt = dayjs().valueOf();
    const surface = this.page.locator('#touch');
    const box = fast ? await surface.boundingBox() : null;
    const viewport = this.page.viewportSize();
    const visible =
      box &&
      box.x >= 0 &&
      box.y >= 0 &&
      (!viewport || (box.x + box.width <= viewport.width && box.y + box.height <= viewport.height));
    // Same lossless rendered pixels; a known viewport clip avoids the locator's
    // extra scrolling/stability waits. Fall back if the arena is off screen.
    const bytes = visible
      ? await this.page.screenshot({ type: 'png', clip: box, timeout: 5000 })
      : await surface.screenshot({ type: 'png', timeout: 5000 });
    const image = await sharp(bytes).resize(WIDTH, HEIGHT, { fit: 'fill' }).removeAlpha().png().toBuffer();
    return { image, capturedAt };
  }

  async play(profile: Profile, slot: number, target: Point) {
    if ((await this.phase()) !== 'battle') return false;
    const box = await this.page.locator('#touch').boundingBox();
    if (!box) throw new Error('Counterpush 아레나 위치를 확인하지 못했습니다.');
    const source = center(profile.hand[slot - 1]!);
    const from = { x: box.x + (source.x / WIDTH) * box.width, y: box.y + (source.y / HEIGHT) * box.height };
    const to = { x: box.x + (target.x / WIDTH) * box.width, y: box.y + (target.y / HEIGHT) * box.height };
    await this.page.mouse.move(from.x, from.y);
    await this.page.mouse.down();
    await this.page.waitForTimeout(100);
    await this.page.mouse.move(to.x, to.y, { steps: 8 });
    await this.page.waitForTimeout(100);
    await this.page.mouse.up();
    return true;
  }

  async result(): Promise<BrowserResult | null> {
    if ((await this.phase()) !== 'result') return null;
    return parseBrowserResult((await this.page.locator('#resultScore').getAttribute('aria-label')) ?? '');
  }
  async activateAbility() {
    if ((await this.phase()) !== 'battle') return false;
    const box = await this.page.locator('#touch').boundingBox();
    if (!box) return false;
    await this.page.mouse.click(
      box.x + (HERO_ABILITY_TARGET.x / WIDTH) * box.width,
      box.y + (HERO_ABILITY_TARGET.y / HEIGHT) * box.height,
    );
    return true;
  }
  async screenshot(path: string) {
    await this.page.screenshot({ path });
  }
  async close() {
    await this.context.close();
  }
}
