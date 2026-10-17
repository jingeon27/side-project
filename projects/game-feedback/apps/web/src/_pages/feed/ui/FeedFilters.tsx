'use client';
import { Input, Tabs, TabsList, TabsTrigger } from '@side/design-system';
import { useI18n } from '@/shared/i18n';
import { MotionButton } from '@/shared/ui';
import { Clock3, MessageSquare, Plus, Search, SlidersHorizontal } from 'lucide-react';

interface IFeedFiltersProps {
  tab: string;
  search: string;
  onTabChange: (tab: string) => void;
  onSearchChange: (search: string) => void;
  onCompose: () => void;
}

export function FeedFilters({ tab, search, onTabChange, onSearchChange, onCompose }: IFeedFiltersProps) {
  const { t } = useI18n();
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
      <div className="feed-search">
        <Search size={17} />
        <Input
          aria-label={t('게시글 검색')}
          placeholder={t('관심 있는 게시글을 검색하세요')}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        {search && (
          <button className="text-button" onClick={() => onSearchChange('')}>
            {t('초기화')}
          </button>
        )}
      </div>
    </>
  );
}
