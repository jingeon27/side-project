import { Clock3, Crown, MessageSquare, Plus, Search, SlidersHorizontal } from 'lucide-react';

interface IFeedFiltersProps {
  tab: string;
  search: string;
  onTabChange: (tab: string) => void;
  onSearchChange: (search: string) => void;
  onCompose: () => void;
}

export function FeedFilters({ tab, search, onTabChange, onSearchChange, onCompose }: IFeedFiltersProps) {
  return (
    <>
      <div className="feed-heading">
        <div>
          <span className="section-eyebrow">FEEDBACK LOUNGE</span>
          <h2>
            피드백 라운지
            <span className="live-indicator">
              <span />
              LIVE
            </span>
          </h2>
        </div>
        <button className="button primary" onClick={onCompose}>
          <Plus size={17} />
          피드백 요청
        </button>
      </div>
      <div className="game-filter">
        <span className="game-filter-icon">
          <Crown size={20} />
        </span>
        <span>클래시 로얄</span>
        <span className="game-filter-label">Clash Royale</span>
        <span className="game-filter-pill">ACTIVE</span>
      </div>
      <div className="feed-controls">
        <div className="feed-tabs" role="tablist" aria-label="피드백 필터">
          <button
            role="tab"
            aria-selected={tab === 'latest'}
            className={tab === 'latest' ? 'active' : ''}
            onClick={() => onTabChange('latest')}
          >
            <Clock3 size={16} />
            최신 피드백
          </button>
          <button
            role="tab"
            aria-selected={tab === 'unanswered'}
            className={tab === 'unanswered' ? 'active' : ''}
            onClick={() => onTabChange('unanswered')}
          >
            <MessageSquare size={16} />
            답변을 기다려요
            <span className="tab-dot" />
          </button>
        </div>
        <div className="sort-label">
          <SlidersHorizontal size={14} />
          최신순
        </div>
      </div>
      <div className="feed-search">
        <Search size={17} />
        <input
          aria-label="피드백 검색"
          placeholder="함께 풀어보고 싶은 플레이를 검색하세요"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        {search && (
          <button className="text-button" onClick={() => onSearchChange('')}>
            초기화
          </button>
        )}
      </div>
    </>
  );
}
