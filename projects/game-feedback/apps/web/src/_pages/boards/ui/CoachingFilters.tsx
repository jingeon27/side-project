'use client';

import { buttonVariants, cn } from '@side/design-system';
import { appRoutes } from '@game-feedback/bridge';
import { coachingRoles, parseCoachingRole } from '@/features/coaching';
import { useI18n } from '@/shared/i18n';
import { TabLink, useBrowserSearch } from '@/shared/navigation';

export function CoachingFilters({ locale, slug }: { locale: string; slug: string }) {
  const { t } = useI18n();
  const params = new URLSearchParams(useBrowserSearch('', `/${locale}/boards/${slug}`));
  const role = parseCoachingRole(params.get('coachingRole'));
  const options = [{ value: undefined, label: '전체' }, ...coachingRoles];
  return (
    <nav className="coaching-filters" aria-label={t('모집 유형')}>
      {options.map((item) => (
        <TabLink
          key={item.value ?? 'all'}
          href={appRoutes.boards(
            locale,
            slug,
            params.get('q') ?? undefined,
            params.get('game') ?? undefined,
            { coachingRole: item.value },
          )}
          replace
          aria-current={role === item.value ? 'page' : undefined}
          className={cn(
            buttonVariants({ variant: role === item.value ? 'accent' : 'secondary', size: 'sm' }),
            'rounded-full',
          )}
        >
          {t(item.label)}
        </TabLink>
      ))}
    </nav>
  );
}
