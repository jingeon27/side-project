'use client';

import { useSuspenseQuery } from '@tanstack/react-query';
import { Gamepad2, Plus } from 'lucide-react';

import { Button } from '@side/design-system';

import { gameAccountListOptions } from '@/features/game-profile';
import { useI18n } from '@/shared/i18n';
import { AsyncBoundary, openOverlay } from '@/shared/ui';
import { ConnectProfile, GameAccountCard } from '@/widgets/game-profile';

const handleOpenProfileConnection = () => {
  openOverlay((control) => <ConnectProfile {...control} onSaved={() => control.onOpenChange(false)} />);
};

export function GameAccountsSection({ userId }: { userId: string }) {
  const { t } = useI18n();
  return (
    <section className="settings-card game-accounts" aria-labelledby="game-accounts-title">
      <div className="section-title-row game-accounts-heading">
        <h2 id="game-accounts-title">
          <Gamepad2 size={20} aria-hidden />
          {t('게임 계정')}
        </h2>
        <Button type="button" variant="secondary" size="sm" onClick={handleOpenProfileConnection}>
          <Plus size={16} aria-hidden />
          {t('계정 등록')}
        </Button>
      </div>
      <p className="muted small">
        {t('게임 계정은 내 사용자 계정에 등록됩니다. 프로필 인증은 관리자에게 문의해주세요.')}
      </p>
      <AsyncBoundary title={t('게임 계정')} resetKey={userId} clientOnly>
        <GameAccountList userId={userId} />
      </AsyncBoundary>
    </section>
  );
}

function GameAccountList({ userId }: { userId: string }) {
  const { data: accounts } = useSuspenseQuery(gameAccountListOptions(userId));
  return (
    <div className="game-account-list">
      {accounts.map((profile) => (
        <GameAccountCard key={profile.playerTag} profile={profile} />
      ))}
    </div>
  );
}
