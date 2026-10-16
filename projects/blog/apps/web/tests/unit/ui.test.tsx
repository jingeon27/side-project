import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
const tagOnly: Article = {
  ...article,
  id: 'state',
  title: '상태 복구',
  slug: '상태-복구',
  tags: ['react'],
};
const nestedTag: Article = {
  ...article,
  id: 'form',
  title: '폼 구성',
  slug: '폼-구성',
  tags: ['react-hook-form'],
};

beforeEach(() => {
  localStorage.clear();
  document.documentElement.dataset.theme = 'light';
  document.documentElement.style.removeProperty('color-scheme');
  navigation.pathname = '/ko/blog/캐시-설계';
});

describe('article discovery', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows linked article metadata, category, and tags', () => {
    render(<ArticleCard article={article} />);
    expect(screen.getByRole('link', { name: article.title })).toHaveAttribute('href', '/ko/blog/캐시-설계');
    expect(screen.getByRole('link', { name: '개발 경험' })).toHaveAttribute(
      'href',
      '/ko/blog/category/engineering',
    );
    expect(screen.getByRole('link', { name: '#nextjs' })).toHaveAttribute('href', '/ko/blog/tag/nextjs');
    expect(screen.getByText(article.description)).toBeVisible();
  });
  it('combines unified search with category filters and resets an empty result', async () => {
    const user = userEvent.setup();
    render(<BlogFeed locale="ko" articles={[article, other]} />);
    const search = screen.getByRole('combobox', { name: labels('ko').common.search });
    await user.type(search, '캐시');
    expect(screen.getByRole('link', { name: article.title })).toBeVisible();
    expect(screen.queryByRole('link', { name: other.title })).not.toBeInTheDocument();
    await user.click(
      within(screen.getByRole('group', { name: '카테고리' })).getByRole('button', { name: /TIL/ }),
    );
    expect(screen.getByRole('heading', { name: labels('ko').common.noResults })).toBeVisible();
    await user.click(screen.getAllByRole('button', { name: /필터 초기화/ })[0]!);
    expect(screen.getByRole('link', { name: other.title })).toBeVisible();
    await user.click(
      within(screen.getByRole('group', { name: '카테고리' })).getByRole('button', { name: /TIL/ }),
    );
    expect(screen.queryByRole('link', { name: article.title })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: other.title })).toBeVisible();
  });

  it('matches a tag absent from the title and applies an exact tag suggestion', async () => {
    const user = userEvent.setup();
    render(<BlogFeed locale="ko" articles={[article, other, tagOnly, nestedTag]} />);
    const search = screen.getByRole('combobox', { name: labels('ko').common.search });
    expect(screen.queryByRole('combobox', { name: '태그' })).not.toBeInTheDocument();
    await user.type(search, 'REACT');
    for (const match of [other, tagOnly, nestedTag]) {
      expect(screen.getByRole('link', { name: match.title })).toBeVisible();
    }
    expect(screen.queryByRole('link', { name: article.title })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: '#react' }));
    expect(search).toHaveValue('#react');
    expect(search).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: tagOnly.title })).toBeVisible();
    expect(screen.queryByRole('link', { name: nestedTag.title })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: labels('ko').common.clear }));
    expect(search).toHaveValue('');
    expect(screen.getByRole('link', { name: article.title })).toBeVisible();
  });

  it.each([
    ['Command', '{Meta>}k{/Meta}'],
    ['Control', '{Control>}k{/Control}'],
  ])('opens with %s+K, tracks expanded state, and closes with Escape', async (_modifier, shortcut) => {
    const user = userEvent.setup();
    render(<BlogFeed locale="ko" articles={[article, other]} />);
    const search = screen.getByRole('combobox', { name: labels('ko').common.search });
    expect(search).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await user.keyboard(shortcut);
    expect(search).toHaveFocus();
    expect(search).toHaveAttribute('aria-expanded', 'true');
    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeVisible();
    expect(search).toHaveAttribute('aria-controls', listbox.id);
    await waitFor(() =>
      expect(search).toHaveAttribute(
        'aria-activedescendant',
        screen.getByRole('option', { selected: true }).id,
      ),
    );
    // Empty input offers article shortcuts, without dumping all tags into the menu.
    expect(screen.queryByRole('option', { name: /^#/ })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(search).toHaveAttribute('aria-expanded', 'false');
    expect(search).not.toHaveAttribute('aria-activedescendant');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('moves through article suggestions with arrow keys and navigates with Enter', async () => {
    const user = userEvent.setup();
    render(<BlogFeed locale="ko" articles={[article, other, tagOnly]} />);
    const search = screen.getByRole('combobox', { name: labels('ko').common.search });
    await user.click(search);
    const options = screen.getAllByRole('option');
    await waitFor(() => expect(options[0]).toHaveAttribute('aria-selected', 'true'));
    await user.keyboard('{ArrowDown}');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    expect(search).toHaveAttribute('aria-activedescendant', options[1]!.id);
    await user.keyboard('{Enter}');
    expect(navigation.push).toHaveBeenCalledWith(`/ko/blog/${encodeURIComponent(other.slug)}`);
    expect(search).toHaveAttribute('aria-expanded', 'false');
  });

  it('navigates an article option on pointer selection without following a list-card link', async () => {
    const user = userEvent.setup();
    render(<BlogFeed locale="ko" articles={[article, other, tagOnly]} />);
    await user.type(screen.getByRole('combobox', { name: labels('ko').common.search }), '상태');
    await user.click(screen.getByRole('option', { name: /상태 복구/ }));
    expect(navigation.push).toHaveBeenCalledWith(`/ko/blog/${encodeURIComponent(tagOnly.slug)}`);
  });

  it('closes the suggestions when focus moves to another control', async () => {
    const user = userEvent.setup();
    render(<BlogFeed locale="ko" articles={[article, other]} />);
    const search = screen.getByRole('combobox', { name: labels('ko').common.search });
    await user.click(search);
    expect(screen.getByRole('listbox')).toBeVisible();
    await user.click(
      within(screen.getByRole('group', { name: '카테고리' })).getByRole('button', { name: /TIL/ }),
    );
    expect(search).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('still clears with the keyboard after Escape closes suggestions while the clear button is focused', async () => {
    const user = userEvent.setup();
    render(<BlogFeed locale="ko" articles={[article, other]} />);
    const search = screen.getByRole('combobox', { name: labels('ko').common.search });
    await user.type(search, 'react');
    await user.keyboard('{Tab}');
    expect(screen.getByRole('button', { name: labels('ko').common.clear })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(search).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard('{Enter}');
    expect(search).toHaveValue('');
    expect(search).toHaveFocus();
    expect(screen.getByRole('link', { name: article.title })).toBeVisible();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it.each([{ isComposing: true }, { keyCode: 229 }])(
    'does not navigate on an IME confirmation key: %j',
    async (composition) => {
      const user = userEvent.setup();
      render(<BlogFeed locale="ko" articles={[tagOnly]} />);
      const search = screen.getByRole('combobox', { name: labels('ko').common.search });
      await user.type(search, '상태');
      await waitFor(() => expect(screen.getByRole('option')).toHaveAttribute('aria-selected', 'true'));
      fireEvent.keyDown(search, { key: 'Enter', code: 'Enter', ...composition });
      expect(navigation.push).not.toHaveBeenCalled();
      expect(search).toHaveValue('상태');
      expect(search).toHaveAttribute('aria-expanded', 'true');
    },
  );

  it('only suggests matching tags after typing and bounds the menu size', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 9 }, (_, index): Article => ({
      ...article,
      id: `cache-${index}`,
      title: `캐시 구성 ${index}`,
      slug: `캐시-구성-${index}`,
      tags: [`cache-${index}`],
    }));
    render(<BlogFeed locale="ko" articles={many} />);
    const search = screen.getByRole('combobox', { name: labels('ko').common.search });
    await user.click(search);
    expect(screen.queryByRole('option', { name: /^#/ })).not.toBeInTheDocument();
    await user.type(search, 'cache');
    expect(screen.getAllByRole('option', { name: /^#/ })).toHaveLength(5);
    expect(screen.getAllByRole('option', { name: /캐시 구성/ })).toHaveLength(6);
  });

  it('keeps fixed route category and tag scopes when search is cleared or reset', async () => {
    const user = userEvent.setup();
    const categoryFeed = render(
      <BlogFeed locale="ko" articles={[article, other, tagOnly]} fixedCategory="engineering" />,
    );
    const categorySearch = screen.getByRole('combobox', { name: labels('ko').common.search });
    await user.type(categorySearch, 'missing');
    await user.click(screen.getAllByRole('button', { name: /필터 초기화/ })[0]!);
    expect(screen.queryByRole('group', { name: '카테고리' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: article.title })).toBeVisible();
    expect(screen.queryByRole('link', { name: other.title })).not.toBeInTheDocument();
    categoryFeed.unmount();
    render(<BlogFeed locale="ko" articles={[article, other, tagOnly, nestedTag]} fixedTag="react" />);
    const tagSearch = screen.getByRole('combobox', { name: labels('ko').common.search });
    await user.type(tagSearch, 'missing');
    await user.click(screen.getAllByRole('button', { name: /필터 초기화/ })[0]!);
    expect(tagSearch).toHaveValue('');
    expect(screen.getByRole('link', { name: other.title })).toBeVisible();
    expect(screen.getByRole('link', { name: tagOnly.title })).toBeVisible();
    expect(screen.queryByRole('link', { name: article.title })).not.toBeInTheDocument();
  });

  it('shows an honest empty English state with a route to Korean articles', () => {
    render(<BlogFeed locale="en" articles={[]} />);
    expect(screen.getByRole('heading', { name: labels('en').common.empty })).toBeVisible();
    expect(screen.getByRole('link', { name: /Korean/ })).toHaveAttribute('href', '/ko/blog');
  });
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
