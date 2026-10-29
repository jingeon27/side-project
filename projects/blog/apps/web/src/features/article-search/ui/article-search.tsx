'use client';

import { useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Autocomplete } from '@base-ui/react/autocomplete';
import { uniqBy } from 'es-toolkit';

import type { Article } from '@/shared/article/model/types';
import { labels, type UiLocale } from '@/shared/config/labels';
import { trackEvent } from '@/shared/lib/analytics/events';
import { SearchIcon } from '@/shared/ui/icon';

import { matchesArticleSearch, normalizeSearchText } from '../lib/matches-article-search';

export function ArticleSearch({
  locale,
  value,
  onChange,
  articles,
}: {
  locale: UiLocale;
  value: string;
  onChange: (value: string) => void;
  articles: readonly Article[];
}) {
  const t = labels(locale);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const query = normalizeSearchText(value, locale);
  const articleResults = articles
    .filter((article) => matchesArticleSearch(article, value, locale))
    .slice(0, query ? 6 : 4);
  const tagQuery = query.replace(/^#/, '').trim();
  const tagResults = tagQuery
    ? uniqBy(
        articles.flatMap((article) => article.tags),
        (tag) => normalizeSearchText(tag, locale),
      )
        .filter((tag) => normalizeSearchText(tag, locale).includes(tagQuery))
        .slice(0, 5)
    : [];

  const shortcut = useEffectEvent((event: KeyboardEvent) => {
    if (
      !event.isComposing &&
      !event.altKey &&
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === 'k'
    ) {
      event.preventDefault();
      inputRef.current?.focus();
      setOpen(true);
    }
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => shortcut(event);
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <Autocomplete.Root
      open={open}
      onOpenChange={setOpen}
      value={value}
      onValueChange={(next, details) => {
        if (details.reason === 'input-change' || details.reason === 'clear-press') onChange(next);
      }}
      items={[
        ...tagResults.map((tag) => `tag:${tag}`),
        ...articleResults.map((article) => `article:${article.id}`),
      ]}
      filter={null}
      openOnInputClick
      autoHighlight
      loopFocus
    >
      <Autocomplete.InputGroup className="search-field">
        <SearchIcon />
        <Autocomplete.Input
          ref={inputRef}
          data-clarity-mask="true"
          type="search"
          aria-label={t.common.search}
          aria-keyshortcuts="Meta+K Control+K"
          aria-describedby={open ? hintId : undefined}
          placeholder={t.common.searchPlaceholder}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
              event.preventBaseUIHandler();
            }
          }}
        />
        {value && (
          <Autocomplete.Clear tabIndex={0} aria-label={t.common.clear}>
            ×
          </Autocomplete.Clear>
        )}
        <kbd className="search-shortcut" aria-hidden="true">
          ⌘K / Ctrl K
        </kbd>
      </Autocomplete.InputGroup>
      <Autocomplete.Portal>
        <Autocomplete.Positioner sideOffset={8} align="start" className="search-positioner">
          <Autocomplete.Popup className="search-popover">
            <Autocomplete.List aria-label={t.common.searchSuggestions}>
              <Autocomplete.Empty className="search-empty">{t.common.searchEmpty}</Autocomplete.Empty>
              {tagResults.length > 0 && (
                <Autocomplete.Group>
                  <Autocomplete.GroupLabel className="search-group-heading">
                    {t.common.searchTags}
                  </Autocomplete.GroupLabel>
                  {tagResults.map((tag) => (
                    <Autocomplete.Item
                      key={tag}
                      value={`tag:${tag}`}
                      className="search-option search-option-tag"
                      aria-label={`#${tag}`}
                      onClick={() => {
                        onChange(`#${tag}`);
                        trackEvent('tag_selected', { tag_id: tag });
                        setOpen(false);
                      }}
                    >
                      #{tag}
                    </Autocomplete.Item>
                  ))}
                </Autocomplete.Group>
              )}
              {articleResults.length > 0 && (
                <Autocomplete.Group>
                  <Autocomplete.GroupLabel className="search-group-heading">
                    {t.common.searchArticles}
                  </Autocomplete.GroupLabel>
                  {articleResults.map((article) => (
                    <Autocomplete.Item
                      key={article.id}
                      value={`article:${article.id}`}
                      className="search-option"
                      aria-label={article.title}
                      onClick={() => {
                        setOpen(false);
                        router.push(`/${locale}/blog/${encodeURIComponent(article.slug)}`);
                      }}
                    >
                      <span className="search-option-title">{article.title}</span>
                      <span className="search-option-category" aria-hidden="true">
                        {t.categories[article.category]}
                      </span>
                    </Autocomplete.Item>
                  ))}
                </Autocomplete.Group>
              )}
            </Autocomplete.List>
            <p id={hintId} className="search-hint">
              {t.common.searchHint}
            </p>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  );
}
