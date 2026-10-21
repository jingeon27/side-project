'use client';

import { appRoutes } from '@game-feedback/bridge';

import { Topbar } from '@/widgets/community-shell';

export function PostTopbarPlaceholder({ locale }: { locale: string }) {
  return (
    <Topbar.Root>
      <Topbar.Back href={appRoutes.feed(locale)} />
      <span className="post-header-placeholder" aria-hidden="true" />
      <Topbar.Actions>
        <Topbar.Language />
        <Topbar.Notifications href={appRoutes.notifications(locale)} />
      </Topbar.Actions>
    </Topbar.Root>
  );
}
