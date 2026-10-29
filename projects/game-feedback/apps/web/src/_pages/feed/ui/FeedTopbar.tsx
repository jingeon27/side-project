'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';

import { appRoutes } from '@game-feedback/bridge';

import { useBrowserSearch } from '@/shared/navigation';
import { Topbar } from '@/widgets/community-shell';

export function FeedTopbar({ locale }: { locale: string }) {
  return (
    <Topbar.Root className="feed-topbar">
      <Topbar.Brand home={appRoutes.feed(locale)} />
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
