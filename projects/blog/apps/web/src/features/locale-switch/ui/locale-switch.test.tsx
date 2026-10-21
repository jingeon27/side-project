import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Article } from '@/entities/article/model/types';
import { LocaleSwitch } from '@/features/locale-switch/ui/locale-switch';
import { labels } from '@/shared/config/labels';

const navigation = vi.hoisted(() => ({ pathname: '/ko/blog/캐시-설계', push: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
}));

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
});
