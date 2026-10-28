'use client';

import { Plus } from 'lucide-react';

import { useI18n } from '@/shared/i18n';
import { MotionButton } from '@/shared/ui';

interface IFeedFiltersProps {
  onCompose: () => void;
}

export function FeedFilters({ onCompose }: IFeedFiltersProps) {
  const { t } = useI18n();
  return (
    <div className="feed-heading">
      <h1 className="max-[760px]:sr-only">{t('홈')}</h1>
      <div className="feed-actions">
        <MotionButton variant="accent" size="md" type="button" className="button" onClick={onCompose}>
          <Plus size={17} />
          {t('글쓰기')}
        </MotionButton>
      </div>
    </div>
  );
}
