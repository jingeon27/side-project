'use client';

import { labels, type UiLocale } from '@/shared/config/labels';

export type Category = 'engineering' | 'til' | 'perspectives' | 'misc';
export const categories: Category[] = ['engineering', 'til', 'perspectives', 'misc'];

export function CategoryFilter({
  locale,
  selected,
  counts,
  onChange,
}: {
  locale: UiLocale;
  selected: Category | 'all';
  counts: Record<string, number>;
  onChange: (category: Category | 'all') => void;
}) {
  const t = labels(locale);
  return (
    <div className="category-filters" role="group" aria-label={t.common.category}>
      {(['all', ...categories] as const).map((category) => (
        <button
          type="button"
          key={category}
          aria-pressed={selected === category}
          onClick={() => onChange(category)}
        >
          {category === 'all' ? t.common.all : t.categories[category]}
          <span>{counts[category] ?? 0}</span>
        </button>
      ))}
    </div>
  );
}
