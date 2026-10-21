import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeSwitch } from '@/features/theme-switch/ui/theme-switch';
import { labels } from '@/shared/config/labels';

const navigation = vi.hoisted(() => ({ pathname: '/ko/blog/캐시-설계', push: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
}));

beforeEach(() => {
  localStorage.clear();
  document.documentElement.dataset.theme = 'light';
  document.documentElement.style.removeProperty('color-scheme');
  navigation.pathname = '/ko/blog/캐시-설계';
});

describe('language and theme preferences', () => {
  afterEach(() => vi.unstubAllGlobals());

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persists theme choice and updates accessible pressed state', async () => {
    render(<ThemeSwitch locale="en" />);
    const button = screen.getByRole('button', { name: labels('en').nav.theme });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(button);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('blog-theme')).toBe('dark');
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it.each([
    { system: 'light', selected: 'dark' },
    { system: 'dark', selected: 'light' },
  ] as const)(
    'restores the selected $selected theme when locale and route rendering replace root attributes',
    async ({ system, selected }) => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockImplementation((media: string) => ({
          matches: system === 'dark',
          media,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      );
      document.documentElement.dataset.theme = system;
      document.documentElement.style.colorScheme = system;
      navigation.pathname = '/ko/blog';
      const user = userEvent.setup();
      const view = render(<ThemeSwitch locale="ko" />);
      await user.click(screen.getByRole('button', { name: labels('ko').nav.theme }));
      expect(localStorage.getItem('blog-theme')).toBe(selected);

      for (const [locale, pathname] of [
        ['en', '/en/blog'],
        ['en', '/en/about'],
        ['ko', '/ko/about'],
      ] as const) {
        delete document.documentElement.dataset.theme;
        document.documentElement.style.removeProperty('color-scheme');
        navigation.pathname = pathname;
        view.rerender(<ThemeSwitch locale={locale} />);
        expect(document.documentElement).toHaveAttribute('data-theme', selected);
        expect(document.documentElement.style.colorScheme).toBe(selected);
        expect(localStorage.getItem('blog-theme')).toBe(selected);
        expect(screen.getByRole('button', { name: labels(locale).nav.theme })).toHaveAttribute(
          'aria-pressed',
          String(selected === 'dark'),
        );
      }
    },
  );
});
