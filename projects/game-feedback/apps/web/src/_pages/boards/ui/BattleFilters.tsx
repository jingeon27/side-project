'use client';

import { buttonVariants, cn } from '@side/design-system';
import { appRoutes } from '@game-feedback/bridge';
import { battleModes, parseBattleMode } from '@/features/battle';
import { useI18n } from '@/shared/i18n';
import { TabLink, useBrowserSearch } from '@/shared/navigation';

export function BattleFilters({ locale, slug }: { locale: string; slug: string }) {
  const { t } = useI18n();
  const params = new URLSearchParams(useBrowserSearch('', `/${locale}/boards/${slug}`));
  const mode = parseBattleMode(params.get('battleMode'));
  const options = [{ value: undefined, label: '전체' }, ...battleModes];
  return (
    <nav className="battle-filters" aria-label={t('전투 유형')}>
      {options.map((item) => (
        <TabLink
          key={item.value ?? 'all'}
          href={appRoutes.boards(
            locale,
            slug,
            params.get('q') ?? undefined,
            params.get('game') ?? undefined,
            item.value,
          )}
          replace
          aria-current={mode === item.value ? 'page' : undefined}
          className={cn(
            buttonVariants({ variant: mode === item.value ? 'accent' : 'secondary', size: 'sm' }),
            'rounded-full',
          )}
        >
          {t(item.label)}
        </TabLink>
      ))}
    </nav>
  );
}
