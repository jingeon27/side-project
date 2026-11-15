import type { BrowserContext, Page } from 'playwright';
import { describe, expect, it, vi } from 'vitest';

import { CounterpushBrowser } from './browser.ts';

describe('restarting a completed concurrent game', () => {
  it('opens the public setup, revalidates the deck and starts Battle instead of a stranded result transition', async () => {
    const calls: string[] = [];
    const page = {
      goto: vi.fn(async () => {
        calls.push('setup');
      }),
      waitForFunction: vi.fn(async () => {
        calls.push('ready');
      }),
      locator: (selector: string) => ({
        click: async () => {
          calls.push(selector);
        },
      }),
    };
    const browser = new CounterpushBrowser({} as BrowserContext, page as unknown as Page);
    vi.spyOn(browser, 'phase').mockResolvedValue('result');
    vi.spyOn(browser, 'assertDecks').mockImplementation(async () => {
      calls.push('deck');
    });
    await browser.startMatch();
    expect(calls).toEqual(['setup', 'ready', 'deck', '#battle']);
  });

  it('does not reset an active game to recover a result transition', async () => {
    const page = { goto: vi.fn() };
    const browser = new CounterpushBrowser({} as BrowserContext, page as unknown as Page);
    vi.spyOn(browser, 'phase').mockResolvedValue('battle');
    await expect(browser.startMatch()).rejects.toThrow('새 매칭');
    expect(page.goto).not.toHaveBeenCalled();
  });
});
