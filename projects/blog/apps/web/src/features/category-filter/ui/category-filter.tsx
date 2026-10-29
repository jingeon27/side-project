'use client';

import type { Category } from '@/shared/article/model/types';
import { labels, type UiLocale } from '@/shared/config/labels';

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
      <button type="button" aria-pressed={selected === 'all'} onClick={() => onChange('all')}>
        {t.common.all}
        <span>{counts.all ?? 0}</span>
      </button>
      <button type="button" aria-pressed={selected === 'engineering'} onClick={() => onChange('engineering')}>
        {t.categories.engineering}
        <span>{counts.engineering ?? 0}</span>
      </button>
      <button type="button" aria-pressed={selected === 'til'} onClick={() => onChange('til')}>
        {t.categories.til}
        <span>{counts.til ?? 0}</span>
      </button>
      <button
        type="button"
        aria-pressed={selected === 'perspectives'}
        onClick={() => onChange('perspectives')}
      >
        {t.categories.perspectives}
        <span>{counts.perspectives ?? 0}</span>
      </button>
      <button type="button" aria-pressed={selected === 'misc'} onClick={() => onChange('misc')}>
        {t.categories.misc}
        <span>{counts.misc ?? 0}</span>
      </button>
    </div>
  );
}
