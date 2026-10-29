import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '@/shared/config/labels';
import { author } from '@/shared/config/site';

import { AboutProfile } from './about-profile';

describe('About profile', () => {
  it.each(['ko', 'en'] as const)('introduces the author and projects in %s', (locale) => {
    const { about } = labels(locale);
    render(<AboutProfile locale={locale} />);
    expect(screen.getByRole('heading', { level: 1, name: about.title })).toBeVisible();
    expect(screen.getByText(about.headline)).toBeVisible();
    expect(screen.getByRole('link', { name: about.readArticles })).toHaveAttribute('href', `/${locale}/blog`);
    expect(
      within(screen.getByRole('region', { name: about.topics.title })).getAllByRole('article'),
    ).toHaveLength(3);
    expect(
      within(screen.getByRole('region', { name: about.projects.title })).getAllByRole('article'),
    ).toHaveLength(3);
    expect(screen.getByRole('link', { name: about.projects.gameMate.link })).toHaveAttribute(
      'href',
      `${author.github}/side-project/tree/main/projects/game-feedback`,
    );
    expect(screen.getByRole('link', { name: about.projects.contest.link })).toHaveAttribute(
      'href',
      `${author.github}/side-project/tree/main/projects/photo-contest`,
    );
    expect(screen.getByRole('link', { name: about.projects.blog.link })).toHaveAttribute(
      'href',
      `${author.github}/side-project/tree/main/projects/blog`,
    );
    expect(screen.getByRole('link', { name: author.email })).toHaveAttribute(
      'href',
      `mailto:${author.email}`,
    );
    expect(screen.getByRole('link', { name: 'github.com/jingeon27' })).toHaveAttribute('href', author.github);
  });
});
