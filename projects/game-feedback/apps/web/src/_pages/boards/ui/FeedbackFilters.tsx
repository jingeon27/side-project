'use client';

import { buttonVariants, cn } from '@side/design-system';
import { appRoutes } from '@game-feedback/bridge';
import { feedbackStatuses, parseFeedbackStatus } from '@/features/post';
import { useI18n } from '@/shared/i18n';
import { TabLink, useBrowserSearch } from '@/shared/navigation';

export function FeedbackFilters({ locale, initialSearch }: { locale: string; initialSearch: string }) {
  const { t } = useI18n();
  const params = new URLSearchParams(useBrowserSearch(initialSearch, `/${locale}/boards/feedback`));
  const status = parseFeedbackStatus(params.get('feedbackStatus'));
  return (
    <nav className="feedback-filters" aria-label={t('답변 상태')}>
      {feedbackStatuses.map((item) => (
        <TabLink
          key={item.value ?? 'all'}
          href={appRoutes.boards(
            locale,
            'feedback',
            params.get('q') ?? undefined,
            params.get('game') ?? undefined,
            { feedbackStatus: item.value },
          )}
          replace
          aria-current={status === item.value ? 'page' : undefined}
          className={cn(
            buttonVariants({ variant: status === item.value ? 'accent' : 'secondary', size: 'sm' }),
            'rounded-full',
          )}
        >
          {t(item.label)}
        </TabLink>
      ))}
    </nav>
  );
}
