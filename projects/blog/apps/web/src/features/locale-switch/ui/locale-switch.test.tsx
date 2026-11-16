import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocaleSwitch } from '@/features/locale-switch/ui/locale-switch';
import type { Article } from '@/shared/article/model/types';
import { labels } from '@/shared/config/labels';
import { trackEvent } from '@/shared/lib/analytics/events';

const navigation = vi.hoisted(() => ({ pathname: '/ko/blog/캐시-설계', push: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
}));
vi.mock('@/shared/lib/analytics/events', () => ({ trackEvent: vi.fn() }));

const article: Article = {
  id: 'cache',
  locale: 'ko',
  title: '캐시 설계',
  slug: '캐시-설계',
  description: '서버와 클라이언트 캐시를 분리한 과정',
  keywords: ['cache'],
  category: 'engineering',
  tags: ['nextjs'],
  publishedAt: '2026-10-01',
  readingMinutes: 4,
  toc: [],
  translations: { ko: '캐시-설계' },
};

beforeEach(() => {
  window.history.replaceState(null, '', '/ko/blog/캐시-설계');
  localStorage.clear();
  document.documentElement.dataset.theme = 'light';
  document.documentElement.style.removeProperty('color-scheme');
  navigation.pathname = '/ko/blog/캐시-설계';
});

describe('language and theme preferences', () => {
  afterEach(vi.unstubAllGlobals);

  it('keeps an untranslated article in place and offers the target language index', async () => {
    render(<LocaleSwitch locale="ko" translations={{ [article.slug]: article.translations }} />);
    await userEvent.click(screen.getByRole('button', { name: /언어 변경/ }));
    expect(screen.getByRole('status')).toHaveTextContent(labels('ko').common.translationMissing);
    expect(navigation.push).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: labels('ko').common.translationList })).toHaveAttribute(
      'href',
      '/en/blog',
    );
  });

  it('uses the actual translated slug for a published translation', async () => {
    render(
      <LocaleSwitch
        locale="ko"
        translations={{ [article.slug]: { ko: article.slug, en: 'designing-cache' } }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /언어 변경/ }));
    expect(navigation.push).toHaveBeenCalledWith('/en/blog/designing-cache');
  });

  it('preserves URL state and leaves the missing-translation link navigation to Link', async () => {
    window.history.replaceState(null, '', '/ko/blog/캐시-설계?q=cache&ref=mail&ref=nav#cache');
    render(<LocaleSwitch locale="ko" translations={{ [article.slug]: article.translations }} />);
    await userEvent.click(screen.getByRole('button', { name: /언어 변경/ }));
    const link = screen.getByRole('link', { name: labels('ko').common.translationList });
    expect(link).toHaveAttribute('href', '/en/blog?q=cache&ref=mail&ref=nav#cache');
    const defaultPrevented = vi.fn();
    document.addEventListener(
      'click',
      (event) => {
        defaultPrevented(event.defaultPrevented);
        // Without an App Router context, Link leaves navigation to the browser.
        event.preventDefault();
      },
      { once: true },
    );
    fireEvent.click(link);
    expect(defaultPrevented).toHaveBeenCalledExactlyOnceWith(false);
    expect(navigation.push).not.toHaveBeenCalled();
    expect(trackEvent).toHaveBeenCalledExactlyOnceWith('language_changed', {
      from_locale: 'ko',
      to_locale: 'en',
    });
  });

  it.each(['ctrlKey', 'metaKey'] as const)(
    'tracks a missing-translation link %s click once while retaining native navigation',
    async (modifier) => {
      window.history.replaceState(null, '', '/ko/blog/캐시-설계?q=cache&ref=mail&ref=nav#cache');
      render(<LocaleSwitch locale="ko" translations={{ [article.slug]: article.translations }} />);
      await userEvent.click(screen.getByRole('button', { name: /언어 변경/ }));
      const link = screen.getByRole('link', { name: labels('ko').common.translationList });
      expect(link).toHaveAttribute('href', '/en/blog?q=cache&ref=mail&ref=nav#cache');
      const defaultPrevented = vi.fn();
      document.addEventListener(
        'click',
        (event) => {
          defaultPrevented(event.defaultPrevented);
          // Observe React/Next's decision before stopping jsdom's unsupported document navigation.
          event.preventDefault();
        },
        { once: true },
      );
      fireEvent.click(link, {
        [modifier]: true,
      });
      expect(defaultPrevented).toHaveBeenCalledExactlyOnceWith(false);
      expect(navigation.push).not.toHaveBeenCalled();
      expect(trackEvent).toHaveBeenCalledExactlyOnceWith('language_changed', {
        from_locale: 'ko',
        to_locale: 'en',
      });
    },
  );

  it('preserves search filters, repeated parameters and hash while changing the list language', async () => {
    navigation.pathname = '/ko/blog';
    window.history.replaceState(
      null,
      '',
      '/ko/blog?q=React%20Query&category=engineering&ref=mail&ref=nav#archive',
    );
    render(<LocaleSwitch locale="ko" />);
    await userEvent.click(screen.getByRole('button', { name: /언어 변경/ }));
    expect(navigation.push).toHaveBeenCalledWith(
      '/en/blog?q=React%20Query&category=engineering&ref=mail&ref=nav#archive',
    );
    expect(trackEvent).toHaveBeenCalledExactlyOnceWith('language_changed', {
      from_locale: 'ko',
      to_locale: 'en',
    });
  });

  it('retains the remaining URL when a translated article uses a different slug', async () => {
    window.history.replaceState(null, '', '/ko/blog/캐시-설계?ref=mail#cache');
    render(<LocaleSwitch locale="ko" translations={{ [article.slug]: { en: 'designing-cache' } }} />);
    await userEvent.click(screen.getByRole('button', { name: /언어 변경/ }));
    expect(navigation.push).toHaveBeenCalledWith('/en/blog/designing-cache?ref=mail#cache');
  });
});
