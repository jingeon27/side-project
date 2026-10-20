import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import userEvent from '@testing-library/user-event';

import type { Article } from '@/entities/article/model/types';

import { BlogFeed } from '@/widgets/blog-feed/ui/blog-feed';

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
