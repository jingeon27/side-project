'use client';

import { appRoutes } from '@game-feedback/bridge';

import { useI18n } from '@/shared/i18n';
import { Topbar } from '@/widgets/community-shell';

export function ContactTopbar({ locale }: { locale: string }) {
  const { t } = useI18n();
  return (
    <Topbar.Root>
      <Topbar.Brand home={appRoutes.feed(locale)} />
      <Topbar.Title>{t('문의하기')}</Topbar.Title>
      <Topbar.Actions>
        <Topbar.Language />
        <Topbar.Notifications href={appRoutes.notifications(locale)} />
        <Topbar.Account href={appRoutes.settings(locale)} />
      </Topbar.Actions>
    </Topbar.Root>
  );
}
