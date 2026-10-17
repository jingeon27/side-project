'use client';
import { Input, Tabs, TabsList, TabsTrigger } from '@side/design-system';
import { useI18n } from '@/shared/i18n';
import { MotionButton } from '@/shared/ui';
import { Clock3, MessageSquare, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
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
  function handleSearchReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearchChange('');
    const input = event.currentTarget.elements.namedItem('q');
    if (input instanceof HTMLInputElement) input.focus();
  }

  return (
    <>
      <div className="feed-heading">
        <div>
          <h1>{t('피드')}</h1>
          <p className="muted small">{t('게임 이야기와 모집, 코칭을 한곳에서 만나보세요.')}</p>
        </div>
        <MotionButton
          variant="primary"
          size="md"
          type="submit"
          className="button primary"
          onClick={onCompose}
        >
          <Plus size={17} />
          {t('글쓰기')}
        </MotionButton>
      </div>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (typeof value === 'string') onTabChange(value);
        }}
        className="feed-controls data-[orientation=horizontal]:flex-row"
      >
        <TabsList variant="line" className="feed-tabs" aria-label={t('피드 필터')}>
          <TabsTrigger value="latest" className={tab === 'latest' ? 'active' : ''}>
            <Clock3 size={16} />
            {t('최신 글')}
          </TabsTrigger>
          <TabsTrigger value="unanswered" className={tab === 'unanswered' ? 'active' : ''}>
            <MessageSquare size={16} />
            {t('답변을 기다려요')}
          </TabsTrigger>
        </TabsList>
        <div className="sort-label">
          <SlidersHorizontal size={14} />
          {t('최신순')}
        </div>
      </Tabs>
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
    </>
  );
}
