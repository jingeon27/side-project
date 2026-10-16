'use client';

import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Article } from '@/entities/article/model/types';
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
  const [selection, setSelection] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const hintId = useId();
  const query = normalizeSearchText(value, locale);
  const articleResults = useMemo(
    () => articles.filter((article) => matchesArticleSearch(article, value, locale)).slice(0, query ? 6 : 4),
    [articles, value, locale, query],
  );
  const tagResults = useMemo(() => {
    const tagQuery = query.startsWith('#') ? query.slice(1).trim() : query;
    if (!tagQuery) return [];
    const matching = new Map<string, string>();
    for (const article of articles) {
      for (const tag of article.tags) {
        const normalized = normalizeSearchText(tag, locale);
        if (normalized.includes(tagQuery) && !matching.has(normalized)) matching.set(normalized, tag);
      }
    }
    return [...matching.values()].slice(0, 5);
  }, [articles, locale, query]);

  useEffect(() => {
    // cmdk 1.1.1 can leave its active descendant stale after mounting or external filtering.
    const input = inputRef.current;
    const options = rootRef.current?.querySelectorAll<HTMLElement>('[cmdk-item]');
    const active = options && [...options].find((option) => option.dataset.value === selection);
    if (open && active) input?.setAttribute('aria-activedescendant', active.id);
    else input?.removeAttribute('aria-activedescendant');
  }, [open, selection, articleResults, tagResults]);

  useEffect(() => {
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    }
    function shortcut(event: KeyboardEvent) {
      if (
        !event.isComposing &&
        !composing.current &&
        !event.altKey &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'k'
      ) {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', shortcut);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', shortcut);
    };
  }, []);

  return (
    <Command
      ref={rootRef}
      className="search-combobox"
      label={t.common.search}
      shouldFilter={false}
      value={selection}
      onValueChange={setSelection}
      loop
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDownCapture={(event) => {
        if (composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
          event.stopPropagation();
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
        } else if (event.target !== inputRef.current) {
          if (['Enter', 'ArrowDown', 'ArrowUp'].includes(event.key)) event.stopPropagation();
        } else if (event.key === 'Enter' && !open) {
          event.preventDefault();
          event.stopPropagation();
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          setOpen(true);
        }
      }}
    >
      <div className="search-field">
        <SearchIcon />
        <Command.Input
          ref={inputRef}
          asChild
          value={value}
          onValueChange={(next) => {
            onChange(next);
            setOpen(true);
          }}
        >
          {/* cmdk injects aria-controls; the child input makes aria-expanded follow the popover. */}
          {/* eslint-disable jsx-a11y/role-has-required-aria-props */}
          <input
            type="search"
            role="combobox"
            aria-label={t.common.search}
            aria-expanded={open}
            aria-keyshortcuts="Meta+K Control+K"
            aria-describedby={open ? hintId : undefined}
            aria-activedescendant={undefined}
            placeholder={t.common.searchPlaceholder}
            autoComplete="off"
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={() => {
              composing.current = false;
            }}
          />
          {/* eslint-enable jsx-a11y/role-has-required-aria-props */}
        </Command.Input>
        {value && (
          <button
            type="button"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              onChange('');
              setOpen(true);
              inputRef.current?.focus();
            }}
            aria-label={t.common.clear}
          >
            ×
          </button>
        )}
        <kbd className="search-shortcut" aria-hidden="true">
          ⌘K / Ctrl K
        </kbd>
      </div>
      <div className="search-popover" hidden={!open} style={open ? undefined : { display: 'none' }}>
        <Command.List label={t.common.searchSuggestions} onMouseDown={(event) => event.preventDefault()}>
          <Command.Empty className="search-empty">{t.common.searchEmpty}</Command.Empty>
          {tagResults.length > 0 && (
            <Command.Group heading={<span className="search-group-heading">{t.common.searchTags}</span>}>
              {tagResults.map((tag) => (
                <Command.Item
                  key={tag}
                  value={`tag:${tag}`}
                  className="search-option search-option-tag"
                  aria-label={`#${tag}`}
                  onSelect={() => {
                    if (composing.current) return;
                    onChange(`#${tag}`);
                    trackEvent('tag_selected', { tag_id: tag });
                    setOpen(false);
                  }}
                >
                  #{tag}
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {articleResults.length > 0 && (
            <Command.Group heading={<span className="search-group-heading">{t.common.searchArticles}</span>}>
              {articleResults.map((article) => (
                <Command.Item
                  key={article.id}
                  value={`article:${article.id}`}
                  className="search-option"
                  aria-label={article.title}
                  onSelect={() => {
                    if (composing.current) return;
                    setOpen(false);
                    router.push(`/${locale}/blog/${encodeURIComponent(article.slug)}`);
                  }}
                >
                  <span className="search-option-title">{article.title}</span>
                  <span className="search-option-category" aria-hidden="true">
                    {t.categories[article.category]}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
        <p id={hintId} className="search-hint">
          {t.common.searchHint}
        </p>
      </div>
    </Command>
  );
}
