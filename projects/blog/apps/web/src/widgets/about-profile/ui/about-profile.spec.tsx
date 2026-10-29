import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '@/shared/config/labels';
import { author } from '@/shared/config/site';

import { AboutProfile } from './about-profile';

describe('About profile', () => {
  it.each(['ko', 'en'] as const)('shows a compact introduction and useful links in %s', (locale) => {
    const { about } = labels(locale);
    render(<AboutProfile locale={locale} />);
    expect(screen.getByRole('heading', { level: 1, name: about.title })).toBeVisible();
    expect(screen.getByText('Software Engineer', { exact: true })).toBeVisible();
    expect(screen.getByText(about.description)).toBeVisible();
    expect(screen.getByText(about.perspective)).toBeVisible();
    expect(screen.getByRole('link', { name: about.readArticles })).toHaveAttribute('href', `/${locale}/blog`);
    expect(screen.getByRole('heading', { level: 2, name: about.contact })).toBeVisible();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(screen.getByRole('link', { name: about.projects.gameMate })).toHaveAttribute(
      'href',
      `${author.github}/side-project/tree/main/projects/game-feedback`,
    );
    expect(screen.getByRole('link', { name: about.projects.contest })).toHaveAttribute(
      'href',
      `${author.github}/side-project/tree/main/projects/photo-contest`,
    );
    expect(screen.getByRole('link', { name: author.email })).toHaveAttribute(
      'href',
      `mailto:${author.email}`,
    );
    expect(screen.getByRole('link', { name: 'github.com/jingeon27' })).toHaveAttribute('href', author.github);
  });
});
