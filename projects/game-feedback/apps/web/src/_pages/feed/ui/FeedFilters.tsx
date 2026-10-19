'use client';
import { useI18n } from '@/shared/i18n';
import { MotionButton } from '@/shared/ui';
import { Plus } from 'lucide-react';
import { useFeedFilters } from '../model/use-feed-filters';

interface IFeedFiltersProps {
  onCompose: () => void;
}

export function FeedFilters({ onCompose }: IFeedFiltersProps) {
  const { t } = useI18n();
  const { tab, handleTabChange } = useFeedFilters();
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
        <MotionButton variant="accent" size="md" type="button" className="button primary" onClick={onCompose}>
          <Plus size={17} />
          {t('글쓰기')}
        </MotionButton>
      </div>
    </div>
  );
}
