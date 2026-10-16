import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArticleCard } from '@/entities/article/ui/article-card';
import type { Article } from '@/entities/article/model/types';
import { BlogFeed } from '@/widgets/blog-feed/ui/blog-feed';
import { LocaleSwitch } from '@/features/locale-switch/ui/locale-switch';
import { ThemeSwitch } from '@/features/theme-switch/ui/theme-switch';
import { labels } from '@/shared/config/labels';
import { TableOfContents } from '@/widgets/article-reader/ui/table-of-contents';
import { CodeBlock } from '@/shared/ui/code-block/code-block';
import { Summary } from '@/shared/ui/mdx/summary';
import { Decision } from '@/shared/ui/mdx/decision';
import { Callout } from '@/shared/ui/mdx/callout';
import { Figure } from '@/shared/ui/mdx/figure';
import { NextIntlClientProvider } from 'next-intl';

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
const other: Article = {
  ...article,
  id: 'learning',
  title: 'React 학습',
  slug: 'react-학습',
  category: 'til',
  tags: ['react'],
};

beforeEach(() => {
  localStorage.clear();
  document.documentElement.dataset.theme = 'light';
  navigation.pathname = '/ko/blog/캐시-설계';
});

describe('article discovery', () => {
  it('shows linked article metadata, category, and tags', () => {
    render(<ArticleCard article={article} index={0} />);
    expect(screen.getByRole('link', { name: article.title })).toHaveAttribute('href', '/ko/blog/캐시-설계');
    expect(screen.getByRole('link', { name: '개발 경험' })).toHaveAttribute(
      'href',
      '/ko/blog/category/engineering',
    );
    expect(screen.getByRole('link', { name: '#nextjs' })).toHaveAttribute('href', '/ko/blog/tag/nextjs');
    expect(screen.getByText(article.description)).toBeVisible();
  });
  it('combines title search, category, and tag filters and clears empty results', async () => {
    const user = userEvent.setup();
    render(<BlogFeed locale="ko" articles={[article, other]} />);
    const search = screen.getByRole('searchbox', { name: labels('ko').common.search });
    await user.type(search, '캐시');
    expect(screen.getByRole('link', { name: article.title })).toBeVisible();
    expect(screen.queryByRole('link', { name: other.title })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: '태그' }), 'react');
    expect(screen.getByRole('heading', { name: labels('ko').common.noResults })).toBeVisible();
    await user.click(screen.getAllByRole('button', { name: /필터 초기화/ })[0]!);
    expect(screen.getByRole('link', { name: other.title })).toBeVisible();
    await user.click(
      within(screen.getByRole('group', { name: '카테고리' })).getByRole('button', { name: /TIL/ }),
    );
    expect(screen.queryByRole('link', { name: article.title })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: other.title })).toBeVisible();
  });
  it('shows an honest empty English state with a route to Korean articles', () => {
    render(<BlogFeed locale="en" articles={[]} />);
    expect(screen.getByRole('heading', { name: labels('en').common.empty })).toBeVisible();
    expect(screen.getByRole('link', { name: /Korean/ })).toHaveAttribute('href', '/ko/blog');
  });
});

describe('language and theme preferences', () => {
  it('keeps an untranslated article in place and offers the target language index', async () => {
    render(<LocaleSwitch locale="ko" translations={{ [article.slug]: article.translations }} />);
    await userEvent.click(screen.getByRole('button', { name: /언어 변경/ }));
    expect(screen.getByRole('status')).toHaveTextContent(labels('ko').common.translationMissing);
    expect(navigation.push).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: `${labels('ko').common.translationList} →` })).toHaveAttribute(
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
  it('persists theme choice and updates accessible pressed state', async () => {
    render(<ThemeSwitch locale="en" />);
    const button = screen.getByRole('button', { name: labels('en').nav.theme });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(button);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('blog-theme')).toBe('dark');
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('article reading aids', () => {
  it('updates the active TOC entry when a real heading enters the viewport and disconnects on unmount', () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    let onChange: IntersectionObserverCallback;
    const MockObserver = vi.fn(function (this: object, callback: IntersectionObserverCallback) {
      onChange = callback;
      Object.assign(this, { observe, disconnect });
    });
    vi.stubGlobal('IntersectionObserver', MockObserver);
    const entries = [
      { id: 'first', title: '첫 번째', level: 2 as const },
      { id: 'second', title: '두 번째', level: 3 as const },
    ];
    const result = render(
      <>
        <h2 id="first">First</h2>
        <h3 id="second">Second</h3>
        <TableOfContents entries={entries} locale="ko" />
      </>,
    );
    expect(observe).toHaveBeenCalledTimes(2);
    act(() =>
      onChange(
        [
          {
            isIntersecting: true,
            target: document.getElementById('second')!,
            boundingClientRect: { top: 100 },
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      ),
    );
    for (const link of screen.getAllByRole('link', { name: '두 번째', hidden: true }))
      expect(link).toHaveAttribute('aria-current', 'location');
    expect(screen.getAllByRole('link', { name: '첫 번째', hidden: true })[0]).toHaveAttribute(
      'href',
      '#first',
    );
    result.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
  it('copies a highlighted multi-line block as readable original code', async () => {
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale="ko" messages={{}}>
        <CodeBlock data-language="typescript">
          <code>
            <span data-line="">
              <span>const</span>
              {' answer = 42;'}
            </span>
            {'\n'}
            <span data-line="">console.log(answer);</span>
          </code>
        </CodeBlock>
      </NextIntlClientProvider>,
    );
    await user.click(screen.getByRole('button', { name: labels('ko').article.copyCode }));
    expect(await navigator.clipboard.readText()).toBe('const answer = 42;\nconsole.log(answer);\n');
    expect(screen.getByRole('status')).toHaveTextContent(labels('ko').article.copied);
  });
  it('renders structured MDX notes and figure captions with accessible alternative text', () => {
    render(
      <>
        <Summary>핵심 정리</Summary>
        <Decision>선택한 이유</Decision>
        <Callout>참고 사항</Callout>
        <Figure src="/images/test.png" alt="캐시 계층도" caption="서버와 클라이언트의 경계" />
      </>,
    );
    expect(screen.getByText('핵심 정리')).toBeVisible();
    expect(screen.getByText('선택한 이유')).toBeVisible();
    expect(screen.getByText('참고 사항')).toBeVisible();
    expect(screen.getByRole('img', { name: '캐시 계층도' })).toHaveAttribute('loading', 'lazy');
    expect(screen.getByText('서버와 클라이언트의 경계')).toBeVisible();
  });
});
