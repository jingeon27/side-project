'use client';
import { Input } from '@side/design-system';
import { useI18n } from '@/shared/i18n';
import { MotionButton } from '@/shared/ui';
import { Plus, Search, X } from 'lucide-react';
import type { FormEvent } from 'react';

interface IFeedFiltersProps {
  tab: string;
  search: string;
  onTabChange: (tab: string) => void;
  onSearchChange: (search: string) => void;
  onCompose: () => void;
}

export function FeedFilters({ tab, search, onTabChange, onSearchChange, onCompose }: IFeedFiltersProps) {
  const { t } = useI18n();
  const unanswered = tab === 'unanswered';
  function handleSearchReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearchChange('');
    const input = event.currentTarget.elements.namedItem('q');
    if (input instanceof HTMLInputElement) input.focus();
  }

  return (
    <>
      <div className="feed-heading">
        <h1>{t('피드')}</h1>
        <MotionButton variant="accent" size="md" type="button" className="button primary" onClick={onCompose}>
          <Plus size={17} />
          {t('글쓰기')}
        </MotionButton>
      </div>
      <div className="feed-toolbar">
        <form
          role="search"
          aria-label={t('게시글 검색')}
          className="feed-search"
          onSubmit={(event) => event.preventDefault()}
          onReset={handleSearchReset}
        >
          <Search size={18} aria-hidden="true" />
          <Input
            name="q"
            aria-label={t('게시글 검색')}
            placeholder={t('게시글 검색')}
            autoComplete="off"
            className="h-touch w-0 flex-1 rounded-none border-0 px-0 py-2 shadow-none focus-visible:border-transparent focus-visible:ring-0"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
          {search && (
            <MotionButton
              type="reset"
              variant="ghost"
              size="icon"
              className="text-muted hover:text-ink"
              aria-label={t('검색어 지우기')}
            >
              <X size={16} aria-hidden="true" />
            </MotionButton>
          )}
        </form>
        <MotionButton
          type="button"
          variant={unanswered ? 'primary' : 'secondary'}
          size="md"
          aria-pressed={unanswered}
          onClick={() => onTabChange(unanswered ? 'latest' : 'unanswered')}
        >
          {t('답변 대기')}
        </MotionButton>
      </div>
    </>
  );
}
