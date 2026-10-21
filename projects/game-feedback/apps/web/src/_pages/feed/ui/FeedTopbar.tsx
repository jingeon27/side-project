'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';

import { appRoutes } from '@game-feedback/bridge';

import { useI18n } from '@/shared/i18n';
import { useBrowserSearch } from '@/shared/navigation';
import { Topbar } from '@/widgets/community-shell';

export function FeedTopbar({ locale }: { locale: string }) {
  const { t } = useI18n();
  return (
    <Topbar.Root>
      <Topbar.Brand home={appRoutes.feed(locale)} />
      <Topbar.Title>{t('홈')}</Topbar.Title>
      <Topbar.Actions>
        <Suspense fallback={null}>
          <FeedSearchLink locale={locale} />
        </Suspense>
        <Topbar.Language />
        <Topbar.Notifications href={appRoutes.notifications(locale)} />
        <Topbar.Account href={appRoutes.settings(locale)} />
      </Topbar.Actions>
    </Topbar.Root>
  );
}

function FeedSearchLink({ locale }: { locale: string }) {
  const pathname = usePathname();
  const params = new URLSearchParams(useBrowserSearch('', pathname));
  return (
    <Topbar.Search
      href={appRoutes.search(locale, {
        q: params.get('q') ?? undefined,
        tab: params.get('tab') ?? undefined,
      })}
    />
  );
}
