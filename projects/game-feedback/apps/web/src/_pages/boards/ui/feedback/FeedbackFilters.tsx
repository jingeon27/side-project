'use client';

import { appRoutes } from '@game-feedback/bridge';
import type { TFeedbackStatus } from '@game-feedback/contracts';

import { parseFeedbackStatus } from '@/features/post';
import { useI18n } from '@/shared/i18n';
import { parseSearch } from '@/shared/lib/query-string';
import { useBrowserSearch } from '@/shared/navigation';

import { BoardFilterLink } from '../board/BoardFilterLink';

export function FeedbackFilters({ locale, initialSearch }: { locale: string; initialSearch: string }) {
  const { t } = useI18n();
  const params = parseSearch(useBrowserSearch(initialSearch, appRoutes.boards(locale, 'feedback')));
  const status = parseFeedbackStatus(params.feedbackStatus);
  const hrefFor = (value?: TFeedbackStatus) =>
    appRoutes.boards(locale, 'feedback', params.q, params.game, {
      feedbackStatus: value,
    });
  return (
    <nav className="feedback-filters" aria-label={t('답변 상태')}>
      <BoardFilterLink href={hrefFor()} active={status === undefined}>
        {t('전체')}
      </BoardFilterLink>
      <BoardFilterLink href={hrefFor('WAITING')} active={status === 'WAITING'}>
        {t('답변 대기')}
      </BoardFilterLink>
      <BoardFilterLink href={hrefFor('ANSWERED')} active={status === 'ANSWERED'}>
        {t('답변 있음')}
      </BoardFilterLink>
    </nav>
  );
}
