'use client';

import { ArrowUpRight } from 'lucide-react';

import { appRoutes } from '@game-feedback/bridge';
import { ButtonLink } from '@side/design-system/next';

import { useI18n } from '@/shared/i18n';

interface IChatWelcomeProps {
  locale: string;
}

export function ChatWelcome({ locale }: IChatWelcomeProps) {
  const { t } = useI18n();
  return (
    <section className="chat-welcome">
      <h2>
        {t('좋은 플레이 뒤에는')}
        <br />
        {t('좋은 대화가 있어요.')}
      </h2>
      <p>
        {t('왼쪽에서 대화를 선택하거나,')}
        <br />
        {t('피드에서 함께 이야기할 플레이어를 찾아보세요.')}
      </p>
      <ButtonLink variant="secondary" size="md" href={appRoutes.feed(locale)} className="button outline">
        {t('피드 둘러보기')}
        <ArrowUpRight size={16} />
      </ButtonLink>
    </section>
  );
}
