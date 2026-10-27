'use client';

import { Plus } from 'lucide-react';

import { useI18n } from '@/shared/i18n';
import { MotionButton } from '@/shared/ui';

import { useFeedFilters } from '../model/use-feed-filters';

interface IFeedFiltersProps {
  locale: string;
  /** 서버 snapshot의 검색 문자열. 첫 HTML과 hydration이 URL과 같은 탭을 표시한다. */
  initialSearch: string;
  onCompose: () => void;
}

export function FeedFilters({ locale, initialSearch, onCompose }: IFeedFiltersProps) {
  const { t } = useI18n();
  const { tab, handleTabChange } = useFeedFilters(locale, initialSearch);
  const unanswered = tab === 'unanswered';
  return (
    <div className="feed-heading">
      <h1 className="max-[760px]:sr-only">{t('홈')}</h1>
      <div className="feed-actions">
        <MotionButton
          type="button"
          variant={unanswered ? 'primary' : 'secondary'}
          size="md"
          aria-pressed={unanswered}
          onClick={() => handleTabChange(unanswered ? 'latest' : 'unanswered')}
        >
          {t('답변 대기')}
        </MotionButton>
        <MotionButton variant="accent" size="md" type="button" className="button" onClick={onCompose}>
          <Plus size={17} />
          {t('글쓰기')}
        </MotionButton>
      </div>
    </div>
  );
}
