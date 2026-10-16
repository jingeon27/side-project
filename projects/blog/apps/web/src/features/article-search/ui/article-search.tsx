'use client';

import { labels, type UiLocale } from '@/shared/config/labels';
import { SearchIcon } from '@/shared/ui/icon';

export function ArticleSearch({
  locale,
  value,
  onChange,
}: {
  locale: UiLocale;
  value: string;
  onChange: (value: string) => void;
}) {
  const t = labels(locale);
  return (
    <div className="search-field">
      <SearchIcon />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={t.common.search}
        placeholder={t.common.searchPlaceholder}
        autoComplete="off"
      />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label={t.common.clear}>
          ×
        </button>
      )}
      <span className="search-hint" aria-hidden="true">
        Aa
      </span>
    </div>
  );
}
