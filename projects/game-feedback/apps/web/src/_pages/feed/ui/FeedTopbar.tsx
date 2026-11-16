'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';

import { appRoutes } from '@game-feedback/bridge';

import { useI18n } from '@/shared/i18n';
import { parseSearch } from '@/shared/lib/query-string';
import { useBrowserSearch } from '@/shared/navigation';
import { Topbar } from '@/widgets/community-shell';

export function FeedTopbar({ locale }: { locale: string }) {
  const { t } = useI18n();
  return (
    <Topbar.Root className="feed-topbar">
      <Topbar.Title heading>{t('전체')}</Topbar.Title>
      <Topbar.Actions>
        <Suspense fallback={null}>
          <FeedSearchLink locale={locale} />
        </Suspense>
        <div className="feed-header-language">
          <Topbar.Language />
        </div>
        <Topbar.Notifications href={appRoutes.notifications(locale)} />
        <Topbar.Account href={appRoutes.settings(locale)} />
      </Topbar.Actions>
    </Topbar.Root>
  );
}

function FeedSearchLink({ locale }: { locale: string }) {
  const pathname = usePathname();
  const params = parseSearch(useBrowserSearch('', pathname));
  return (
    <Topbar.Search
      href={appRoutes.search(locale, {
        q: params.q,
        tab: params.tab,
      })}
    />
  );
}
