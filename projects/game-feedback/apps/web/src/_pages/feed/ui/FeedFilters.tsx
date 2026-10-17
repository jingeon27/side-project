'use client';
import { useI18n } from '@/shared/i18n';
import { MotionButton } from '@/shared/ui';
import { m } from '@/shared/motion';
import { Clock3, MessageSquare, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { ClashRoyaleIcon } from '@/features/game-profile';

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
          <h2>{t('피드백 라운지')}</h2>
        </div>
        <MotionButton
          variant="primary"
          size="md"
          type="submit"
          className="button primary"
          onClick={onCompose}
        >
          <Plus size={17} />
          {t('피드백 요청')}
        </MotionButton>
      </div>
      <div className="game-filter">
        <ClashRoyaleIcon className="game-filter-icon" size={28} />
        <span>{t('클래시 로얄')}</span>
      </div>
      <div className="feed-controls">
        <div className="feed-tabs" role="tablist" aria-label={t('피드백 필터')}>
          <button
            role="tab"
            aria-selected={tab === 'latest'}
            className={tab === 'latest' ? 'active' : ''}
            onClick={() => onTabChange('latest')}
          >
            <Clock3 size={16} />
            {t('최신 피드백')}
            <m.span
              aria-hidden="true"
              className="feed-tab-indicator"
              initial={false}
              animate={{ scaleX: tab === 'latest' ? 1 : 0 }}
              style={{ originX: 0 }}
            />
          </button>
          <button
            role="tab"
            aria-selected={tab === 'unanswered'}
            className={tab === 'unanswered' ? 'active' : ''}
            onClick={() => onTabChange('unanswered')}
          >
            <MessageSquare size={16} />
            {t('답변을 기다려요')}
            <m.span
              aria-hidden="true"
              className="feed-tab-indicator"
              initial={false}
              animate={{ scaleX: tab === 'unanswered' ? 1 : 0 }}
              style={{ originX: 0 }}
            />
          </button>
        </div>
        <div className="sort-label">
          <SlidersHorizontal size={14} />
          {t('최신순')}
        </div>
      </div>
      <div className="feed-search">
        <Search size={17} />
        <input
          className="ds-input"
          aria-label={t('피드백 검색')}
          placeholder={t('함께 풀어보고 싶은 플레이를 검색하세요')}
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
